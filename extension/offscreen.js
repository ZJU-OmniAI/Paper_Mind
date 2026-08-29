/* Blob 工厂。
   offscreen 文档只能用 chrome.runtime —— chrome.storage / chrome.downloads 在这里全是 undefined，
   所以它只干一件 service worker 干不了的事：把图片变成 blob: 地址（SW 里没有 URL.createObjectURL，
   而 data: 地址会撞上 Chrome 2MB 的长度上限）。抓取之外的下载、落库都在 SW 那边。 */

const FETCH_TIMEOUT_MS = 20000;
const MAX_BYTES = 12 * 1024 * 1024;
// 太大的图不回传 data: 兜底版，省得白白多占一份内存
const DATA_URL_LIMIT = 1200000;

const liveUrls = new Set();

async function blobToDataUrl(blob) {
  if (blob.size > DATA_URL_LIMIT) return "";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

function publish(blob) {
  const objectUrl = URL.createObjectURL(blob);
  liveUrls.add(objectUrl);
  return objectUrl;
}

async function fetchBlob(assetUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // referrerPolicy 必须是 no-referrer：带上扩展来源时公众号图床只回一张 2KB 的
    // "未经允许不可引用"占位图，而且照样是 200，不看体积根本发现不了
    const response = await fetch(assetUrl, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("图片为空");
    if (blob.size > MAX_BYTES) throw new Error("图片超过单张上限");
    if (blob.type && !blob.type.startsWith("image/")) throw new Error(`返回的不是图片：${blob.type}`);
    return blob;
  } finally {
    clearTimeout(timer);
  }
}

function blobFromBase64(base64, mime) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime || "image/jpeg" });
}

async function handle(message) {
  if (message.type === "clip-blob-from-url") {
    // 扩展页面是安全上下文，直接拉 http:// 会被当混合内容拦掉；图床基本都支持 https
    let blob;
    if (message.url.startsWith("http://")) {
      try {
        blob = await fetchBlob(message.url.replace(/^http:/, "https:"));
      } catch {
        blob = await fetchBlob(message.url);
      }
    } else {
      blob = await fetchBlob(message.url);
    }
    return { objectUrl: publish(blob), dataUrl: await blobToDataUrl(blob), mime: blob.type || "", size: blob.size };
  }

  // 老版本存在浏览器里的图片：SW 读出来转成 base64 递过来，这里还原成 blob: 地址
  if (message.type === "clip-blob-from-base64") {
    const blob = blobFromBase64(message.base64, message.mime);
    return { objectUrl: publish(blob), dataUrl: await blobToDataUrl(blob), mime: blob.type || "", size: blob.size };
  }

  if (message.type === "clip-blob-release") {
    for (const objectUrl of message.objectUrls || []) {
      if (liveUrls.delete(objectUrl)) URL.revokeObjectURL(objectUrl);
    }
    return { released: true };
  }

  throw new Error(`未知任务：${message.type}`);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return;
  handle(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});

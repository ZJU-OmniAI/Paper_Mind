/* 网页剪藏：把当前网页的正文（文字 + 图片）抽成 Markdown，按一篇"论文"存进论文库。
   抽取跑在页面里（DOM 直读），所以微信公众号这类反爬站点也能拿到全文。 */

export const CLIP_MIN_TEXT_LENGTH = 160;

// 注入页面执行：executeScript 只把函数体字符串化传过去，闭包、import、模块常量都带不过去，
// 所以这个函数必须自包含，所有工具函数都写在里面。
export function pageClipExtractor() {
  const MAX_MARKDOWN = 200000;
  const MIN_ROOT_TEXT = 160;

  const SKIP_TAGS = new Set([
    "script", "style", "noscript", "template", "svg", "canvas", "form", "select", "textarea",
    "button", "nav", "aside", "footer", "ins", "object", "embed", "link", "meta", "input", "label", "dialog"
  ]);

  const BLOCK_TAGS = new Set([
    "address", "article", "blockquote", "details", "dd", "div", "dl", "dt", "fieldset", "figcaption",
    "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hgroup", "li", "main", "ol", "p", "pre",
    "section", "summary", "table", "tr", "ul", "body"
  ]);

  // 广告 / 分享 / 评论 / 二维码这类噪声块，只在小块上生效，避免误杀正文容器
  const NOISE_PATTERN =
    /(^|[-_\s])(ad|ads|advert|adsbygoogle|banner|share|sharing|social|comment|comments|discuss|related|recommend|sidebar|breadcrumb|toolbar|copyright|qrcode|reward|subscribe|follow|newsletter|popup|modal|cookie|promo|paywall|pagination|menu|toc|catalog|vote|tucao)($|[-_\s])/i;

  const PLACEHOLDER_IMAGE = /(spacer|blank|placeholder|loading|pixel|1x1|transparent)\.(gif|png|jpg|webp)/i;

  const flatText = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();
  const textLength = (node) => flatText(node).length;

  function absoluteUrl(value) {
    let raw = String(value || "").trim();
    if (!raw) return "";
    // 有些站点（公众号的视频封面）把整条地址 URL 编码后塞进属性，直接当相对路径拼会拼歪
    if (/^https?%3a/i.test(raw)) {
      try {
        raw = decodeURIComponent(raw);
      } catch {
        return "";
      }
    }
    try {
      return new URL(raw, document.baseURI).href;
    } catch {
      return "";
    }
  }

  function metaContent(...selectors) {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.getAttribute("content")?.trim();
      if (value) return value;
    }
    return "";
  }

  function linkDensity(el) {
    const total = textLength(el);
    if (!total) return 1;
    let linkText = 0;
    for (const anchor of el.querySelectorAll("a")) linkText += textLength(anchor);
    return linkText / total;
  }

  // 懒加载图片的真实地址通常藏在 data-src（微信公众号就是这样），src 只是占位图
  function imageUrl(img) {
    const candidates = [
      img.getAttribute("data-src"),
      img.getAttribute("data-original"),
      img.getAttribute("data-actualsrc"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-echo"),
      img.getAttribute("data-url")
    ];
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset) {
      const entries = srcset
        .split(",")
        .map((item) => item.trim().split(/\s+/)[0])
        .filter(Boolean);
      if (entries.length) candidates.push(entries[entries.length - 1]);
    }
    candidates.push(img.currentSrc, img.getAttribute("src"));
    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (!value) continue;
      if (/^data:/i.test(value)) continue;
      if (PLACEHOLDER_IMAGE.test(value)) continue;
      const absolute = absoluteUrl(value);
      if (absolute && /^https?:/i.test(absolute)) return absolute;
    }
    return "";
  }

  function isTinyImage(img) {
    const width = img.naturalWidth || Number(img.getAttribute("width")) || 0;
    const height = img.naturalHeight || Number(img.getAttribute("height")) || 0;
    return (width > 0 && width <= 3) || (height > 0 && height <= 3);
  }

  function styleOf(el) {
    try {
      return window.getComputedStyle(el);
    } catch {
      return null;
    }
  }

  // visibility 会被子元素继承：公众号正文容器初始就是 visibility:hidden（靠脚本揭开），
  // 一旦正文根节点自己就是隐藏的，整棵子树的 visibility 判断都得让路，否则会抽出空正文
  let ignoreVisibility = false;

  function isHidden(el, style) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
    if (!style) return false;
    if (style.display === "none") return true;
    return !ignoreVisibility && style.visibility === "hidden";
  }

  function isBlockLevel(tag, style) {
    if (BLOCK_TAGS.has(tag)) return true;
    const display = style?.display || "";
    return display.startsWith("block") || display === "flex" || display === "grid" || display === "list-item" || display.startsWith("table");
  }

  function isNoise(el) {
    if (el.id === "js_content") return false;
    const signature = `${el.className && typeof el.className === "string" ? el.className : ""} ${el.id || ""}`;
    if (!signature.trim()) return false;
    // 大块内容即便命中关键词也保留，避免正文容器恰好叫 "content-share" 之类被整块丢掉
    return NOISE_PATTERN.test(signature) && textLength(el) < 400;
  }

  function cleanInline(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function renderChildren(el) {
    let out = "";
    for (const child of el.childNodes) out += renderNode(child);
    return out;
  }

  function renderImage(el) {
    const url = imageUrl(el);
    if (!url || isTinyImage(el)) return "";
    const alt = cleanInline(el.getAttribute("alt") || "").replace(/[[\]]/g, "");
    const markdown = `![${alt}](${url})`;
    // 图片旁边没有同级文字（配图、figure 里的图）就单独成块，句子中间的小图标保持行内
    const siblings = [...(el.parentElement?.childNodes || [])];
    const standalone = !siblings.some((node) => node !== el && node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim());
    return standalone ? `\n\n${markdown}\n\n` : markdown;
  }

  function renderLink(el) {
    const raw = cleanInline(renderChildren(el));
    if (!raw) return "";
    // 链接里包着图片（徽章、缩略图）时保留图片本身，别把图片语法拆坏
    if (raw.includes("![")) return raw;
    const label = raw.replace(/[[\]]/g, "");
    const href = absoluteUrl(el.getAttribute("href"));
    if (!href || !/^https?:/i.test(href)) return label;
    return `[${label}](${href})`;
  }

  function renderList(el, tag) {
    const items = [...el.children].filter((child) => child.tagName?.toLowerCase() === "li");
    const lines = [];
    items.forEach((item, index) => {
      const body = renderChildren(item).replace(/\n{2,}/g, "\n").trim();
      if (!body) return;
      const marker = tag === "ol" ? `${index + 1}.` : "-";
      lines.push(
        body
          .split("\n")
          .map((line, lineIndex) => (lineIndex === 0 ? `${marker} ${line.trim()}` : `  ${line.trim()}`))
          .join("\n")
      );
    });
    return lines.length ? `\n\n${lines.join("\n")}\n\n` : "";
  }

  function renderTable(el) {
    const rows = [...(el.rows || [])];
    if (!rows.length) return "";
    const cellText = (cell) => cleanInline(renderChildren(cell)).replace(/\|/g, "｜") || " ";
    const matrix = rows.map((row) => [...row.cells].map(cellText)).filter((cells) => cells.length);
    if (!matrix.length) return "";
    const columns = Math.max(...matrix.map((cells) => cells.length));
    const pad = (cells) => [...cells, ...Array(columns - cells.length).fill(" ")];
    const [head, ...body] = matrix;
    const lines = [
      `| ${pad(head).join(" | ")} |`,
      `| ${Array(columns).fill("---").join(" | ")} |`,
      ...body.map((cells) => `| ${pad(cells).join(" | ")} |`)
    ];
    return `\n\n${lines.join("\n")}\n\n`;
  }

  function renderCodeBlock(el) {
    // 代码块必须原样保留换行，交给通用逻辑会被压成一行
    const code = String(el.textContent || "").replace(/\n+$/, "");
    if (!code.trim()) return "";
    const className = `${el.className || ""} ${el.querySelector("code")?.className || ""}`;
    const language = className.match(/(?:language|lang|hljs|brush:?)[-\s]([\w+#-]+)/i)?.[1] || "";
    const fence = code.includes("```") ? "~~~" : "```";
    return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
  }

  function renderMedia(el) {
    const source = el.getAttribute("data-src") || el.getAttribute("src") || el.querySelector("source")?.getAttribute("src") || "";
    const href = absoluteUrl(source);
    if (!href || !/^https?:/i.test(href)) return "";
    const poster = absoluteUrl(el.getAttribute("poster") || el.getAttribute("data-cover") || "");
    const cover = poster ? `\n\n![](${poster})` : "";
    return `${cover}\n\n[▶ 视频](${href})\n\n`;
  }

  function renderNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return String(node.nodeValue || "").replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "hr") return "\n\n---\n\n";
    if (tag === "img") return renderImage(el);
    if (SKIP_TAGS.has(tag)) return "";

    const style = styleOf(el);
    if (isHidden(el, style)) return "";
    if (isNoise(el)) return "";

    if (tag === "pre") return renderCodeBlock(el);
    if (tag === "table") return renderTable(el);
    if (tag === "ul" || tag === "ol") return renderList(el, tag);
    if (tag === "a") return renderLink(el);
    if (tag === "iframe" || tag === "video" || tag === "audio") return renderMedia(el);

    if (/^h[1-6]$/.test(tag)) {
      const heading = cleanInline(renderChildren(el));
      if (!heading) return "";
      return `\n\n${"#".repeat(Number(tag[1]))} ${heading}\n\n`;
    }

    if (tag === "blockquote") {
      const inner = renderChildren(el).replace(/\n{3,}/g, "\n\n").trim();
      if (!inner) return "";
      const quoted = inner
        .split("\n")
        .map((line) => (line.trim() ? `> ${line.trim()}` : ">"))
        .join("\n");
      return `\n\n${quoted}\n\n`;
    }

    if (tag === "figcaption") {
      const caption = cleanInline(renderChildren(el));
      return caption ? `\n\n*${caption}*\n\n` : "";
    }

    if (tag === "code" && !el.closest("pre")) {
      const code = cleanInline(el.textContent);
      return code ? `\`${code.replace(/`/g, "'")}\`` : "";
    }

    if (tag === "strong" || tag === "b") {
      const inner = cleanInline(renderChildren(el));
      return inner ? `**${inner}**` : "";
    }

    if (tag === "em" || tag === "i") {
      const inner = cleanInline(renderChildren(el));
      return inner ? `*${inner}*` : "";
    }

    const inner = renderChildren(el);
    if (!inner.trim()) return "";
    return isBlockLevel(tag, style) ? `\n\n${inner}\n\n` : inner;
  }

  function tidyMarkdown(raw) {
    const lines = String(raw || "").replace(/\u00a0/g, " ").split("\n");
    const out = [];
    let lastContent = "";
    let insideFence = false;
    for (const line of lines) {
      // 代码块里的缩进和空行都要原样保留，压掉就成一坨了
      if (/^\s*(```|~~~)/.test(line)) {
        insideFence = !insideFence;
        out.push(line.trim());
        lastContent = "";
        continue;
      }
      if (insideFence) {
        out.push(line.replace(/\s+$/, ""));
        continue;
      }
      const indentWidth = (line.match(/^[ \t]*/)[0] || "").replace(/\t/g, "  ").length;
      const body = line.replace(/[ \t]+/g, " ").trim();
      // 连续空行压成一个：微信那种层层 section 嵌套会造出大量空块
      if (!body) {
        if (!out.length || !out[out.length - 1]) continue;
        out.push("");
        continue;
      }
      // 同一张图连着出现两次（站点同时写了 src 和 data-src）时只留一张
      if (body.startsWith("![") && body === lastContent) continue;
      lastContent = body;
      // 嵌套列表靠缩进表达层级，这里的缩进要留住
      const nested = /^(?:[-*+]|\d+\.)\s/.test(body) ? " ".repeat(Math.min(8, Math.floor(indentWidth / 2) * 2)) : "";
      out.push(nested + body);
    }
    let text = out.join("\n").trim();
    if (text.length > MAX_MARKDOWN) text = `${text.slice(0, MAX_MARKDOWN)}\n\n…（正文过长已截断）`;
    return text;
  }

  function descendToTightestWrapper(el) {
    let current = el;
    const baseLength = textLength(el);
    for (let depth = 0; depth < 6; depth += 1) {
      const children = [...current.children].filter((child) => !SKIP_TAGS.has(String(child.tagName).toLowerCase()));
      // 只有当某个子元素几乎装下了全部正文时才下钻，避免把外层包装当正文
      const dominant = children.find((child) => textLength(child) >= baseLength * 0.9 && textLength(child) >= MIN_ROOT_TEXT);
      if (!dominant) break;
      current = dominant;
    }
    return current;
  }

  function pickContentRoot() {
    const explicit = [
      "#js_content",
      ".rich_media_content",
      "#activity-detail .rich_media_content",
      "[itemprop='articleBody']",
      "article .article-content",
      ".markdown-body",
      ".post-content",
      ".entry-content",
      ".article-content",
      "#article-content",
      ".note-content",
      ".RichText",
      "#content_views",
      "article",
      "main"
    ];
    for (const selector of explicit) {
      const el = document.querySelector(selector);
      if (el && textLength(el) >= MIN_ROOT_TEXT && linkDensity(el) < 0.5) {
        return { el: descendToTightestWrapper(el), selector };
      }
    }

    let best = null;
    for (const el of document.querySelectorAll("article, main, section, div, td")) {
      if (el.closest("nav, footer, aside")) continue;
      const length = textLength(el);
      if (length < MIN_ROOT_TEXT) continue;
      const density = linkDensity(el);
      if (density > 0.45) continue;
      const paragraphs = el.querySelectorAll("p, br").length;
      const images = el.querySelectorAll("img").length;
      let score = length * (1 - density) + paragraphs * 20 + images * 15;
      if (isNoise(el)) score *= 0.3;
      if (!best || score > best.score) best = { el, score };
    }
    if (!best) return null;
    return { el: descendToTightestWrapper(best.el), selector: "" };
  }

  function readMetadata() {
    const title =
      metaContent('meta[property="og:title"]', 'meta[name="twitter:title"]', 'meta[name="citation_title"]') ||
      document.querySelector("h1")?.innerText?.trim() ||
      document.title ||
      "";
    const author =
      document.querySelector("#js_name")?.innerText?.trim() ||
      document.querySelector(".rich_media_meta_nickname")?.innerText?.trim() ||
      metaContent('meta[name="author"]', 'meta[property="article:author"]', 'meta[name="twitter:creator"]') ||
      "";
    const siteName = metaContent('meta[property="og:site_name"]') || location.hostname.replace(/^www\./, "");
    const publishedAt =
      metaContent('meta[property="article:published_time"]', 'meta[name="pubdate"]', 'meta[itemprop="datePublished"]') ||
      document.querySelector("#publish_time")?.innerText?.trim() ||
      document.querySelector("time[datetime]")?.getAttribute("datetime") ||
      "";
    const description = metaContent('meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]');
    const cover = absoluteUrl(metaContent('meta[property="og:image"]', 'meta[name="twitter:image"]'));
    return { title: title.trim(), author, siteName, publishedAt, description, cover };
  }

  try {
    const meta = readMetadata();
    const selection = window.getSelection()?.toString().trim() || "";
    const picked = pickContentRoot();
    if (!picked?.el) {
      return { ok: false, url: location.href, selection, ...meta, markdown: "", textLength: 0, imageCount: 0, reason: "no-content" };
    }
    ignoreVisibility = styleOf(picked.el)?.visibility === "hidden";
    const markdown = tidyMarkdown(renderChildren(picked.el));
    const plain = markdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const imageCount = (markdown.match(/!\[[^\]]*\]\(https?:\/\//g) || []).length;
    return {
      ok: plain.length >= MIN_ROOT_TEXT || imageCount > 0,
      url: location.href,
      selection,
      ...meta,
      markdown,
      textLength: plain.length,
      imageCount,
      contentSelector: picked.selector,
      reason: ""
    };
  } catch (err) {
    return { ok: false, url: location.href, markdown: "", textLength: 0, imageCount: 0, reason: String(err?.message || err) };
  }
}

/* ----- 下面是各处共用的小工具（popup / manager / storage 都会 import） ----- */

export function clipPlainText(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clipExcerpt(markdown, max = 600) {
  const text = clipPlainText(markdown);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"), cut.lastIndexOf(". "));
  return `${stop > max * 0.6 ? cut.slice(0, stop + 1) : cut}…`;
}

export function clipImageUrls(markdown) {
  const urls = [];
  const seen = new Set();
  const pattern = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  let match = pattern.exec(markdown || "");
  while (match) {
    const url = match[1];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
    match = pattern.exec(markdown || "");
  }
  return urls;
}

// 剪藏结果 → 存库用的 clip 字段
export function buildClipRecord(page, { clippedAt = new Date().toISOString() } = {}) {
  const markdown = String(page?.markdown || "").trim();
  if (!markdown) return null;
  return {
    markdown,
    siteName: String(page?.siteName || "").trim(),
    author: String(page?.author || "").trim(),
    publishedAt: String(page?.publishedAt || "").trim(),
    cover: String(page?.cover || "").trim(),
    contentSelector: String(page?.contentSelector || ""),
    textLength: Number(page?.textLength) || clipPlainText(markdown).length,
    imageCount: clipImageUrls(markdown).length,
    clippedAt
  };
}

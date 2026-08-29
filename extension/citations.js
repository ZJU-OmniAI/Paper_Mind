// 引用量获取模块：使用 Semantic Scholar 免费 API。
// 选用原因：Google Scholar 对脚本化 fetch 一律返回验证码（实测整库被拦），无法稳定使用；
// Semantic Scholar 免费、稳定、不被封，对 arXiv 预印本聚合快、数字接近 Google Scholar。
// 解析顺序：arXiv ID → DOI → 标题检索。
// 文档：https://api.semanticscholar.org/

const S2_BASE = "https://api.semanticscholar.org/graph/v1/paper";
const S2_FIELDS = "title,citationCount";
const S2_TIMEOUT_MS = 15000;
const S2_RETRY_DELAY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildText(input) {
  return `${input?.sourceUrl || ""}\n${input?.conversation || ""}`;
}

// 识别 arxiv.org / alphaxiv.org 上的 arXiv 编号，支持新式（2605.29829）与旧式（hep-th/9901001）。
function extractArxivId(input) {
  const text = buildText(input);
  const modern = text.match(/(?:arxiv\.org|alphaxiv\.org)\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?/i);
  if (modern) return modern[1];
  const legacy = text.match(/arxiv\.org\/(?:abs|pdf)\/([a-z-]+(?:\.[a-z]{2})?\/\d{7})/i);
  if (legacy) return legacy[1].toLowerCase();
  const bare = text.match(/\barxiv:\s*(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return bare ? bare[1] : "";
}

function extractDoi(input) {
  const text = buildText(input);
  const match = text.match(/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  if (!match) return "";
  return match[0].replace(/[).,;]+$/, "").toLowerCase();
}

// 去掉标题里的站点后缀和常见前缀，提升标题检索命中率。
function cleanTitle(title) {
  return String(title || "")
    .replace(/\s*[|｜]\s*(alphaXiv|arXiv|OpenReview|Papers With Code|Hugging Face).*$/i, "")
    .replace(/^\s*(Abstract|摘要)\s*[:：]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, " ")
    .trim();
}

// 标题相似度（词级重合 + 子串包含），用于校验标题检索结果，避免匹配到无关论文。
function titleOverlap(a, b) {
  const left = normalizeForCompare(a);
  const right = normalizeForCompare(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  return shared / union;
}

const S2_MAX_RETRY = 2;

// 429 时退避重试（最多 2 次，间隔递增）；404 返回 null；超时/其余错误抛出。
async function requestS2(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), S2_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("Semantic Scholar 请求超时，请稍后重试");
    throw new Error(`Semantic Scholar 网络请求失败：${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 404) return null;
  if (response.status === 429) {
    if (attempt < S2_MAX_RETRY) {
      await sleep(S2_RETRY_DELAY_MS * (attempt + 1));
      return requestS2(url, attempt + 1);
    }
    throw new Error("Semantic Scholar 请求过于频繁（429），请稍后再试");
  }
  if (!response.ok) throw new Error(`Semantic Scholar 请求失败：HTTP ${response.status}`);
  return response.json();
}

function toResult(paper, source) {
  if (!paper || typeof paper.citationCount !== "number") return null;
  return { status: "ok", count: paper.citationCount, source, externalId: paper.paperId || "" };
}

async function fetchById(idPath, source) {
  const paper = await requestS2(`${S2_BASE}/${idPath}?fields=${encodeURIComponent(S2_FIELDS)}`);
  return toResult(paper, source);
}

// 标题检索可能返回同名副本，取多条候选，在标题高度吻合（>=0.82）的记录中选引用数最高的规范记录。
async function fetchByTitle(title) {
  const url = `${S2_BASE}/search?query=${encodeURIComponent(title)}&limit=5&fields=${encodeURIComponent(S2_FIELDS)}`;
  const payload = await requestS2(url);
  const candidates = (payload?.data || []).filter((paper) => titleOverlap(title, paper.title) >= 0.82);
  const best = candidates.reduce((top, paper) => ((paper.citationCount || 0) > (top?.citationCount || 0) ? paper : top), null);
  return toResult(best, "semanticscholar:title");
}

// 返回 { status: "ok"|"notfound", count, source, externalId }。
// 网络/限流错误会抛出，交由上层记录为 error 状态并下次重试。
export async function fetchCitationCount(input) {
  const arxivId = extractArxivId(input);
  if (arxivId) {
    const result = await fetchById(`arXiv:${arxivId}`, "semanticscholar:arxiv");
    if (result) {
      console.debug("[Paper_Mind] S2 命中(arXiv)", { arxivId, count: result.count });
      return result;
    }
  }

  const doi = extractDoi(input);
  if (doi) {
    const result = await fetchById(`DOI:${doi}`, "semanticscholar:doi");
    if (result) {
      console.debug("[Paper_Mind] S2 命中(DOI)", { doi, count: result.count });
      return result;
    }
  }

  const title = cleanTitle(input?.title);
  if (title) {
    const result = await fetchByTitle(title);
    if (result) {
      console.debug("[Paper_Mind] S2 命中(标题)", { title, count: result.count });
      return result;
    }
  }

  console.debug("[Paper_Mind] S2 未找到", { title, arxivId });
  return { status: "notfound", count: null, source: "", externalId: "" };
}

export const __testing = { extractArxivId, extractDoi, cleanTitle, titleOverlap };

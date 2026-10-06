// Counts describe Semantic Scholar's corpus, not Google Scholar or a global total.
// Match paper identity before reading its count; popularity is never identity evidence.
// 文档：https://api.semanticscholar.org/

const S2_BASE = "https://api.semanticscholar.org/graph/v1/paper";
const S2_FIELDS = "title,citationCount,externalIds,authors,year";
const METADATA_FIELDS = "title,authors,year,venue,journal,url";
const S2_TIMEOUT_MS = 15000;
const S2_RETRY_DELAY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sourceUrl(input) {
  try {
    const url = new URL(String(input?.sourceUrl || "").trim());
    return /^(https?:)$/.test(url.protocol) ? url : null;
  } catch { return null; }
}

// 识别 arxiv.org / alphaxiv.org 上的 arXiv 编号，支持新式（2605.29829）与旧式（hep-th/9901001）。
function extractArxivId(input) {
  const url = sourceUrl(input);
  if (!url || !/^(?:www\.|export\.)?(?:arxiv|alphaxiv)\.org$/i.test(url.hostname)) return "";
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return ""; }
  const modern = path.match(/^\/(?:abs|pdf|html|overview)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?\/?$/i);
  if (modern) return modern[1];
  const legacy = path.match(/^\/(?:abs|pdf|html)\/([a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?\/?$/i);
  return legacy ? legacy[1].toLowerCase() : "";
}

function extractDoi(input) {
  const url = sourceUrl(input);
  if (!url) return "";
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return ""; }
  const match = path.match(/(?:^|\/)(10\.\d{4,9}\/\S+)$/i);
  if (!match) return "";
  return match[1].replace(/[.,;]+$/, "").toLowerCase();
}

// 去掉标题里的站点后缀和常见前缀，提升标题检索命中率。
function cleanTitle(title) {
  return String(title || "")
    .replace(/\s*[|｜]\s*(alphaXiv|arXiv|OpenReview|Papers With Code|Hugging Face).*$/i, "")
    .replace(/^\s*(Abstract|摘要)\s*[:：]\s*/i, "")
    .replace(/^\s*\[\d{4}\.\d{4,5}(?:v\d+)?\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sameTitle(a, b) {
  const title = normalizeForCompare(cleanTitle(a));
  return Boolean(title) && title === normalizeForCompare(cleanTitle(b));
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
  if (!paper || !Number.isSafeInteger(paper.citationCount) || paper.citationCount < 0) return null;
  return { status: "ok", count: paper.citationCount, source, externalId: paper.paperId || "", matchedTitle: paper.title || "" };
}

const noCount = (status = "notfound") => ({ status, count: null, source: "", externalId: "", matchedTitle: "" });

async function fetchById(idPath, source, input) {
  const paper = await requestS2(`${S2_BASE}/${encodeURIComponent(idPath)}?fields=${encodeURIComponent(S2_FIELDS)}`);
  // A legacy source URL may have been inferred from an unrelated link in notes.
  if (paper && cleanTitle(input.title) && !sameTitle(input.title, paper.title)) return noCount("ambiguous");
  return toResult(paper, source);
}

async function fetchByTitle(title, input) {
  const url = `${S2_BASE}/search?query=${encodeURIComponent(title)}&limit=10&fields=${encodeURIComponent(S2_FIELDS)}`;
  const payload = await requestS2(url);
  const nameKey = name => normalizeForCompare(name).split(" ").sort().join(" ");
  const authors = (Array.isArray(input.authors) ? input.authors : []).map(nameKey).filter(Boolean);
  const arxivId = extractArxivId(input), doi = extractDoi(input);
  const exact = (payload?.data || []).filter(paper => sameTitle(input.title, paper.title));
  const candidates = exact.filter(paper => {
    const ids = paper.externalIds || {};
    if (arxivId && ids.ArXiv && ids.ArXiv.replace(/v\d+$/i, "").toLowerCase() !== arxivId) return false;
    if (doi && ids.DOI && ids.DOI.toLowerCase() !== doi) return false;
    if (input.year && paper.year && String(input.year) !== String(paper.year)) return false;
    if (authors.length && !(paper.authors || []).some(author => authors.includes(nameKey(author.name)))) return false;
    return true;
  });
  // Distinct records remain ambiguous even when one happens to have more citations.
  const distinct = new Map(candidates.map(paper => [paper.paperId || JSON.stringify(paper), paper]));
  if (distinct.size !== 1) return noCount(exact.length ? "ambiguous" : "notfound");
  return toResult([...distinct.values()][0], "semanticscholar:title");
}

// Returns an exact count, an unavailable record, or an ambiguous identity.
// 网络/限流错误会抛出，交由上层记录为 error 状态并下次重试。
export async function fetchCitationCount(input = {}) {
  const arxivId = extractArxivId(input);
  if (arxivId) {
    const result = await fetchById(`arXiv:${arxivId}`, "semanticscholar:arxiv", input);
    if (result) return result;
  }

  const doi = extractDoi(input);
  if (doi) {
    const result = await fetchById(`DOI:${doi}`, "semanticscholar:doi", input);
    if (result) return result;
  }

  const title = cleanTitle(input?.title);
  if (title) {
    const result = await fetchByTitle(title.slice(0, 600), input);
    if (result) return result;
  }

  return noCount();
}

export const __testing = { extractArxivId, extractDoi, cleanTitle };

async function fetchS2Metadata(input) {
  const toMetadata = paper => ({ authors: (paper.authors || []).map(author => author.name).filter(Boolean),
    year: paper.year ? String(paper.year) : '', venue: paper.venue || paper.journal?.name || '' });
  const ids = [extractArxivId(input) && `arXiv:${extractArxivId(input)}`, extractDoi(input) && `DOI:${extractDoi(input)}`].filter(Boolean);
  for (const id of ids) {
    const paper = await requestS2(`${S2_BASE}/${encodeURIComponent(id)}?fields=${encodeURIComponent(METADATA_FIELDS)}`, S2_MAX_RETRY);
    if (paper) return { ...toMetadata(paper), matchedBy: 'id', title: paper.title || '', sourceUrl: paper.url || '', found: true };
  }
  const title = cleanTitle(input.title).slice(0, 600);
  if (!title) return { found: false };
  const result = await requestS2(`${S2_BASE}/search?query=${encodeURIComponent(title)}&limit=5&fields=${encodeURIComponent(METADATA_FIELDS)}`, S2_MAX_RETRY);
  // Title-only matches must be exact after punctuation/case normalization. An
  // ambiguous title never silently supplies a different paper's bibliographic facts.
  const exact = (result?.data || []).filter(paper => normalizeForCompare(paper.title) === normalizeForCompare(title));
  const distinct = new Map(exact.map(paper => [JSON.stringify(toMetadata(paper)), paper]));
  if (distinct.size !== 1) return { found: false, ambiguous: distinct.size > 1 };
  const paper = [...distinct.values()][0];
  return { ...toMetadata(paper), title: paper.title, matchedBy: 'title', sourceUrl: paper.url || '', found: true };
}


async function fetchCrossrefMetadata(input) {
  const doi = extractDoi(input), title = cleanTitle(input.title).slice(0, 600);
  if (!doi && !title) return { found: false };
  const url = doi ? `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    : `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=5`;
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (response.status === 404) return { found: false };
  if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
  const payload = await response.json();
  const toMetadata = item => ({
    title: item.title?.[0] || '',
    authors: (item.author || []).map(author => author.name || [author.given,author.family].filter(Boolean).join(' ')).filter(Boolean),
    year: String((item['published-print'] || item.published || item.issued)?.['date-parts']?.[0]?.[0] || ''),
    venue: item['container-title']?.[0] || '',
    sourceUrl: item.DOI ? `https://doi.org/${item.DOI}` : ''
  });
  const candidates = doi ? [payload.message].filter(item=>item?.DOI?.toLowerCase() === doi)
    : (payload.message?.items || []).filter(item=>normalizeForCompare(item.title?.[0]) === normalizeForCompare(title));
  const distinct = new Map(candidates.map(item => {
    const result = toMetadata(item);
    return [JSON.stringify([result.authors,result.year,result.venue]), result];
  }));
  if (distinct.size !== 1) return { found:false, ambiguous:distinct.size>1 };
  return { ...[...distinct.values()][0], found:true, matchedBy:doi?'id':'title' };
}

export async function fetchPaperMetadata(input) {
  let firstError;
  try {
    const result = await fetchS2Metadata(input);
    if (result.found || result.ambiguous) return { ...result, provider:'Semantic Scholar' };
  } catch (error) { firstError = error; }
  try {
    return { ...await fetchCrossrefMetadata(input), provider:'Crossref' };
  } catch (error) {
    throw new Error([firstError?.message,error.message].filter(Boolean).join('; '));
  }
}

// 按论文身份查书目信息：arXiv 编号 > OpenReview 编号 > 会议落地页 > DOI，
// 都没有时才按逐字一致的标题检索。只用学术数据库和论文页自己的元数据，从不让模型猜；
// 同名多篇、标题对不上就不填。这里不依赖 DOM，service worker / popup / 管理页都能跑。

import { fetchPaperMetadata } from "./citations.js";
import { cleanPaperTitle, isPaperHost, isWeakTitle, normalizeArxivId, resolvePaperSource } from "./paper-source.js";

const ARXIV_API = "https://export.arxiv.org/api/query";
const ARXIV_BATCH = 40;
// arXiv 要求连续请求至少间隔 3 秒
export const ARXIV_SPACING_MS = 3100;
const TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, { credentials = "omit", accept = "*/*", timeoutMs = TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetch(url, { credentials, headers: { accept }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const host = new URL(url).hostname;
    const failure = new Error(error?.name === "TimeoutError" ? `${host} 请求超时` : `${host} 网络请求失败：${error?.message || error}`);
    failure.timeout = error?.name === "TimeoutError";
    throw failure;
  }
  if (!response.ok) {
    const error = new Error(`${new URL(url).hostname} HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };

function decodeEntities(value) {
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== "#") return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  });
}

// arXiv 偶尔限流（429 / 503）或连接被重置：等 3 秒重试一次。超时已经等了很久，不再重试
async function fetchArxivText(url) {
  try {
    return await fetchText(url, { accept: "application/atom+xml" });
  } catch (error) {
    if (error.timeout || (error.status && error.status !== 429 && error.status < 500)) throw error;
    await sleep(ARXIV_SPACING_MS);
    return fetchText(url, { accept: "application/atom+xml" });
  }
}

const squash = (value) => decodeEntities(value).replace(/\s+/g, " ").trim();
const stripTags = (value) => String(value || "").replace(/<[^>]*>/g, " ");

export function compareKey(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// 只差大小写（PDF 元数据里的 "VIDEOTREE" ↔ arXiv 的 "VideoTree"）才算同一个写法；
// 标点不同不算："π∗0.6" 不该被换成 arXiv 的 LaTeX 写法 "$π^{*}_{0.6}$"
export function sameTitleIgnoringCase(left, right) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}

// "Last, First" → "First Last"，和 arXiv / Semantic Scholar 的写法一致
function personName(value) {
  const name = squash(value).replace(/[,，;；]+$/, "");
  const parts = name.split(/\s*,\s*/);
  return parts.length === 2 && parts[0] && parts[1] && !/^(?:jr|sr|ii|iii|iv)\.?$/i.test(parts[1]) ? `${parts[1]} ${parts[0]}` : name;
}

/* ----- arXiv ----- */

function xmlField(body, name) {
  const match = body.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? squash(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
}

export function parseArxivFeed(xml) {
  const entries = [];
  for (const [, body] of String(xml || "").matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const arxivId = normalizeArxivId(xmlField(body, "id").replace(/^https?:\/\/(?:www\.|export\.)?arxiv\.org\/abs\//i, ""));
    const title = xmlField(body, "title");
    // 编号格式不对时 arXiv 返回一条 title 为 Error 的条目
    if (!arxivId || !title || /^error$/i.test(title)) continue;
    entries.push({
      arxivId,
      title,
      abstract: xmlField(body, "summary"),
      authors: [...body.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi)].map(([, author]) => xmlField(author, "name")).filter(Boolean),
      published: xmlField(body, "published"),
      journalRef: xmlField(body, "arxiv:journal_ref"),
      comment: xmlField(body, "arxiv:comment"),
      doi: xmlField(body, "arxiv:doi").toLowerCase()
    });
  }
  return entries;
}

const VENUE_NAMES = String.raw`CVPR|ICCV|ECCV|WACV|BMVC|3DV|NeurIPS|NIPS|ICML|ICLR|AAAI|IJCAI|AISTATS|UAI|COLT|ACL|EMNLP|NAACL|EACL|COLING|AACL|CoNLL|COLM|TACL|LREC|KDD|WWW|SIGIR|WSDM|CIKM|RecSys|ICDE|SIGMOD|VLDB|CHI|UIST|CSCW|SIGGRAPH Asia|SIGGRAPH|CoRL|RSS|ICRA|IROS|Humanoids|HRI|MICCAI|ICASSP|Interspeech|ACM MM|ACMMM|TPAMI|T-PAMI|IJCV|TIP|TMLR|JMLR|T-RO|TRO|RA-L|RAL|IJRR|TNNLS|TKDE|TOG`;
// "CVPR 2025"、"NeurIPS'24"、"… Pattern Recognition (CVPR) 2026"
const VENUE_PATTERN = new RegExp(String.raw`\b(${VENUE_NAMES})\)?\s*(?:((?:19|20)\d{2})|['’](\d{2}))(?!\d)`);
const ACCEPTED = /\b(?:accepted|accept|to appear|appear(?:s|ed)? (?:in|at)|published|camera[- ]ready|oral|spotlight|poster|highlight|findings)\b/i;
const NOT_ACCEPTED = /\b(?:submitted|submission|under review|in review|rejected|withdrawn|extended version|extension of|journal version|based on|previous|prior|preliminary|follow-up|challenge|competition|technical report|tech report)\b/i;

// arXiv 的 journal_ref 是正式出处；comment 里作者自己写的"CVPR 2025 / Accepted to NeurIPS 2024"
// 只在明确写了录用、且不是"投稿中 / 扩展版 / 比赛报告"时才认
export function venueFromArxiv(entry = {}) {
  const journal = squash(entry.journalRef);
  if (journal) return { venue: journal.slice(0, 200), year: journal.match(/\b(?:19|20)\d{2}\b/)?.[0] || "" };
  for (const clause of String(entry.comment || "").split(/[;\n]|\.\s+|,\s+(?=[A-Z])/)) {
    const part = clause.trim();
    const match = part.match(VENUE_PATTERN);
    if (!match || NOT_ACCEPTED.test(part)) continue;
    if (match.index > 0 && !ACCEPTED.test(part)) continue;
    const year = match[2] || `20${match[3]}`;
    const name = match[1] === "NIPS" ? "NeurIPS" : match[1];
    const findings = /\bfindings\b/i.test(part) ? "Findings of " : "";
    const workshop = /\bworkshops?\b/i.test(part) ? " Workshop" : "";
    return { venue: `${findings}${name} ${year}${workshop}`, year };
  }
  return { venue: "", year: "" };
}

export function metadataFromArxiv(entry) {
  const { venue, year } = venueFromArxiv(entry);
  return {
    title: entry.title,
    authors: entry.authors,
    abstract: entry.abstract,
    // 已录用的论文按会议年份记，否则按 arXiv 首次提交年份
    year: year || String(entry.published || "").slice(0, 4),
    venue,
    arxivId: entry.arxivId,
    doi: entry.doi || "",
    sourceUrl: `https://arxiv.org/abs/${entry.arxivId}`
  };
}

export async function fetchArxivRecords(ids, { spacingMs = ARXIV_SPACING_MS } = {}) {
  const unique = [...new Set(ids.map(normalizeArxivId).filter(Boolean))];
  const records = new Map();
  for (let start = 0; start < unique.length; start += ARXIV_BATCH) {
    if (start) await sleep(spacingMs);
    const chunk = unique.slice(start, start + ARXIV_BATCH);
    const list = chunk.map((id) => encodeURIComponent(id).replace(/%2F/gi, "/")).join(",");
    const xml = await fetchArxivText(`${ARXIV_API}?id_list=${list}&max_results=${chunk.length}`);
    for (const entry of parseArxivFeed(xml)) if (chunk.includes(entry.arxivId)) records.set(entry.arxivId, entry);
  }
  return records;
}

// export.arxiv.org 偶尔超时或限流，单篇查询时退回 arxiv.org 的摘要页（页面里有 citation_* 元数据）
async function fetchArxivAbsPage(arxivId) {
  const html = await fetchText(`https://arxiv.org/abs/${arxivId}`, { accept: "text/html" });
  const page = parseCitationMeta(html);
  if (!page.title) return null;
  const cell = (name) => squash(stripTags(html.match(new RegExp(`<td class="tablecell ${name}[^"]*"[^>]*>([\\s\\S]*?)</td>`, "i"))?.[1] || ""));
  return {
    arxivId,
    title: page.title,
    abstract: page.abstract,
    authors: page.authors,
    published: page.date,
    journalRef: cell("jref"),
    comment: cell("comments"),
    doi: ""
  };
}

export async function fetchArxivEntry(arxivId) {
  const id = normalizeArxivId(arxivId);
  if (!id) return null;
  let apiError;
  try {
    const entry = (await fetchArxivRecords([id])).get(id);
    if (entry) return entry;
  } catch (error) {
    apiError = error;
  }
  try {
    return await fetchArxivAbsPage(id);
  } catch (error) {
    if (error.status === 404 && !apiError) return null;
    throw apiError || error;
  }
}

export async function searchArxivByTitle(title) {
  const words = compareKey(cleanPaperTitle(title));
  if (words.split(" ").length < 3) return null;
  const xml = await fetchArxivText(`${ARXIV_API}?search_query=${encodeURIComponent(`ti:"${words}"`)}&max_results=10`);
  const exact = parseArxivFeed(xml).filter((entry) => compareKey(entry.title) === words);
  // 同名的不同论文就不认
  return new Set(exact.map((entry) => entry.arxivId)).size === 1 ? exact[0] : null;
}

/* ----- 论文落地页 / OpenReview ----- */

// 落地页的 citation_* 元数据（正则解析，service worker 里没有 DOMParser）
export function parseCitationMeta(html) {
  const metas = [];
  for (const [, attrs] of String(html || "").matchAll(/<meta\b([^>]*)>/gi)) {
    const map = {};
    for (const [, key, , doubleQuoted, singleQuoted, bare] of attrs.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      map[key.toLowerCase()] = doubleQuoted ?? singleQuoted ?? bare ?? "";
    }
    const name = String(map.name || map.property || "").toLowerCase();
    if (name && map.content) metas.push([name, squash(map.content)]);
  }
  const all = (name) => metas.filter(([key]) => key === name).map(([, value]) => value).filter(Boolean);
  const first = (...names) => names.map((name) => all(name)[0]).find(Boolean) || "";
  let authors = [...new Set(all("citation_author").map(personName).filter(Boolean))];
  if (!authors.length) authors = [...new Set(first("citation_authors").split(/\s*;\s*/).map(personName).filter(Boolean))];
  if (!authors.length && first("dc.title")) authors = [...new Set(all("dc.creator").map(personName).filter(Boolean))];
  const date = first("citation_publication_date", "citation_date", "citation_online_date", "citation_cover_date", "citation_year", "prism.publicationdate", "dc.date");
  let abstract = first("citation_abstract", "dcterms.abstract");
  if (!abstract) {
    // NeurIPS / CVF 等落地页的摘要只在正文里
    const block = html.match(/<div[^>]*\bid=["']abstract["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || html.match(/<h[1-6][^>]*>\s*Abstract\s*<\/h[1-6]>\s*((?:<(?:p|div|span)[^>]*>\s*)*[\s\S]{80,8000}?)<\/(?:p|div|span)>/i)?.[1];
    abstract = squash(stripTags(block));
  }
  const doi = (first("citation_doi", "prism.doi", "dc.identifier").match(/\b10\.\d{4,9}\/[^\s"'<>]+/) || [""])[0].replace(/[.,;)]+$/, "").toLowerCase();
  const ieee = parseIeeeMetadata(html);
  return {
    title: cleanPaperTitle(first("citation_title", "dc.title") || ieee?.title || first("og:title")),
    authors: authors.length ? authors : ieee?.authors || [],
    date: date || ieee?.date || "",
    year: (date || ieee?.date || "").match(/\b(?:19|20)\d{2}\b/)?.[0] || "",
    venue: first("citation_journal_title", "citation_conference_title", "citation_conference", "citation_inbook_title", "prism.publicationname") || ieee?.venue || "",
    abstract: (abstract.length >= 80 ? abstract.replace(/^(?:abstract|摘要)\s*[:：.]?\s*/i, "") : "") || ieee?.abstract || "",
    doi: doi || ieee?.doi || "",
    arxivId: normalizeArxivId(first("citation_arxiv_id"))
  };
}

function parseIeeeMetadata(html) {
  const json = String(html || "").match(/xplGlobal\.document\.metadata\s*=\s*(\{[\s\S]*?\});\s*(?:\n|$)/)?.[1];
  if (!json) return null;
  try {
    const record = JSON.parse(json);
    return {
      title: squash(record.displayDocTitle || record.title),
      authors: (record.authors || []).map((author) => squash(author?.name)).filter(Boolean),
      date: String(record.publicationYear || record.publicationDate || ""),
      venue: squash(record.displayPublicationTitle || record.publicationTitle),
      abstract: squash(record.abstract),
      doi: String(record.doi || "").toLowerCase()
    };
  } catch {
    return null;
  }
}

async function fetchLandingPage(url) {
  // 带上浏览器自己的 Cookie：OpenReview / 出版商的人机验证只认已经过验证的会话
  const page = parseCitationMeta(await fetchText(url, { credentials: "include", accept: "text/html" }));
  return page.title && (page.authors.length || page.abstract) ? page : null;
}

// OpenReview 的 PDF 直链：用 API 查（新旧两套 API 都试）。没有通过站点人机验证时返回 403，交给后面的方式
async function fetchOpenReviewNote(id) {
  const value = (field) => (field && typeof field === "object" && !Array.isArray(field) && "value" in field ? field.value : field);
  for (const base of ["https://api2.openreview.net", "https://api.openreview.net"]) {
    let payload;
    try {
      payload = JSON.parse(await fetchText(`${base}/notes?id=${encodeURIComponent(id)}`, { credentials: "include", accept: "application/json" }));
    } catch {
      continue;
    }
    const note = payload?.notes?.[0];
    const content = note?.content || {};
    const title = squash(value(content.title));
    if (!title) continue;
    const rawVenue = squash(value(content.venue));
    // "Submitted to ICLR 2025"、撤稿、拒稿都不是发表出处
    const venue = /submitted to|withdrawn|reject|under review|anonymous/i.test(rawVenue) ? "" : rawVenue;
    const stamp = note.pdate || note.odate || note.cdate;
    return {
      title,
      authors: [value(content.authors) || []].flat().map(squash).filter(Boolean),
      abstract: squash(value(content.abstract)),
      venue,
      year: venue.match(/\b(?:19|20)\d{2}\b/)?.[0] || (stamp ? String(new Date(stamp).getUTCFullYear()) : ""),
      sourceUrl: `https://openreview.net/forum?id=${encodeURIComponent(id)}`
    };
  }
  return null;
}

/* ----- 总入口 ----- */

/**
 * 网页上出现的 arXiv 链接只是候选：标题对得上才认。
 * loose：代码仓库 / 项目主页的标题常带前缀（"[CVPR 2025] VideoTree: …"），允许包含关系。
 */
export function titleMatchesCandidates(recordTitle, candidates = [], { loose = false } = {}) {
  const target = compareKey(recordTitle);
  const head = compareKey(String(recordTitle || "").split(/[:：]/)[0]);
  if (!target) return false;
  return candidates.some((candidate) => {
    const key = compareKey(cleanPaperTitle(candidate));
    if (!key) return false;
    if (key === target) return true;
    // 项目主页只写简称："VideoTree" ↔ "VideoTree: Adaptive Tree-based …"
    if (head !== target && head.length >= 3 && key === head) return true;
    return loose && target.length >= 12 && key.includes(target);
  });
}

/**
 * input:
 *   sourceUrl         论文地址（可以是阅读器地址，会自动还原）
 *   title             当前标题
 *   arxivId / doi     页面元数据里读到的编号（可选）
 *   arxivCandidates   页面上链接到的 arXiv 编号，按标题核对后才用
 *   titleCandidates   用来核对候选的页面标题们
 *   looseTitleMatch   见 titleMatchesCandidates
 *   allowTitleSearch  没有任何编号时按标题精确检索
 * 返回 { found, ambiguous, provider, matchedBy: "id" | "link" | "title", title, authors, year, venue, abstract, sourceUrl, arxivId, doi }
 */
export async function lookupPaperMetadata(input = {}) {
  const source = resolvePaperSource(input.sourceUrl || "");
  const arxivId = normalizeArxivId(input.arxivId) || source.arxivId;
  const doi = String(input.doi || source.doi || "").toLowerCase();
  const title = cleanPaperTitle(input.title);
  const errors = [];
  const attempt = async (task) => {
    try {
      return await task();
    } catch (error) {
      errors.push(error);
      return null;
    }
  };

  if (arxivId) {
    const entry = await attempt(() => fetchArxivEntry(arxivId));
    if (entry) return { found: true, provider: "arXiv", matchedBy: "id", ...metadataFromArxiv(entry) };
  }
  if (source.openreviewId) {
    const note = await attempt(() => fetchOpenReviewNote(source.openreviewId));
    if (note) return { found: true, provider: "OpenReview", matchedBy: "id", arxivId: "", doi: "", ...note };
  }
  if (source.landingUrl && source.landingUrl !== source.url) {
    const page = await attempt(() => fetchLandingPage(source.landingUrl));
    if (page?.arxivId && !page.authors.length) {
      const entry = await attempt(() => fetchArxivEntry(page.arxivId));
      if (entry) return { found: true, provider: "arXiv", matchedBy: "id", ...metadataFromArxiv(entry) };
    }
    if (page) return { found: true, provider: new URL(source.landingUrl).hostname.replace(/^www\./, ""), matchedBy: "id", ...page, sourceUrl: source.landingUrl };
  }
  const candidates = [...new Set((input.arxivCandidates || []).map(normalizeArxivId).filter(Boolean))].slice(0, 5);
  if (!arxivId && candidates.length) {
    const records = await attempt(() => fetchArxivRecords(candidates));
    const titles = [...(input.titleCandidates || []), title].filter(Boolean);
    const matches = [...(records?.values() || [])].filter((entry) => titleMatchesCandidates(entry.title, titles, { loose: Boolean(input.looseTitleMatch) }));
    if (matches.length === 1) return { found: true, provider: "arXiv", matchedBy: "link", ...metadataFromArxiv(matches[0]) };
  }
  if (doi) {
    const result = await attempt(() => fetchPaperMetadata({ title, sourceUrl: `https://doi.org/${doi}` }));
    if (result?.found) return { doi, ...result };
  }
  if (!arxivId && input.allowTitleSearch && title && !isWeakTitle(title)) {
    const entry = await attempt(() => searchArxivByTitle(title));
    if (entry) return { found: true, provider: "arXiv", matchedBy: "title", ...metadataFromArxiv(entry) };
    if (!doi) {
      const result = await attempt(() => fetchPaperMetadata({ title }));
      if (result?.found || result?.ambiguous) return result;
    }
  }
  // 全部失败且确实有网络错误时报错，让调用方提示"稍后重试"；单纯没找到就是 found:false
  if (errors.length) {
    const error = new Error([...new Set(errors.map((item) => item.message))].join("；"));
    error.partial = true;
    throw error;
  }
  return { found: false };
}

/* ----- 库里已有论文缺什么 ----- */

const TRUNCATED_ABSTRACT = /(?:\.\.\.|…)\s*$/;

// 抓到的摘要只是截断的开头（alphaXiv 的 og:description 只有 ~200 字）时才换成完整摘要
export function isTruncatedAbstract(current, full) {
  const left = compareKey(String(current || "").replace(TRUNCATED_ABSTRACT, ""));
  const right = compareKey(full);
  return Boolean(left) && right.length > left.length + 20 && right.startsWith(left.slice(0, Math.max(40, left.length - 12)));
}

export function bibliographyGaps(paper = {}) {
  const source = resolvePaperSource(paper.sourceUrl || "");
  return {
    authors: !(paper.authors || []).length,
    year: !paper.year,
    venue: !paper.venue,
    abstract: !String(paper.abstract || "").trim() || TRUNCATED_ABSTRACT.test(String(paper.abstract || "")) || String(paper.abstract || "").trim().length < 300,
    title: isWeakTitle(paper.title),
    // 阅读器地址（chrome-extension://…?id=2405.19209）换成论文自己的地址
    sourceUrl: Boolean(source.reader && source.url && source.url !== paper.sourceUrl && !source.local),
    arxivId: source.arxivId
  };
}

// 没有任何编号时，只有"像论文"的记录才按标题去查：手动添加（无来源）、PDF、阅读器、论文站点。
// 公众号 / 知乎 / 博客这类解读文章的标题不是论文标题，查了也是白查
export function titleSearchAllowed(paper = {}) {
  if (isWeakTitle(paper.title)) return false;
  if (!String(paper.sourceUrl || "").trim()) return true;
  const source = resolvePaperSource(paper.sourceUrl);
  return source.pdf || source.local || isPaperHost(source.url);
}

function hasIdentity(source) {
  return Boolean(source.arxivId || source.doi || source.openreviewId || source.landingUrl);
}

// 值得去查的：缺作者/年份、标题是占位、来源是阅读器地址；有 arXiv 编号时摘要不全或缺出处也查（批量查很便宜）
export function needsBibliography(paper = {}) {
  const gaps = bibliographyGaps(paper);
  const wanted = gaps.authors || gaps.year || gaps.title || gaps.sourceUrl || Boolean(gaps.arxivId && (gaps.abstract || gaps.venue));
  return wanted && (gaps.sourceUrl || hasIdentity(resolvePaperSource(paper.sourceUrl || "")) || titleSearchAllowed(paper));
}

/**
 * 把查到的信息补进论文记录（原地修改），只填空缺：作者/年份/出处为空才填，
 * 摘要为空或只是截断的开头才换，标题只替换占位标题或大小写不同的同一标题。
 * 返回补上的字段名。
 */
export function applyBibliography(paper, found) {
  if (!paper || !found?.found) return [];
  const filled = [];
  const authors = [...new Set((found.authors || []).map((name) => squash(name)).filter(Boolean))];
  if (!(paper.authors || []).length && authors.length) {
    paper.authors = authors;
    filled.push("authors");
  }
  if (!paper.year && /^[12]\d{3}$/.test(String(found.year || ""))) {
    paper.year = String(found.year);
    filled.push("year");
  }
  if (!paper.venue && squash(found.venue)) {
    paper.venue = squash(found.venue);
    filled.push("venue");
  }
  const abstract = squash(found.abstract);
  if (abstract && (!String(paper.abstract || "").trim() || isTruncatedAbstract(paper.abstract, abstract))) {
    paper.abstract = abstract;
    paper.abstractZh = "";
    filled.push("abstract");
  }
  const title = cleanPaperTitle(found.title);
  if (title && found.matchedBy !== "title" && title !== paper.title && (isWeakTitle(paper.title) || sameTitleIgnoringCase(paper.title, title))) {
    paper.title = title;
    filled.push("title");
  }
  const source = resolvePaperSource(paper.sourceUrl || "");
  if (source.reader && !source.local && source.url && source.url !== paper.sourceUrl) {
    paper.sourceUrl = source.url;
    filled.push("sourceUrl");
  } else if (!paper.sourceUrl && found.matchedBy === "id" && found.sourceUrl) {
    paper.sourceUrl = found.sourceUrl;
    filled.push("sourceUrl");
  }
  return filled;
}

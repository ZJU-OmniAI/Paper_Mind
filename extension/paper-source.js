// 论文的真实出处。标签页里常常是一层"壳"：LLM_in_PDF 阅读器、PDF.js 插件、
// alphaXiv / Hugging Face 的论文页、会议的 PDF 直链……身份（arXiv 编号、DOI、
// OpenReview 编号、落地页）一律从被包着的那篇论文的网址里认，只认网址路径里的
// 硬证据，不从备注或正文里猜。

const ARXIV_ID = String.raw`(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})`;
const ARXIV_ID_ONLY = new RegExp(`^(${ARXIV_ID})(?:v\\d+)?$`, "i");

// 每个站点里，紧挨在 arXiv 编号前面的路径。编号后面只允许版本号、.pdf 和斜杠。
const ARXIV_PATH_RULES = [
  { host: /(^|\.)arxiv\.org$/i, prefix: String.raw`\/(?:abs|pdf|html|format|src|e-print)\/` },
  { host: /^ar5iv(?:\.labs\.arxiv)?\.org$/i, prefix: String.raw`\/(?:html|abs)\/` },
  { host: /(^|\.)alphaxiv\.(?:org|io)$/i, prefix: String.raw`\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:abs|pdf|overview|html|paper|resources)\/` },
  { host: /^huggingface\.co$/i, prefix: String.raw`\/papers\/` },
  { host: /^papers\.cool$/i, prefix: String.raw`\/arxiv\/` },
  { host: /^(?:www\.)?emergentmind\.com$/i, prefix: String.raw`\/(?:papers|articles)\/` },
  { host: /^(?:www\.)?semanticscholar\.org$/i, prefix: String.raw`\/arxiv\/` },
  { host: /^(?:www\.)?hjfy\.top$/i, prefix: String.raw`\/arxiv\/` }
];

function parseUrl(value) {
  try {
    return new URL(String(value || "").trim());
  } catch {
    return null;
  }
}

function decodedPath(url) {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

function isWebUrl(url) {
  return Boolean(url) && /^https?:$/.test(url.protocol) && !url.username && !url.password;
}

function isExtensionUrl(url) {
  return Boolean(url) && /^(?:chrome|moz|edge)-extension:$/.test(url.protocol);
}

export function normalizeArxivId(value) {
  const match = String(value || "").trim().match(ARXIV_ID_ONLY);
  return match ? match[1].toLowerCase() : "";
}

export function arxivIdFromUrl(value) {
  const url = typeof value === "string" ? parseUrl(value) : value;
  if (!isWebUrl(url)) return "";
  const host = url.hostname.toLowerCase();
  const path = decodedPath(url);
  if (/^(?:dx\.)?doi\.org$/i.test(host)) {
    const match = path.match(new RegExp(`^\\/10\\.48550\\/arxiv\\.(${ARXIV_ID})(?:v\\d+)?\\/?$`, "i"));
    return match ? match[1].toLowerCase() : "";
  }
  for (const rule of ARXIV_PATH_RULES) {
    if (!rule.host.test(host)) continue;
    const match = path.match(new RegExp(`^${rule.prefix}(${ARXIV_ID})(?:v\\d+)?(?:\\.pdf)?\\/?$`, "i"));
    if (match) return match[1].toLowerCase();
  }
  return "";
}

function cleanDoi(value) {
  return String(value || "")
    .trim()
    .replace(/[.,;]+$/, "")
    .toLowerCase();
}

// 只在出版商把 DOI 原样放进路径的地方认，查询参数里的 DOI 只认 PLOS 这类整条就是论文 ID 的
export function doiFromUrl(value) {
  const url = typeof value === "string" ? parseUrl(value) : value;
  if (!isWebUrl(url)) return "";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = decodedPath(url);
  const doiTail = String.raw`(10\.\d{4,9}\/[^\s?#]+)`;
  let doi = "";
  if (/^(?:dx\.)?doi\.org$/.test(host)) {
    doi = path.match(new RegExp(`^\\/${doiTail}$`, "i"))?.[1] || "";
  } else if (/(^|\.)(?:biorxiv|medrxiv)\.org$/.test(host)) {
    doi = path.match(/^\/content\/(10\.1101\/[\d.]+?)(?:v\d+)?(?:\.(?:full|abstract|article-info|article-metrics|supplementary-material)(?:\.pdf)?|\.pdf)?\/?$/i)?.[1] || "";
  } else if (host === "nature.com") {
    const suffix = path.match(/^\/articles\/([a-z0-9][a-z0-9.-]*?)(?:\.pdf)?\/?$/i)?.[1];
    doi = suffix ? `10.1038/${suffix}` : "";
  } else if (host === "link.springer.com") {
    doi = path.match(new RegExp(`^\\/(?:article|chapter|book|referenceworkentry|protocol|content\\/pdf)\\/${doiTail}$`, "i"))?.[1] || "";
    doi = doi.replace(/\.pdf$/i, "");
  } else if (/(^|\.)plos\.org$/.test(host)) {
    doi = String(url.searchParams.get("id") || "").match(/^10\.1371\/[^\s]+$/i)?.[0] || "";
  } else {
    // ACM / Wiley / Taylor & Francis / Science / PNAS / APS 等：路径以 DOI 结尾（…/doi/[abs|full|pdf]/10.xxx/yyy）
    doi = path.replace(/\/(?:full|abstract|pdf|epdf|meta)\/?$/i, "").match(new RegExp(`(?:^|\\/)${doiTail}$`, "i"))?.[1] || "";
    doi = doi.replace(/\.pdf$/i, "");
  }
  doi = cleanDoi(doi);
  return /^10\.48550\//.test(doi) ? "" : doi;
}

// 会议 PDF 直链 → 论文落地页（落地页上有 citation_* 元数据）。只认结构固定的几个站点。
export function landingPageFromUrl(value) {
  const url = typeof value === "string" ? parseUrl(value) : value;
  if (!isWebUrl(url)) return { landingUrl: "", openreviewId: "", ieeeNumber: "" };
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;
  const origin = url.origin;
  const result = { landingUrl: "", openreviewId: "", ieeeNumber: "" };
  if (host === "openreview.net") {
    const id = url.searchParams.get("id") || "";
    if (/^[A-Za-z0-9_-]{6,}$/.test(id)) {
      result.openreviewId = id;
      result.landingUrl = `https://openreview.net/forum?id=${encodeURIComponent(id)}`;
    }
  } else if (host === "aclanthology.org" || host === "aclweb.org") {
    const id = path.match(/^\/(?:anthology\/)?([A-Za-z0-9.-]+?)(?:v\d+)?\.pdf$/i)?.[1];
    if (id) result.landingUrl = `https://aclanthology.org/${id}/`;
  } else if (/^(?:proceedings\.neurips\.cc|papers\.nips\.cc)$/.test(host)) {
    const match = path.match(/^(.*)\/file\/([0-9a-f]{20,})-Paper((?:-[A-Za-z_]+)?)\.pdf$/i);
    if (match) result.landingUrl = `${origin}${match[1]}/hash/${match[2]}-Abstract${match[3]}.html`;
  } else if (host === "openaccess.thecvf.com") {
    const match = path.match(/^(.*)\/papers\/([^/]+)_paper\.pdf$/i);
    if (match) result.landingUrl = `${origin}${match[1]}/html/${match[2]}_paper.html`;
  } else if (host === "proceedings.mlr.press") {
    const match = path.match(/^\/(v\d+)\/([^/]+)\/\2\.pdf$/i);
    if (match) result.landingUrl = `${origin}/${match[1]}/${match[2]}.html`;
  } else if (host === "jmlr.org") {
    const match = path.match(/^\/papers\/volume(\d+)\/([^/]+)\/\2\.pdf$/i);
    if (match) result.landingUrl = `${origin}/papers/v${match[1]}/${match[2]}.html`;
  } else if (host === "ijcai.org") {
    // PDF 是 /proceedings/2023/0001.pdf，落地页是 /proceedings/2023/1
    const match = path.match(/^\/proceedings\/(\d{4})\/(\d+)\.pdf$/i);
    if (match) result.landingUrl = `${origin}/proceedings/${match[1]}/${Number(match[2])}`;
  } else if (host === "ojs.aaai.org") {
    const match = path.match(/^(\/index\.php\/[^/]+\/article)\/download\/(\d+)(?:\/\d+)?$/i);
    if (match) result.landingUrl = `${origin}${match[1]}/view/${match[2]}`;
  } else if (host === "roboticsproceedings.org") {
    const match = path.match(/^\/(rss\d+)\/(p\d+)\.pdf$/i);
    if (match) result.landingUrl = `${origin}/${match[1]}/${match[2]}.html`;
  } else if (host === "ieeexplore.ieee.org") {
    const number = url.searchParams.get("arnumber") || path.match(/^\/(?:document|abstract\/document)\/(\d+)/)?.[1] || path.match(/\/(\d{6,})\.pdf$/)?.[1] || "";
    if (/^\d{5,}$/.test(number)) {
      result.ieeeNumber = String(Number(number));
      result.landingUrl = `https://ieeexplore.ieee.org/document/${result.ieeeNumber}`;
    }
  }
  return result;
}

function innerDocumentUrl(url) {
  // PDF.js 插件这类阅读器把原网址直接拼在扩展路径后面：chrome-extension://<id>/https://…
  const tail = `${url.pathname.slice(1)}${url.search}`;
  if (/^(?:https?|file):\/\//i.test(tail)) return tail;
  try {
    const decoded = decodeURIComponent(tail);
    if (/^(?:https?|file):\/\//i.test(decoded)) return decoded;
  } catch {
    // 非法转义就当没有
  }
  for (const key of ["url", "file", "src", "pdf", "uri", "source", "doc"]) {
    const value = url.searchParams.get(key);
    if (value && /^(?:https?|file):\/\//i.test(value)) return value;
  }
  return "";
}

/**
 * 标签页地址 → 论文身份。
 * url：保存时用的来源地址（阅读器会被还原成原论文地址；本地文件保留阅读器地址）
 * reader：标签页是不是别的扩展的阅读器页面（这种页面 Chrome 不允许注入脚本）
 */
export function resolvePaperSource(value) {
  const original = String(value || "").trim();
  const empty = { url: original, arxivId: "", doi: "", landingUrl: "", openreviewId: "", ieeeNumber: "", reader: false, local: false, pdf: false };
  let url = parseUrl(original);
  if (!url) return empty;
  let reader = false;
  if (isExtensionUrl(url)) {
    reader = true;
    // LLM_in_PDF：reader.html?id=<arXiv 编号> / ?url=<PDF 地址> / ?local=<本地文件>
    const arxivParam = ["id", "arxiv", "arxivId", "arxiv_id"].map((key) => normalizeArxivId(url.searchParams.get(key))).find(Boolean);
    if (arxivParam) {
      return { ...empty, url: `https://arxiv.org/abs/${arxivParam}`, arxivId: arxivParam, reader, pdf: true };
    }
    const inner = parseUrl(innerDocumentUrl(url));
    if (!inner) return { ...empty, reader, local: url.searchParams.has("local") };
    if (inner.protocol === "file:") return { ...empty, url: inner.href, reader, local: true, pdf: true };
    url = inner;
  }
  if (!isWebUrl(url)) return { ...empty, url: url.protocol === "file:" ? url.href : original, local: url.protocol === "file:", reader };
  url.hash = "";
  const arxivId = arxivIdFromUrl(url);
  // 阅读器里包着的一定是 PDF（LLM_in_PDF、PDF.js 插件都只接管 PDF），哪怕地址不以 .pdf 结尾
  const pdf = reader || /\.pdf$/i.test(url.pathname) || /\/pdf(?:\/|$)/i.test(url.pathname) || /stamp\.jsp$/i.test(url.pathname);
  if (arxivId) return { ...empty, url: reader ? `https://arxiv.org/abs/${arxivId}` : url.href, arxivId, reader, pdf };
  const landing = landingPageFromUrl(url);
  return { ...empty, ...landing, url: url.href, doi: doiFromUrl(url), reader, pdf };
}

// 论文原始出处的站点。用来判断合并时谁是"正主"（论文页的标题/摘要应该盖过解读文章的），
// 以及没有编号时要不要按标题去学术数据库里查
export const PAPER_HOSTS = [
  "arxiv.org", "ar5iv.org", "alphaxiv.io", "alphaxiv.org", "doi.org", "openreview.net", "aclanthology.org",
  "ieeexplore.ieee.org", "dl.acm.org", "link.springer.com", "nature.com", "science.org", "sciencedirect.com",
  "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "europepmc.org", "biorxiv.org", "medrxiv.org", "semanticscholar.org",
  "papers.nips.cc", "proceedings.neurips.cc", "proceedings.mlr.press", "jmlr.org", "openaccess.thecvf.com", "ecva.net",
  "ojs.aaai.org", "ijcai.org", "roboticsproceedings.org", "huggingface.co", "papers.cool", "emergentmind.com",
  "onlinelibrary.wiley.com", "tandfonline.com", "pnas.org", "iopscience.iop.org", "mdpi.com", "frontiersin.org",
  "plos.org", "cell.com", "ssrn.com", "researchgate.net", "cnki.net", "wanfangdata.com.cn", "cqvip.com"
];

export function isPaperHost(value) {
  const url = typeof value === "string" ? parseUrl(value) : value;
  if (!isWebUrl(url)) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return PAPER_HOSTS.some((paperHost) => host === paperHost || host.endsWith(`.${paperHost}`));
}

// 代码仓库和项目主页：标题常带前缀（"[CVPR 2025] VideoTree: …"、"GitHub - owner/repo: …"），
// 核对页面上的 arXiv 链接时允许"页面标题包含论文标题"
export function isProjectHost(value) {
  const url = typeof value === "string" ? parseUrl(value) : value;
  if (!isWebUrl(url)) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return /^(?:github\.com|gitlab\.com|gitee\.com|bitbucket\.org|huggingface\.co|sites\.google\.com)$/.test(host)
    || /\.(?:github\.io|gitlab\.io|netlify\.app|vercel\.app|pages\.dev)$/.test(host);
}

/* ----- 标题清洗 ----- */

// 站点名后缀：标题后面拼的" | 站名"、" · LLM_in_PDF"。只去掉认识的站名，免得误伤论文标题本身
const TITLE_SUFFIXES = [
  /\s*[·|｜]\s*LLM_in_PDF\s*$/i,
  /\s*[|｜·\-–—]\s*(?:alphaXiv|arXiv(?:\.org)?(?: e-print)?|OpenReview|Papers With Code|Hugging Face|Semantic Scholar|ACL Anthology|ScienceDirect|SpringerLink|Springer(?: Nature)?(?: Link)?|bioRxiv|medRxiv|PubMed|PMC|Europe PMC|Emergent Mind|ResearchGate|DBLP|Google Scholar|IJCAI|AAAI|PMLR|JMLR)\s*$/i,
  /\s*[|｜]\s*IEEE Xplore\s*$/i,
  /\s*[|｜]\s*IEEE (?:Journals? & Magazines?|Conference Publication|Journal|Magazine|Standard|Early Access)[^|｜]*$/i,
  /\s*[|｜]\s*ACM Digital Library\s*$/i,
  /\s*[|｜]\s*(?:Proceedings of (?:the )?[^|｜]{3,140}|Communications of the ACM|ACM [A-Z][^|｜]{2,120})$/,
  /\s*[|｜]\s*Nature(?: [A-Z][A-Za-z]+){0,3}\s*$/,
  /\s*[|｜]\s*Science(?: Robotics| Advances| Translational Medicine| Signaling| Immunology)?\s*$/,
  /\s*[|｜]\s*(?:PNAS|Proceedings of the National Academy of Sciences)\s*$/,
  /\s*[|｜\-–—]\s*Cool Papers\b.*$/i,
  /\s*[|｜\-–—]\s*(?:Cloudflare|reCAPTCHA)\s*$/i,
  /\s*·\s*GitHub\s*$/i
];

const TITLE_PREFIXES = [
  /^\s*\[\d{4}\.\d{4,5}(?:v\d+)?\]\s*/,
  /^\s*Paper page\s*[-–—]\s*/i,
  /^\s*\[(?:PDF|HTML|CITATION)\]\s*/i,
  /^\s*(?:Abstract|摘要)\s*[:：]\s*/i,
  // README 标题里的会议标记："[CVPR 2025] VideoTree: …"、"【NeurIPS'24 Spotlight】…"
  /^\s*[[【]\s*[A-Za-z][A-Za-z&-]*(?:\s+[A-Za-z&-]+){0,3}\s*['’]?\s*\d{2,4}(?:\s+[A-Za-z]+){0,2}\s*[\]】]\s*/
];

export function cleanPaperTitle(value) {
  let title = String(value || "").replace(/\s+/g, " ").trim();
  for (let round = 0; round < 3; round++) {
    const before = title;
    for (const pattern of TITLE_SUFFIXES) title = title.replace(pattern, "").trim();
    for (const pattern of TITLE_PREFIXES) title = title.replace(pattern, "").trim();
    if (title === before) break;
  }
  return title;
}

// 这些"标题"只是占位：阅读器的编号、PDF 文件名、反爬验证页、报错页
const WEAK_TITLES = [
  /^(?:arxiv\s*[:：]?\s*)?\d{4}\.\d{4,5}(?:v\d+)?(?:\.pdf)?$/i,
  /^arxiv\s*[:：]\s*\S+$/i,
  /^[^\s/\\]+\.pdf$/i,
  /^(?:microsoft (?:word|powerpoint) - .+|untitled(?: document)?|main|paper|manuscript|document|pdf|llm_in_pdf|本地论文|无标题)$/i,
  // 反爬验证页、报错页：整个标题就是这句话（最多带标点），免得误伤 "One More Step: …" 这类真标题
  /^(?:verifying your browser|just a moment|attention required|access denied|are you a robot|checking your browser|security check|robot check|captcha|please wait|one more step|there was a problem providing the content you requested|page not found|not found|forbidden|error)\b[\s.!?？…:：-]*$/i,
  /^(?:403|404|500|502|503)(?:\s|$)/,
  // 被拦截时标签页标题只剩域名："dl.acm.org"
  /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,6}$/i
];

export function isWeakTitle(value) {
  const title = cleanPaperTitle(value);
  return !title || title.length < 4 || WEAK_TITLES.some((pattern) => pattern.test(title));
}

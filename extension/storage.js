import { fetchCitationCount } from "./citations.js";
import { clipExcerpt, clipImageUrls, clipPlainText } from "./clipper.js";

const DEFAULT_CONFIG = {
  provider: "qwen",
  qwenKey: "",
  qwenModel: "qwen3.7-max",
  qwenBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  zhipuKey: "",
  zhipuModel: "glm-5.1",
  zhipuBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  kimiKey: "",
  kimiModel: "kimi-for-coding",
  kimiBaseUrl: "https://api.kimi.com/coding/v1",
  deepseekKey: "",
  deepseekModel: "deepseek-v4-pro",
  deepseekBaseUrl: "https://api.deepseek.com",
  // 各后端"当前可用模型"的缓存，来自 GET {baseUrl}/models，形如
  // { deepseek: { models: [{id, traits}], recommended: [], source, updatedAt } }
  modelCatalog: {}
};

// presetModels 是兜底清单：没填 Key、断网或后端不支持 /models 时撑住下拉框。
// 线上能拉到列表就以线上为准（模型更新很快，写死的清单一定会过期）。
const PROVIDERS = {
  qwen: {
    label: "Qwen",
    keyField: "qwenKey",
    modelField: "qwenModel",
    baseUrlField: "qwenBaseUrl",
    family: /^qwen/i,
    presetModels: ["qwen3.7-max", "qwen3.6-plus", "qwen3.6-flash", "qwen-plus-latest", "qwen-turbo-latest"]
  },
  zhipu: {
    label: "智谱",
    keyField: "zhipuKey",
    modelField: "zhipuModel",
    baseUrlField: "zhipuBaseUrl",
    family: /^glm/i,
    presetModels: ["glm-5.1", "glm-5", "glm-5-turbo", "glm-4.7", "glm-4.7-flash", "glm-4.6"]
  },
  kimi: {
    label: "Kimi Code",
    keyField: "kimiKey",
    modelField: "kimiModel",
    baseUrlField: "kimiBaseUrl",
    family: /^(kimi|k\d|moonshot)/i,
    presetModels: ["kimi-for-coding", "kimi-for-coding-highspeed", "kimi-k2.6", "k3"]
  },
  deepseek: {
    label: "DeepSeek",
    keyField: "deepseekKey",
    modelField: "deepseekModel",
    baseUrlField: "deepseekBaseUrl",
    family: /^deepseek/i,
    presetModels: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"]
  }
};

function normalizeProvider(value) {
  return PROVIDERS[value] ? value : "qwen";
}

// /models 会把向量、语音、图片、视频模型一起返回，这些走 chat/completions 必然报错，先滤掉
const NON_CHAT_MODEL_PATTERN =
  /(embedding|embed|rerank|tts|asr|stt|whisper|paraformer|cosyvoice|sambert|wanx|wan2\.|image|img2|ocr|video|audio|speech|voice|moderation|content-guard|safety|sd3|flux|paint|music|animate|avatar|virtual|background)/i;

// 给模型名打标，前端按语言翻成"快"/"会深度思考"这类人话
function modelTraits(id) {
  const name = String(id).toLowerCase();
  const traits = [];
  if (/(reason|think|-r\d|deepthink)/.test(name)) traits.push("reasoning");
  if (/(flash|turbo|lite|mini|speed|air|fast|nano|instant)/.test(name)) traits.push("fast");
  if (/(max|pro|plus|ultra|advanced)/.test(name)) traits.push("quality");
  if (/(vl|vision|omni|multimodal|-mm)/.test(name)) traits.push("vision");
  if (/(long|32k|64k|128k|200k|256k|1m)/.test(name)) traits.push("long");
  if (/(cod(e|ing|er))/.test(name)) traits.push("code");
  return traits;
}

function decorateModels(ids) {
  return ids.map((id) => ({ id, traits: modelTraits(id) }));
}

// 同族模型（deepseek-* / glm-* ...）排前面，其余按名字排后面
function sortModelIds(provider, ids) {
  const family = PROVIDERS[provider]?.family;
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  return [...ids].sort((a, b) => {
    const aFamily = family?.test(a) ? 0 : 1;
    const bFamily = family?.test(b) ? 0 : 1;
    if (aFamily !== bFamily) return aFamily - bFamily;
    return collator.compare(a, b);
  });
}

function presetCatalog(provider) {
  const presets = PROVIDERS[provider]?.presetModels || [];
  return {
    provider,
    models: decorateModels(presets),
    recommended: [...presets],
    source: "preset",
    updatedAt: "",
    endpoint: ""
  };
}

// 拉后端当前可用模型：OpenAI 兼容的 GET {baseUrl}/models
async function fetchRemoteModels(apiKey, baseUrl) {
  const endpoint = `${String(baseUrl).replace(/\/+$/, "")}/models`;
  const response = await fetch(endpoint, {
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
  }
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  const ids = rows
    .map((row) => (typeof row === "string" ? row : row?.id || row?.model || row?.name))
    .filter(Boolean)
    .map((id) => String(id).trim());
  if (!ids.length) throw new Error("接口没有返回模型列表");
  return { ids: [...new Set(ids)], endpoint };
}

// 返回某个后端的模型清单。refresh=true 才联网，否则用缓存/兜底清单。
// 拉取失败不抛错：带上 error 原样返回兜底清单，前端提示一句就行，不该把设置页卡住。
async function loadModelCatalog(config, provider, { apiKey = "", baseUrl = "", refresh = false } = {}) {
  const info = PROVIDERS[provider];
  const cached = config.modelCatalog?.[provider];
  if (!refresh) {
    if (cached?.models?.length) return { ...cached, provider };
    return presetCatalog(provider);
  }

  const key = apiKey || config[info.keyField];
  const url = baseUrl || config[info.baseUrlField] || DEFAULT_CONFIG[info.baseUrlField];
  const fallback = cached?.models?.length ? { ...cached, provider } : presetCatalog(provider);
  if (!key) return { ...fallback, reason: "no-key" };

  try {
    const { ids, endpoint } = await fetchRemoteModels(key, url);
    const chatIds = ids.filter((id) => !NON_CHAT_MODEL_PATTERN.test(id));
    const usable = sortModelIds(provider, chatIds.length ? chatIds : ids);
    const current = String(config[info.modelField] || "").trim();
    // 用户已保存的模型即使不在列表里也保留，免得刷新一下把当前设置弄丢
    if (current && !usable.includes(current)) usable.unshift(current);
    return {
      provider,
      models: decorateModels(usable),
      recommended: (info.presetModels || []).filter((id) => usable.includes(id)),
      source: "remote",
      updatedAt: nowIso(),
      endpoint,
      reason: "ok"
    };
  } catch (error) {
    return { ...fallback, reason: "request-failed", error: error.message || String(error) };
  }
}

async function cacheModelCatalog(provider, catalog) {
  if (catalog.source !== "remote") return;
  // 走排队更新：一次刷新四个后端时，四个写回不排队会互相覆盖，只剩最后一个的清单
  await updateConfig((stored) => ({
    ...stored,
    modelCatalog: { ...(stored.modelCatalog || {}), [provider]: catalog }
  }));
}

function publicModelCatalog(config) {
  const catalogs = {};
  for (const provider of Object.keys(PROVIDERS)) {
    const cached = config.modelCatalog?.[provider];
    catalogs[provider] = cached?.models?.length ? { ...cached, provider } : presetCatalog(provider);
  }
  return catalogs;
}

const ZHIPU_MAX_TOKENS = 65536;

const ZHIPU_THINKING_MODELS = new Set([
  "glm-5.1",
  "glm-5",
  "glm-5-turbo",
  "glm-4.7",
  "glm-4.6",
  "glm-4.5-air",
  "glm-4.5-airx",
  "glm-4.5-flash"
]);

const DEFAULT_STORE = {
  papers: [],
  tags: [],
  topicPacks: [],
  meta: {
    tagCuration: {
      status: "stale",
      updatedAt: "",
      provider: "",
      model: "",
      tagCount: 0,
      mergeCount: 0
    }
  }
};

const STORE_KEY = "paperTagStore";
const CONFIG_KEY = "paperTagConfig";
const MIGRATION_KEY = "paperTagIndexedDbMigrationComplete";
const DB_NAME = "paperTagLibrary";
const DB_VERSION = 3;
const PAPER_STORE = "papers";
const TAG_STORE = "tags";
const META_STORE = "meta";
const TOPIC_PACK_STORE = "topicPacks";
const CLIP_ASSET_STORE = "clipAssets";
const UNSORTED_TAG_ID = "system-unsorted";
const UNSORTED_TAG_NAME = "待归类";
const DEFAULT_VALUE_SCORE = 3;

/* ----- 网页剪藏 -----
   正文里的图片会下载成真实文件存到 <Chrome 下载目录>/Paper_Mind剪藏/ 下（不留在浏览器里）。
   下载动作在 offscreen.js 里做，这里只负责记录每张图存到了哪个路径。
   旧版本（v1.1）把图片存在下面这张 clipAssets 表里，现在只用于读出来迁移到磁盘。 */

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(value) {
  return chrome.storage.local.set(value);
}

function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PAPER_STORE)) {
        const store = db.createObjectStore(PAPER_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(TAG_STORE)) {
        const store = db.createObjectStore(TAG_STORE, { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(TOPIC_PACK_STORE)) {
        const store = db.createObjectStore(TOPIC_PACK_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(CLIP_ASSET_STORE)) {
        const store = db.createObjectStore(CLIP_ASSET_STORE, { keyPath: "id" });
        store.createIndex("paperId", "paperId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    // 别的页面还开着旧版本连接时升级会一直卡住，这里直接报错，比静默挂死好排查
    request.onblocked = () => reject(new Error("论文库正在被其他标签页占用，请关掉其他 Paper_Mind 页面后重试"));
  });
}

function sortByNewest(items) {
  return [...items].sort((a, b) => {
    const bTime = Date.parse(b.createdAt || b.updatedAt || "") || 0;
    const aTime = Date.parse(a.createdAt || a.updatedAt || "") || 0;
    return bTime - aTime;
  });
}

function publicConfig(config) {
  return {
    provider: normalizeProvider(config.provider),
    qwenModel: config.qwenModel,
    qwenBaseUrl: config.qwenBaseUrl,
    zhipuModel: config.zhipuModel,
    zhipuBaseUrl: config.zhipuBaseUrl,
    kimiModel: config.kimiModel,
    kimiBaseUrl: config.kimiBaseUrl,
    deepseekModel: config.deepseekModel,
    deepseekBaseUrl: config.deepseekBaseUrl,
    hasQwenKey: Boolean(config.qwenKey),
    hasZhipuKey: Boolean(config.zhipuKey),
    hasKimiKey: Boolean(config.kimiKey),
    hasDeepseekKey: Boolean(config.deepseekKey),
    modelCatalog: publicModelCatalog(config)
  };
}

function nowIso() {
  return new Date().toISOString();
}

function ensureTopicPacks(store) {
  store.topicPacks ||= [];
  return store.topicPacks;
}

function ensureStoreMeta(store) {
  store.meta ||= {};
  store.meta.tagCuration ||= clone(DEFAULT_STORE.meta.tagCuration);
  return store.meta.tagCuration;
}

function markTagsStale(store) {
  ensureStoreMeta(store).status = "stale";
}

function markTagsCurated(store, config, mergeCount = 0) {
  const tagCuration = ensureStoreMeta(store);
  const provider = normalizeProvider(config.provider);
  tagCuration.status = "curated";
  tagCuration.updatedAt = nowIso();
  tagCuration.provider = provider;
  tagCuration.model = config[PROVIDERS[provider].modelField];
  tagCuration.tagCount = store.tags.length;
  tagCuration.mergeCount = mergeCount;
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTagName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^#+/, "")
    .trim();
}

function tagKey(name) {
  return normalizeTagName(name).toLocaleLowerCase("zh-CN");
}

function splitManualTags(input) {
  if (Array.isArray(input)) return input.map(normalizeTagName).filter(Boolean);
  return String(input || "")
    .split(/[,，;；\n]/)
    .map(normalizeTagName)
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeValueScore(value, fallback = DEFAULT_VALUE_SCORE) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  const base = Number.isFinite(numeric) ? numeric : fallback;
  if (base === null || base === undefined || base === "") return null;
  return Math.min(5, Math.max(1, Math.round(base * 2) / 2));
}

function compactText(value, max = 2400) {
  const text = String(value || "").trim();
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function similarity(a, b) {
  const ak = tagKey(a);
  const bk = tagKey(b);
  if (!ak || !bk) return 0;
  if (ak === bk) return 1;
  if (ak.includes(bk) || bk.includes(ak)) return 0.82;
  const aset = new Set(ak.split(/[\s\-_/]+|(?=[A-Z])/).filter(Boolean));
  const bset = new Set(bk.split(/[\s\-_/]+|(?=[A-Z])/).filter(Boolean));
  if (!aset.size || !bset.size) return 0;
  const intersection = [...aset].filter((x) => bset.has(x)).length;
  const union = new Set([...aset, ...bset]).size;
  return intersection / union;
}

function findExistingTag(tags, name) {
  const key = tagKey(name);
  const exact = tags.find((tag) => tagKey(tag.name) === key || tag.aliases?.some((alias) => tagKey(alias) === key));
  if (exact) return exact;

  let best = null;
  let bestScore = 0;
  for (const tag of tags) {
    const score = Math.max(similarity(name, tag.name), ...(tag.aliases || []).map((alias) => similarity(name, alias)));
    if (score > bestScore) {
      bestScore = score;
      best = tag;
    }
  }
  return bestScore >= 0.9 ? best : null;
}

function findTagByName(store, name) {
  const key = tagKey(name);
  return store.tags.find((tag) => tagKey(tag.name) === key || (tag.aliases || []).some((alias) => tagKey(alias) === key));
}

function findTagByExactName(store, name) {
  const key = tagKey(name);
  return store.tags.find((tag) => tagKey(tag.name) === key);
}

function isSystemTag(tag) {
  return Boolean(tag?.system) || tag?.id === UNSORTED_TAG_ID;
}

function ensureSystemTags(store) {
  store.tags ||= [];
  const timestamp = nowIso();
  let unsorted =
    store.tags.find((tag) => tag.id === UNSORTED_TAG_ID) ||
    findTagByExactName(store, UNSORTED_TAG_NAME) ||
    findTagByExactName(store, "Unsorted");

  if (unsorted && unsorted.id !== UNSORTED_TAG_ID) {
    const oldId = unsorted.id;
    unsorted.id = UNSORTED_TAG_ID;
    for (const paper of store.papers || []) {
      paper.tagIds = uniq((paper.tagIds || []).map((id) => (id === oldId ? UNSORTED_TAG_ID : id)));
    }
  }

  if (!unsorted) {
    unsorted = {
      id: UNSORTED_TAG_ID,
      name: UNSORTED_TAG_NAME,
      description: "添加论文时暂时不选标签，会先进入这里，之后可再整理。",
      aliases: ["Unsorted"],
      parentIds: [],
      childIds: [],
      relatedIds: [],
      paperIds: [],
      sources: ["system"],
      system: true,
      sortOrder: 999999,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.tags.push(unsorted);
  }

  unsorted.name = UNSORTED_TAG_NAME;
  unsorted.description ||= "添加论文时暂时不选标签，会先进入这里，之后可再整理。";
  unsorted.aliases = uniq(["Unsorted", ...(unsorted.aliases || [])]);
  unsorted.parentIds ||= [];
  unsorted.childIds ||= [];
  unsorted.relatedIds ||= [];
  unsorted.paperIds ||= [];
  unsorted.sources = uniq(["system", ...(unsorted.sources || [])]);
  unsorted.system = true;
  unsorted.sortOrder = 999999;
  unsorted.createdAt ||= timestamp;
  unsorted.updatedAt ||= timestamp;
}

function normalizeCitation(paper) {
  if (!Object.hasOwn(paper, "citationCount") || typeof paper.citationCount !== "number") {
    paper.citationCount = null;
  }
  paper.citationSource ||= "";
  paper.citationStatus ||= "";
  paper.citationUpdatedAt ||= "";
  paper.citationExternalId ||= "";
  paper.citationError ||= "";
}

const CLIP_ASSET_STATUSES = new Set(["pending", "done", "partial", "error", "skipped"]);

/* 一条记录可以挂多份剪藏材料：论文原文页、公众号解读、知乎回答……
   所以存的是 clips 数组而不是单个 clip。clips[0] 当作主材料，摘要/搜索/推荐都以它为准。 */
function normalizeOneClip(input, index) {
  const markdown = String(input?.markdown || "").trim();
  if (!markdown) return null;
  const imageCount = Number.isFinite(Number(input.imageCount)) ? Number(input.imageCount) : clipImageUrls(markdown).length;
  const assets = (Array.isArray(input.assets) ? input.assets : [])
    .filter((asset) => asset?.url)
    .map((asset) => ({
      url: String(asset.url),
      path: String(asset.path || ""),
      file: String(asset.file || ""),
      mime: String(asset.mime || ""),
      size: Number(asset.size) || 0
    }));
  return {
    id: String(input.id || "") || makeId("clip"),
    // 这份材料自己的标题和来源（公众号解读的标题和论文标题往往不一样）
    title: String(input.title || "").trim(),
    sourceUrl: String(input.sourceUrl || "").trim(),
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : index,
    markdown,
    siteName: String(input.siteName || ""),
    author: String(input.author || ""),
    publishedAt: String(input.publishedAt || ""),
    cover: String(input.cover || ""),
    contentSelector: String(input.contentSelector || ""),
    textLength: Number.isFinite(Number(input.textLength)) ? Number(input.textLength) : clipPlainText(markdown).length,
    imageCount,
    clippedAt: String(input.clippedAt || "") || nowIso(),
    assetStatus: imageCount === 0 ? "skipped" : CLIP_ASSET_STATUSES.has(input.assetStatus) ? input.assetStatus : "pending",
    assetSavedCount: assets.length || Number(input.assetSavedCount) || 0,
    assetUpdatedAt: String(input.assetUpdatedAt || ""),
    assetError: String(input.assetError || ""),
    // 图片存盘位置：assetDir 是相对下载目录的文件夹，assets[].file 是绝对路径（渲染时用它拼 file://）
    assetDir: String(input.assetDir || ""),
    assets
  };
}

function normalizeClips(paper) {
  // v1.2 及更早只有单个 paper.clip，迁到数组里
  const incoming = Array.isArray(paper.clips) ? paper.clips : paper.clip ? [{ ...paper.clip, title: paper.title, sourceUrl: paper.sourceUrl }] : [];
  if (paper.clip) delete paper.clip;
  const clips = incoming.map(normalizeOneClip).filter(Boolean);
  clips.sort((a, b) => a.order - b.order);
  clips.forEach((clip, index) => {
    clip.order = index;
  });
  if (clips.length) paper.clips = clips;
  else if (paper.clips) delete paper.clips;
}

function paperClips(paper) {
  return Array.isArray(paper?.clips) ? paper.clips : [];
}

function primaryClip(paper) {
  return paperClips(paper)[0] || null;
}

function findClip(paper, clipId) {
  return paperClips(paper).find((clip) => clip.id === clipId) || null;
}

// 所有材料的正文拼一起，给本地搜索用
function allClipText(paper, max) {
  return compactText(paperClips(paper).map((clip) => clip.markdown).join("\n\n"), max);
}

function normalizeStore(store) {
  store.papers ||= [];
  store.tags ||= [];
  for (const paper of store.papers) {
    paper.valueScore = normalizeValueScore(paper.valueScore, null);
    normalizeCitation(paper);
    normalizeClips(paper);
    if (!Array.isArray(paper.links)) paper.links = [];
    if (typeof paper.abstractZh !== "string") paper.abstractZh = "";
  }
  ensureTopicPacks(store);
  ensureStoreMeta(store);
  ensureSystemTags(store);
  rebuildPaperTagLinks(store);
  store.topicPacks = store.topicPacks.map(normalizeTopicPack).filter(Boolean);
  const validTagIds = new Set(store.tags.map((tag) => tag.id));
  for (const pack of store.topicPacks) {
    pack.includeTagIds = pack.includeTagIds.filter((id) => validTagIds.has(id));
    pack.excludeTagIds = pack.excludeTagIds.filter((id) => validTagIds.has(id) && !pack.includeTagIds.includes(id));
  }
  return store;
}

function cleanupUnusedTags(store) {
  store.tags = (store.tags || []).filter((tag) => isSystemTag(tag) || (tag.paperIds || []).length > 0);
}

function ensureTag(store, name, source, meta = {}) {
  const cleanName = normalizeTagName(name);
  if (!cleanName) return null;
  const existing = findExistingTag(store.tags, cleanName);
  const timestamp = nowIso();
  if (existing) {
    existing.updatedAt = timestamp;
    existing.sources = uniq([...(existing.sources || []), source]);
    existing.aliases = uniq([...(existing.aliases || []), ...(meta.aliases || [])]);
    if (existing.name !== cleanName && !existing.aliases.some((alias) => tagKey(alias) === tagKey(cleanName))) {
      existing.aliases.push(cleanName);
    }
    if (!existing.description && meta.description) existing.description = meta.description;
    return existing;
  }

  const tag = {
    id: makeId("tag"),
    name: cleanName,
    description: meta.description || "",
    aliases: uniq(meta.aliases || []),
    parentIds: [],
    childIds: [],
    relatedIds: [],
    paperIds: [],
    sources: [source],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  store.tags.push(tag);
  return tag;
}

function attachPaperToTag(tag, paperId) {
  tag.paperIds = uniq([...(tag.paperIds || []), paperId]);
}

function detachPaperFromAllTags(store, paperId) {
  for (const tag of store.tags) {
    tag.paperIds = (tag.paperIds || []).filter((id) => id !== paperId);
  }
}

function rebuildPaperTagLinks(store) {
  for (const tag of store.tags) tag.paperIds = [];
  for (const paper of store.papers) {
    paper.tagIds = uniq(paper.tagIds || []);
    for (const tagId of paper.tagIds) {
      const tag = store.tags.find((item) => item.id === tagId);
      if (tag) attachPaperToTag(tag, paper.id);
    }
  }
}

function setPaperTags(store, paper, tagNames) {
  ensureSystemTags(store);
  detachPaperFromAllTags(store, paper.id);
  paper.tagIds = [];
  let names = splitManualTags(tagNames);
  if (!names.length) names = [UNSORTED_TAG_NAME];
  const hasNonSystemTag = names.some((name) => tagKey(name) !== tagKey(UNSORTED_TAG_NAME) && tagKey(name) !== tagKey("Unsorted"));
  if (hasNonSystemTag) names = names.filter((name) => tagKey(name) !== tagKey(UNSORTED_TAG_NAME) && tagKey(name) !== tagKey("Unsorted"));
  for (const name of names) {
    const tag = ensureTag(store, name, "manual");
    if (!tag) continue;
    attachPaperToTag(tag, paper.id);
    paper.tagIds = uniq([...paper.tagIds, tag.id]);
  }
  paper.updatedAt = nowIso();
}

function tagNamesForPaper(store, paper) {
  return (paper.tagIds || []).map((id) => store.tags.find((tag) => tag.id === id)?.name).filter(Boolean);
}

function mergePaperTags(store, paper, tagNames) {
  setPaperTags(store, paper, uniq([...tagNamesForPaper(store, paper), ...splitManualTags(tagNames)]));
}

function extractSourceUrl(input) {
  const explicit = String(input.sourceUrl || "").trim();
  if (explicit) return explicit;
  const conversation = String(input.conversation || "");
  const labelled = conversation.match(/(?:来源页面|Source page)：?\s*(https?:\/\/\S+)/i);
  if (labelled) return labelled[1].trim();
  const anyUrl = conversation.match(/https?:\/\/\S+/i);
  return anyUrl ? anyUrl[0].trim() : "";
}

// 分享链接常挂一堆一次性参数（公众号 chksm、小红书 xsec_token…），
// 同一篇文章两次分享就变成两条 URL，不清掉会被当成两篇存进来
const SHARE_PARAMS_BY_HOST = {
  "mp.weixin.qq.com": ["chksm", "scene", "srcid", "sharer_shareinfo", "sharer_shareinfo_first", "sharer_sharetime", "from", "isappinstalled", "clicktime", "enterid", "ascene", "devicetype", "version", "nettype", "abtest_cookie", "pass_ticket", "wx_header", "exportkey", "subscene", "sessionid", "key", "uin"],
  "xiaohongshu.com": ["xsec_token", "xsec_source", "source", "share_from_user_hidden", "author_share", "apptime", "share_id", "shareredid", "type"],
  "bilibili.com": ["spm_id_from", "vd_source", "from_source", "share_source", "share_medium", "share_plat", "bbid", "ts", "unique_k"],
  "zhihu.com": ["utm_psn", "utm_id", "utm_oi", "hybrid_search_source", "hybrid_search_extra"],
  "juejin.cn": ["utm_psn"],
  "x.com": ["s", "t"],
  "twitter.com": ["s", "t"]
};

function normalizeSourceUrl(value) {
  const raw = String(value || "").trim().replace(/[)\].,;，。；、]+$/g, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/g, "");

    // 公众号文章的唯一标识就在路径里（/s/<id>），后面的参数全是分享上下文
    if (host === "mp.weixin.qq.com" && /^\/s\/[^/]+$/.test(pathname)) {
      return `https://mp.weixin.qq.com${pathname}`;
    }

    const shareParams = SHARE_PARAMS_BY_HOST[host] || SHARE_PARAMS_BY_HOST[host.split(".").slice(-2).join(".")] || [];
    for (const key of [...url.searchParams.keys()]) {
      if (shareParams.includes(key.toLowerCase())) url.searchParams.delete(key);
    }

    if (host === "arxiv.org") {
      const match = pathname.match(/^\/(?:abs|pdf|html)\/([^/]+?)(?:\.pdf)?$/i);
      if (match) {
        const arxivId = match[1].replace(/v\d+$/i, "");
        return `https://arxiv.org/abs/${arxivId.toLowerCase()}`;
      }
    }

    if (host === "doi.org" || host === "dx.doi.org") {
      return `https://doi.org${pathname.toLowerCase()}`;
    }

    const trackingParams = ["fbclid", "gclid", "mc_cid", "mc_eid"];
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || trackingParams.includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    const query = url.searchParams.toString();
    return `${url.protocol}//${host}${pathname || "/"}${query ? `?${query}` : ""}`;
  } catch {
    return raw.toLowerCase();
  }
}

function stripSiteTitleSuffix(value) {
  // alphaXiv 等网站的页面标题会在论文标题后面拼 "| 站名"，保存时去掉
  return String(value || "").replace(/\s*[|｜]\s*alphaXiv\s*$/i, "").trim();
}

function normalizePaperTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function editDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function titleSimilarity(a, b) {
  const left = normalizePaperTitle(a);
  const right = normalizePaperTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const distance = editDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length, 1);
}

function findDuplicatePaper(store, input, { threshold = 0.94 } = {}) {
  const sourceUrl = normalizeSourceUrl(extractSourceUrl(input));
  const titleKey = normalizePaperTitle(input.title);
  let best = null;
  for (const paper of store.papers) {
    const paperSourceUrl = normalizeSourceUrl(paper.sourceUrl || extractSourceUrl(paper));
    if (sourceUrl && paperSourceUrl && sourceUrl === paperSourceUrl) {
      return { paper, score: 1, reason: "sourceUrl" };
    }
    const score = titleKey ? titleSimilarity(input.title, paper.title) : 0;
    if (!best || score > best.score) best = { paper, score, reason: "title" };
  }
  return best?.score >= threshold ? best : null;
}

function appendUniqueText(existing, incoming) {
  const left = String(existing || "").trim();
  const right = String(incoming || "").trim();
  if (!right) return left;
  if (!left) return right;
  if (left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left}\n\n---\n\n${right}`;
}

function mergePaperContent(paper, body, sourceUrl) {
  if (!paper.sourceUrl && sourceUrl) paper.sourceUrl = sourceUrl;
  if (typeof body.abstract === "string") paper.abstract = appendUniqueText(paper.abstract, body.abstract);
  if (typeof body.conversation === "string") paper.conversation = appendUniqueText(paper.conversation, body.conversation);
  if ("valueScore" in body) paper.valueScore = normalizeValueScore(body.valueScore, paper.valueScore || 1);
}

// 存进来的剪藏走一遍和存量数据同一套整形逻辑
function normalizeIncomingClip(input, fallback = {}) {
  if (!String(input?.markdown || "").trim()) return null;
  return normalizeOneClip(
    {
      ...input,
      id: makeId("clip"),
      title: String(input.title || fallback.title || "").trim(),
      sourceUrl: String(input.sourceUrl || fallback.sourceUrl || "").trim(),
      clippedAt: String(input.clippedAt || "") || nowIso(),
      assetStatus: "pending",
      assetSavedCount: 0,
      assetUpdatedAt: "",
      assetError: "",
      assetDir: "",
      assets: []
    },
    0
  );
}

// 往一条记录上再挂一份材料。同一个来源再剪一次算更新（留正文更全的那份），
// 不同来源就追加成新的一份。返回新增/更新的那条，没动就返回 null。
function attachClip(paper, incoming) {
  if (!incoming) return null;
  paper.clips = paperClips(paper);
  const sameSource = incoming.sourceUrl
    ? paper.clips.find((clip) => clip.sourceUrl && normalizeSourceUrl(clip.sourceUrl) === normalizeSourceUrl(incoming.sourceUrl))
    : null;
  if (sameSource) {
    if (sameSource.markdown.length >= incoming.markdown.length) return null;
    Object.assign(sameSource, incoming, { id: sameSource.id, order: sameSource.order });
    return sameSource;
  }
  incoming.order = paper.clips.length;
  paper.clips.push(incoming);
  return incoming;
}

// 合并进来的解读，同时把原文地址记进「外部资料」，方便一键打开原文。
// 预览信息直接用剪藏时已经抓到的（标题/站点/封面/开头），不必再联网。
function attachClipLink(paper, clip) {
  const url = String(clip?.sourceUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  // 就是这条记录自己的来源，不用再记一遍
  if (paper.sourceUrl && normalizeSourceUrl(url) === normalizeSourceUrl(paper.sourceUrl)) return null;
  paper.links ||= [];
  const existing = paper.links.find((link) => normalizeSourceUrl(link.url) === normalizeSourceUrl(url));
  if (existing) {
    if (!existing.clipId) existing.clipId = clip.id;
    return existing;
  }
  const link = {
    id: makeId("link"),
    title: clip.title || "",
    url,
    createdAt: nowIso(),
    previewTitle: clip.title || "",
    previewDescription: clipExcerpt(clip.markdown, 140),
    previewImage: clip.cover || "",
    previewSiteName: clip.siteName || "",
    previewFetchedAt: nowIso(),
    // 记一下是哪份材料带来的，将来要做联动能用上
    clipId: clip.id
  };
  paper.links.push(link);
  return link;
}

// 喂给模型的正文：优先摘要，网页剪藏没写摘要时用正文开头顶上
function paperBodyText(paper, max) {
  const abstract = String(paper?.abstract || "").trim();
  if (abstract) return compactText(abstract, max);
  return compactText(clipExcerpt(primaryClip(paper)?.markdown || "", max), max);
}

/* ----- 论文 ←→ 解读文章的配对 -----
   公众号解读和原论文常常是同一件事，存两条没意义。这里找出"这份剪藏讲的是库里哪篇论文"，
   只认硬证据（arXiv 编号 / DOI / 论文标题原样出现），拿不准就不提，免得误并。 */

/* arXiv 编号出现的几种写法都要认：
   arxiv.org/abs|pdf/xxx、alphaxiv.org/abs|overview/xxx（用户主要从这里存论文）、
   ar5iv、huggingface.co/papers/xxx、arXiv:xxx、以及 DOI 形式的 10.48550/arXiv.xxx。
   都要求编号紧挨着这些上下文，避免把正文里随便一个 2024.1234 当成论文号。 */
const ARXIV_ID_PATTERN =
  /(?:(?:arxiv|alphaxiv|ar5iv)\.(?:org|io)\/[^\s"'<>)]{0,40}?|huggingface\.co\/papers\/|arxiv[\s:.]{0,3}|10\.48550\/arxiv\.)(\d{4}\.\d{4,5})/gi;

function arxivIdsIn(text) {
  const ids = new Set();
  const haystack = String(text || "");
  ARXIV_ID_PATTERN.lastIndex = 0;
  let match = ARXIV_ID_PATTERN.exec(haystack);
  while (match) {
    ids.add(match[1]);
    match = ARXIV_ID_PATTERN.exec(haystack);
  }
  return ids;
}

function doisIn(text) {
  const dois = new Set();
  const pattern = /\b(10\.\d{4,9}\/[-._;()/:a-z0-9]+)/gi;
  let match = pattern.exec(String(text || ""));
  while (match) {
    dois.add(match[1].toLowerCase().replace(/[).,;]+$/, ""));
    match = pattern.exec(String(text || ""));
  }
  return dois;
}

// 论文原始出处的站点。用来判断合并时谁是"正主"：论文页的标题/摘要应该盖过解读文章的
const PAPER_HOSTS = [
  "arxiv.org",
  "ar5iv.org",
  "alphaxiv.io",
  "alphaxiv.org",
  "doi.org",
  "openreview.net",
  "aclanthology.org",
  "ieeexplore.ieee.org",
  "dl.acm.org",
  "link.springer.com",
  "nature.com",
  "science.org",
  "sciencedirect.com",
  "pubmed.ncbi.nlm.nih.gov",
  "biorxiv.org",
  "medrxiv.org",
  "semanticscholar.org",
  "papers.nips.cc",
  "proceedings.mlr.press",
  "huggingface.co"
];

function isPaperSourceUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
    return PAPER_HOSTS.some((paperHost) => host === paperHost || host.endsWith(`.${paperHost}`));
  } catch {
    return false;
  }
}

// 一条记录"自己是什么"：标题和来源里的编号
function paperSelfIdentifiers(paper) {
  const haystack = [paper.title, paper.sourceUrl].filter(Boolean).join(" ");
  return { arxiv: arxivIdsIn(haystack), doi: doisIn(haystack) };
}

// 一条记录"提到了什么"：正文、备注、摘要里的编号（解读文章会写原论文的 arXiv 号）
function paperMentionText(paper) {
  return [paper.abstract, paper.conversation, ...paperClips(paper).map((clip) => compactText(clip.markdown, 30000))]
    .filter(Boolean)
    .join("\n");
}

function hasOverlap(left, right) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

/* 两个方向都要认：
   A. 正在存的是解读，库里已有它讲的那篇论文 → 挂上去当一份材料，不动论文的标题摘要
   B. 正在存的是论文本身，库里已有它的解读   → 合并后用论文的标题/摘要/来源顶替（解读的标题不该占着正主的位置） */
function matchPapersForClip(store, { markdown = "", title: rawTitle = "", sourceUrl = "" }) {
  const title = stripSiteTitleSuffix(rawTitle);
  const mentionText = compactText(markdown, 60000);
  const mentionArxiv = arxivIdsIn(mentionText);
  const mentionDoi = doisIn(mentionText);
  const normalizedMention = normalizePaperTitle(`${title}\n${mentionText}`);

  const selfText = `${title} ${sourceUrl}`;
  const selfArxiv = arxivIdsIn(selfText);
  const selfDoi = doisIn(selfText);
  const selfTitle = normalizePaperTitle(title);
  const selfIsPaper = isPaperSourceUrl(sourceUrl);

  const matches = [];
  for (const paper of store.papers) {
    // 同一个来源的交给查重逻辑，不算配对
    if (sourceUrl && normalizeSourceUrl(paper.sourceUrl) === normalizeSourceUrl(sourceUrl)) continue;
    const ids = paperSelfIdentifiers(paper);
    let reason = "";
    let confidence = 0;
    let direction = "";

    // 方向 A：我提到了它
    if (hasOverlap(mentionArxiv, ids.arxiv)) {
      reason = "正文里出现了这篇论文的 arXiv 编号";
      confidence = 0.98;
      direction = "clip-about-paper";
    } else if (hasOverlap(mentionDoi, ids.doi)) {
      reason = "正文里出现了这篇论文的 DOI";
      confidence = 0.96;
      direction = "clip-about-paper";
    } else {
      const paperTitle = normalizePaperTitle(paper.title);
      // 标题原样出现：长标题才算数，短标题容易误伤
      if (paperTitle.length >= 16 && normalizedMention.includes(paperTitle)) {
        reason = "正文里出现了这篇论文的标题";
        confidence = 0.9;
        direction = "clip-about-paper";
      }
    }

    // 方向 B：它提到了我（库里存的是我的解读）
    if (!confidence && (selfArxiv.size || selfDoi.size || selfTitle.length >= 16)) {
      const paperText = paperMentionText(paper);
      const paperArxiv = arxivIdsIn(paperText);
      const paperDoi = doisIn(paperText);
      if (hasOverlap(selfArxiv, paperArxiv)) {
        reason = "库里这篇解读引用了同一个 arXiv 编号";
        confidence = 0.97;
        direction = "paper-about-clip";
      } else if (hasOverlap(selfDoi, paperDoi)) {
        reason = "库里这篇解读引用了同一个 DOI";
        confidence = 0.95;
        direction = "paper-about-clip";
      } else if (selfTitle.length >= 16 && normalizePaperTitle(paperText).includes(selfTitle)) {
        reason = "库里这篇解读里出现了这篇论文的标题";
        confidence = 0.88;
        direction = "paper-about-clip";
      }
    }

    if (!confidence) continue;
    // 正主是论文页、而库里那条是解读时，合并后要把标题摘要换成论文的
    const promote = selfIsPaper && !isPaperSourceUrl(paper.sourceUrl);
    matches.push({
      paperId: paper.id,
      title: paper.title,
      reason,
      confidence,
      direction,
      promote,
      clipCount: paperClips(paper).length
    });
  }
  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

function redundantTagSuggestions(store) {
  const groups = new Map();
  for (const tag of store.tags || []) {
    if (isSystemTag(tag)) continue;
    const paperIds = [...new Set(tag.paperIds || [])].sort();
    if (!paperIds.length) continue;
    const key = paperIds.join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tag);
  }
  return [...groups.values()]
    .filter((tags) => tags.length > 1)
    .map((tags) => {
      const ordered = [...tags].sort((a, b) => (b.paperIds?.length || 0) - (a.paperIds?.length || 0) || a.name.localeCompare(b.name, "zh-CN"));
      const [canonical, ...sources] = ordered;
      return {
        canonical: canonical.name,
        tags: sources.map((tag) => tag.name),
        aliases: sources.map((tag) => tag.name),
        confidence: 1,
        reason: `这些标签关联的论文集合完全一致（${canonical.paperIds?.length || 0} 篇），区分度可能冗余。`,
        kind: "redundant-identical-paper-set"
      };
    });
}

function replaceRelationIds(ids, sourceIds, targetId) {
  const next = [];
  for (const id of ids || []) {
    if (sourceIds.has(id)) {
      if (targetId) next.push(targetId);
    } else {
      next.push(id);
    }
  }
  return uniq(next.filter(Boolean));
}

function mergeTagGroup(store, group) {
  const canonicalName = normalizeTagName(group.canonical || group.target || group.name);
  const sourceNames = splitManualTags(group.tags || group.sources || group.merge || group.aliases || []);
  if (!canonicalName || !sourceNames.length) return null;

  const target = findTagByName(store, canonicalName);
  if (!target) return null;

  const sourceTags = sourceNames
    .map((name) => findTagByExactName(store, name) || findTagByName(store, name))
    .filter((tag) => tag && tag.id !== target.id);
  const sourceIds = new Set(sourceTags.map((tag) => tag.id));
  if (!sourceIds.size) return null;

  if (group.description && !target.description) target.description = group.description;
  target.aliases = uniq([...(target.aliases || []), ...(group.aliases || [])]);

  for (const source of sourceTags) {
    target.aliases = uniq([...(target.aliases || []), source.name, ...(source.aliases || [])]);
    target.sources = uniq([...(target.sources || []), ...(source.sources || []), "llm-merge"]);
    target.paperIds = uniq([...(target.paperIds || []), ...(source.paperIds || [])]);
    target.parentIds = uniq([...(target.parentIds || []), ...(source.parentIds || [])]);
    target.childIds = uniq([...(target.childIds || []), ...(source.childIds || [])]);
    target.relatedIds = uniq([...(target.relatedIds || []), ...(source.relatedIds || [])]);
    if (!target.description && source.description) target.description = source.description;
  }

  for (const paper of store.papers) {
    if ((paper.tagIds || []).some((id) => sourceIds.has(id))) {
      paper.tagIds = uniq([...(paper.tagIds || []).filter((id) => !sourceIds.has(id)), target.id]);
      paper.updatedAt = nowIso();
    }
  }

  for (const tag of store.tags) {
    if (tag.id === target.id) continue;
    tag.parentIds = replaceRelationIds(tag.parentIds, sourceIds, target.id);
    tag.childIds = replaceRelationIds(tag.childIds, sourceIds, target.id);
    tag.relatedIds = replaceRelationIds(tag.relatedIds, sourceIds, target.id);
  }

  target.parentIds = replaceRelationIds(target.parentIds, sourceIds, null).filter((id) => id !== target.id);
  target.childIds = replaceRelationIds(target.childIds, sourceIds, null).filter((id) => id !== target.id);
  target.relatedIds = replaceRelationIds(target.relatedIds, sourceIds, null).filter((id) => id !== target.id);
  target.updatedAt = nowIso();
  store.tags = store.tags.filter((tag) => !sourceIds.has(tag.id));
  rebuildPaperTagLinks(store);
  return target;
}

function validateMergeGroup(store, group) {
  const canonicalName = normalizeTagName(group?.canonical || group?.target || group?.name);
  const sourceNames = splitManualTags(group?.tags || group?.sources || group?.merge || []);
  if (!canonicalName) throw new Error("请选择要保留的标签");
  if (!sourceNames.length) throw new Error("请选择要合并的标签");

  const target = findTagByName(store, canonicalName);
  if (!target) throw new Error(`保留标签不存在：${canonicalName}`);
  if (isSystemTag(target)) throw new Error("系统标签不能参与合并");

  const missing = sourceNames.filter((name) => !findTagByName(store, name));
  if (missing.length) throw new Error(`待合并标签不存在：${missing.join("、")}`);
  if (sourceNames.map((name) => findTagByName(store, name)).some(isSystemTag)) throw new Error("系统标签不能参与合并");

  const normalizedTarget = tagKey(target.name);
  const normalizedSources = sourceNames.map(tagKey).filter((name) => name !== normalizedTarget);
  if (!normalizedSources.length) throw new Error("待合并标签不能和保留标签完全相同");

  return {
    ...group,
    canonical: target.name,
    tags: sourceNames.filter((name) => tagKey(name) !== normalizedTarget)
  };
}

function applyTagMerges(store, merges) {
  let count = 0;
  for (const group of Array.isArray(merges) ? merges : []) {
    const confidence = Number(group.confidence ?? 1);
    if (confidence >= 0.72 && mergeTagGroup(store, group)) count += 1;
  }
  return count;
}

function clearTagGraph(store) {
  for (const tag of store.tags) {
    tag.parentIds = [];
    tag.childIds = [];
    tag.relatedIds = [];
  }
}

function fallbackSearch(query, store) {
  const q = tagKey(query);
  const scored = store.tags.map((tag) => {
    const paperHits = (tag.paperIds || [])
      .map((id) => store.papers.find((paper) => paper.id === id))
      .filter(Boolean)
      .some((paper) => tagKey(`${paper.title} ${paper.abstract} ${paper.conversation}`).includes(q));
    const score =
      similarity(q, tag.name) * 2 +
      (tagKey(tag.name).includes(q) ? 2 : 0) +
      ((tag.aliases || []).some((alias) => tagKey(alias).includes(q)) ? 1 : 0) +
      (paperHits ? 0.8 : 0);
    return { tag, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => ({
      tagId: item.tag.id,
      tagName: item.tag.name,
      reason: "本地标签/论文文本匹配",
      confidence: Math.min(0.95, Number((item.score / 4).toFixed(2)))
    }));
}

// 论文检索的本地兜底：模型不可用时按标题/摘要/对话/标签做文本包含匹配
function fallbackPaperSearch(query, store) {
  const q = tagKey(query);
  if (!q) return [];
  return store.papers
    .map((paper) => {
      const titleHit = tagKey(paper.title).includes(q);
      // 网页剪藏的正文也要能被搜到：用户常常只记得文章里的一句话
      const clipText = allClipText(paper, 20000);
      const bodyHit = tagKey(`${paper.abstract} ${paper.conversation} ${clipText} ${tagNamesForPaper(store, paper).join(" ")}`).includes(q);
      return { paper, score: (titleHit ? 2 : 0) + (bodyHit ? 1 : 0) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => ({
      paperId: item.paper.id,
      title: item.paper.title,
      reason: "本地文本匹配",
      confidence: item.score >= 2 ? 0.8 : 0.5
    }));
}

function similarPapersByTags(store, paperId) {
  const target = store.papers.find((paper) => paper.id === paperId);
  if (!target) return [];
  const targetTags = new Set(target.tagIds || []);
  return store.papers
    .filter((paper) => paper.id !== target.id)
    .map((paper) => {
      const candidateTags = new Set(paper.tagIds || []);
      const sharedIds = [...targetTags].filter((id) => candidateTags.has(id));
      const unionSize = new Set([...targetTags, ...candidateTags]).size || 1;
      const score = sharedIds.length / unionSize;
      const sharedTags = sharedIds.map((id) => store.tags.find((tag) => tag.id === id)?.name).filter(Boolean);
      return {
        paperId: paper.id,
        title: paper.title,
        confidence: Number(score.toFixed(2)),
        reason: sharedTags.length ? `共享标签：${sharedTags.join("、")}` : "标签重合度较低",
        sharedTags
      };
    })
    .filter((item) => item.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

function tagCatalogForLLM(store) {
  return store.tags.filter((tag) => !isSystemTag(tag)).map((tag) => ({
    id: tag.id,
    name: tag.name,
    aliases: tag.aliases || [],
    description: tag.description || "",
    paperCount: tag.paperIds?.length || 0,
    paperTitles: (tag.paperIds || [])
      .map((id) => store.papers.find((paper) => paper.id === id)?.title)
      .filter(Boolean)
      .slice(0, 8)
  }));
}

function normalizeTopicPack(input) {
  if (!input) return null;
  const name = String(input.name || "").trim();
  if (!name) return null;
  const timestamp = nowIso();
  return {
    id: input.id || makeId("topic"),
    name,
    description: String(input.description || "").trim(),
    includeTagIds: uniq(Array.isArray(input.includeTagIds) ? input.includeTagIds.map(String) : []),
    excludeTagIds: uniq(Array.isArray(input.excludeTagIds) ? input.excludeTagIds.map(String) : []),
    matchMode: input.matchMode === "all" ? "all" : "any",
    createdAt: input.createdAt || timestamp,
    updatedAt: input.updatedAt || timestamp
  };
}

function topicPackPapers(store, pack) {
  const includeIds = new Set(pack.includeTagIds || []);
  const excludeIds = new Set(pack.excludeTagIds || []);
  return store.papers.filter((paper) => {
    const paperTagIds = new Set(paper.tagIds || []);
    if ([...excludeIds].some((id) => paperTagIds.has(id))) return false;
    if (!includeIds.size) return false;
    if (pack.matchMode === "all") return [...includeIds].every((id) => paperTagIds.has(id));
    return [...includeIds].some((id) => paperTagIds.has(id));
  });
}

function serializeTopicPack(store, pack) {
  const normalized = normalizeTopicPack(pack);
  return {
    ...normalized,
    paperCount: topicPackPapers(store, normalized).length
  };
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

async function fetchLinkPreview(linkUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(linkUrl, { signal: controller.signal, redirect: "follow", credentials: "omit" });
    clearTimeout(timer);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.includes("html")) return null;
    const html = (await response.text()).slice(0, 400000);
    const baseUrl = response.url || linkUrl;
    const metaPatterns = (key) => [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*?content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*?(?:property|name)=["']${key}["']`, "i")
    ];
    const pick = (...patterns) => {
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return decodeHtmlEntities(match[1].trim());
      }
      return "";
    };
    const title = pick(...metaPatterns("og:title"), ...metaPatterns("twitter:title"), /<title[^>]*>([^<]+)<\/title>/i);
    const description = pick(...metaPatterns("og:description"), ...metaPatterns("twitter:description"), ...metaPatterns("description"));
    let image = pick(...metaPatterns("og:image"), ...metaPatterns("twitter:image"));
    const siteName = pick(...metaPatterns("og:site_name"));
    if (image) {
      try {
        image = new URL(image, baseUrl).href;
      } catch {
        image = "";
      }
    }
    if (!title && !description && !image) return null;
    return { title, description, image, siteName };
  } catch {
    return null;
  }
}

function applyLinkPreview(link, preview) {
  link.previewTitle = preview?.title || "";
  link.previewDescription = preview?.description || "";
  link.previewImage = preview?.image || "";
  link.previewSiteName = preview?.siteName || "";
  link.previewFetchedAt = nowIso();
}

function parseJsonContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = String(content).match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型没有返回可解析的 JSON");
    return JSON.parse(match[0]);
  }
}

async function callLLM(config, messages, { temperature = 0.2, json = true, returnMeta = false } = {}) {
  const provider = normalizeProvider(config.provider);
  const providerInfo = PROVIDERS[provider];
  const apiKey = config[providerInfo.keyField];
  const model = config[providerInfo.modelField];
  const baseUrl = config[providerInfo.baseUrlField];
  if (!apiKey) throw new Error(`尚未配置 ${providerInfo.label} API Key`);

  const endpoint = `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;
  const requestBody = {
    model,
    // Kimi Code 端点只接受 temperature=1，传其他值会直接 400
    temperature: provider === "kimi" ? 1 : temperature,
    ...(json ? { response_format: { type: "json_object" } } : {}),
    messages
  };
  if (provider === "zhipu") requestBody.max_tokens = ZHIPU_MAX_TOKENS;
  if (provider === "zhipu" && ZHIPU_THINKING_MODELS.has(String(model).toLowerCase())) {
    requestBody.thinking = { type: "enabled" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `模型请求失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content || "";
  const parsed = json ? parseJsonContent(content) : content;
  if (!returnMeta) return parsed;
  return {
    content: parsed,
    meta: {
      provider,
      requestedModel: model,
      responseModel: payload?.model || "",
      endpoint,
      thinking: requestBody.thinking?.type || "",
      maxTokens: requestBody.max_tokens || null,
      responseId: payload?.id || "",
      created: payload?.created || null
    }
  };
}

async function searchTagsWithLLM(config, query, store) {
  const messages = [
    {
      role: "system",
      content: "你是论文标签检索助手。根据用户关键词，从标签库中选择最相关标签，并说明理由。只返回 JSON，不要 Markdown。"
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "search_best_tags",
        schema: {
          matches: [
            {
              tagName: "必须来自标签库的标签名",
              reason: "匹配原因",
              confidence: 0.88
            }
          ],
          expandedKeywords: ["模型理解后的关键词"]
        },
        query,
        tagCatalog: tagCatalogForLLM(store)
      })
    }
  ];

  const result = await callLLM(config, messages);
  return (Array.isArray(result.matches) ? result.matches : [])
    .map((match) => {
      const tag = store.tags.find((item) => tagKey(item.name) === tagKey(match.tagName));
      if (!tag) return null;
      return {
        tagId: tag.id,
        tagName: tag.name,
        reason: match.reason || "模型推荐",
        confidence: Number(match.confidence || 0.7)
      };
    })
    .filter(Boolean);
}

// LLM 论文检索：让模型读每篇论文的标题/摘要/对话，按语义返回可能相关的候选论文
async function searchPapersWithLLM(config, query, store) {
  if (!store.papers.length) return [];
  const messages = [
    {
      role: "system",
      content:
        "你是论文库检索助手。请根据用户的检索意图，仔细阅读每篇论文的标题、摘要和对话记录，从论文库中挑出可能相关的候选论文，并说明理由。只返回 JSON，不要 Markdown。"
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "search_relevant_papers",
        rules: [
          "只能返回 paperCatalog 中已有的 id，不能编造论文。",
          "按语义理解检索意图，不要只做字面关键词匹配；同义词、中英文互译、相关方法和应用场景都算相关。",
          "reason 必须用中文书写，具体说明这篇论文和检索意图哪里相关。",
          "按相关程度从高到低排序，最多返回 12 篇；没有相关的就返回空数组。"
        ],
        schema: { matches: [{ paperId: "论文 id", reason: "为什么相关", confidence: 0.88 }] },
        query,
        paperCatalog: store.papers.map((paper) => ({
          id: paper.id,
          title: paper.title,
          abstract: paperBodyText(paper, 600),
          conversation: compactText(paper.conversation, 800),
          tags: tagNamesForPaper(store, paper)
        }))
      })
    }
  ];

  const result = await callLLM(config, messages, { temperature: 0.2 });
  const paperById = new Map(store.papers.map((paper) => [paper.id, paper]));
  return (Array.isArray(result.matches) ? result.matches : [])
    .map((match) => {
      const paper = paperById.get(String(match.paperId || "").trim());
      if (!paper) return null;
      return {
        paperId: paper.id,
        title: paper.title,
        reason: match.reason || "模型认为相关",
        confidence: Math.max(0, Math.min(1, Number(match.confidence || 0.7)))
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

async function recommendSimilarPapersWithLLM(config, paperId, store, { sinceIso = "" } = {}) {
  const target = store.papers.find((paper) => paper.id === paperId);
  if (!target) throw new Error("论文不存在");

  const candidates = store.papers
    .filter((paper) => paper.id !== target.id && (!sinceIso || String(paper.createdAt || "") > sinceIso))
    .map((paper) => ({
      id: paper.id,
      title: paper.title,
      abstract: paperBodyText(paper, 1200),
      conversation: compactText(paper.conversation, 1600),
      tags: tagNamesForPaper(store, paper)
    }));
  if (!candidates.length) return [];

  const result = await callLLM(
    config,
    [
      {
        role: "system",
        content:
          "你是论文库相似论文推荐助手。请仔细阅读目标论文和每篇候选论文的简介摘要与对话记录，理解各自的研究问题、方法和结论后，从候选论文中推荐最相似的论文。只能返回候选库中已有 paper id。只返回 JSON，不要 Markdown。"
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "recommend_similar_existing_papers",
          rules: [
            "只能推荐 candidatePapers 中已有的 id，不能编造论文。",
            "每篇论文都附带了简介摘要(abstract)和用户与大模型的对话记录(conversation)，请逐篇仔细阅读理解内容后再判断相似性，不要只看标签或标题。",
            "优先考虑语义相近的研究问题、方法或应用场景，其次是共享标签。",
            "如果标签相同但论文主题明显不同，要降低置信度。",
            "reason 必须用中文书写，具体说明两篇论文在内容上的相似点。",
            "返回最多 6 篇。"
          ],
          schema: {
            matches: [
              {
                paperId: "候选论文 id",
                reason: "为什么相似，提及具体的研究问题、方法或主题",
                confidence: 0.86
              }
            ]
          },
          targetPaper: {
            id: target.id,
            title: target.title,
            abstract: paperBodyText(target, 2000),
            conversation: compactText(target.conversation, 2400),
            tags: tagNamesForPaper(store, target)
          },
          candidatePapers: candidates
        })
      }
    ],
    { temperature: 0.2 }
  );

  const candidateIds = new Set(candidates.map((paper) => paper.id));
  return (Array.isArray(result.matches) ? result.matches : [])
    .map((match) => {
      const paperId = String(match.paperId || "").trim();
      if (!candidateIds.has(paperId)) return null;
      const paper = store.papers.find((item) => item.id === paperId);
      return {
        paperId,
        title: paper?.title || "",
        reason: match.reason || "模型认为该论文在标签和主题上相似",
        confidence: Math.max(0, Math.min(1, Number(match.confidence || 0.7)))
      };
    })
    .filter(Boolean)
    .slice(0, 6);
}

async function mergeSimilarTagsWithLLM(config, store) {
  const result = await callLLM(
    config,
    [
      {
        role: "system",
        content:
          "你是 Paper_Mind 清理助手。你的唯一任务是找出语义十分相似、几乎同义、或中英文/缩写表达同一概念的已有标签，并给出合并方案。只返回 JSON，不要 Markdown。"
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "merge_highly_similar_existing_tags_only",
          rules: [
            "保留所有已有论文和论文-标签关联，不要丢失任何论文。",
            "绝对不要创建任何新标签。canonical 和 tags 都必须来自 tagCatalog 中已有的标签 name 或 aliases。",
            "只合并语义十分相似、几乎同义、或中英文/缩写表达同一概念的标签。",
            "合并时 canonical 是保留的规范标签名，tags 是要合并进 canonical 的已有标签名。",
            "不要把只是相关但不是同义的标签合并。",
            "如果没有足够把握，不要合并。宁可少合并，不要误合并。",
            "不要输出树结构、父子关系、目录层级或相关标签图。",
            "中文标签优先，常见英文缩写可放入 aliases。"
          ],
          schema: {
            merges: [
              {
                canonical: "保留的规范标签名",
                tags: ["要合并进规范标签的已有标签名"],
                aliases: ["合并后的别名"],
                confidence: 0.9,
                reason: "为什么这些标签语义相同或高度相似"
              }
            ]
          },
          tagCatalog: tagCatalogForLLM(store)
        })
      }
    ],
    { temperature: 0.1 }
  );
  return { merges: Array.isArray(result.merges) ? result.merges : [] };
}

// 用当前 LLM 把论文摘要翻译成中文
async function translateAbstractWithLLM(config, text) {
  const result = await callLLM(
    config,
    [
      {
        role: "system",
        content: "你是学术论文摘要翻译助手。把用户给的英文摘要完整翻译成通顺的学术中文，专业术语翻译准确，常见缩写（如 LLM、RAG）保留英文。只返回 JSON，不要 Markdown。"
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "translate_paper_abstract_to_chinese",
          schema: { translation: "完整的中文翻译" },
          abstract: compactText(text, 8000)
        })
      }
    ],
    { temperature: 0.3 }
  );
  const translation = String(result.translation || "").trim();
  if (!translation) throw new Error("模型没有返回翻译内容");
  return translation;
}

async function testModel(config, question) {
  return callLLM(
    config,
    [
      {
        role: "user",
        content: question
      }
    ],
    { temperature: 0.5, json: false, returnMeta: true }
  );
}

async function readStoreFromIndexedDb() {
  const db = await openDatabase();
  try {
    const transaction = db.transaction([PAPER_STORE, TAG_STORE, META_STORE, TOPIC_PACK_STORE], "readonly");
    const paperRequest = transaction.objectStore(PAPER_STORE).getAll();
    const tagRequest = transaction.objectStore(TAG_STORE).getAll();
    const metaRequest = transaction.objectStore(META_STORE).getAll();
    const topicPackRequest = transaction.objectStore(TOPIC_PACK_STORE).getAll();
    const [papers, tags, metaRecords, topicPacks] = await Promise.all([
      requestToPromise(paperRequest),
      requestToPromise(tagRequest),
      requestToPromise(metaRequest),
      requestToPromise(topicPackRequest)
    ]);
    await transactionDone(transaction);
    const meta = clone(DEFAULT_STORE.meta);
    for (const record of metaRecords || []) {
      if (record?.key) meta[record.key] = record.value;
    }
    const store = {
      papers: sortByNewest(papers || []),
      tags: tags || [],
      topicPacks: sortByNewest(topicPacks || []),
      meta
    };
    const shouldPersistValueScoreNulls = (papers || []).some((paper) => !Object.hasOwn(paper, "valueScore") || paper.valueScore === undefined);
    const normalized = normalizeStore(store);
    if (shouldPersistValueScoreNulls) await writeStoreToIndexedDb(normalized);
    return normalized;
  } finally {
    db.close();
  }
}

async function writeStoreToIndexedDb(store) {
  normalizeStore(store);
  const db = await openDatabase();
  try {
    const transaction = db.transaction([PAPER_STORE, TAG_STORE, META_STORE, TOPIC_PACK_STORE], "readwrite");
    const papers = transaction.objectStore(PAPER_STORE);
    const tags = transaction.objectStore(TAG_STORE);
    const meta = transaction.objectStore(META_STORE);
    const topicPacks = transaction.objectStore(TOPIC_PACK_STORE);
    papers.clear();
    tags.clear();
    meta.clear();
    topicPacks.clear();
    for (const paper of store.papers || []) papers.put(paper);
    for (const tag of store.tags || []) tags.put(tag);
    for (const topicPack of store.topicPacks || []) topicPacks.put(topicPack);
    for (const [key, value] of Object.entries(store.meta || {})) meta.put({ key, value });
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

// 只更新单条论文记录（单事务原子操作），不整库覆盖写。
// 后台耗时任务（引用量、自动推荐）落库用它：任务跑完的瞬间用户可能刚存了新论文，
// 整库写回会把新论文覆盖丢掉。mutate 收到 (paper, allPaperIds) 可顺便过滤失效引用。
async function updatePaperInIndexedDb(paperId, mutate) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction([PAPER_STORE], "readwrite");
    const papersStore = transaction.objectStore(PAPER_STORE);
    const [paper, paperIds] = await Promise.all([
      requestToPromise(papersStore.get(paperId)),
      requestToPromise(papersStore.getAllKeys())
    ]);
    if (!paper) {
      await transactionDone(transaction);
      return null;
    }
    mutate(paper, new Set(paperIds || []));
    papersStore.put(paper);
    await transactionDone(transaction);
    return paper;
  } finally {
    db.close();
  }
}

/* ----- 剪藏图片的本地存档（单独一张表，不进整库读写，也不进 JSON 导出） ----- */

async function readClipAssets(paperId) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction([CLIP_ASSET_STORE], "readonly");
    const records = await requestToPromise(transaction.objectStore(CLIP_ASSET_STORE).index("paperId").getAll(paperId));
    await transactionDone(transaction);
    return records || [];
  } finally {
    db.close();
  }
}

async function deleteClipAssets(paperId) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction([CLIP_ASSET_STORE], "readwrite");
    const assets = transaction.objectStore(CLIP_ASSET_STORE);
    const keys = await requestToPromise(assets.index("paperId").getAllKeys(paperId));
    for (const key of keys || []) assets.delete(key);
    await transactionDone(transaction);
    return (keys || []).length;
  } finally {
    db.close();
  }
}

async function indexedDbHasLibraryData() {
  const db = await openDatabase();
  try {
    const transaction = db.transaction([PAPER_STORE, TAG_STORE], "readonly");
    const paperCountRequest = transaction.objectStore(PAPER_STORE).count();
    const tagCountRequest = transaction.objectStore(TAG_STORE).count();
    const [paperCount, tagCount] = await Promise.all([
      requestToPromise(paperCountRequest),
      requestToPromise(tagCountRequest)
    ]);
    await transactionDone(transaction);
    return paperCount > 0 || tagCount > 0;
  } finally {
    db.close();
  }
}

async function migrateLegacyChromeStorageStore() {
  const values = await storageGet([STORE_KEY, MIGRATION_KEY]);
  if (values[MIGRATION_KEY] || !values[STORE_KEY]) return;
  if (await indexedDbHasLibraryData()) {
    await storageSet({ [MIGRATION_KEY]: true });
    return;
  }
  const legacyStore = {
    ...clone(DEFAULT_STORE),
    ...values[STORE_KEY],
    papers: values[STORE_KEY].papers || [],
    tags: values[STORE_KEY].tags || [],
    topicPacks: values[STORE_KEY].topicPacks || [],
    meta: values[STORE_KEY].meta || clone(DEFAULT_STORE.meta)
  };
  await writeStoreToIndexedDb(legacyStore);
  await storageSet({ [MIGRATION_KEY]: true });
  await storageRemove(STORE_KEY);
}

async function readAll() {
  await migrateLegacyChromeStorageStore();
  const values = await storageGet([CONFIG_KEY]);
  const store = await readStoreFromIndexedDb();
  const config = { ...DEFAULT_CONFIG, ...(values[CONFIG_KEY] || {}) };
  return { store, config };
}

async function writeStore(store) {
  await writeStoreToIndexedDb(store);
}

async function writeConfig(config) {
  await storageSet({ [CONFIG_KEY]: config });
}

// 配置的"读—改—写"排成一队：并发写（保存设置 + 后台刷新模型清单）不排队会互相覆盖。
// mutate 收到的永远是刚从存储读出来的最新配置。
let configWriteQueue = Promise.resolve();

function updateConfig(mutate) {
  const run = configWriteQueue.then(async () => {
    const values = await storageGet([CONFIG_KEY]);
    const stored = { ...DEFAULT_CONFIG, ...(values[CONFIG_KEY] || {}) };
    const next = mutate(stored);
    if (next) await writeConfig(next);
    return next || stored;
  });
  // 单次失败不能把后面排队的写死
  configWriteQueue = run.catch(() => {});
  return run;
}

async function parseBody(options) {
  if (!options?.body) return {};
  if (typeof options.body === "string") return JSON.parse(options.body);
  return options.body;
}

function response(status, body) {
  if (status >= 400) {
    const error = new Error(body.error || `请求失败：${status}`);
    error.status = status;
    throw error;
  }
  return body;
}

// 通知后台跑耗时的 LLM 任务（翻译摘要、相似推荐）。
// 必须交给后台跑：popup 保存完就会关闭，在这里直接调 LLM 会被中途杀掉。
function notifyBackground(type, paperId, clipId = "") {
  try {
    const sending = globalThis.chrome?.runtime?.sendMessage?.({ type, paperId, clipId });
    sending?.catch?.(() => {});
  } catch {
    // 无后台监听（如测试环境）时静默忽略，不影响保存
  }
}

export async function handleApi(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const url = new URL(path, "https://extension.local");
  const { store, config } = await readAll();

  if (method === "GET" && url.pathname === "/api/state") {
    return response(200, { ...store, config: publicConfig(config) });
  }

  if (method === "GET" && url.pathname === "/api/export") {
    return response(200, {
      exportedAt: nowIso(),
      format: "paper-mind-store",
      version: 3,
      storage: "indexeddb",
      store
    });
  }

  if (method === "POST" && url.pathname === "/api/import") {
    const body = await parseBody(options);
    const importedStore = body.store || body;
    if (!Array.isArray(importedStore.papers) || !Array.isArray(importedStore.tags)) {
      return response(400, { error: "导入文件格式不正确" });
    }
    const nextStore = {
      papers: importedStore.papers,
      tags: importedStore.tags,
      topicPacks: importedStore.topicPacks || [],
      meta: importedStore.meta || clone(DEFAULT_STORE.meta)
    };
    normalizeStore(nextStore);
    await writeStore(nextStore);
    return response(200, { ...nextStore, config: publicConfig(config) });
  }

  if (method === "POST" && url.pathname === "/api/settings") {
    const body = await parseBody(options);
    // 只写用户改动的字段，其余（含后台刚拉回来的模型清单）保留存储里的最新值
    const nextConfig = await updateConfig((stored) => {
      const patched = {
        ...stored,
        provider: normalizeProvider(body.provider),
        qwenModel: body.qwenModel || stored.qwenModel,
        qwenBaseUrl: body.qwenBaseUrl || stored.qwenBaseUrl,
        zhipuModel: body.zhipuModel || stored.zhipuModel,
        zhipuBaseUrl: body.zhipuBaseUrl || stored.zhipuBaseUrl,
        kimiModel: body.kimiModel || stored.kimiModel,
        kimiBaseUrl: body.kimiBaseUrl || stored.kimiBaseUrl,
        deepseekModel: body.deepseekModel || stored.deepseekModel,
        deepseekBaseUrl: body.deepseekBaseUrl || stored.deepseekBaseUrl
      };
      if (typeof body.qwenKey === "string" && body.qwenKey.trim()) patched.qwenKey = body.qwenKey.trim();
      if (typeof body.zhipuKey === "string" && body.zhipuKey.trim()) patched.zhipuKey = body.zhipuKey.trim();
      if (typeof body.kimiKey === "string" && body.kimiKey.trim()) patched.kimiKey = body.kimiKey.trim();
      if (typeof body.deepseekKey === "string" && body.deepseekKey.trim()) patched.deepseekKey = body.deepseekKey.trim();
      if (body.clearQwenKey) patched.qwenKey = "";
      if (body.clearZhipuKey) patched.zhipuKey = "";
      if (body.clearKimiKey) patched.kimiKey = "";
      if (body.clearDeepseekKey) patched.deepseekKey = "";
      return patched;
    });
    return response(200, { config: publicConfig(nextConfig) });
  }

  // 模型清单：GET 只读缓存/兜底清单，POST 才联网拉最新（Key 和 Base URL 可由请求体临时覆盖，
  // 这样用户刚粘上 Key、还没点保存也能先刷新看看有哪些模型）
  if (url.pathname === "/api/models" && (method === "GET" || method === "POST")) {
    const body = method === "POST" ? await parseBody(options) : {};
    const provider = normalizeProvider(body.provider || url.searchParams.get("provider"));
    const catalog = await loadModelCatalog(config, provider, {
      apiKey: typeof body.key === "string" ? body.key.trim() : "",
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl.trim() : "",
      refresh: method === "POST" && body.refresh !== false
    });
    await cacheModelCatalog(provider, catalog);
    return response(200, catalog);
  }

  if (method === "POST" && url.pathname === "/api/test-model") {
    const body = await parseBody(options);
    const question = String(body.question || "").trim();
    if (!question) return response(400, { error: "测试问题不能为空" });
    const testConfig = {
      ...config,
      provider: normalizeProvider(body.provider),
      qwenModel: body.qwenModel || config.qwenModel,
      qwenBaseUrl: body.qwenBaseUrl || config.qwenBaseUrl,
      zhipuModel: body.zhipuModel || config.zhipuModel,
      zhipuBaseUrl: body.zhipuBaseUrl || config.zhipuBaseUrl,
      kimiModel: body.kimiModel || config.kimiModel,
      kimiBaseUrl: body.kimiBaseUrl || config.kimiBaseUrl,
      deepseekModel: body.deepseekModel || config.deepseekModel,
      deepseekBaseUrl: body.deepseekBaseUrl || config.deepseekBaseUrl
    };
    if (typeof body.qwenKey === "string" && body.qwenKey.trim()) testConfig.qwenKey = body.qwenKey.trim();
    if (typeof body.zhipuKey === "string" && body.zhipuKey.trim()) testConfig.zhipuKey = body.zhipuKey.trim();
    if (typeof body.kimiKey === "string" && body.kimiKey.trim()) testConfig.kimiKey = body.kimiKey.trim();
    if (typeof body.deepseekKey === "string" && body.deepseekKey.trim()) testConfig.deepseekKey = body.deepseekKey.trim();
    const result = await testModel(testConfig, question);
    return response(200, { answer: result.content, meta: result.meta });
  }

  if (method === "POST" && url.pathname === "/api/papers/check-duplicate") {
    const body = await parseBody(options);
    const title = String(body.title || "").trim();
    const sourceUrl = extractSourceUrl(body);
    if (!title && !sourceUrl) return response(200, { duplicate: false });
    const match = findDuplicatePaper(store, body);
    if (!match) return response(200, { duplicate: false });
    return response(200, {
      duplicate: true,
      score: Number(match.score.toFixed(3)),
      reason: match.reason,
      paper: match.paper,
      tagNames: tagNamesForPaper(store, match.paper)
    });
  }

  // 判断这份剪藏讲的是不是库里已有的某篇论文（公众号解读 ↔ 原论文）
  if (method === "POST" && url.pathname === "/api/papers/match-clip") {
    const body = await parseBody(options);
    return response(200, {
      matches: matchPapersForClip(store, {
        markdown: String(body.markdown || ""),
        title: String(body.title || ""),
        sourceUrl: extractSourceUrl(body)
      })
    });
  }

  if (method === "POST" && url.pathname === "/api/papers") {
    const body = await parseBody(options);
    const title = stripSiteTitleSuffix(body.title);
    const sourceUrl = extractSourceUrl(body);
    const incomingClip = normalizeIncomingClip(body.clip, { title, sourceUrl });

    // 直接并进指定的那条记录：popup 里选了"这是《XXX》的解读"，或者"库里已有这篇论文的解读"
    if (body.mergeIntoPaperId) {
      const host = store.papers.find((item) => item.id === body.mergeIntoPaperId);
      if (!host) return response(404, { error: "要并入的论文不存在" });

      // promote：正在存的是论文原始出处，而库里那条是解读，
      // 那么标题/摘要/来源要换成论文自己的，解读的标题不该占着正主的位置
      const promote = Boolean(body.promote) && isPaperSourceUrl(sourceUrl);
      if (promote) {
        if (title) host.title = title;
        if (typeof body.abstract === "string" && body.abstract.trim()) host.abstract = body.abstract.trim();
        if (sourceUrl) host.sourceUrl = sourceUrl;
        host.abstractZh = "";
      } else {
        if (!host.abstract && typeof body.abstract === "string") host.abstract = body.abstract.trim();
      }
      const attached = attachClip(host, incomingClip);
      if (attached) attachClipLink(host, attached);
      // promote 之后这条记录的来源变成论文本身了，原来那些解读的地址要补进外部资料
      if (promote) for (const clip of paperClips(host)) attachClipLink(host, clip);
      if (typeof body.conversation === "string") host.conversation = appendUniqueText(host.conversation, body.conversation);
      if ("valueScore" in body && promote) host.valueScore = normalizeValueScore(body.valueScore, host.valueScore || 1);
      mergePaperTags(store, host, body.manualTags);
      host.updatedAt = nowIso();
      markTagsStale(store);
      await writeStore(store);
      if (attached?.imageCount) notifyBackground("clip-archive-images", host.id, attached.id);
      if (promote && host.abstract) notifyBackground("auto-translate-abstract", host.id);
      return response(200, {
        paper: host,
        papers: store.papers,
        tags: store.tags,
        meta: store.meta,
        mergedIntoPaper: true,
        promoted: promote,
        clipId: attached?.id || ""
      });
    }

    if (!title) return response(400, { error: "论文标题不能为空" });
    const timestamp = nowIso();
    const duplicateAction = body.duplicateAction === "create" ? "create" : body.duplicateAction === "merge" ? "merge" : "";
    const duplicateMatch = duplicateAction === "create" ? null : findDuplicatePaper(store, { ...body, title, sourceUrl });
    if (duplicateMatch) {
      const existingPaper = duplicateMatch.paper;
      if (duplicateAction === "merge") mergePaperContent(existingPaper, body, sourceUrl);
      else {
        if (!existingPaper.sourceUrl && sourceUrl) existingPaper.sourceUrl = sourceUrl;
        if (!existingPaper.abstract && typeof body.abstract === "string") existingPaper.abstract = body.abstract.trim();
        if (!existingPaper.conversation && typeof body.conversation === "string") existingPaper.conversation = body.conversation.trim();
        if ("valueScore" in body) existingPaper.valueScore = normalizeValueScore(body.valueScore, existingPaper.valueScore || 1);
      }
      const attached = attachClip(existingPaper, incomingClip);
      if (attached) attachClipLink(existingPaper, attached);
      mergePaperTags(store, existingPaper, body.manualTags);
      existingPaper.updatedAt = nowIso();
      markTagsStale(store);
      await writeStore(store);
      if (attached?.imageCount) notifyBackground("clip-archive-images", existingPaper.id, attached.id);
      return response(200, { paper: existingPaper, papers: store.papers, tags: store.tags, meta: store.meta, duplicate: true, duplicateMerged: duplicateAction === "merge" });
    }
    const paper = {
      id: makeId("paper"),
      title,
      abstract: String(body.abstract || "").trim(),
      conversation: String(body.conversation || "").trim(),
      sourceUrl,
      valueScore: normalizeValueScore(body.valueScore),
      tagIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    if (incomingClip) paper.clips = [incomingClip];
    store.papers.unshift(paper);
    setPaperTags(store, paper, body.manualTags);
    markTagsStale(store);
    await writeStore(store);
    notifyBackground("auto-translate-abstract", paper.id);
    notifyBackground("auto-recommend-similar", paper.id);
    // 图片存档放后台跑：popup 保存完就关了，在这里等下载会被中途掐断
    if (incomingClip?.imageCount) notifyBackground("clip-archive-images", paper.id, incomingClip.id);
    return response(201, { paper, papers: store.papers, tags: store.tags, meta: store.meta });
  }

  const citationMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/citation$/);
  if (method === "POST" && citationMatch) {
    const paperId = decodeURIComponent(citationMatch[1]);
    const target = store.papers.find((item) => item.id === paperId);
    if (!target) return response(404, { error: "论文不存在" });

    // 先发起网络请求，再读取最新整库写回，缩小并发写覆盖（lost update）窗口。
    let citation;
    try {
      const result = await fetchCitationCount({
        title: target.title,
        sourceUrl: target.sourceUrl || extractSourceUrl(target),
        conversation: target.conversation
      });
      citation =
        result.status === "ok"
          ? { citationCount: result.count, citationSource: result.source, citationStatus: "ok", citationExternalId: result.externalId || "", citationError: "" }
          : { citationStatus: "notfound", citationError: "" };
    } catch (err) {
      citation = { citationStatus: "error", citationError: err.message || "引用量获取失败" };
    }

    // 只原子更新这一条论文记录，不整库写回：引用量抓取和自动推荐会同时在后台跑，
    // 整库写回会互相覆盖，还可能丢掉期间新增的论文
    const paper = await updatePaperInIndexedDb(paperId, (record) => {
      Object.assign(record, citation, { citationUpdatedAt: nowIso() });
    });
    if (!paper) return response(404, { error: "论文不存在" });
    return response(200, { paper, papers: store.papers.map((item) => (item.id === paperId ? paper : item)) });
  }

  const paperTranslateMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/translate-abstract$/);
  if (method === "POST" && paperTranslateMatch) {
    const paperId = decodeURIComponent(paperTranslateMatch[1]);
    const target = store.papers.find((item) => item.id === paperId);
    if (!target) return response(404, { error: "论文不存在" });
    if (!String(target.abstract || "").trim()) return response(200, { paper: target, translated: false, error: "这篇论文没有摘要" });
    if (target.abstractZh) return response(200, { paper: target, translated: true, cached: true });

    const translation = await translateAbstractWithLLM(config, target.abstract);

    // LLM 耗时期间可能有其他写入，只原子更新这一条论文记录
    const provider = normalizeProvider(config.provider);
    const paper = await updatePaperInIndexedDb(paperId, (record) => {
      record.abstractZh = translation;
      record.abstractZhAt = nowIso();
      record.abstractZhModel = config[PROVIDERS[provider].modelField] || "";
    });
    if (!paper) return response(404, { error: "论文不存在" });
    return response(200, { paper, translated: true });
  }

  const paperSimilarMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/similar-llm$/);
  if (method === "POST" && paperSimilarMatch) {
    const paperId = decodeURIComponent(paperSimilarMatch[1]);
    const target = store.papers.find((paper) => paper.id === paperId);
    if (!target) return response(404, { error: "论文不存在" });
    const existing = target.llmSimilar || null;
    const sinceIso = existing?.updatedAt || "";
    const validExistingMatches = (existing?.matches || []).filter(
      (match) => match.paperId !== paperId && store.papers.some((paper) => paper.id === match.paperId)
    );

    // 增量模式：上次推荐之后没有新增论文，直接返回已有结果，不调模型
    if (sinceIso) {
      const hasNewPapers = store.papers.some((paper) => paper.id !== paperId && String(paper.createdAt || "") > sinceIso);
      if (!hasNewPapers) {
        return response(200, { paper: target, matches: validExistingMatches, llmUsed: true, error: "", updatedAt: existing.updatedAt, noNewPapers: true });
      }
    }

    let newMatches = [];
    try {
      newMatches = await recommendSimilarPapersWithLLM(config, paperId, store, { sinceIso });
    } catch (err) {
      // 模型不可用：有历史推荐就原样保留展示，没有才用本地标签规则兜底（都不落库）
      const fallback = validExistingMatches.length ? validExistingMatches : similarPapersByTags(store, paperId);
      return response(200, { paper: target, matches: fallback, llmUsed: false, error: err.message, updatedAt: existing?.updatedAt || "", noNewPapers: false });
    }

    const merged = [...newMatches, ...validExistingMatches.filter((match) => !newMatches.some((item) => item.paperId === match.paperId))]
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
      .slice(0, 8);

    // LLM 调用耗时较长，期间用户可能又存了新论文；只原子更新这一条论文记录，
    // 不整库写回，避免覆盖丢掉期间新增的论文
    const provider = normalizeProvider(config.provider);
    let validMerged = merged;
    const paper = await updatePaperInIndexedDb(paperId, (record, allPaperIds) => {
      validMerged = merged.filter((match) => allPaperIds.has(match.paperId));
      record.llmSimilar = {
        matches: validMerged,
        updatedAt: nowIso(),
        provider,
        model: config[PROVIDERS[provider].modelField] || ""
      };
    });
    if (!paper) return response(404, { error: "论文不存在" });
    return response(200, { paper, matches: validMerged, llmUsed: true, error: "", updatedAt: paper.llmSimilar.updatedAt, noNewPapers: false });
  }

  /* ----- 一条记录下的多份剪藏材料 ----- */

  // 图片是磁盘上的真实文件，这里只管元数据（哪张图存到了哪个路径）。
  // 真正的下载在 clip-archive.js（service worker）里做，用 PUT 把结果写回来。
  const clipAssetsMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/clips\/([^/]+)\/assets$/);
  if (clipAssetsMatch && (method === "GET" || method === "PUT" || method === "DELETE")) {
    const paperId = decodeURIComponent(clipAssetsMatch[1]);
    const clipId = decodeURIComponent(clipAssetsMatch[2]);
    const target = store.papers.find((item) => item.id === paperId);
    if (!target) return response(404, { error: "论文不存在" });
    const clip = findClip(target, clipId);
    if (!clip) return response(404, { error: "这份材料不存在" });

    if (method === "GET") {
      // legacy 是 v1.1 存在浏览器里的图片副本，读出来是为了迁移到磁盘，迁完就删
      const legacy = await readClipAssets(paperId);
      return response(200, { paperId, clipId, assets: clip.assets || [], dir: clip.assetDir || "", legacy });
    }

    if (method === "DELETE") {
      const removed = await deleteClipAssets(paperId);
      const paper = await updatePaperInIndexedDb(paperId, (record) => {
        const record_clip = (record.clips || []).find((item) => item.id === clipId);
        if (!record_clip) return;
        record_clip.assets = [];
        record_clip.assetDir = "";
        record_clip.assetStatus = record_clip.imageCount ? "pending" : "skipped";
        record_clip.assetSavedCount = 0;
        record_clip.assetUpdatedAt = nowIso();
        record_clip.assetError = "";
      });
      // 只清记录，不删磁盘上的图片文件：那是用户自己的存档，误删代价太大
      return response(200, { paper: paper || target, removed });
    }

    const body = await parseBody(options);
    // 不带 assets 的 PUT 只更新状态（后台失败时用它把原因写下来，别把已存好的图记录抹掉）
    const hasAssets = Array.isArray(body.assets);
    const assets = hasAssets ? body.assets.filter((asset) => asset?.url) : [];
    const paper = await updatePaperInIndexedDb(paperId, (record) => {
      const record_clip = (record.clips || []).find((item) => item.id === clipId);
      if (!record_clip) return;
      if (hasAssets) {
        record_clip.assets = assets;
        record_clip.assetDir = String(body.dir || "");
        record_clip.assetSavedCount = assets.length;
      }
      record_clip.assetStatus = CLIP_ASSET_STATUSES.has(body.status) ? body.status : assets.length ? "done" : "error";
      record_clip.assetUpdatedAt = nowIso();
      record_clip.assetError = String(body.error || "");
    });
    if (!paper) return response(404, { error: "论文不存在" });
    // 图片已经落到磁盘，浏览器里的旧副本可以扔了
    if (assets.length && !paperClips(paper).some((item) => item.assetStatus === "pending")) {
      await deleteClipAssets(paperId).catch(() => {});
    }
    return response(200, { paper });
  }

  const clipMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/clips\/([^/]+)$/);
  if (clipMatch && (method === "PUT" || method === "DELETE")) {
    const paperId = decodeURIComponent(clipMatch[1]);
    const clipId = decodeURIComponent(clipMatch[2]);
    const paper = store.papers.find((item) => item.id === paperId);
    if (!paper) return response(404, { error: "论文不存在" });
    const clip = findClip(paper, clipId);
    if (!clip) return response(404, { error: "这份材料不存在" });

    if (method === "DELETE") {
      paper.clips = paperClips(paper).filter((item) => item.id !== clipId);
      paper.updatedAt = nowIso();
      await writeStore(store);
      // 磁盘上的图片文件留着，用户自己的存档不替他删
      return response(200, { paper, papers: store.papers, removedClipId: clipId, assetDir: clip.assetDir || "" });
    }

    const body = await parseBody(options);
    let markdownChanged = false;
    if (typeof body.title === "string") clip.title = body.title.trim();
    if (typeof body.markdown === "string") {
      const markdown = body.markdown.trim();
      if (!markdown) {
        paper.clips = paperClips(paper).filter((item) => item.id !== clipId);
      } else if (markdown !== clip.markdown) {
        clip.markdown = markdown;
        clip.textLength = clipPlainText(markdown).length;
        clip.imageCount = clipImageUrls(markdown).length;
        markdownChanged = true;
      }
    }
    paper.updatedAt = nowIso();
    await writeStore(store);
    // 正文改过可能多出新图，补一轮存档
    if (markdownChanged && clip.imageCount) notifyBackground("clip-archive-images", paperId, clipId);
    return response(200, { paper, papers: store.papers });
  }

  // 把另一篇论文整个并进来：它的剪藏材料、外部链接、标签都搬过来，然后删掉那条
  const absorbMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/absorb$/);
  if (method === "POST" && absorbMatch) {
    const paperId = decodeURIComponent(absorbMatch[1]);
    const body = await parseBody(options);
    const sourceId = String(body.sourcePaperId || "");
    const host = store.papers.find((item) => item.id === paperId);
    const source = store.papers.find((item) => item.id === sourceId);
    if (!host || !source) return response(404, { error: "论文不存在" });
    if (host.id === source.id) return response(400, { error: "不能并入自己" });

    for (const clip of paperClips(source)) {
      const moved = attachClip(host, { ...clip, id: makeId("clip") });
      if (moved) attachClipLink(host, moved);
    }
    // 源论文没有剪藏正文时，至少把它的来源链接留成一条外部资料
    if (!paperClips(source).length && source.sourceUrl) {
      host.links ||= [];
      if (!host.links.some((link) => link.url === source.sourceUrl)) {
        host.links.push({ id: makeId("link"), title: source.title, url: source.sourceUrl, createdAt: nowIso() });
      }
    }
    host.links = [...(host.links || []), ...(source.links || []).filter((link) => !(host.links || []).some((item) => item.url === link.url))];
    host.abstract = appendUniqueText(host.abstract, source.abstract);
    host.conversation = appendUniqueText(host.conversation, source.conversation);
    mergePaperTags(store, host, tagNamesForPaper(store, source));
    host.updatedAt = nowIso();

    store.papers = store.papers.filter((item) => item.id !== sourceId);
    for (const tag of store.tags) tag.paperIds = (tag.paperIds || []).filter((id) => id !== sourceId);
    cleanupUnusedTags(store);
    rebuildPaperTagLinks(store);
    markTagsStale(store);
    await writeStore(store);
    await deleteClipAssets(sourceId).catch(() => {});
    for (const clip of paperClips(host)) {
      if (clip.imageCount && clip.assetStatus !== "done") notifyBackground("clip-archive-images", host.id, clip.id);
    }
    return response(200, { paper: host, papers: store.papers, tags: store.tags, meta: store.meta, absorbedPaperId: sourceId });
  }

  const paperLinksMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/links$/);
  if (method === "POST" && paperLinksMatch) {
    const paperId = decodeURIComponent(paperLinksMatch[1]);
    const target = store.papers.find((item) => item.id === paperId);
    if (!target) return response(404, { error: "论文不存在" });
    const body = await parseBody(options);
    const linkUrl = String(body.url || "").trim();
    if (!/^https?:\/\//i.test(linkUrl)) return response(400, { error: "链接需要以 http:// 或 https:// 开头" });
    if ((target.links || []).some((link) => link.url === linkUrl)) return response(400, { error: "这条链接已经添加过了" });

    // 先抓网页预览（耗时的网络请求），再读最新整库写回，缩小并发写覆盖窗口
    const preview = await fetchLinkPreview(linkUrl);

    const fresh = await readAll();
    const paper = fresh.store.papers.find((item) => item.id === paperId);
    if (!paper) return response(404, { error: "论文不存在" });
    paper.links ||= [];
    if (paper.links.some((link) => link.url === linkUrl)) return response(400, { error: "这条链接已经添加过了" });
    const link = {
      id: makeId("link"),
      title: String(body.title || "").trim(),
      url: linkUrl,
      createdAt: nowIso()
    };
    applyLinkPreview(link, preview);
    paper.links.push(link);
    paper.updatedAt = nowIso();
    await writeStore(fresh.store);
    return response(201, { paper, papers: fresh.store.papers, link });
  }

  const paperLinkPreviewMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/links\/([^/]+)\/preview$/);
  if (method === "POST" && paperLinkPreviewMatch) {
    const paperId = decodeURIComponent(paperLinkPreviewMatch[1]);
    const linkId = decodeURIComponent(paperLinkPreviewMatch[2]);
    const target = store.papers.find((item) => item.id === paperId);
    const targetLink = (target?.links || []).find((item) => item.id === linkId);
    if (!target) return response(404, { error: "论文不存在" });
    if (!targetLink) return response(404, { error: "链接不存在" });

    const preview = await fetchLinkPreview(targetLink.url);

    const fresh = await readAll();
    const paper = fresh.store.papers.find((item) => item.id === paperId);
    const link = (paper?.links || []).find((item) => item.id === linkId);
    if (!paper || !link) return response(404, { error: "链接不存在" });
    applyLinkPreview(link, preview);
    paper.updatedAt = nowIso();
    await writeStore(fresh.store);
    return response(200, { paper, papers: fresh.store.papers, link, previewFound: Boolean(preview) });
  }

  const paperLinkMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/links\/([^/]+)$/);
  if (method === "DELETE" && paperLinkMatch) {
    const paper = store.papers.find((item) => item.id === decodeURIComponent(paperLinkMatch[1]));
    if (!paper) return response(404, { error: "论文不存在" });
    const linkId = decodeURIComponent(paperLinkMatch[2]);
    const nextLinks = (paper.links || []).filter((link) => link.id !== linkId);
    if (nextLinks.length === (paper.links || []).length) return response(404, { error: "链接不存在" });
    paper.links = nextLinks;
    paper.updatedAt = nowIso();
    await writeStore(store);
    return response(200, { paper, papers: store.papers });
  }

  const paperMatch = url.pathname.match(/^\/api\/papers\/([^/]+)$/);
  if (method === "DELETE" && paperMatch) {
    const paperId = decodeURIComponent(paperMatch[1]);
    const paper = store.papers.find((item) => item.id === paperId);
    if (!paper) return response(404, { error: "论文不存在" });

    store.papers = store.papers.filter((item) => item.id !== paperId);
    for (const tag of store.tags) {
      tag.paperIds = (tag.paperIds || []).filter((id) => id !== paperId);
      tag.updatedAt = nowIso();
    }
    cleanupUnusedTags(store);
    for (const tag of store.tags) {
      tag.parentIds = (tag.parentIds || []).filter((id) => store.tags.some((item) => item.id === id));
      tag.childIds = (tag.childIds || []).filter((id) => store.tags.some((item) => item.id === id));
      tag.relatedIds = (tag.relatedIds || []).filter((id) => store.tags.some((item) => item.id === id));
    }
    rebuildPaperTagLinks(store);
    markTagsStale(store);
    await writeStore(store);
    // 剪藏图片单独存在另一张表，跟着论文一起删掉，否则会一直占着空间
    await deleteClipAssets(paperId).catch(() => {});
    return response(200, { deletedPaperId: paperId, papers: store.papers, tags: store.tags, meta: store.meta });
  }

  if (method === "PUT" && paperMatch) {
    const body = await parseBody(options);
    const paper = store.papers.find((item) => item.id === decodeURIComponent(paperMatch[1]));
    if (!paper) return response(404, { error: "论文不存在" });
    if (typeof body.title === "string" && stripSiteTitleSuffix(body.title)) paper.title = stripSiteTitleSuffix(body.title);
    let abstractChanged = false;
    if (typeof body.abstract === "string" && body.abstract.trim() !== paper.abstract) {
      paper.abstract = body.abstract.trim();
      paper.abstractZh = ""; // 原文变了旧译文作废，交给后台重新翻译
      abstractChanged = true;
    }
    if (typeof body.conversation === "string") paper.conversation = body.conversation.trim();
    if ("valueScore" in body) paper.valueScore = normalizeValueScore(body.valueScore, paper.valueScore || 1);
    if ("manualTags" in body) setPaperTags(store, paper, body.manualTags);
    paper.updatedAt = nowIso();
    if ("manualTags" in body) markTagsStale(store);
    await writeStore(store);
    if (abstractChanged && paper.abstract) notifyBackground("auto-translate-abstract", paper.id);
    return response(200, { paper, papers: store.papers, tags: store.tags, meta: store.meta });
  }

  if (method === "POST" && url.pathname === "/api/search") {
    const body = await parseBody(options);
    const query = String(body.query || "").trim();
    if (!query) return response(400, { error: "检索关键词不能为空" });
    let llmUsed = true;
    let error = "";
    let matches = [];
    try {
      matches = await searchTagsWithLLM(config, query, store);
    } catch (err) {
      llmUsed = false;
      error = err.message;
      matches = fallbackSearch(query, store);
    }
    return response(200, { matches, llmUsed, error });
  }

  if (method === "POST" && url.pathname === "/api/search-papers") {
    const body = await parseBody(options);
    const query = String(body.query || "").trim();
    if (!query) return response(400, { error: "检索关键词不能为空" });
    let llmUsed = true;
    let error = "";
    let matches = [];
    try {
      matches = await searchPapersWithLLM(config, query, store);
    } catch (err) {
      llmUsed = false;
      error = err.message;
      matches = fallbackPaperSearch(query, store);
    }
    return response(200, { matches, llmUsed, error });
  }

  if (method === "POST" && url.pathname === "/api/topic-packs") {
    const body = await parseBody(options);
    const pack = normalizeTopicPack(body);
    if (!pack) return response(400, { error: "主题包名称不能为空" });
    if (!pack.includeTagIds.length) return response(400, { error: "主题包至少需要包含一个标签" });
    const validTagIds = new Set(store.tags.map((tag) => tag.id));
    pack.includeTagIds = pack.includeTagIds.filter((id) => validTagIds.has(id));
    pack.excludeTagIds = pack.excludeTagIds.filter((id) => validTagIds.has(id) && !pack.includeTagIds.includes(id));
    if (!pack.includeTagIds.length) return response(400, { error: "主题包至少需要包含一个有效标签" });
    store.topicPacks.unshift(pack);
    await writeStore(store);
    return response(201, { topicPack: serializeTopicPack(store, pack), topicPacks: store.topicPacks, papers: store.papers, tags: store.tags, meta: store.meta });
  }

  const topicPackMatch = url.pathname.match(/^\/api\/topic-packs\/([^/]+)$/);
  if (method === "PUT" && topicPackMatch) {
    const body = await parseBody(options);
    const id = decodeURIComponent(topicPackMatch[1]);
    const index = store.topicPacks.findIndex((pack) => pack.id === id);
    if (index < 0) return response(404, { error: "主题包不存在" });
    const pack = normalizeTopicPack({ ...store.topicPacks[index], ...body, id, createdAt: store.topicPacks[index].createdAt, updatedAt: nowIso() });
    if (!pack) return response(400, { error: "主题包名称不能为空" });
    const validTagIds = new Set(store.tags.map((tag) => tag.id));
    pack.includeTagIds = pack.includeTagIds.filter((tagId) => validTagIds.has(tagId));
    pack.excludeTagIds = pack.excludeTagIds.filter((tagId) => validTagIds.has(tagId) && !pack.includeTagIds.includes(tagId));
    if (!pack.includeTagIds.length) return response(400, { error: "主题包至少需要包含一个有效标签" });
    store.topicPacks[index] = pack;
    await writeStore(store);
    return response(200, { topicPack: serializeTopicPack(store, pack), topicPacks: store.topicPacks, papers: store.papers, tags: store.tags, meta: store.meta });
  }

  if (method === "DELETE" && topicPackMatch) {
    const id = decodeURIComponent(topicPackMatch[1]);
    const before = store.topicPacks.length;
    store.topicPacks = store.topicPacks.filter((pack) => pack.id !== id);
    if (store.topicPacks.length === before) return response(404, { error: "主题包不存在" });
    await writeStore(store);
    return response(200, { deletedTopicPackId: id, topicPacks: store.topicPacks, papers: store.papers, tags: store.tags, meta: store.meta });
  }

  const tagMatch = url.pathname.match(/^\/api\/tags\/([^/]+)$/);
  if (method === "DELETE" && tagMatch) {
    const tagId = decodeURIComponent(tagMatch[1]);
    const tag = store.tags.find((item) => item.id === tagId);
    if (!tag) return response(404, { error: "标签不存在" });
    if (isSystemTag(tag)) return response(400, { error: "系统标签不能删除" });

    for (const paper of store.papers) {
      paper.tagIds = (paper.tagIds || []).filter((id) => id !== tagId);
      if (!paper.tagIds.length) paper.tagIds = [UNSORTED_TAG_ID];
      paper.updatedAt = nowIso();
    }
    for (const item of store.tags) {
      item.parentIds = (item.parentIds || []).filter((id) => id !== tagId);
      item.childIds = (item.childIds || []).filter((id) => id !== tagId);
      item.relatedIds = (item.relatedIds || []).filter((id) => id !== tagId);
    }
    store.tags = store.tags.filter((item) => item.id !== tagId);
    markTagsStale(store);
    await writeStore(store);
    return response(200, { deletedTagId: tagId, papers: store.papers, tags: store.tags, meta: store.meta });
  }

  if (method === "POST" && url.pathname === "/api/tags/rebuild") {
    let llmUsed = true;
    let error = "";
    let result;
    try {
      result = await mergeSimilarTagsWithLLM(config, store);
    } catch (err) {
      llmUsed = false;
      error = err.message;
      result = { merges: [] };
    }
    const merges = (result.merges || [])
      .map((merge) => {
        try {
          return validateMergeGroup(store, merge);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (llmUsed && !merges.length) {
      markTagsCurated(store, config, 0);
      await writeStore(store);
    }
    return response(200, { papers: store.papers, tags: store.tags, meta: store.meta, llmUsed, error, merges });
  }

  if (method === "POST" && url.pathname === "/api/tags/analyze-redundancy") {
    const merges = redundantTagSuggestions(store).map((merge) => validateMergeGroup(store, merge));
    return response(200, { papers: store.papers, tags: store.tags, meta: store.meta, merges });
  }

  if (method === "POST" && url.pathname === "/api/tags/merge") {
    const body = await parseBody(options);
    const groups = Array.isArray(body.merges) ? body.merges : [body];
    const validated = groups.map((group) => validateMergeGroup(store, group));
    const mergeCount = applyTagMerges(
      store,
      validated.map((group) => ({ ...group, confidence: 1 }))
    );
    clearTagGraph(store);
    markTagsStale(store);
    await writeStore(store);
    return response(200, { papers: store.papers, tags: store.tags, meta: store.meta, mergeCount });
  }

  if (method === "POST" && url.pathname === "/api/tags/curation-reviewed") {
    const body = await parseBody(options);
    markTagsCurated(store, config, Number(body.mergeCount || 0));
    await writeStore(store);
    return response(200, { papers: store.papers, tags: store.tags, meta: store.meta });
  }

  return response(404, { error: "Not found" });
}

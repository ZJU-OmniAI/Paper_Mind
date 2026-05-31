const DEFAULT_CONFIG = {
  provider: "qwen",
  qwenKey: "",
  qwenModel: "qwen3.7-max",
  qwenBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  zhipuKey: "",
  zhipuModel: "glm-5.1",
  zhipuBaseUrl: "https://open.bigmodel.cn/api/paas/v4"
};

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

function clone(value) {
  return structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(value) {
  return chrome.storage.local.set(value);
}

function publicConfig(config) {
  return {
    provider: config.provider,
    qwenModel: config.qwenModel,
    qwenBaseUrl: config.qwenBaseUrl,
    zhipuModel: config.zhipuModel,
    zhipuBaseUrl: config.zhipuBaseUrl,
    hasQwenKey: Boolean(config.qwenKey),
    hasZhipuKey: Boolean(config.zhipuKey)
  };
}

function nowIso() {
  return new Date().toISOString();
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
  const provider = config.provider === "zhipu" ? "zhipu" : "qwen";
  tagCuration.status = "curated";
  tagCuration.updatedAt = nowIso();
  tagCuration.provider = provider;
  tagCuration.model = provider === "zhipu" ? config.zhipuModel : config.qwenModel;
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
  detachPaperFromAllTags(store, paper.id);
  paper.tagIds = [];
  for (const name of splitManualTags(tagNames)) {
    const tag = ensureTag(store, name, "manual");
    if (!tag) continue;
    attachPaperToTag(tag, paper.id);
    paper.tagIds = uniq([...paper.tagIds, tag.id]);
  }
  paper.updatedAt = nowIso();
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

  const missing = sourceNames.filter((name) => !findTagByName(store, name));
  if (missing.length) throw new Error(`待合并标签不存在：${missing.join("、")}`);

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

function tagNamesForPaper(store, paper) {
  return (paper.tagIds || []).map((id) => store.tags.find((tag) => tag.id === id)?.name).filter(Boolean);
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
  return store.tags.map((tag) => ({
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
  const provider = config.provider === "zhipu" ? "zhipu" : "qwen";
  const apiKey = provider === "zhipu" ? config.zhipuKey : config.qwenKey;
  const model = provider === "zhipu" ? config.zhipuModel : config.qwenModel;
  const baseUrl = provider === "zhipu" ? config.zhipuBaseUrl : config.qwenBaseUrl;
  if (!apiKey) throw new Error(`尚未配置 ${provider === "zhipu" ? "智谱" : "Qwen"} API Key`);

  const endpoint = `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;
  const requestBody = {
    model,
    temperature,
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

async function recommendSimilarPapersWithLLM(config, paperId, store) {
  const target = store.papers.find((paper) => paper.id === paperId);
  if (!target) throw new Error("论文不存在");

  const candidates = store.papers
    .filter((paper) => paper.id !== target.id)
    .map((paper) => ({
      id: paper.id,
      title: paper.title,
      abstract: compactText(paper.abstract, 900),
      tags: tagNamesForPaper(store, paper)
    }));

  const result = await callLLM(
    config,
    [
      {
        role: "system",
        content:
          "你是论文库相似论文推荐助手。请结合论文标题、摘要和标签系统，从候选论文中推荐最相似的论文。只能返回候选库中已有 paper id。只返回 JSON，不要 Markdown。"
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "recommend_similar_existing_papers",
          rules: [
            "只能推荐 candidatePapers 中已有的 id，不能编造论文。",
            "优先考虑共享标签、语义相近的研究问题、方法或应用场景。",
            "如果标签相同但论文主题明显不同，要降低置信度。",
            "返回最多 6 篇。"
          ],
          schema: {
            matches: [
              {
                paperId: "候选论文 id",
                reason: "为什么相似，提及关键标签或主题",
                confidence: 0.86
              }
            ]
          },
          targetPaper: {
            id: target.id,
            title: target.title,
            abstract: compactText(target.abstract, 1400),
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
          "你是论文标签库清理助手。你的唯一任务是找出语义十分相似、几乎同义、或中英文/缩写表达同一概念的已有标签，并给出合并方案。只返回 JSON，不要 Markdown。"
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

async function readAll() {
  const values = await storageGet([STORE_KEY, CONFIG_KEY]);
  const store = { ...clone(DEFAULT_STORE), ...(values[STORE_KEY] || {}) };
  store.papers ||= [];
  store.tags ||= [];
  ensureStoreMeta(store);
  rebuildPaperTagLinks(store);
  const config = { ...DEFAULT_CONFIG, ...(values[CONFIG_KEY] || {}) };
  return { store, config };
}

async function writeStore(store) {
  ensureStoreMeta(store);
  rebuildPaperTagLinks(store);
  await storageSet({ [STORE_KEY]: store });
}

async function writeConfig(config) {
  await storageSet({ [CONFIG_KEY]: config });
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
      version: 1,
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
      meta: importedStore.meta || clone(DEFAULT_STORE.meta)
    };
    ensureStoreMeta(nextStore);
    await writeStore(nextStore);
    return response(200, { ...nextStore, config: publicConfig(config) });
  }

  if (method === "POST" && url.pathname === "/api/settings") {
    const body = await parseBody(options);
    const nextConfig = {
      ...config,
      provider: body.provider === "zhipu" ? "zhipu" : "qwen",
      qwenModel: body.qwenModel || config.qwenModel,
      qwenBaseUrl: body.qwenBaseUrl || config.qwenBaseUrl,
      zhipuModel: body.zhipuModel || config.zhipuModel,
      zhipuBaseUrl: body.zhipuBaseUrl || config.zhipuBaseUrl
    };
    if (typeof body.qwenKey === "string" && body.qwenKey.trim()) nextConfig.qwenKey = body.qwenKey.trim();
    if (typeof body.zhipuKey === "string" && body.zhipuKey.trim()) nextConfig.zhipuKey = body.zhipuKey.trim();
    if (body.clearQwenKey) nextConfig.qwenKey = "";
    if (body.clearZhipuKey) nextConfig.zhipuKey = "";
    await writeConfig(nextConfig);
    return response(200, { config: publicConfig(nextConfig) });
  }

  if (method === "POST" && url.pathname === "/api/test-model") {
    const body = await parseBody(options);
    const question = String(body.question || "").trim();
    if (!question) return response(400, { error: "测试问题不能为空" });
    const testConfig = {
      ...config,
      provider: body.provider === "zhipu" ? "zhipu" : "qwen",
      qwenModel: body.qwenModel || config.qwenModel,
      qwenBaseUrl: body.qwenBaseUrl || config.qwenBaseUrl,
      zhipuModel: body.zhipuModel || config.zhipuModel,
      zhipuBaseUrl: body.zhipuBaseUrl || config.zhipuBaseUrl
    };
    if (typeof body.qwenKey === "string" && body.qwenKey.trim()) testConfig.qwenKey = body.qwenKey.trim();
    if (typeof body.zhipuKey === "string" && body.zhipuKey.trim()) testConfig.zhipuKey = body.zhipuKey.trim();
    const result = await testModel(testConfig, question);
    return response(200, { answer: result.content, meta: result.meta });
  }

  if (method === "POST" && url.pathname === "/api/papers") {
    const body = await parseBody(options);
    const title = String(body.title || "").trim();
    if (!title) return response(400, { error: "论文标题不能为空" });
    const timestamp = nowIso();
    const paper = {
      id: makeId("paper"),
      title,
      abstract: String(body.abstract || "").trim(),
      conversation: String(body.conversation || "").trim(),
      tagIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.papers.unshift(paper);
    setPaperTags(store, paper, body.manualTags);
    markTagsStale(store);
    await writeStore(store);
    return response(201, { paper, papers: store.papers, tags: store.tags, meta: store.meta });
  }

  const paperSimilarMatch = url.pathname.match(/^\/api\/papers\/([^/]+)\/similar-llm$/);
  if (method === "POST" && paperSimilarMatch) {
    const paperId = decodeURIComponent(paperSimilarMatch[1]);
    if (!store.papers.some((paper) => paper.id === paperId)) return response(404, { error: "论文不存在" });
    let llmUsed = true;
    let error = "";
    let matches = [];
    try {
      matches = await recommendSimilarPapersWithLLM(config, paperId, store);
    } catch (err) {
      llmUsed = false;
      error = err.message;
      matches = similarPapersByTags(store, paperId);
    }
    return response(200, { matches, llmUsed, error });
  }

  const paperMatch = url.pathname.match(/^\/api\/papers\/([^/]+)$/);
  if (method === "PUT" && paperMatch) {
    const body = await parseBody(options);
    const paper = store.papers.find((item) => item.id === decodeURIComponent(paperMatch[1]));
    if (!paper) return response(404, { error: "论文不存在" });
    if (typeof body.title === "string" && body.title.trim()) paper.title = body.title.trim();
    if (typeof body.abstract === "string") paper.abstract = body.abstract.trim();
    if (typeof body.conversation === "string") paper.conversation = body.conversation.trim();
    if ("manualTags" in body) setPaperTags(store, paper, body.manualTags);
    paper.updatedAt = nowIso();
    if ("manualTags" in body) markTagsStale(store);
    await writeStore(store);
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

  const tagMatch = url.pathname.match(/^\/api\/tags\/([^/]+)$/);
  if (method === "DELETE" && tagMatch) {
    const tagId = decodeURIComponent(tagMatch[1]);
    const tag = store.tags.find((item) => item.id === tagId);
    if (!tag) return response(404, { error: "标签不存在" });

    for (const paper of store.papers) {
      paper.tagIds = (paper.tagIds || []).filter((id) => id !== tagId);
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

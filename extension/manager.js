import { handleApi } from "./storage.js";

const state = {
  papers: [],
  tags: [],
  topicPacks: [],
  meta: {},
  config: {},
  language: localStorage.getItem("paperTagLanguage") || "zh",
  activeTagId: null,
  activePaperId: null,
  searchTagId: null,
  lastSyncedAt: 0,
  pendingMerges: [],
  reviewedMergeCount: 0,
  draggedTagId: null,
  paperDetailEditing: false,
  paperFormSubmitting: false,
  activeTopicPackId: null,
  editingTopicPackId: null,
  paperLibraryMode: localStorage.getItem("paperLibraryMode") || "list",
  selectedMapTagIds: [],
  selectedMapPaperId: null
};

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  languageLabel: document.querySelector("#languageLabel"),
  languageSelect: document.querySelector("#languageSelect"),
  modelStatus: document.querySelector("#modelStatus"),
  paperCount: document.querySelector("#paperCount"),
  tagCount: document.querySelector("#tagCount"),
  paperForm: document.querySelector("#paperForm"),
  previewTags: document.querySelector("#previewTags"),
  addManualTagButton: document.querySelector("#addManualTagButton"),
  manualTagList: document.querySelector("#manualTagList"),
  paperList: document.querySelector("#paperList"),
  paperFilter: document.querySelector("#paperFilter"),
  paperLibraryFilter: document.querySelector("#paperLibraryFilter"),
  paperLibrarySort: document.querySelector("#paperLibrarySort"),
  paperLibraryListMode: document.querySelector("#paperLibraryListMode"),
  paperLibraryMapMode: document.querySelector("#paperLibraryMapMode"),
  paperMapFilter: document.querySelector("#paperMapFilter"),
  paperMapMatchMode: document.querySelector("#paperMapMatchMode"),
  paperMapHint: document.querySelector("#paperMapHint"),
  paperMapShell: document.querySelector("#paperMapShell"),
  paperMapSvg: document.querySelector("#paperMapSvg"),
  paperMapTags: document.querySelector("#paperMapTags"),
  paperMapPapers: document.querySelector("#paperMapPapers"),
  paperLibraryList: document.querySelector("#paperLibraryList"),
  paperLibraryTagMeta: document.querySelector("#paperLibraryTagMeta"),
  paperLibraryTagList: document.querySelector("#paperLibraryTagList"),
  backToPapersButton: document.querySelector("#backToPapersButton"),
  paperDetailMeta: document.querySelector("#paperDetailMeta"),
  paperDetailTitle: document.querySelector("#paperDetailTitle"),
  paperDetailTags: document.querySelector("#paperDetailTags"),
  editPaperDetailButton: document.querySelector("#editPaperDetailButton"),
  paperDetailReadView: document.querySelector("#paperDetailReadView"),
  paperDetailAbstract: document.querySelector("#paperDetailAbstract"),
  paperDetailConversation: document.querySelector("#paperDetailConversation"),
  paperDetailTagForm: document.querySelector("#paperDetailTagForm"),
  paperDetailTitleInput: document.querySelector("#paperDetailTitleInput"),
  paperDetailAbstractInput: document.querySelector("#paperDetailAbstractInput"),
  paperDetailConversationInput: document.querySelector("#paperDetailConversationInput"),
  addDetailTagButton: document.querySelector("#addDetailTagButton"),
  paperDetailTagList: document.querySelector("#paperDetailTagList"),
  cancelPaperDetailEditButton: document.querySelector("#cancelPaperDetailEditButton"),
  tagSimilarPaperList: document.querySelector("#tagSimilarPaperList"),
  loadLlmSimilarButton: document.querySelector("#loadLlmSimilarButton"),
  llmSimilarPaperList: document.querySelector("#llmSimilarPaperList"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  searchResults: document.querySelector("#searchResults"),
  activeSearchLabel: document.querySelector("#activeSearchLabel"),
  searchPaperList: document.querySelector("#searchPaperList"),
  topicPackForm: document.querySelector("#topicPackForm"),
  topicFormTitle: document.querySelector("#topicFormTitle"),
  cancelTopicEditButton: document.querySelector("#cancelTopicEditButton"),
  topicPackName: document.querySelector("#topicPackName"),
  topicPackDescription: document.querySelector("#topicPackDescription"),
  addTopicIncludeTagButton: document.querySelector("#addTopicIncludeTagButton"),
  topicIncludeTagList: document.querySelector("#topicIncludeTagList"),
  addTopicExcludeTagButton: document.querySelector("#addTopicExcludeTagButton"),
  topicExcludeTagList: document.querySelector("#topicExcludeTagList"),
  saveTopicPackButton: document.querySelector("#saveTopicPackButton"),
  topicPackList: document.querySelector("#topicPackList"),
  topicListMeta: document.querySelector("#topicListMeta"),
  topicResultTitle: document.querySelector("#topicResultTitle"),
  topicResultMeta: document.querySelector("#topicResultMeta"),
  topicPaperList: document.querySelector("#topicPaperList"),
  tagTree: document.querySelector("#tagTree"),
  tagDetail: document.querySelector("#tagDetail"),
  tagCurationStatus: document.querySelector("#tagCurationStatus"),
  selectedTagName: document.querySelector("#selectedTagName"),
  selectedTagMeta: document.querySelector("#selectedTagMeta"),
  refreshGraphButton: document.querySelector("#refreshGraphButton"),
  settingsForm: document.querySelector("#settingsForm"),
  qwenKey: document.querySelector("#qwenKey"),
  qwenModel: document.querySelector("#qwenModel"),
  qwenBaseUrl: document.querySelector("#qwenBaseUrl"),
  zhipuKey: document.querySelector("#zhipuKey"),
  zhipuModel: document.querySelector("#zhipuModel"),
  zhipuBaseUrl: document.querySelector("#zhipuBaseUrl"),
  clearQwenKey: document.querySelector("#clearQwenKey"),
  clearZhipuKey: document.querySelector("#clearZhipuKey"),
  exportDataButton: document.querySelector("#exportDataButton"),
  importDataButton: document.querySelector("#importDataButton"),
  importDataInput: document.querySelector("#importDataInput"),
  openModelTest: document.querySelector("#openModelTest"),
  paperDialog: document.querySelector("#paperDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  closeDialog: document.querySelector("#closeDialog"),
  modelTestDialog: document.querySelector("#modelTestDialog"),
  closeModelTestDialog: document.querySelector("#closeModelTestDialog"),
  modelTestForm: document.querySelector("#modelTestForm"),
  modelTestQuestion: document.querySelector("#modelTestQuestion"),
  modelTestMeta: document.querySelector("#modelTestMeta"),
  modelTestAnswer: document.querySelector("#modelTestAnswer"),
  mergeReviewDialog: document.querySelector("#mergeReviewDialog"),
  closeMergeReviewDialog: document.querySelector("#closeMergeReviewDialog"),
  mergeReviewMeta: document.querySelector("#mergeReviewMeta"),
  mergeReviewList: document.querySelector("#mergeReviewList"),
  toast: document.querySelector("#toast")
};

const translations = {
  zh: {
    appName: "论文标签库",
    appSubtitle: "本地 LLM 辅助管理",
    language: "语言",
    library: "论文录入",
    papers: "论文库",
    paperDetail: "论文详情",
    search: "智能检索",
    topics: "研究主题包",
    tags: "标签库",
    settings: "模型设置",
    paperCount: "论文",
    tagCount: "标签",
    addPaper: "添加论文",
    manualTagsOnly: "仅使用人工标签",
    paperTitle: "论文标题",
    paperTitlePlaceholder: "输入论文标题",
    abstract: "简介摘要",
    abstractPlaceholder: "粘贴 abstract 或自己的简介",
    conversation: "对话记录",
    conversationPlaceholder: "可粘贴你和大模型关于这篇论文的讨论",
    addTag: "添加标签",
    savePaper: "保存论文",
    paperList: "论文列表",
    filterPapers: "过滤论文",
    allPapers: "全部论文",
    allTags: "全部标签",
    searchPaperOrTag: "搜索论文或标签",
    paperLibraryListView: "平铺列表",
    paperLibraryMapView: "标签映射",
    paperLibrarySort: "排序",
    sortBySimilarity: "标签相似",
    sortByCreated: "最近添加",
    sortByUpdated: "最近更新",
    sortByTitle: "标题",
    paperClusters: (count) => `${count} 个标签簇`,
    untaggedCluster: "待归类",
    clusterPaperCount: (count) => `${count} 篇论文`,
    mapTitle: "标签-论文映射",
    mapHint: "点击标签或论文，高亮它们之间的映射关系",
    mapFilterPlaceholder: "搜索标签或论文",
    mapMatchAny: "包含任一标签",
    mapMatchAll: "包含全部标签",
    mapVisibleMeta: (tagCount, paperCount) => `${tagCount} 个标签 · ${paperCount} 篇论文`,
    sortedByPaperCount: "按论文数量排序",
    backToPapers: "返回论文库",
    editPaper: "编辑",
    cancelEdit: "取消",
    editTags: "标签",
    saveTagChanges: "保存修改",
    paperUpdated: "论文详情已更新",
    tagSimilarPapers: "标签相似论文",
    tagSimilarityHint: "按共享标签和标签重合度",
    llmSimilarPapers: "LLM 相似论文",
    generateRecommendations: "生成推荐",
    llmSimilarEmpty: "点击生成推荐后，模型会结合标签系统和论文信息推荐相似论文",
    searchPlaceholder: "输入研究关键词，例如 多智能体协作与工具调用",
    searchTags: "检索标签",
    matchedPapers: "匹配论文",
    chooseTagForPapers: "选择一个标签查看论文",
    newTopicPack: "新建主题包",
    editTopicPack: "编辑主题包",
    topicName: "主题名称",
    topicNamePlaceholder: "例如 RAG Evaluation",
    topicDescription: "说明",
    topicDescriptionPlaceholder: "这个主题包用来聚合哪类论文",
    topicMatchMode: "匹配方式",
    topicMatchAny: "包含任一标签",
    topicMatchAll: "包含全部标签",
    topicIncludeTags: "包含标签",
    topicExcludeTags: "排除标签",
    topicPacks: "主题包",
    topicPacksMeta: (count) => `${count} 个主题包`,
    topicPackPapers: "主题包论文",
    chooseTopicPack: "选择一个主题包查看聚合论文",
    noTopicPacks: "暂无主题包",
    saveTopicPack: "保存主题包",
    updateTopicPack: "保存修改",
    cancelTopicEdit: "取消编辑",
    topicSaved: "主题包已保存",
    topicUpdated: "主题包已更新",
    topicDeleted: "主题包已删除",
    topicNeedsTags: "主题包至少需要包含一个标签",
    includeTagModeAny: "任一",
    includeTagModeAll: "全部",
    edit: "编辑",
    delete: "删除",
    tagLibrary: "标签库",
    uncurated: "未整理",
    generateMergeSuggestions: "LLM 生成合并建议",
    tagDetail: "标签详情",
    clickTag: "点击左侧标签",
    modelSettings: "模型设置",
    apiKeyLocal: "API Key 仅保存在 Chrome 插件本地存储",
    defaultModel: "默认模型",
    saveSettings: "保存设置",
    testModel: "测试模型",
    dataTransfer: "数据导入 / 导出",
    dataTransferHint: "从本地 JSON 导入到 Chrome，或从 Chrome 导出本地备份。API Key 不会被导出。",
    exportData: "从 Chrome 导出本地 JSON",
    importData: "本地 JSON 导入 Chrome",
    dataExported: (paperCount, tagCount) => `已从 Chrome 导出 ${paperCount} 篇论文、${tagCount} 个标签`,
    dataImported: (paperCount, tagCount) => `已导入到 Chrome：${paperCount} 篇论文、${tagCount} 个标签`,
    noPapers: "暂无论文",
    noTags: "暂无标签",
    noAbstract: "暂无摘要",
    noConversation: "暂无对话记录",
    viewDetail: "查看详情",
    deletePaper: "删除论文",
    paperDeleted: "论文已删除，未被其他论文使用的标签也已清理",
    created: "创建",
    updated: "更新",
    similarity: "相似度",
    saving: "保存中...",
    generating: "生成中...",
    searching: "检索中...",
    paperSaved: "论文已保存，人工标签已加入标签库",
    duplicatePaperSaved: "这篇论文已存在，未重复添加；新标签已合并到已有论文",
    tagSaved: "论文标签已更新",
    settingsSaved: "模型设置已保存",
    connected: (count) => `已连接 · ${count} 个标签`,
    modelMissing: (name) => `${name} 未配置 Key · 将使用本地规则`,
    modelConfigured: (name, model) => `${name} 已配置 · ${model}`,
    tagsMeta: (count) => `${count} 个标签`,
    tagPaperCount: (count) => `${count} 篇`,
    tagPaperCountLong: (count) => `${count} 篇论文`,
    similarEmpty: "暂无相似论文",
    llmUnavailable: (error) => `模型不可用：${error}`,
    loadingLlmSimilar: "正在调用模型推荐相似论文...",
    mergePrompt: "保存后可在“标签库”中用 LLM 合并十分相似的标签",
    createTag: (name) => `新建标签：${name}`,
    tagInputPlaceholder: "搜索已有标签或输入新标签"
  },
  en: {
    appName: "Paper Tag Library",
    appSubtitle: "Local LLM-assisted manager",
    language: "Language",
    library: "Add Paper",
    papers: "Paper Library",
    paperDetail: "Paper Detail",
    search: "Smart Search",
    topics: "Topic Packs",
    tags: "Tags",
    settings: "Model Settings",
    paperCount: "Papers",
    tagCount: "Tags",
    addPaper: "Add Paper",
    manualTagsOnly: "Manual tags only",
    paperTitle: "Paper title",
    paperTitlePlaceholder: "Enter paper title",
    abstract: "Abstract",
    abstractPlaceholder: "Paste the abstract or your own summary",
    conversation: "Conversation",
    conversationPlaceholder: "Paste your discussion with an LLM about this paper",
    addTag: "Add Tag",
    savePaper: "Save Paper",
    paperList: "Paper List",
    filterPapers: "Filter papers",
    allPapers: "All Papers",
    allTags: "All Tags",
    searchPaperOrTag: "Search papers or tags",
    paperLibraryListView: "Paper List",
    paperLibraryMapView: "Tag Map",
    paperLibrarySort: "Sort",
    sortBySimilarity: "Tag similarity",
    sortByCreated: "Recently added",
    sortByUpdated: "Recently updated",
    sortByTitle: "Title",
    paperClusters: (count) => `${count} tag clusters`,
    untaggedCluster: "Unsorted",
    clusterPaperCount: (count) => `${count} papers`,
    mapTitle: "Tag-Paper Map",
    mapHint: "Click a tag or paper to highlight their mapping",
    mapFilterPlaceholder: "Search tags or papers",
    mapMatchAny: "Any selected tag",
    mapMatchAll: "All selected tags",
    mapVisibleMeta: (tagCount, paperCount) => `${tagCount} tags · ${paperCount} papers`,
    sortedByPaperCount: "Sorted by paper count",
    backToPapers: "Back to Library",
    editPaper: "Edit",
    cancelEdit: "Cancel",
    editTags: "Tags",
    saveTagChanges: "Save Changes",
    paperUpdated: "Paper details updated",
    tagSimilarPapers: "Tag-similar Papers",
    tagSimilarityHint: "By shared tags and tag overlap",
    llmSimilarPapers: "LLM Similar Papers",
    generateRecommendations: "Generate",
    llmSimilarEmpty: "Click Generate to recommend similar papers using the tag system and paper metadata",
    searchPlaceholder: "Enter research keywords, e.g. multi-agent tool use",
    searchTags: "Search Tags",
    matchedPapers: "Matched Papers",
    chooseTagForPapers: "Select a tag to view papers",
    newTopicPack: "New Topic Pack",
    editTopicPack: "Edit Topic Pack",
    topicName: "Topic name",
    topicNamePlaceholder: "e.g. RAG Evaluation",
    topicDescription: "Description",
    topicDescriptionPlaceholder: "What kind of papers this topic pack gathers",
    topicMatchMode: "Match Mode",
    topicMatchAny: "Any included tag",
    topicMatchAll: "All included tags",
    topicIncludeTags: "Include Tags",
    topicExcludeTags: "Exclude Tags",
    topicPacks: "Topic Packs",
    topicPacksMeta: (count) => `${count} topic packs`,
    topicPackPapers: "Topic Papers",
    chooseTopicPack: "Select a topic pack to view aggregated papers",
    noTopicPacks: "No topic packs yet",
    saveTopicPack: "Save Topic Pack",
    updateTopicPack: "Save Changes",
    cancelTopicEdit: "Cancel Edit",
    topicSaved: "Topic pack saved",
    topicUpdated: "Topic pack updated",
    topicDeleted: "Topic pack deleted",
    topicNeedsTags: "A topic pack needs at least one included tag",
    includeTagModeAny: "Any",
    includeTagModeAll: "All",
    edit: "Edit",
    delete: "Delete",
    tagLibrary: "Tag Library",
    uncurated: "Not Reviewed",
    generateMergeSuggestions: "Generate Merge Suggestions",
    tagDetail: "Tag Detail",
    clickTag: "Click a tag on the left",
    modelSettings: "Model Settings",
    apiKeyLocal: "API keys are stored locally in Chrome extension storage",
    defaultModel: "Default Model",
    saveSettings: "Save Settings",
    testModel: "Test Model",
    dataTransfer: "Data Import / Export",
    dataTransferHint: "Import a local JSON file into Chrome, or export a local JSON backup from Chrome. API keys are not exported.",
    exportData: "Export Chrome to Local JSON",
    importData: "Import Local JSON to Chrome",
    dataExported: (paperCount, tagCount) => `Exported ${paperCount} papers and ${tagCount} tags from Chrome`,
    dataImported: (paperCount, tagCount) => `Imported to Chrome: ${paperCount} papers and ${tagCount} tags`,
    noPapers: "No papers yet",
    noTags: "No tags yet",
    noAbstract: "No abstract",
    noConversation: "No conversation",
    viewDetail: "View Detail",
    deletePaper: "Delete Paper",
    paperDeleted: "Paper deleted; unused tags were cleaned up",
    created: "Created",
    updated: "Updated",
    similarity: "Similarity",
    saving: "Saving...",
    generating: "Generating...",
    searching: "Searching...",
    paperSaved: "Paper saved and manual tags were added",
    duplicatePaperSaved: "This paper already exists. It was not duplicated; new tags were merged into the existing paper",
    tagSaved: "Paper tags updated",
    settingsSaved: "Model settings saved",
    connected: (count) => `Connected · ${count} tags`,
    modelMissing: (name) => `${name} key is missing · local rules will be used`,
    modelConfigured: (name, model) => `${name} configured · ${model}`,
    tagsMeta: (count) => `${count} tags`,
    tagPaperCount: (count) => `${count} papers`,
    tagPaperCountLong: (count) => `${count} papers`,
    similarEmpty: "No similar papers",
    llmUnavailable: (error) => `Model unavailable: ${error}`,
    loadingLlmSimilar: "Calling the model for similar-paper recommendations...",
    mergePrompt: "After saving, use the Tag Library to merge highly similar tags",
    createTag: (name) => `Create tag: ${name}`,
    tagInputPlaceholder: "Search existing tags or enter a new tag"
  }
};

function t(key, ...args) {
  const value = translations[state.language]?.[key] ?? translations.zh[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMarkdown(value) {
  const text = String(value || "").trim();
  if (!text) return `<p class="empty">${escapeHtml(t("noConversation"))}</p>`;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listOpen = false;
  let quoteOpen = false;
  let codeOpen = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };
  const closeQuote = () => {
    if (quoteOpen) {
      html.push("</blockquote>");
      quoteOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
      closeQuote();
      if (codeOpen) {
        html.push("</code></pre>");
        codeOpen = false;
      } else {
        html.push("<pre><code>");
        codeOpen = true;
      }
      continue;
    }
    if (codeOpen) {
      html.push(`${escapeHtml(rawLine)}\n`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      closeQuote();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      closeQuote();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      if (!quoteOpen) {
        html.push("<blockquote>");
        quoteOpen = true;
      }
      html.push(`<p>${renderInlineMarkdown(quote[1])}</p>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      closeQuote();
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    closeList();
    closeQuote();
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();
  closeQuote();
  if (codeOpen) html.push("</code></pre>");
  return html.join("");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function truncate(value, max = 130) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function tagById(id) {
  return state.tags.find((tag) => tag.id === id);
}

function paperById(id) {
  return state.papers.find((paper) => paper.id === id);
}

function tagByName(name) {
  return state.tags.find((tag) => normalizeText(tag.name) === normalizeText(name));
}

function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function isSystemTag(tag) {
  return Boolean(tag?.system) || tag?.id === "system-unsorted";
}

function tagSortValue(tag) {
  return isSystemTag(tag) ? 1 : 0;
}

function compareTags(a, b) {
  const systemDiff = tagSortValue(a) - tagSortValue(b);
  if (systemDiff) return systemDiff;
  const countDiff = (b.paperIds?.length || 0) - (a.paperIds?.length || 0);
  return countDiff || a.name.localeCompare(b.name, "zh-CN");
}

function papersForTag(tagId, includeChildren = false) {
  const ids = new Set([tagId]);
  if (includeChildren) collectChildTagIds(tagId, ids);
  return state.papers.filter((paper) => paper.tagIds?.some((id) => ids.has(id)));
}

function collectChildTagIds(tagId, ids, trail = new Set()) {
  if (trail.has(tagId)) return;
  trail.add(tagId);
  const tag = tagById(tagId);
  for (const childId of tag?.childIds || []) {
    if (ids.has(childId)) continue;
    ids.add(childId);
    collectChildTagIds(childId, ids, new Set(trail));
  }
}

async function api(path, options = {}) {
  return handleApi(path, options);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function setBusy(button, busyText) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  return () => {
    button.disabled = false;
    button.textContent = original;
  };
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function setPlaceholder(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.placeholder = text;
}

function applyLanguage() {
  document.documentElement.lang = state.language === "en" ? "en" : "zh-CN";
  els.languageSelect.value = state.language;
  els.languageLabel.textContent = t("language");

  setText(".brand h1", t("appName"));
  setText(".brand p", t("appSubtitle"));
  document.querySelector('[data-view="library"]').textContent = t("library");
  document.querySelector('[data-view="papers"]').textContent = t("papers");
  document.querySelector('[data-view="search"]').textContent = t("search");
  document.querySelector('[data-view="topics"]').textContent = t("topics");
  document.querySelector('[data-view="tags"]').textContent = t("tags");
  document.querySelector('[data-view="settings"]').textContent = t("settings");
  document.querySelectorAll(".stats small")[0].textContent = t("paperCount");
  document.querySelectorAll(".stats small")[1].textContent = t("tagCount");

  setText("#view-library .form-panel .panel-head h3", t("addPaper"));
  setText("#view-library .form-panel .panel-head .muted", t("manualTagsOnly"));
  setText('label[for="paperTitle"] span', t("paperTitle"));
  document.querySelector('label:has(#paperTitle) span').textContent = t("paperTitle");
  document.querySelector('label:has(#paperAbstract) span').textContent = t("abstract");
  document.querySelector('label:has(#paperConversation) span').textContent = t("conversation");
  setPlaceholder("#paperTitle", t("paperTitlePlaceholder"));
  setPlaceholder("#paperAbstract", t("abstractPlaceholder"));
  setPlaceholder("#paperConversation", t("conversationPlaceholder"));
  setText("#addManualTagButton", t("addTag"));
  setText("#previewTags", t("mergePrompt"));
  setText("#paperForm .primary-button", t("savePaper"));
  setText("#view-library .panel:not(.form-panel) .panel-head h3", t("paperList"));
  setPlaceholder("#paperFilter", t("filterPapers"));

  setText("#paperLibraryTitle", t("allPapers"));
  setText("#paperLibraryTagsTitle", t("allTags"));
  setPlaceholder("#paperLibraryFilter", t("searchPaperOrTag"));
  setText("#paperLibraryTagMeta", t("sortedByPaperCount"));
  setText('[data-paper-library-mode="list"]', t("paperLibraryListView"));
  setText('[data-paper-library-mode="map"]', t("paperLibraryMapView"));
  setText("#paperLibrarySortLabel", t("paperLibrarySort"));
  els.paperLibrarySort.options[0].textContent = t("sortBySimilarity");
  els.paperLibrarySort.options[1].textContent = t("sortByCreated");
  els.paperLibrarySort.options[2].textContent = t("sortByUpdated");
  els.paperLibrarySort.options[3].textContent = t("sortByTitle");
  setText("#paperMapTitle", t("mapTitle"));
  setText("#paperMapHint", t("mapHint"));
  setPlaceholder("#paperMapFilter", t("mapFilterPlaceholder"));
  els.paperMapMatchMode.options[0].textContent = t("mapMatchAny");
  els.paperMapMatchMode.options[1].textContent = t("mapMatchAll");

  setText("#backToPapersButton", t("backToPapers"));
  setText("#editPaperDetailButton", t("editPaper"));
  setText("#cancelPaperDetailEditButton", t("cancelEdit"));
  setText("#paperDetailTitleLabel", t("paperTitle"));
  setText("#paperDetailAbstractLabel", t("abstract"));
  setText("#paperDetailConversationLabel", t("conversation"));
  setText("#paperDetailAbstractHeading", t("abstract"));
  setText("#paperDetailConversationHeading", t("conversation"));
  setText("#paperDetailTagForm .field-label-row span", t("editTags"));
  setText("#addDetailTagButton", t("addTag"));
  setText("#paperDetailTagForm .primary-button", t("saveTagChanges"));
  setText("#view-paper-detail .recommendations-layout .panel:first-child h3", t("tagSimilarPapers"));
  setText("#view-paper-detail .recommendations-layout .panel:first-child .muted", t("tagSimilarityHint"));
  setText("#view-paper-detail .recommendations-layout .panel:nth-child(2) h3", t("llmSimilarPapers"));
  setText("#loadLlmSimilarButton", t("generateRecommendations"));

  setPlaceholder("#searchInput", t("searchPlaceholder"));
  setText("#searchForm .primary-button", t("searchTags"));
  setText("#view-search .panel:nth-child(2) .panel-head h3", t("matchedPapers"));
  if (!state.searchTagId) setText("#activeSearchLabel", t("chooseTagForPapers"));

  setText("#topicFormTitle", state.editingTopicPackId ? t("editTopicPack") : t("newTopicPack"));
  setText("#topicNameLabel", t("topicName"));
  setPlaceholder("#topicPackName", t("topicNamePlaceholder"));
  setText("#topicDescriptionLabel", t("topicDescription"));
  setPlaceholder("#topicPackDescription", t("topicDescriptionPlaceholder"));
  setText("#topicMatchModeLegend", t("topicMatchMode"));
  setText("#topicMatchAnyLabel", t("topicMatchAny"));
  setText("#topicMatchAllLabel", t("topicMatchAll"));
  setText("#topicIncludeTagsLabel", t("topicIncludeTags"));
  setText("#topicExcludeTagsLabel", t("topicExcludeTags"));
  setText("#addTopicIncludeTagButton", t("addTag"));
  setText("#addTopicExcludeTagButton", t("addTag"));
  setText("#saveTopicPackButton", state.editingTopicPackId ? t("updateTopicPack") : t("saveTopicPack"));
  setText("#cancelTopicEditButton", t("cancelTopicEdit"));
  setText("#topicListTitle", t("topicPacks"));
  setText("#topicResultTitle", t("topicPackPapers"));
  if (!state.activeTopicPackId) setText("#topicResultMeta", t("chooseTopicPack"));

  setText("#view-tags .panel:first-child .panel-head h3", t("tagLibrary"));
  setText("#refreshGraphButton", t("generateMergeSuggestions"));
  if (!state.activeTagId) {
    setText("#selectedTagName", t("tagDetail"));
    setText("#selectedTagMeta", t("clickTag"));
  }

  setText("#view-settings .panel-head h3", t("modelSettings"));
  setText("#view-settings .panel-head .muted", t("apiKeyLocal"));
  setText("#view-settings legend", t("defaultModel"));
  setText("#settingsForm .primary-button", t("saveSettings"));
  setText("#openModelTest", t("testModel"));
  setText("#dataTransferTitle", t("dataTransfer"));
  setText("#dataTransferHint", t("dataTransferHint"));
  setText("#exportDataButton", t("exportData"));
  setText("#importDataButton", t("importData"));

  els.viewTitle.textContent = t(document.querySelector(".nav-item.active")?.dataset.view || (state.activePaperId ? "paperDetail" : "library"));
}

async function loadState() {
  const payload = await api("/api/state");
  state.papers = payload.papers || [];
  state.tags = payload.tags || [];
  state.topicPacks = payload.topicPacks || [];
  state.meta = payload.meta || {};
  state.config = payload.config || {};
  state.lastSyncedAt = Date.now();
  applyLanguage();
  renderAll();
}

async function syncState({ render = false, force = false } = {}) {
  if (!force && Date.now() - state.lastSyncedAt < 1200) return;
  const payload = await api("/api/state");
  state.papers = payload.papers || [];
  state.tags = payload.tags || [];
  state.topicPacks = payload.topicPacks || [];
  state.meta = payload.meta || {};
  state.config = payload.config || {};
  state.lastSyncedAt = Date.now();
  if (render) renderAll();
}

function renderAll() {
  applyLanguage();
  renderStats();
  renderModelStatus();
  renderSettings();
  renderPapers();
  renderPaperLibrary();
  renderTopicPacks();
  renderTagCurationStatus();
  renderTagTree();
  renderTagDetail();
  if (state.activePaperId) renderPaperDetail(state.activePaperId);
}

function renderStats() {
  els.paperCount.textContent = state.papers.length;
  els.tagCount.textContent = state.tags.length;
}

function renderModelStatus() {
  const cfg = state.config;
  const providerName = cfg.provider === "zhipu" ? "智谱 GLM" : "Qwen/百炼";
  const model = cfg.provider === "zhipu" ? cfg.zhipuModel : cfg.qwenModel;
  const hasKey = cfg.provider === "zhipu" ? cfg.hasZhipuKey : cfg.hasQwenKey;
  els.modelStatus.textContent = hasKey ? t("modelConfigured", providerName, model) : t("modelMissing", providerName);
}

function renderTagCurationStatus() {
  const info = state.meta?.tagCuration || {};
  const curated = info.status === "curated";
  els.tagCurationStatus.classList.toggle("curated", curated);
  els.tagCurationStatus.classList.toggle("stale", !curated);
  if (!curated) {
    els.tagCurationStatus.textContent = state.language === "en" ? "New tags need review" : "有新标签未整理";
    els.tagCurationStatus.title = state.language === "en" ? "After adding, editing, or deleting tags, generate merge suggestions again." : "新增、修改或删除标签后，可以重新点击 LLM 合并相似标签。";
    return;
  }
  const time = info.updatedAt ? formatDate(info.updatedAt) : "";
  els.tagCurationStatus.textContent = state.language === "en" ? `Similar tags reviewed${time ? ` · ${time}` : ""}` : `已检查相似标签${time ? ` · ${time}` : ""}`;
  els.tagCurationStatus.title = state.language === "en" ? `${info.provider || ""} ${info.model || ""} · ${info.tagCount || 0} tags · ${info.mergeCount || 0} merges` : `${info.provider || ""} ${info.model || ""} · ${info.tagCount || 0} 个标签 · 合并 ${info.mergeCount || 0} 组`;
}

function renderSettings() {
  const cfg = state.config;
  document.querySelectorAll('input[name="provider"]').forEach((input) => {
    input.checked = input.value === (cfg.provider || "qwen");
  });
  els.qwenModel.value = cfg.qwenModel || "qwen3.7-max";
  els.qwenBaseUrl.value = cfg.qwenBaseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  els.zhipuModel.value = cfg.zhipuModel || "glm-5.1";
  els.zhipuBaseUrl.value = cfg.zhipuBaseUrl || "https://open.bigmodel.cn/api/paas/v4";
}

function renderPapers(target = els.paperList, papers = state.papers) {
  const filter = target === els.paperList ? els.paperFilter.value.trim().toLowerCase() : "";
  const visible = papers.filter((paper) => `${paper.title} ${paper.abstract}`.toLowerCase().includes(filter));
  if (!visible.length) {
    target.innerHTML = `<div class="empty">${escapeHtml(t("noPapers"))}</div>`;
    return;
  }
  target.innerHTML = visible
    .map((paper) => {
      const tags = (paper.tagIds || []).map(tagById).filter(Boolean);
      return `
        <article class="paper-card">
          <h4>${escapeHtml(paper.title)}</h4>
          <p>${escapeHtml(truncate(paper.abstract || t("noAbstract")))}</p>
          <div class="chip-row">
            ${tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag.name)}</span>`).join("")}
          </div>
          ${paperCardActions(paper)}
        </article>
      `;
    })
    .join("");
}

function paperTags(paper) {
  return (paper?.tagIds || []).map(tagById).filter(Boolean);
}

function paperSearchText(paper) {
  const tags = paperTags(paper).map((tag) => tag.name).join(" ");
  return normalizeText(`${paper.title} ${paper.abstract} ${paper.conversation} ${tags}`);
}

function paperSemanticTagIds(paper) {
  return (paper?.tagIds || []).filter((id) => {
    const tag = tagById(id);
    return tag && !isSystemTag(tag);
  });
}

function paperTime(paper, field) {
  return Date.parse(paper?.[field] || "") || 0;
}

function paperTagSimilarity(a, b) {
  const aIds = new Set(paperSemanticTagIds(a));
  const bIds = new Set(paperSemanticTagIds(b));
  if (!aIds.size || !bIds.size) return 0;
  const shared = [...aIds].filter((id) => bIds.has(id)).length;
  const union = new Set([...aIds, ...bIds]).size || 1;
  return shared / union;
}

function sortPapersForLibrary(papers) {
  const mode = els.paperLibrarySort?.value || "similar";
  const items = [...papers];
  if (mode === "created") return items.sort((a, b) => paperTime(b, "createdAt") - paperTime(a, "createdAt"));
  if (mode === "updated") return items.sort((a, b) => paperTime(b, "updatedAt") - paperTime(a, "updatedAt"));
  if (mode === "title") return items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "zh-CN"));
  return clusterPapersByTags(items).flatMap((cluster) => cluster.papers);
}

function clusterLabelForPapers(papers) {
  const counts = new Map();
  for (const paper of papers) {
    for (const id of paperSemanticTagIds(paper)) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const names = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || tagById(a[0])?.name.localeCompare(tagById(b[0])?.name || "", "zh-CN"))
    .slice(0, 4)
    .map(([id]) => tagById(id)?.name)
    .filter(Boolean);
  return names.length ? names.join(" / ") : t("untaggedCluster");
}

function clusterPapersByTags(papers) {
  const tagged = [...papers]
    .filter((paper) => paperSemanticTagIds(paper).length)
    .sort((a, b) => paperSemanticTagIds(b).length - paperSemanticTagIds(a).length || paperTime(b, "updatedAt") - paperTime(a, "updatedAt"));
  const clusters = [];
  const threshold = 0.34;

  for (const paper of tagged) {
    let bestCluster = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const score = Math.max(...cluster.papers.map((candidate) => paperTagSimilarity(paper, candidate)));
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }
    if (bestCluster && bestScore >= threshold) bestCluster.papers.push(paper);
    else clusters.push({ papers: [paper] });
  }

  const unsorted = papers.filter((paper) => !paperSemanticTagIds(paper).length);
  const normalized = clusters
    .map((cluster) => ({
      label: clusterLabelForPapers(cluster.papers),
      papers: cluster.papers.sort((a, b) => paperTime(b, "updatedAt") - paperTime(a, "updatedAt"))
    }))
    .sort((a, b) => b.papers.length - a.papers.length || a.label.localeCompare(b.label, "zh-CN"));

  if (unsorted.length) {
    normalized.push({
      label: t("untaggedCluster"),
      papers: unsorted.sort((a, b) => paperTime(b, "updatedAt") - paperTime(a, "updatedAt"))
    });
  }
  return normalized;
}

function renderPaperLibrary() {
  const query = normalizeText(els.paperLibraryFilter?.value || "");
  const visiblePapers = state.papers.filter((paper) => !query || paperSearchText(paper).includes(query));
  const sortedPapers = sortPapersForLibrary(visiblePapers);
  const sortMode = els.paperLibrarySort?.value || "similar";
  els.paperLibraryList.innerHTML =
    sortMode === "similar"
      ? renderPaperClustersHtml(clusterPapersByTags(visiblePapers))
      : renderPaperCardsHtml(sortedPapers, { includeTags: true });

  document.querySelectorAll("[data-paper-library-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paperLibraryMode === state.paperLibraryMode);
  });
  els.paperLibraryListMode.classList.toggle("is-hidden", state.paperLibraryMode !== "list");
  els.paperLibraryMapMode.classList.toggle("is-hidden", state.paperLibraryMode !== "map");

  const orderedTags = [...state.tags].sort(compareTags);
  els.paperLibraryTagMeta.textContent = t("tagsMeta", orderedTags.length);
  els.paperLibraryTagList.innerHTML = orderedTags.length
    ? orderedTags
        .map(
          (tag) => `
          <button class="tag-summary-item" data-tag-id="${tag.id}" type="button">
            <strong>${escapeHtml(tag.name)}</strong>
            <span>${escapeHtml(t("tagPaperCount", tag.paperIds?.length || 0))}</span>
            ${(tag.aliases || []).length ? `<small>${escapeHtml(tag.aliases.slice(0, 4).join(" / "))}</small>` : ""}
          </button>
        `
        )
        .join("")
    : `<div class="empty">${escapeHtml(t("noTags"))}</div>`;
  renderPaperMap();
}

function renderPaperClustersHtml(clusters) {
  if (!clusters.length) return `<div class="empty">${escapeHtml(t("noPapers"))}</div>`;
  return clusters
    .map(
      (cluster) => `
        <section class="paper-cluster">
          <div class="paper-cluster-head">
            <strong>${escapeHtml(cluster.label)}</strong>
            <span>${escapeHtml(t("clusterPaperCount", cluster.papers.length))}</span>
          </div>
          <div class="paper-cluster-list">
            ${renderPaperCardsHtml(cluster.papers, { includeTags: true })}
          </div>
        </section>
      `
    )
    .join("");
}

function paperMatchesSelectedMapTags(paper) {
  const selected = state.selectedMapTagIds;
  if (!selected.length) return true;
  const ids = new Set(paper.tagIds || []);
  if (els.paperMapMatchMode.value === "all") return selected.every((id) => ids.has(id));
  return selected.some((id) => ids.has(id));
}

function renderPaperMap() {
  if (!els.paperMapTags || state.paperLibraryMode !== "map") return;
  const query = normalizeText(els.paperMapFilter?.value || "");
  const selectedTags = new Set(state.selectedMapTagIds);
  const selectedPaper = paperById(state.selectedMapPaperId);
  let papers = state.papers.filter((paper) => {
    const queryMatch = !query || paperSearchText(paper).includes(query);
    return queryMatch && paperMatchesSelectedMapTags(paper);
  });
  if (selectedPaper && !papers.some((paper) => paper.id === selectedPaper.id)) papers = [selectedPaper, ...papers];

  papers = papers
    .sort((a, b) => {
      const selectedDiff = Number(b.id === state.selectedMapPaperId) - Number(a.id === state.selectedMapPaperId);
      if (selectedDiff) return selectedDiff;
      const aMatch = (a.tagIds || []).filter((id) => selectedTags.has(id)).length;
      const bMatch = (b.tagIds || []).filter((id) => selectedTags.has(id)).length;
      return bMatch - aMatch || paperTime(b, "updatedAt") - paperTime(a, "updatedAt");
    })
    .slice(0, selectedTags.size || query ? 80 : 45);

  const visiblePaperIds = new Set(papers.map((paper) => paper.id));
  const tagQueryMatches = (tag) => !query || normalizeText(`${tag.name} ${(tag.aliases || []).join(" ")}`).includes(query);
  const tags = [...state.tags]
    .filter((tag) => {
      if (selectedPaper && (selectedPaper.tagIds || []).includes(tag.id)) return true;
      if (selectedTags.has(tag.id)) return true;
      const hasVisiblePaper = (tag.paperIds || []).some((id) => visiblePaperIds.has(id));
      return hasVisiblePaper || tagQueryMatches(tag);
    })
    .sort(compareTags);
  const visibleTagIds = new Set(tags.map((tag) => tag.id));

  els.paperMapHint.textContent = selectedTags.size
    ? t("mapVisibleMeta", tags.length, papers.length)
    : t("mapHint");
  els.paperMapTags.innerHTML = tags.length
    ? tags
        .map((tag) => {
          const selected = selectedTags.has(tag.id);
          const relatedToPaper = selectedPaper && (selectedPaper.tagIds || []).includes(tag.id);
          const active = selected || relatedToPaper;
          const dimmed = (selectedTags.size || selectedPaper) && !active;
          return `
            <button class="map-node map-tag-node${active ? " active" : ""}${dimmed ? " dimmed" : ""}${isSystemTag(tag) ? " system" : ""}" type="button" data-map-tag-id="${tag.id}">
              <strong>${escapeHtml(tag.name)}</strong>
              <span>${escapeHtml(t("tagPaperCount", tag.paperIds?.length || 0))}</span>
            </button>
          `;
        })
        .join("")
    : `<div class="empty">${escapeHtml(t("noTags"))}</div>`;

  els.paperMapPapers.innerHTML = papers.length
    ? papers
        .map((paper) => {
          const tagIds = new Set(paper.tagIds || []);
          const selected = paper.id === state.selectedMapPaperId;
          const relatedToTags = state.selectedMapTagIds.length && state.selectedMapTagIds.some((id) => tagIds.has(id));
          const active = selected || relatedToTags;
          const dimmed = (selectedTags.size || selectedPaper) && !active;
          const tagsForPaper = paperTags(paper).filter((tag) => visibleTagIds.has(tag.id)).slice(0, 5);
          return `
            <button class="map-node map-paper-node${active ? " active" : ""}${dimmed ? " dimmed" : ""}" type="button" data-map-paper-id="${paper.id}">
              <strong>${escapeHtml(paper.title)}</strong>
              <span>${tagsForPaper.map((tag) => escapeHtml(tag.name)).join(" · ") || escapeHtml(t("noTags"))}</span>
            </button>
          `;
        })
        .join("")
    : `<div class="empty">${escapeHtml(t("noPapers"))}</div>`;

  requestAnimationFrame(drawPaperMapLines);
}

function drawPaperMapLines() {
  if (!els.paperMapSvg || state.paperLibraryMode !== "map") return;
  const shellRect = els.paperMapShell.getBoundingClientRect();
  const width = Math.max(els.paperMapShell.scrollWidth, shellRect.width);
  const height = Math.max(els.paperMapShell.scrollHeight, shellRect.height);
  els.paperMapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.paperMapSvg.setAttribute("width", String(width));
  els.paperMapSvg.setAttribute("height", String(height));
  const tagNodes = [...els.paperMapTags.querySelectorAll("[data-map-tag-id]")];
  const paperNodes = [...els.paperMapPapers.querySelectorAll("[data-map-paper-id]")];
  const paperNodeById = new Map(paperNodes.map((node) => [node.dataset.mapPaperId, node]));
  const selectedTags = new Set(state.selectedMapTagIds);
  const selectedPaperId = state.selectedMapPaperId;
  const lines = [];
  let count = 0;

  for (const tagNode of tagNodes) {
    const tag = tagById(tagNode.dataset.mapTagId);
    if (!tag) continue;
    for (const paperId of tag.paperIds || []) {
      const paperNode = paperNodeById.get(paperId);
      if (!paperNode) continue;
      const tagRect = tagNode.getBoundingClientRect();
      const paperRect = paperNode.getBoundingClientRect();
      const x1 = tagRect.right - shellRect.left + els.paperMapShell.scrollLeft;
      const y1 = tagRect.top + tagRect.height / 2 - shellRect.top + els.paperMapShell.scrollTop;
      const x2 = paperRect.left - shellRect.left + els.paperMapShell.scrollLeft;
      const y2 = paperRect.top + paperRect.height / 2 - shellRect.top + els.paperMapShell.scrollTop;
      const c1 = x1 + Math.max(56, (x2 - x1) * 0.45);
      const c2 = x2 - Math.max(56, (x2 - x1) * 0.45);
      const active = selectedTags.has(tag.id) || selectedPaperId === paperId;
      const dimmed = (selectedTags.size || selectedPaperId) && !active;
      lines.push(`<path class="${active ? "active" : ""}${dimmed ? " dimmed" : ""}" d="M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}" />`);
      count += 1;
      if (count >= 320) break;
    }
    if (count >= 320) break;
  }
  els.paperMapSvg.innerHTML = lines.join("");
}

function topicPackById(id) {
  return state.topicPacks.find((pack) => pack.id === id);
}

function tagNamesForIds(ids) {
  return (ids || []).map(tagById).filter(Boolean).map((tag) => tag.name);
}

function topicPackPapers(pack) {
  if (!pack) return [];
  const includeIds = new Set(pack.includeTagIds || []);
  const excludeIds = new Set(pack.excludeTagIds || []);
  return state.papers.filter((paper) => {
    const paperTags = new Set(paper.tagIds || []);
    if ([...excludeIds].some((id) => paperTags.has(id))) return false;
    if (!includeIds.size) return false;
    if (pack.matchMode === "all") return [...includeIds].every((id) => paperTags.has(id));
    return [...includeIds].some((id) => paperTags.has(id));
  });
}

function renderTopicPacks() {
  const ordered = [...state.topicPacks].sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0));
  els.topicListMeta.textContent = t("topicPacksMeta", ordered.length);
  els.topicPackList.innerHTML = ordered.length
    ? ordered
        .map((pack) => {
          const selected = pack.id === state.activeTopicPackId ? " selected" : "";
          const includeTags = tagNamesForIds(pack.includeTagIds).slice(0, 6);
          const excludeTags = tagNamesForIds(pack.excludeTagIds).slice(0, 4);
          const papers = topicPackPapers(pack);
          return `
            <article class="topic-pack-card${selected}" data-topic-pack-id="${pack.id}">
              <div>
                <h4>${escapeHtml(pack.name)}</h4>
                ${pack.description ? `<p>${escapeHtml(pack.description)}</p>` : ""}
              </div>
              <div class="topic-pack-meta">
                <span>${escapeHtml(t("tagPaperCountLong", papers.length))}</span>
                <span>${escapeHtml(pack.matchMode === "all" ? t("includeTagModeAll") : t("includeTagModeAny"))}</span>
              </div>
              <div class="chip-row">
                ${includeTags.map((name) => `<span class="tag-chip">${escapeHtml(name)}</span>`).join("")}
                ${excludeTags.map((name) => `<span class="tag-chip muted-chip">-${escapeHtml(name)}</span>`).join("")}
              </div>
              <div class="button-row">
                <button class="secondary-button small-button" type="button" data-open-topic-pack-id="${pack.id}">${escapeHtml(t("viewDetail"))}</button>
                <button class="secondary-button small-button" type="button" data-edit-topic-pack-id="${pack.id}">${escapeHtml(t("edit"))}</button>
                <button class="secondary-button small-button danger-button" type="button" data-delete-topic-pack-id="${pack.id}">${escapeHtml(t("delete"))}</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty">${escapeHtml(t("noTopicPacks"))}</div>`;
  renderTopicPackResult();
}

function renderTopicPackResult() {
  const pack = topicPackById(state.activeTopicPackId);
  if (!pack) {
    els.topicResultMeta.textContent = t("chooseTopicPack");
    els.topicPaperList.innerHTML = `<div class="empty">${escapeHtml(t("chooseTopicPack"))}</div>`;
    return;
  }
  const papers = topicPackPapers(pack);
  const includeNames = tagNamesForIds(pack.includeTagIds).join("、");
  const excludeNames = tagNamesForIds(pack.excludeTagIds).join("、");
  els.topicResultMeta.textContent = `${pack.name} · ${t("tagPaperCountLong", papers.length)}${includeNames ? ` · ${includeNames}` : ""}${excludeNames ? ` · 排除 ${excludeNames}` : ""}`;
  els.topicPaperList.innerHTML = renderPaperCardsHtml(papers, { includeTags: true });
}

function collectTopicTagNames(list) {
  return [...list.querySelectorAll(".manual-tag-input")].map((input) => input.value.trim()).filter(Boolean);
}

function tagIdsFromNames(names) {
  return uniq(names.map((name) => tagByName(name)?.id).filter(Boolean));
}

function fillTopicTagList(list, names = []) {
  list.innerHTML = (names.length ? names : [""]).map((name) => tagInputRow(name, t("tagInputPlaceholder"))).join("");
}

function resetTopicForm() {
  state.editingTopicPackId = null;
  els.topicPackForm.reset();
  fillTopicTagList(els.topicIncludeTagList);
  fillTopicTagList(els.topicExcludeTagList);
  els.cancelTopicEditButton.classList.add("is-hidden");
  applyLanguage();
}

function editTopicPack(packId) {
  const pack = topicPackById(packId);
  if (!pack) return;
  state.editingTopicPackId = pack.id;
  els.topicPackName.value = pack.name || "";
  els.topicPackDescription.value = pack.description || "";
  document.querySelectorAll('input[name="topicMatchMode"]').forEach((input) => {
    input.checked = input.value === (pack.matchMode || "any");
  });
  fillTopicTagList(els.topicIncludeTagList, tagNamesForIds(pack.includeTagIds));
  fillTopicTagList(els.topicExcludeTagList, tagNamesForIds(pack.excludeTagIds));
  els.cancelTopicEditButton.classList.remove("is-hidden");
  switchView("topics");
  applyLanguage();
  els.topicPackName.focus();
}

function localSimilarPapers(paperId) {
  const paper = paperById(paperId);
  if (!paper) return [];
  const targetTags = new Set(paper.tagIds || []);
  const targetWords = new Set(normalizeText(`${paper.title} ${paper.abstract}`).split(/[\s,，。；;:：()（）\-_/]+/).filter((word) => word.length > 1));

  return state.papers
    .filter((candidate) => candidate.id !== paper.id)
    .map((candidate) => {
      const candidateTags = new Set(candidate.tagIds || []);
      const sharedTagIds = [...targetTags].filter((id) => candidateTags.has(id));
      const unionSize = new Set([...targetTags, ...candidateTags]).size || 1;
      const tagScore = sharedTagIds.length / unionSize;
      const candidateWords = new Set(normalizeText(`${candidate.title} ${candidate.abstract}`).split(/[\s,，。；;:：()（）\-_/]+/).filter((word) => word.length > 1));
      const sharedWords = [...targetWords].filter((word) => candidateWords.has(word)).length;
      const textScore = targetWords.size ? Math.min(0.25, sharedWords / Math.max(targetWords.size, 1)) : 0;
      const score = tagScore * 0.82 + textScore;
      const sharedTags = sharedTagIds.map(tagById).filter(Boolean);
      return {
        paperId: candidate.id,
        title: candidate.title,
        score,
        confidence: Math.min(0.98, score),
        reason: sharedTags.length ? (state.language === "en" ? `Shared tags: ${sharedTags.map((tag) => tag.name).join(", ")}` : `共享标签：${sharedTags.map((tag) => tag.name).join("、")}`) : (state.language === "en" ? "Title or abstract has overlapping terms" : "标题或摘要存在词汇重合"),
        sharedTags
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function renderSimilarResults(target, matches, emptyText = "暂无相似论文") {
  if (!matches.length) {
    target.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  target.innerHTML = matches
    .map((match) => {
      const paper = paperById(match.paperId);
      if (!paper) return "";
      const tags = paperTags(paper);
      const score = Number(match.confidence ?? match.score ?? 0);
      return `
        <article class="paper-card recommendation-card">
          <h4>${escapeHtml(paper.title)}</h4>
          <p>${escapeHtml(match.reason || truncate(paper.abstract || t("noAbstract")))}</p>
          <div class="chip-row">${tags.slice(0, 5).map((tag) => `<span class="tag-chip">${escapeHtml(tag.name)}</span>`).join("")}</div>
          <small>${escapeHtml(t("similarity"))} ${(score * 100).toFixed(0)}%</small>
          <button class="secondary-button" data-paper-id="${paper.id}">${escapeHtml(t("viewDetail"))}</button>
        </article>
      `;
    })
    .join("");
}

function paperCardActions(paper) {
  return `
    <div class="paper-card-actions">
      <button class="secondary-button" data-paper-id="${paper.id}" type="button">${escapeHtml(t("viewDetail"))}</button>
      <button class="secondary-button danger-button" data-delete-paper-id="${paper.id}" type="button">${escapeHtml(t("deletePaper"))}</button>
    </div>
  `;
}

function setPaperDetailEditMode(editing) {
  state.paperDetailEditing = Boolean(editing);
  els.paperDetailReadView.classList.toggle("is-hidden", state.paperDetailEditing);
  els.paperDetailTagForm.classList.toggle("is-hidden", !state.paperDetailEditing);
  els.editPaperDetailButton.classList.toggle("is-hidden", state.paperDetailEditing);
  els.paperDetailReadView.setAttribute("aria-hidden", String(state.paperDetailEditing));
  els.paperDetailTagForm.setAttribute("aria-hidden", String(!state.paperDetailEditing));
}

function renderPaperDetail(paperId) {
  const paper = paperById(paperId);
  if (!paper) {
    els.paperDetailTitle.textContent = state.language === "en" ? "Paper not found" : "论文不存在";
    els.paperDetailMeta.textContent = "";
    els.paperDetailTags.innerHTML = "";
    els.paperDetailTagList.innerHTML = "";
    els.paperDetailTitleInput.value = "";
    els.paperDetailAbstractInput.value = "";
    els.paperDetailConversationInput.value = "";
    els.paperDetailAbstract.textContent = t("noAbstract");
    els.paperDetailConversation.innerHTML = `<p class="empty">${escapeHtml(t("noConversation"))}</p>`;
    setPaperDetailEditMode(false);
    renderSimilarResults(els.tagSimilarPaperList, []);
    return;
  }

  state.activePaperId = paper.id;
  const tags = paperTags(paper);
  els.paperDetailTitle.textContent = paper.title;
  els.paperDetailMeta.textContent = `${t("created")} ${formatDate(paper.createdAt)} · ${t("updated")} ${formatDate(paper.updatedAt)}`;
  els.paperDetailTags.innerHTML = tags.length ? tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag.name)}</span>`).join("") : `<span class="empty">${escapeHtml(t("noTags"))}</span>`;
  els.paperDetailAbstract.textContent = paper.abstract || t("noAbstract");
  els.paperDetailConversation.innerHTML = renderMarkdown(paper.conversation);
  els.paperDetailTitleInput.value = paper.title || "";
  els.paperDetailAbstractInput.value = paper.abstract || "";
  els.paperDetailConversationInput.value = paper.conversation || "";
  els.paperDetailTagList.innerHTML = (tags.length ? tags : [{ name: "" }]).map((tag) => tagInputRow(tag.name, t("tagInputPlaceholder"))).join("");
  setPaperDetailEditMode(state.paperDetailEditing);
  renderSimilarResults(els.tagSimilarPaperList, localSimilarPapers(paper.id), t("similarEmpty"));
  els.llmSimilarPaperList.innerHTML = `<div class="empty">${escapeHtml(t("llmSimilarEmpty"))}</div>`;
}

function tagInputRow(value = "", placeholder = "") {
  return `
    <div class="manual-tag-row">
      <div class="tag-combobox">
        <input class="manual-tag-input" autocomplete="off" placeholder="${escapeHtml(placeholder || t("tagInputPlaceholder"))}" value="${escapeHtml(value)}" />
        <div class="tag-suggestions" hidden></div>
      </div>
      <button class="icon-button remove-manual-tag" type="button" title="删除标签">×</button>
    </div>
  `;
}

function tagMatchScore(tag, query, context) {
  const q = normalizeText(query);
  const ctx = normalizeText(context);
  const names = [tag.name, ...(tag.aliases || [])].map(normalizeText);
  let score = 0;
  if (q) {
    if (names.some((name) => name === q)) score += 40;
    else if (names.some((name) => name.startsWith(q))) score += 30;
    else if (names.some((name) => name.includes(q))) score += 20;
    else if (names.some((name) => q.includes(name))) score += 10;
  }
  if (ctx) {
    if (names.some((name) => name && ctx.includes(name))) score += 8;
    if (tag.description && ctx.includes(normalizeText(tag.description))) score += 3;
  }
  return score;
}

function paperContextTextForTagInput(input) {
  if (input.closest("#paperDetailTagForm")) {
    return `${els.paperDetailTitleInput.value} ${els.paperDetailAbstractInput.value} ${els.paperDetailConversationInput.value}`;
  }
  if (input.closest("#topicPackForm")) {
    return `${els.topicPackName.value} ${els.topicPackDescription.value}`;
  }
  return `${document.querySelector("#paperTitle").value} ${document.querySelector("#paperAbstract").value} ${document.querySelector("#paperConversation").value}`;
}

function matchingTags(query, context = "") {
  const q = normalizeText(query);
  const ctx = normalizeText(context);
  const tagTime = (tag) => Date.parse(tag.updatedAt || tag.createdAt || "") || 0;
  if (!q && !ctx) return [...state.tags].sort((a, b) => tagSortValue(a) - tagSortValue(b) || tagTime(b) - tagTime(a) || a.name.localeCompare(b.name, "zh-CN"));
  return [...state.tags]
    .map((tag) => ({ tag, score: tagMatchScore(tag, query, context) }))
    .sort((a, b) => b.score - a.score || tagSortValue(a.tag) - tagSortValue(b.tag) || tagTime(b.tag) - tagTime(a.tag) || a.tag.name.localeCompare(b.tag.name, "zh-CN"))
    .map((item) => item.tag);
}

function renderTagSuggestions(input) {
  const box = input.closest(".tag-combobox");
  const suggestions = box?.querySelector(".tag-suggestions");
  if (!suggestions) return;
  const matches = matchingTags(input.value, paperContextTextForTagInput(input));
  const current = input.value.trim();
  const exact = current && state.tags.some((tag) => normalizeText(tag.name) === normalizeText(current));
  const createOption = current && !exact ? `<button type="button" class="tag-suggestion create" data-tag-value="${escapeHtml(current)}">${escapeHtml(t("createTag", current))}</button>` : "";
  if (!matches.length && !createOption) {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
    return;
  }
  suggestions.innerHTML =
    matches
      .map(
        (tag) => `
        <button type="button" class="tag-suggestion" data-tag-value="${escapeHtml(tag.name)}">
          <span>${escapeHtml(tag.name)}</span>
          <small>${escapeHtml(t("tagPaperCount", tag.paperIds?.length || 0))}</small>
        </button>
      `
      )
      .join("") + createOption;
  suggestions.hidden = false;
}

function hideTagSuggestions(root = document) {
  root.querySelectorAll(".tag-suggestions").forEach((el) => {
    el.hidden = true;
  });
}

function createTagInputRow(value = "", placeholder = "") {
  const template = document.createElement("template");
  template.innerHTML = tagInputRow(value, placeholder).trim();
  return template.content.firstElementChild;
}

function renderTagTree() {
  if (!state.tags.length) {
    els.tagTree.innerHTML = `<div class="empty">${escapeHtml(t("noTags"))}</div>`;
    return;
  }
  const orderedTags = [...state.tags].sort(compareTags);
  els.tagTree.innerHTML = `
    <div class="tag-library-grid">
      ${orderedTags
        .map((tag) => {
          const selected = tag.id === state.activeTagId ? " selected" : "";
          const system = isSystemTag(tag) ? " system-tag" : "";
          return `
            <div class="tag-library-card${selected}${system}" data-tag-id="${tag.id}" draggable="${isSystemTag(tag) ? "false" : "true"}" role="button" tabindex="0">
              <strong>${escapeHtml(tag.name)}</strong>
              <span>${escapeHtml(t("tagPaperCountLong", tag.paperIds?.length || 0))}</span>
              ${(tag.aliases || []).length ? `<small>${escapeHtml(tag.aliases.slice(0, 3).join(" / "))}</small>` : ""}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTagDetail() {
  const tag = tagById(state.activeTagId);
  if (!tag) {
    els.selectedTagName.textContent = t("tagDetail");
    els.selectedTagMeta.textContent = t("clickTag");
    els.tagDetail.innerHTML = `<div class="empty">${escapeHtml(t("clickTag"))}</div>`;
    return;
  }

  const directPapers = papersForTag(tag.id);
  els.selectedTagName.textContent = tag.name;
  els.selectedTagMeta.textContent = t("tagPaperCountLong", directPapers.length);

  els.tagDetail.innerHTML = `
    ${tag.description ? `<p>${escapeHtml(tag.description)}</p>` : ""}
    <div class="button-row">
      ${isSystemTag(tag) ? `<span class="muted">${state.language === "en" ? "System tag · cannot be deleted" : "系统标签 · 不可删除"}</span>` : `<button class="secondary-button danger-button" data-delete-tag-id="${tag.id}" type="button">${state.language === "en" ? "Delete Tag" : "删除标签"}</button>`}
    </div>
    <div class="relation-row">
      <strong>${state.language === "en" ? "Aliases" : "别名"}</strong>
      <div class="chip-row">${(tag.aliases || []).length ? tag.aliases.map((name) => `<span class="tag-chip">${escapeHtml(name)}</span>`).join("") : `<span class="empty">${state.language === "en" ? "None" : "无"}</span>`}</div>
    </div>
    <div class="relation-row">
      <strong>${state.language === "en" ? "Linked Papers" : "关联论文"}</strong>
      <div class="paper-list">${renderPaperCardsHtml(directPapers)}</div>
    </div>
  `;
}

function mergeStillValid(merge) {
  const canonical = tagByName(merge.canonical);
  const sources = splitMergeTags(merge.tags).map(tagByName).filter(Boolean);
  return Boolean(canonical && sources.some((tag) => tag.id !== canonical.id));
}

function splitMergeTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag || "").trim()).filter(Boolean);
  return String(tags || "")
    .split(/[,，;；\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renderMergeReview() {
  state.pendingMerges = state.pendingMerges.filter(mergeStillValid);
  const total = state.pendingMerges.length;
  els.mergeReviewMeta.textContent = total ? `还有 ${total} 条建议待审核，已确认 ${state.reviewedMergeCount} 条` : `审核完成，已确认 ${state.reviewedMergeCount} 条合并`;

  if (!total) {
    els.mergeReviewList.innerHTML = `
      <div class="empty merge-empty">${state.language === "en" ? "No merge suggestions to review" : "没有待审核的合并建议"}</div>
      <button class="primary-button" type="button" data-finish-merge-review>${state.language === "en" ? "Finish Review" : "完成审核"}</button>
    `;
    return;
  }

  els.mergeReviewList.innerHTML = state.pendingMerges
    .map((merge, index) => {
      const sourceTags = splitMergeTags(merge.tags);
      return `
        <article class="merge-review-card" data-merge-index="${index}">
          <div class="merge-route">
            <span class="merge-target">${escapeHtml(merge.canonical)}</span>
            <span class="merge-arrow">${state.language === "en" ? "keep" : "保留"}</span>
          </div>
          <div class="merge-sources">
            ${sourceTags.map((name) => `<span class="tag-chip">${escapeHtml(name)}</span>`).join("")}
          </div>
          <p>${escapeHtml(merge.reason || (state.language === "en" ? "The LLM considers these tags highly similar" : "LLM 认为这些标签语义十分相似"))}</p>
          <small>${state.language === "en" ? "Confidence" : "置信度"}：${(Number(merge.confidence || 0) * 100).toFixed(0)}%</small>
          <div class="button-row">
            <button class="primary-button small-button" type="button" data-approve-merge="${index}">${state.language === "en" ? "Merge" : "确认合并"}</button>
            <button class="secondary-button small-button" type="button" data-skip-merge="${index}">${state.language === "en" ? "Skip" : "跳过"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function finishMergeReview() {
  const result = await api("/api/tags/curation-reviewed", {
    method: "POST",
    body: JSON.stringify({ mergeCount: state.reviewedMergeCount })
  });
  state.papers = result.papers || state.papers;
  state.tags = result.tags || state.tags;
  state.meta = result.meta || state.meta;
  state.pendingMerges = [];
  renderAll();
  els.mergeReviewDialog.close();
  toast(state.language === "en" ? "Tag merge review completed" : "标签合并审核已完成");
}

async function mergeTags(merge) {
  const result = await api("/api/tags/merge", {
    method: "POST",
    body: JSON.stringify(merge)
  });
  state.papers = result.papers || state.papers;
  state.tags = result.tags || state.tags;
  state.meta = result.meta || state.meta;
  state.reviewedMergeCount += Number(result.mergeCount || 0);
  await syncState({ force: true });
  renderAll();
  return Number(result.mergeCount || 0);
}

function renderClickableTag(tag) {
  return `<button class="tag-chip" data-tag-id="${tag.id}">${escapeHtml(tag.name)}</button>`;
}

function renderPaperCardsHtml(papers, { includeTags = false } = {}) {
  if (!papers.length) return `<div class="empty">${escapeHtml(t("noPapers"))}</div>`;
  return papers
    .map(
      (paper) => {
        const tags = includeTags ? paperTags(paper) : [];
        return `
          <article class="paper-card">
            <h4>${escapeHtml(paper.title)}</h4>
            <p>${escapeHtml(truncate(paper.abstract || t("noAbstract")))}</p>
            ${includeTags ? `<div class="chip-row">${tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag.name)}</span>`).join("")}</div>` : ""}
            ${paperCardActions(paper)}
          </article>
        `;
      }
    )
    .join("");
}

function renderSearchResults(matches, llmUsed, error) {
  if (!matches.length) {
    els.searchResults.innerHTML = `<div class="empty">${state.language === "en" ? "No matching tags" : "没有找到匹配标签"}</div>`;
    return;
  }
  const note = llmUsed ? "" : `<div class="empty">${state.language === "en" ? `Model unavailable; local search was used: ${escapeHtml(error)}` : `模型不可用，已用本地规则检索：${escapeHtml(error)}`}</div>`;
  els.searchResults.innerHTML =
    note +
    matches
      .map(
        (match) => `
        <button class="result-button" data-search-tag-id="${match.tagId}">
          <strong>${escapeHtml(match.tagName)}</strong>
          <small>${escapeHtml(match.reason || "")} · ${(Number(match.confidence || 0) * 100).toFixed(0)}%</small>
        </button>
      `
      )
      .join("");
}

function showPaper(paperId) {
  const paper = state.papers.find((item) => item.id === paperId);
  if (!paper) return;
  state.paperDetailEditing = false;
  renderPaperDetail(paper.id);
  switchView("paperDetail");
}

function switchView(name) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  const viewId = `view-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  els.viewTitle.textContent = t(name) || t("appName");
}

function manualTagInputs() {
  return [...els.manualTagList.querySelectorAll(".manual-tag-input")];
}

function collectManualTags() {
  return manualTagInputs()
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function addManualTagInput(value = "") {
  const row = createTagInputRow(value, t("tagInputPlaceholder"));
  row.querySelector(".manual-tag-input").value = value;
  els.manualTagList.append(row);
  row.querySelector(".manual-tag-input").focus();
}

function resetManualTagInputs() {
  els.manualTagList.innerHTML = "";
  addManualTagInput();
}

function collectPaperForm() {
  return {
    title: document.querySelector("#paperTitle").value.trim(),
    abstract: document.querySelector("#paperAbstract").value.trim(),
    conversation: document.querySelector("#paperConversation").value.trim(),
    manualTags: collectManualTags()
  };
}

function collectSettingsForm() {
  return {
    provider: document.querySelector('input[name="provider"]:checked')?.value || "qwen",
    qwenKey: els.qwenKey.value.trim(),
    qwenModel: els.qwenModel.value.trim(),
    qwenBaseUrl: els.qwenBaseUrl.value.trim(),
    zhipuKey: els.zhipuKey.value.trim(),
    zhipuModel: els.zhipuModel.value.trim(),
    zhipuBaseUrl: els.zhipuBaseUrl.value.trim()
  };
}

function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function readJsonFile(file) {
  return JSON.parse(await file.text());
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

els.languageSelect.addEventListener("change", () => {
  state.language = els.languageSelect.value === "en" ? "en" : "zh";
  localStorage.setItem("paperTagLanguage", state.language);
  applyLanguage();
  renderAll();
});

document.body.addEventListener("input", (event) => {
  const input = event.target.closest(".manual-tag-input");
  if (!input) return;
  renderTagSuggestions(input);
});

document.body.addEventListener("focusin", (event) => {
  const input = event.target.closest(".manual-tag-input");
  if (!input) return;
  renderTagSuggestions(input);
  syncState({ force: true })
    .then(() => {
      if (document.activeElement === input) renderTagSuggestions(input);
    })
    .catch(() => {});
});

document.body.addEventListener("click", (event) => {
  const suggestion = event.target.closest(".tag-suggestion");
  if (suggestion) {
    const row = suggestion.closest(".manual-tag-row");
    const input = row?.querySelector(".manual-tag-input");
    if (input) input.value = suggestion.dataset.tagValue || "";
    hideTagSuggestions(row || document);
    input?.focus();
    return;
  }
  if (!event.target.closest(".tag-combobox")) hideTagSuggestions();
});

document.body.addEventListener("keydown", (event) => {
  const input = event.target.closest(".manual-tag-input");
  if (!input || event.key !== "Escape") return;
  hideTagSuggestions(input.closest(".manual-tag-row") || document);
});

els.paperForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.paperFormSubmitting) return;
  state.paperFormSubmitting = true;
  const button = els.paperForm.querySelector(".primary-button");
  const done = setBusy(button, "保存中...");
  try {
    const result = await api("/api/papers", {
      method: "POST",
      body: JSON.stringify(collectPaperForm())
    });
    state.papers = result.papers || [result.paper, ...state.papers.filter((paper) => paper.id !== result.paper.id)];
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    els.paperForm.reset();
    resetManualTagInputs();
    els.previewTags.textContent = t("mergePrompt");
    els.previewTags.classList.add("empty");
    renderAll();
    toast(result.duplicate ? t("duplicatePaperSaved") : t("paperSaved"));
  } catch (err) {
    toast(err.message);
  } finally {
    state.paperFormSubmitting = false;
    done();
  }
});

els.addManualTagButton.addEventListener("click", () => addManualTagInput());

els.manualTagList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-manual-tag");
  if (!removeButton) return;
  const rows = [...els.manualTagList.querySelectorAll(".manual-tag-row")];
  if (rows.length <= 1) {
    rows[0].querySelector(".manual-tag-input").value = "";
    return;
  }
  removeButton.closest(".manual-tag-row").remove();
});

els.manualTagList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addManualTagInput();
});

els.paperDetailTagList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-manual-tag");
  if (!removeButton) return;
  const rows = [...els.paperDetailTagList.querySelectorAll(".manual-tag-row")];
  if (rows.length <= 1) {
    rows[0].querySelector(".manual-tag-input").value = "";
    return;
  }
  removeButton.closest(".manual-tag-row").remove();
});

els.paperDetailTagList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const row = createTagInputRow("", t("tagInputPlaceholder"));
  els.paperDetailTagList.append(row);
  row.querySelector(".manual-tag-input").focus();
});

els.paperFilter.addEventListener("input", () => renderPapers());

els.paperLibraryFilter.addEventListener("input", () => renderPaperLibrary());

els.paperLibrarySort.addEventListener("change", () => renderPaperLibrary());

document.querySelectorAll("[data-paper-library-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.paperLibraryMode = button.dataset.paperLibraryMode === "map" ? "map" : "list";
    localStorage.setItem("paperLibraryMode", state.paperLibraryMode);
    renderPaperLibrary();
  });
});

els.paperMapFilter.addEventListener("input", () => renderPaperMap());
els.paperMapMatchMode.addEventListener("change", () => renderPaperMap());
els.paperMapShell.addEventListener("scroll", () => requestAnimationFrame(drawPaperMapLines), true);
window.addEventListener("resize", () => requestAnimationFrame(drawPaperMapLines));

els.paperLibraryMapMode.addEventListener("click", (event) => {
  const tagButton = event.target.closest("[data-map-tag-id]");
  if (tagButton) {
    const tagId = tagButton.dataset.mapTagId;
    state.selectedMapPaperId = null;
    state.selectedMapTagIds = state.selectedMapTagIds.includes(tagId)
      ? state.selectedMapTagIds.filter((id) => id !== tagId)
      : [...state.selectedMapTagIds, tagId];
    renderPaperMap();
    return;
  }

  const paperButton = event.target.closest("[data-map-paper-id]");
  if (paperButton) {
    state.selectedMapTagIds = [];
    state.selectedMapPaperId = state.selectedMapPaperId === paperButton.dataset.mapPaperId ? null : paperButton.dataset.mapPaperId;
    renderPaperMap();
  }
});

els.backToPapersButton.addEventListener("click", () => switchView("papers"));

els.editPaperDetailButton.addEventListener("click", () => {
  setPaperDetailEditMode(true);
  els.paperDetailTitleInput.focus();
});

els.cancelPaperDetailEditButton.addEventListener("click", () => {
  setPaperDetailEditMode(false);
  if (state.activePaperId) renderPaperDetail(state.activePaperId);
});

els.addDetailTagButton.addEventListener("click", () => {
  const row = createTagInputRow("", t("tagInputPlaceholder"));
  els.paperDetailTagList.append(row);
  row.querySelector(".manual-tag-input").focus();
});

els.paperDetailTagForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const paperId = state.activePaperId;
  if (!paperId) return;
  const title = els.paperDetailTitleInput.value.trim();
  const manualTags = [...els.paperDetailTagList.querySelectorAll(".manual-tag-input")].map((input) => input.value.trim()).filter(Boolean);
  if (!title) {
    toast(state.language === "en" ? "Paper title is required" : "论文标题不能为空");
    els.paperDetailTitleInput.focus();
    return;
  }
  const button = els.paperDetailTagForm.querySelector(".primary-button");
  const done = setBusy(button, t("saving"));
  try {
    const result = await api(`/api/papers/${encodeURIComponent(paperId)}`, {
      method: "PUT",
      body: JSON.stringify({
        title,
        abstract: els.paperDetailAbstractInput.value.trim(),
        conversation: els.paperDetailConversationInput.value.trim(),
        manualTags
      })
    });
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    const index = state.papers.findIndex((paper) => paper.id === paperId);
    if (index >= 0) state.papers[index] = result.paper;
    state.paperDetailEditing = false;
    renderAll();
    toast(t("paperUpdated"));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.loadLlmSimilarButton.addEventListener("click", async () => {
  const paperId = state.activePaperId;
  if (!paperId) return;
  const done = setBusy(els.loadLlmSimilarButton, t("generating"));
  els.llmSimilarPaperList.innerHTML = `<div class="empty">${escapeHtml(t("loadingLlmSimilar"))}</div>`;
  try {
    const result = await api(`/api/papers/${encodeURIComponent(paperId)}/similar-llm`, {
      method: "POST",
      body: JSON.stringify({})
    });
    renderSimilarResults(els.llmSimilarPaperList, result.matches || [], result.llmUsed ? t("similarEmpty") : t("llmUnavailable", result.error));
  } catch (err) {
    els.llmSimilarPaperList.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  } finally {
    done();
  }
});

els.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = els.searchInput.value.trim();
  if (!query) return;
  const button = els.searchForm.querySelector(".primary-button");
  const done = setBusy(button, t("searching"));
  try {
    const result = await api("/api/search", {
      method: "POST",
      body: JSON.stringify({ query })
    });
    renderSearchResults(result.matches || [], result.llmUsed, result.error);
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-search-tag-id]");
  if (!button) return;
  const tag = tagById(button.dataset.searchTagId);
  if (!tag) return;
  state.searchTagId = tag.id;
  els.activeSearchLabel.textContent = tag.name;
  renderPapers(els.searchPaperList, papersForTag(tag.id));
});

els.addTopicIncludeTagButton.addEventListener("click", () => {
  const row = createTagInputRow("", t("tagInputPlaceholder"));
  els.topicIncludeTagList.append(row);
  row.querySelector(".manual-tag-input").focus();
});

els.addTopicExcludeTagButton.addEventListener("click", () => {
  const row = createTagInputRow("", t("tagInputPlaceholder"));
  els.topicExcludeTagList.append(row);
  row.querySelector(".manual-tag-input").focus();
});

function handleTopicTagListRemove(event, list) {
  const removeButton = event.target.closest(".remove-manual-tag");
  if (!removeButton) return false;
  const rows = [...list.querySelectorAll(".manual-tag-row")];
  if (rows.length <= 1) {
    rows[0].querySelector(".manual-tag-input").value = "";
    return true;
  }
  removeButton.closest(".manual-tag-row").remove();
  return true;
}

els.topicIncludeTagList.addEventListener("click", (event) => {
  handleTopicTagListRemove(event, els.topicIncludeTagList);
});

els.topicExcludeTagList.addEventListener("click", (event) => {
  handleTopicTagListRemove(event, els.topicExcludeTagList);
});

for (const list of [els.topicIncludeTagList, els.topicExcludeTagList]) {
  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const row = createTagInputRow("", t("tagInputPlaceholder"));
    list.append(row);
    row.querySelector(".manual-tag-input").focus();
  });
}

els.cancelTopicEditButton.addEventListener("click", () => resetTopicForm());

els.topicPackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const includeTagIds = tagIdsFromNames(collectTopicTagNames(els.topicIncludeTagList));
  const excludeTagIds = tagIdsFromNames(collectTopicTagNames(els.topicExcludeTagList)).filter((id) => !includeTagIds.includes(id));
  if (!includeTagIds.length) {
    toast(t("topicNeedsTags"));
    return;
  }
  const body = {
    name: els.topicPackName.value.trim(),
    description: els.topicPackDescription.value.trim(),
    matchMode: document.querySelector('input[name="topicMatchMode"]:checked')?.value || "any",
    includeTagIds,
    excludeTagIds
  };
  const editingId = state.editingTopicPackId;
  const button = els.saveTopicPackButton;
  const done = setBusy(button, t("saving"));
  try {
    const result = await api(editingId ? `/api/topic-packs/${encodeURIComponent(editingId)}` : "/api/topic-packs", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    state.topicPacks = result.topicPacks || state.topicPacks;
    state.papers = result.papers || state.papers;
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    state.activeTopicPackId = result.topicPack?.id || editingId || state.activeTopicPackId;
    resetTopicForm();
    renderAll();
    toast(editingId ? t("topicUpdated") : t("topicSaved"));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.topicPackList.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-open-topic-pack-id], [data-topic-pack-id]");
  const editButton = event.target.closest("[data-edit-topic-pack-id]");
  const deleteButton = event.target.closest("[data-delete-topic-pack-id]");

  if (editButton) {
    editTopicPack(editButton.dataset.editTopicPackId);
    return;
  }

  if (deleteButton) {
    const pack = topicPackById(deleteButton.dataset.deleteTopicPackId);
    if (!pack) return;
    const confirmed = window.confirm(state.language === "en" ? `Delete topic pack "${pack.name}"? Papers and tags will be preserved.` : `删除主题包「${pack.name}」？论文和标签都会保留。`);
    if (!confirmed) return;
    const done = setBusy(deleteButton, state.language === "en" ? "Deleting..." : "删除中...");
    try {
      const result = await api(`/api/topic-packs/${encodeURIComponent(pack.id)}`, { method: "DELETE" });
      state.topicPacks = result.topicPacks || state.topicPacks;
      if (state.activeTopicPackId === pack.id) state.activeTopicPackId = null;
      if (state.editingTopicPackId === pack.id) resetTopicForm();
      renderAll();
      toast(t("topicDeleted"));
    } catch (err) {
      toast(err.message);
    } finally {
      done();
    }
    return;
  }

  if (openButton) {
    state.activeTopicPackId = openButton.dataset.openTopicPackId || openButton.dataset.topicPackId;
    renderTopicPacks();
  }
});

document.body.addEventListener("click", async (event) => {
  const deletePaperButton = event.target.closest("[data-delete-paper-id]");
  if (deletePaperButton) {
    const paper = paperById(deletePaperButton.dataset.deletePaperId);
    if (!paper) return;
    const confirmed = window.confirm(
      state.language === "en"
        ? `Delete paper "${paper.title}"? Tags that are still linked to other papers will be kept.`
        : `删除论文「${paper.title}」？仍关联其他论文的标签会保留。`
    );
    if (!confirmed) return;

    const done = setBusy(deletePaperButton, state.language === "en" ? "Deleting..." : "删除中...");
    try {
      const result = await api(`/api/papers/${encodeURIComponent(paper.id)}`, {
        method: "DELETE"
      });
      state.papers = result.papers || state.papers;
      state.tags = result.tags || state.tags;
      state.meta = result.meta || state.meta;
      if (state.activePaperId === paper.id) {
        state.activePaperId = null;
        state.paperDetailEditing = false;
        switchView("papers");
      }
      renderAll();
      toast(t("paperDeleted"));
    } catch (err) {
      toast(err.message);
    } finally {
      done();
    }
    return;
  }

  const paperButton = event.target.closest("[data-paper-id]");
  if (paperButton) {
    showPaper(paperButton.dataset.paperId);
    return;
  }

  const addPaperTagButton = event.target.closest("[data-add-paper-tag]");
  if (addPaperTagButton) {
    const list = addPaperTagButton.closest("form").querySelector("[data-paper-tag-list]");
    const row = createTagInputRow("", t("tagInputPlaceholder"));
    list.append(row);
    row.querySelector(".manual-tag-input").focus();
    return;
  }

  const tagButton = event.target.closest("[data-tag-id]");
  if (tagButton) {
    state.activeTagId = tagButton.dataset.tagId;
    switchView("tags");
    renderTagDetail();
  }
});

els.tagDetail.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-tag-id]");
  if (!deleteButton) return;
  const tag = tagById(deleteButton.dataset.deleteTagId);
  if (!tag) return;
  const affectedCount = papersForTag(tag.id).length;
  const confirmed = window.confirm(state.language === "en" ? `Delete tag "${tag.name}"? ${affectedCount} papers will be preserved; only the tag link will be removed.` : `删除标签「${tag.name}」？${affectedCount} 篇论文会保留，只会移除此标签关联。`);
  if (!confirmed) return;

  const done = setBusy(deleteButton, state.language === "en" ? "Deleting..." : "删除中...");
  try {
    const result = await api(`/api/tags/${encodeURIComponent(tag.id)}`, {
      method: "DELETE"
    });
    state.papers = result.papers || state.papers;
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    state.activeTagId = null;
    renderAll();
    toast(state.language === "en" ? "Tag deleted; papers were preserved" : "标签已删除，论文已保留");
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.refreshGraphButton.addEventListener("click", async () => {
  const done = setBusy(els.refreshGraphButton, t("generating"));
  try {
    const result = await api("/api/tags/rebuild", {
      method: "POST",
      body: JSON.stringify({})
    });
    state.papers = result.papers || state.papers;
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    state.pendingMerges = result.merges || [];
    state.reviewedMergeCount = 0;
    renderAll();
    renderMergeReview();
    els.mergeReviewDialog.showModal();
    const mergeCount = state.pendingMerges.length;
    toast(result.llmUsed ? (state.language === "en" ? `LLM generated ${mergeCount} suggestions to review` : `LLM 生成了 ${mergeCount} 条待审核建议`) : t("llmUnavailable", result.error));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.tagTree.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-tag-id]");
  if (!card) return;
  if (isSystemTag(tagById(card.dataset.tagId))) {
    event.preventDefault();
    return;
  }
  state.draggedTagId = card.dataset.tagId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.tagId);
  card.classList.add("dragging");
});

els.tagTree.addEventListener("dragend", () => {
  state.draggedTagId = null;
  els.tagTree.querySelectorAll(".dragging, .drop-target").forEach((card) => card.classList.remove("dragging", "drop-target"));
});

els.tagTree.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-tag-id]");
  if (!card || !state.draggedTagId || card.dataset.tagId === state.draggedTagId || isSystemTag(tagById(card.dataset.tagId))) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  card.classList.add("drop-target");
});

els.tagTree.addEventListener("dragleave", (event) => {
  const card = event.target.closest("[data-tag-id]");
  if (card) card.classList.remove("drop-target");
});

els.tagTree.addEventListener("drop", async (event) => {
  const targetCard = event.target.closest("[data-tag-id]");
  const sourceTagId = state.draggedTagId || event.dataTransfer.getData("text/plain");
  const sourceTag = tagById(sourceTagId);
  const targetTag = tagById(targetCard?.dataset.tagId);
  els.tagTree.querySelectorAll(".dragging, .drop-target").forEach((card) => card.classList.remove("dragging", "drop-target"));
  state.draggedTagId = null;
  if (!sourceTag || !targetTag || sourceTag.id === targetTag.id || isSystemTag(sourceTag) || isSystemTag(targetTag)) return;
  event.preventDefault();

  const confirmed = window.confirm(state.language === "en" ? `Merge tag "${sourceTag.name}" into "${targetTag.name}"? Papers will be preserved; only tag links will be merged.` : `将标签「${sourceTag.name}」合并进「${targetTag.name}」？论文会保留，只会合并标签关联。`);
  if (!confirmed) return;
  try {
    const mergeCount = await mergeTags({
      canonical: targetTag.name,
      tags: [sourceTag.name],
      aliases: [sourceTag.name],
      confidence: 1,
      reason: state.language === "en" ? "Manual drag-and-drop merge" : "人工拖拽合并"
    });
    toast(mergeCount ? (state.language === "en" ? `Merged "${sourceTag.name}" into "${targetTag.name}"` : `已将「${sourceTag.name}」合并进「${targetTag.name}」`) : (state.language === "en" ? "No merge happened; refresh and try again" : "没有发生合并，请刷新后重试"));
  } catch (err) {
    toast(err.message);
  }
});

els.mergeReviewList.addEventListener("click", async (event) => {
  const finishButton = event.target.closest("[data-finish-merge-review]");
  if (finishButton) {
    const done = setBusy(finishButton, state.language === "en" ? "Finishing..." : "完成中...");
    try {
      await finishMergeReview();
    } catch (err) {
      toast(err.message);
    } finally {
      done();
    }
    return;
  }

  const approveButton = event.target.closest("[data-approve-merge]");
  if (approveButton) {
    const index = Number(approveButton.dataset.approveMerge);
    const merge = state.pendingMerges[index];
    if (!merge) return;
    const done = setBusy(approveButton, state.language === "en" ? "Merging..." : "合并中...");
    try {
      await mergeTags(merge);
      state.pendingMerges.splice(index, 1);
      renderMergeReview();
      if (!state.pendingMerges.length) await finishMergeReview();
    } catch (err) {
      toast(err.message);
    } finally {
      done();
    }
    return;
  }

  const skipButton = event.target.closest("[data-skip-merge]");
  if (skipButton) {
    const index = Number(skipButton.dataset.skipMerge);
    state.pendingMerges.splice(index, 1);
    renderMergeReview();
    if (!state.pendingMerges.length) {
      try {
        await finishMergeReview();
      } catch (err) {
        toast(err.message);
      }
    }
  }
});

els.dialogBody.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-manual-tag");
  if (!removeButton) return;
  const list = removeButton.closest(".manual-tag-list");
  const rows = [...list.querySelectorAll(".manual-tag-row")];
  if (rows.length <= 1) {
    rows[0].querySelector(".manual-tag-input").value = "";
    return;
  }
  removeButton.closest(".manual-tag-row").remove();
});

els.dialogBody.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.closest("[data-paper-tag-list]")) return;
  event.preventDefault();
  const list = event.target.closest("[data-paper-tag-list]");
  const row = createTagInputRow("", t("tagInputPlaceholder"));
  list.append(row);
  row.querySelector(".manual-tag-input").focus();
});

els.dialogBody.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-edit-paper-id]");
  if (!form) return;
  event.preventDefault();
  const paperId = form.dataset.editPaperId;
  const manualTags = [...form.querySelectorAll(".manual-tag-input")].map((input) => input.value.trim()).filter(Boolean);
  const button = form.querySelector(".primary-button");
    const done = setBusy(button, t("saving"));
  try {
    const result = await api(`/api/papers/${encodeURIComponent(paperId)}`, {
      method: "PUT",
      body: JSON.stringify({ manualTags })
    });
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    const index = state.papers.findIndex((paper) => paper.id === paperId);
    if (index >= 0) state.papers[index] = result.paper;
    renderAll();
    showPaper(paperId);
    toast(t("tagSaved"));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = els.settingsForm.querySelector(".primary-button");
  const done = setBusy(button, t("saving"));
  try {
    const result = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        ...collectSettingsForm(),
        clearQwenKey: els.clearQwenKey.checked,
        clearZhipuKey: els.clearZhipuKey.checked
      })
    });
    state.config = result.config;
    els.qwenKey.value = "";
    els.zhipuKey.value = "";
    els.clearQwenKey.checked = false;
    els.clearZhipuKey.checked = false;
    renderModelStatus();
    renderSettings();
    toast(t("settingsSaved"));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.exportDataButton.addEventListener("click", async () => {
  const done = setBusy(els.exportDataButton, state.language === "en" ? "Exporting..." : "导出中...");
  try {
    const payload = await api("/api/export");
    downloadJson(`paper-tag-library-${new Date().toISOString().slice(0, 10)}.json`, payload);
    toast(t("dataExported", payload.store?.papers?.length || 0, payload.store?.tags?.length || 0));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.importDataButton.addEventListener("click", () => {
  els.importDataInput.click();
});

els.importDataInput.addEventListener("change", async () => {
  const file = els.importDataInput.files?.[0];
  els.importDataInput.value = "";
  if (!file) return;
  const confirmed = window.confirm(
    state.language === "en"
      ? "Importing will replace the current Chrome paper library. You can import an old data/store.json file or a JSON exported by this extension. Continue?"
      : "导入会替换当前 Chrome 插件里的论文和标签库。你可以选择旧本地服务的 data/store.json，或本插件导出的 JSON。是否继续？"
  );
  if (!confirmed) return;

  const done = setBusy(els.importDataButton, state.language === "en" ? "Importing..." : "导入中...");
  try {
    const payload = await readJsonFile(file);
    const result = await api("/api/import", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.papers = result.papers || [];
    state.tags = result.tags || [];
    state.topicPacks = result.topicPacks || [];
    state.meta = result.meta || {};
    state.config = result.config || state.config;
    state.activePaperId = null;
    state.activeTagId = null;
    renderAll();
    toast(t("dataImported", state.papers.length, state.tags.length));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.closeDialog.addEventListener("click", () => els.paperDialog.close());

els.closeMergeReviewDialog.addEventListener("click", () => els.mergeReviewDialog.close());

els.openModelTest.addEventListener("click", () => {
  els.modelTestQuestion.value = "";
  els.modelTestMeta.textContent = state.language === "en" ? "Call metadata will appear here" : "调用信息会显示在这里";
  els.modelTestAnswer.textContent = state.language === "en" ? "The model answer will appear here" : "模型回答会显示在这里";
  els.modelTestDialog.showModal();
});

els.closeModelTestDialog.addEventListener("click", () => els.modelTestDialog.close());

els.modelTestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = els.modelTestQuestion.value.trim();
  if (!question) {
    toast(state.language === "en" ? "Please enter a test question" : "请输入测试问题");
    return;
  }
  const button = els.modelTestForm.querySelector(".primary-button");
  const done = setBusy(button, state.language === "en" ? "Sending..." : "发送中...");
  els.modelTestMeta.textContent = state.language === "en" ? "Requesting the currently configured model..." : "正在请求当前设置中的模型...";
  els.modelTestAnswer.textContent = state.language === "en" ? "The model is answering..." : "模型正在回答...";
  try {
    const result = await api("/api/test-model", {
      method: "POST",
      body: JSON.stringify({ question, ...collectSettingsForm() })
    });
    const meta = result.meta || {};
    els.modelTestMeta.textContent = [
      `Provider: ${meta.provider || "unknown"}`,
      `${state.language === "en" ? "Requested model" : "请求模型"}: ${meta.requestedModel || "unknown"}`,
      `${state.language === "en" ? "Response model" : "响应模型"}: ${meta.responseModel || (state.language === "en" ? "not returned" : "未返回")}`,
      meta.thinking ? `Thinking: ${meta.thinking}` : "",
      meta.maxTokens ? `Max tokens: ${meta.maxTokens}` : "",
      `Endpoint: ${meta.endpoint || "unknown"}`,
      meta.responseId ? `Response ID: ${meta.responseId}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    els.modelTestAnswer.textContent = result.answer || (state.language === "en" ? "The model returned no content" : "模型没有返回内容");
  } catch (err) {
    els.modelTestMeta.textContent = state.language === "en" ? "Request failed" : "请求失败";
    els.modelTestAnswer.textContent = state.language === "en" ? `Test failed: ${err.message}` : `测试失败：${err.message}`;
  } finally {
    done();
  }
});

resetTopicForm();
loadState().catch((err) => toast(err.message));

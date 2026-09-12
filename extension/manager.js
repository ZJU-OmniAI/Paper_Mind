import { DEFAULT_TAG_POLICY, tagKey as canonicalTagKey, splitTags, suggestTags, paperSearchScore, matchesText, safeWebUrl } from "./library-tools.js";
import { handleApi } from "./storage.js";

const VALUE_SCORE_LABELS = {
  zh: {
    1: "故事理念",
    2: "方法参考",
    3: "热点引领",
    4: "开创新坑",
    5: "传世经典"
  },
  en: {
    1: "Story idea",
    2: "Method reference",
    3: "Trend signal",
    4: "New direction",
    5: "Classic"
  }
};

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
  paperLlmSearch: null,
  libraryTagIds: [],
  libraryPage: 1,
  libraryTagLimit: 16,
  tagDisplayLimit: 48,
  searchRequest: 0,
  tagSearchRequest: 0,
  tagLlmSearch: null,
  abstractLang: localStorage.getItem("abstractLang") === "en" ? "en" : "zh",
  // 展开了正文的材料 id（一条记录可以挂多份材料）
  expandedClipIds: new Set(),
  // file:// 图片加载失败过一次，说明 Chrome 没给扩展开"允许访问文件网址"
  clipFileAccessBlocked: false,
  // 「重新下载图片」按钮的恢复函数，后台跑完广播回来时调用
  clipArchiveRestore: null,
  // 当前详情页剪藏图片的本地副本：{ paperId, urlMap: Map(原图地址 -> blob URL) }
  clipAssets: null,
  lastSyncedAt: 0,
  pendingMerges: [],
  reviewedMergeCount: 0,
  draggedTagId: null,
  paperDetailEditing: false,
  paperFormSubmitting: false,
  activeTopicPackId: null,
  editingTopicPackId: null,
  paperLibraryMode: localStorage.getItem("paperLibraryMode") || "list",
  tagLibraryView: localStorage.getItem("tagLibraryView") || "flat",
  tagGroupThreshold: Math.min(90, Math.max(10, Number(localStorage.getItem("tagGroupThreshold")) || 50)),
  selectedMapTagIds: [],
  selectedMapPaperId: null,
  paperMapFocus: localStorage.getItem("paperMapFocus") || "on",
  citationRefreshing: new Set(),
  citationRefreshStarted: false,
  // 各后端可用模型清单 { provider: {models, recommended, source, updatedAt, error} }
  modelCatalog: {},
  // 手动填模型名的后端（下拉框选了"自定义"）
  customModelProviders: new Set(),
  modelsAutoRefreshed: new Set()
};

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  languageLabel: document.querySelector("#languageLabel"),
  languageSelect: document.querySelector("#languageSelect"),
  modelStatus: document.querySelector("#modelStatus"),
  paperCount: document.querySelector("#paperCount"),
  tagCount: document.querySelector("#tagCount"),
  paperForm: document.querySelector("#paperForm"),
  paperValueScoreLabel: document.querySelector("#paperValueScoreLabel"),
  paperValueScore: document.querySelector("#paperValueScore"),
  paperValueScoreText: document.querySelector("#paperValueScoreText"),
  previewTags: document.querySelector("#previewTags"),
  addManualTagButton: document.querySelector("#addManualTagButton"),
  manualTagList: document.querySelector("#manualTagList"),
  paperList: document.querySelector("#paperList"),
  paperFilter: document.querySelector("#paperFilter"),
  paperLibraryFilter: document.querySelector("#paperLibraryFilter"),
  paperLibraryLlmSearchButton: document.querySelector("#paperLibraryLlmSearchButton"),
  paperLibrarySort: document.querySelector("#paperLibrarySort"),
  refreshCitationsButton: document.querySelector("#refreshCitationsButton"),
  paperLibraryListMode: document.querySelector("#paperLibraryListMode"),
  paperLibraryMapMode: document.querySelector("#paperLibraryMapMode"),
  paperMapFilter: document.querySelector("#paperMapFilter"),
  paperMapMatchMode: document.querySelector("#paperMapMatchMode"),
  paperMapFocusToggle: document.querySelector("#paperMapFocusToggle"),
  paperMapClearButton: document.querySelector("#paperMapClearButton"),
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
  refreshPaperDetailCitationButton: document.querySelector("#refreshPaperDetailCitationButton"),
  editPaperDetailButton: document.querySelector("#editPaperDetailButton"),
  paperDetailReadView: document.querySelector("#paperDetailReadView"),
  paperDetailAbstract: document.querySelector("#paperDetailAbstract"),
  paperDetailClips: document.querySelector("#paperDetailClips"),
  paperDetailClipWarning: document.querySelector("#paperDetailClipWarning"),
  openClipFolderButton: document.querySelector("#openClipFolderButton"),
  absorbPaperButton: document.querySelector("#absorbPaperButton"),
  absorbDialog: document.querySelector("#absorbDialog"),
  absorbFilter: document.querySelector("#absorbFilter"),
  absorbList: document.querySelector("#absorbList"),
  closeAbsorbDialog: document.querySelector("#closeAbsorbDialog"),
  abstractLangToggle: document.querySelector("#abstractLangToggle"),
  translateAbstractButton: document.querySelector("#translateAbstractButton"),
  paperDetailConversation: document.querySelector("#paperDetailConversation"),
  toggleConversationButton: document.querySelector("#toggleConversationButton"),
  paperDetailLinks: document.querySelector("#paperDetailLinks"),
  paperLinkForm: document.querySelector("#paperLinkForm"),
  paperLinkUrl: document.querySelector("#paperLinkUrl"),
  paperLinkTitle: document.querySelector("#paperLinkTitle"),
  paperLinkSubmit: document.querySelector("#paperLinkSubmit"),
  paperDetailTagForm: document.querySelector("#paperDetailTagForm"),
  paperDetailTitleInput: document.querySelector("#paperDetailTitleInput"),
  paperDetailValueScoreLabel: document.querySelector("#paperDetailValueScoreLabel"),
  paperDetailValueScore: document.querySelector("#paperDetailValueScoreInput"),
  paperDetailValueScoreText: document.querySelector("#paperDetailValueScoreText"),
  paperDetailAbstractInput: document.querySelector("#paperDetailAbstractInput"),
  paperDetailClipsEditor: document.querySelector("#paperDetailClipsEditor"),
  paperDetailConversationInput: document.querySelector("#paperDetailConversationInput"),
  addDetailTagButton: document.querySelector("#addDetailTagButton"),
  paperDetailTagList: document.querySelector("#paperDetailTagList"),
  cancelPaperDetailEditButton: document.querySelector("#cancelPaperDetailEditButton"),
  tagSimilarPaperList: document.querySelector("#tagSimilarPaperList"),
  loadLlmSimilarButton: document.querySelector("#loadLlmSimilarButton"),
  llmSimilarMeta: document.querySelector("#llmSimilarMeta"),
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
  tagThresholdControl: document.querySelector("#tagThresholdControl"),
  tagThresholdLabel: document.querySelector("#tagThresholdLabel"),
  tagThresholdRange: document.querySelector("#tagThresholdRange"),
  tagThresholdValue: document.querySelector("#tagThresholdValue"),
  tagTree: document.querySelector("#tagTree"),
  tagDetail: document.querySelector("#tagDetail"),
  tagCurationStatus: document.querySelector("#tagCurationStatus"),
  tagLibraryFilter: document.querySelector("#tagLibraryFilter"),
  tagLibraryLlmSearchButton: document.querySelector("#tagLibraryLlmSearchButton"),
  analyzeRedundantTagsButton: document.querySelector("#analyzeRedundantTagsButton"),
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
  kimiKey: document.querySelector("#kimiKey"),
  kimiModel: document.querySelector("#kimiModel"),
  kimiBaseUrl: document.querySelector("#kimiBaseUrl"),
  deepseekKey: document.querySelector("#deepseekKey"),
  deepseekModel: document.querySelector("#deepseekModel"),
  deepseekBaseUrl: document.querySelector("#deepseekBaseUrl"),
  clearQwenKey: document.querySelector("#clearQwenKey"),
  clearZhipuKey: document.querySelector("#clearZhipuKey"),
  clearKimiKey: document.querySelector("#clearKimiKey"),
  clearDeepseekKey: document.querySelector("#clearDeepseekKey"),
  exportDataButton: document.querySelector("#exportDataButton"),
  importDataButton: document.querySelector("#importDataButton"),
  importDataInput: document.querySelector("#importDataInput"),
  openModelTest: document.querySelector("#openModelTest"),
  refreshAllModels: document.querySelector("#refreshAllModels"),
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
    appName: "Paper_Mind",
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
    manualTagsOnly: "人工选择标签 · AI 编写说明",
    paperTitle: "论文标题",
    paperTitlePlaceholder: "输入论文标题",
    valueScore: "价值评分",
    citations: (count) => `被引 ${count}`,
    citationsUnknown: "被引 暂无",
    citationsLoading: "被引更新中…",
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
    quickPaperSearch: "快速检索论文或标签（本地）",
    quickTagSearch: "快速检索标签（本地）",
    paperLibraryListView: "平铺列表",
    paperLibraryMapView: "标签映射",
    paperLibrarySort: "排序",
    sortBySimilarity: "标签相似",
    sortByCreated: "最近添加",
    sortByUpdated: "最近更新",
    sortByTitle: "标题",
    sortByCitations: "引用量",
    refreshCitations: "刷新全部引用量",
    refreshCitationsBusy: "刷新中…",
    refreshCitationsRunning: "正在刷新引用量，请稍候…",
    refreshCitationsStart: (count) => `开始从 Semantic Scholar 刷新 ${count} 篇，逐篇限速，请耐心等待…`,
    refreshCitationsEmpty: "论文库里还没有论文",
    refreshCitationsSummary: (s) =>
      `刷新完成：成功 ${s.ok}，未找到 ${s.notfound}，限流 ${s.blocked}，失败 ${s.error}（共 ${s.total} 篇）` +
      (s.blocked ? "。被限流（429）的请稍后再点一次刷新即可补齐" : ""),
    refreshOneCitation: "更新引用量",
    refreshOneCitationBusy: "更新中…",
    refreshOneCitationOk: (count) => `引用量已更新：被引 ${count}`,
    refreshOneCitationNotFound: "未找到该论文的引用量",
    refreshOneCitationFailed: "引用量获取失败，请稍后重试",
    paperClusters: (count) => `${count} 个标签簇`,
    untaggedCluster: "待归类",
    clusterPaperCount: (count) => `${count} 篇论文`,
    mapTitle: "标签-论文映射",
    mapHint: "点击标签或论文，高亮它们之间的映射关系",
    mapFilterPlaceholder: "搜索标签或论文",
    mapMatchAny: "包含任一标签",
    mapMatchAll: "包含全部标签",
    mapFocusToggle: "聚焦所选",
    mapFocusTitle: "开启后，选中标签或论文时只显示相关项，不用长距离滚动；关闭则只高亮不隐藏",
    mapClearSelection: "清除选择",
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
    updateRecommendations: "LLM 更新推荐",
    recommendedAt: (time) => `推荐于 ${time}`,
    noNewPapersSinceLast: "上次推荐后没有新增论文，推荐保持不变",
    autoRecommendDone: (title) => `已自动为「${title}」生成 LLM 相似推荐`,
    llmSearch: "LLM 检索",
    llmSearchNeedQuery: "先在检索框输入你想找什么，再点 LLM 检索",
    llmSearchPaperTitle: (query, count) => `LLM 检索「${query}」· ${count} 篇候选`,
    llmSearchTagHead: (query, count) => `LLM 检索「${query}」· ${count} 个候选标签 · 修改检索框内容可返回全部`,
    llmSearchNoResults: "模型没有找到相关候选",
    llmSearchFallback: (error) => `模型不可用，已用本地规则检索：${error}`,
    translateAbstract: "翻译成中文",
    translating: "翻译中…",
    abstractTranslatedToast: (title) => `已生成「${title}」的中文摘要`,
    llmSimilarStoredEmpty: "模型上次没有找到足够相似的论文，添加新论文后可点更新",
    llmSimilarEmpty: "点击生成推荐后，模型会仔细阅读每篇论文的简介和对话记录来推荐相似论文",
    keySavedPlaceholder: "已保存 · 留空表示不修改",
    keyMissingPlaceholder: "尚未配置，输入 API Key",
    externalLinks: "外部资料",
    linkUrlPlaceholder: "粘贴链接，如小红书 / 知乎 / 公众号文章",
    linkTitlePlaceholder: "备注标题（可选）",
    addLink: "添加链接",
    addingLink: "添加中...",
    noLinks: "暂无外部资料，可以把小红书、知乎、公众号等解读链接存到这里",
    linkAdded: "链接已添加",
    linkDeleted: "链接已删除",
    deleteLink: "删除链接",
    confirmDeleteLink: (title) => `删除外部资料「${title}」？`,
    invalidLink: "链接需要以 http:// 或 https:// 开头",
    webLink: "网页",
    refreshPreview: "刷新预览",
    refreshingPreview: "抓取中...",
    previewRefreshed: "预览已更新",
    previewNotFound: "没抓到这个页面的预览信息，可能需要登录或有反爬",
    conversationHeading: "alphaXiv 对话记录",
    expandConversation: "展开全部",
    collapseConversation: "收起",
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
    tagViewGrouped: "按主题分组",
    tagViewFlat: "平铺",
    tagThresholdLabel: "分组阈值",
    tagThresholdTitle: "标签的论文重合度达到该值才归入同组：调低 → 组更大更少；调高 → 组更小更准",
    tagGroupOther: "其他",
    tagGroupMeta: (tagCount, paperCount) => `${tagCount} 个标签 · ${paperCount} 篇论文`,
    uncurated: "未整理",
    generateMergeSuggestions: "LLM 生成合并建议",
    analyzeRedundantTags: "分析冗余标签",
    redundancyNoSuggestions: "没有发现论文集合完全一致的冗余标签",
    redundancySuggestions: (count) => `发现 ${count} 条冗余标签建议，请逐条审核`,
    keepTag: "保留标签",
    tagDetail: "标签详情",
    clickTag: "点击左侧标签",
    modelSettings: "模型设置",
    apiKeyLocal: "API Key 仅保存在 Chrome 插件本地存储",
    defaultModel: "默认模型",
    saveSettings: "保存设置",
    testModel: "测试模型",
    refreshAllModels: "刷新全部模型列表",
    refreshModelsTitle: (name) => `拉取 ${name} 当前可用模型`,
    customModelOption: "自定义（手动填模型名）",
    customModelPlaceholder: "手动填模型名",
    modelTraitReasoning: "会深度思考",
    modelTraitFast: "快、便宜",
    modelTraitQuality: "效果好、贵一点",
    modelTraitVision: "能看图",
    modelTraitLong: "能读长文",
    modelTraitCode: "偏写代码",
    modelCatalogRemote: (count, time) => `${count} 个可用模型 · ${time} 拉取 · 🔄 可再拉一次`,
    modelCatalogPreset: "内置备选清单，点 🔄 拉取该后端当前可用模型",
    modelCatalogNoKey: "先填好 API Key（或先保存），再点 🔄 拉取可用模型",
    modelCatalogFailed: (message) => `拉取失败：${message}（先用内置备选清单）`,
    refreshingModels: "拉取中...",
    modelsRefreshed: (name, count) => `${name}：拉到 ${count} 个可用模型`,
    modelsRefreshFailed: (name, message) => `${name} 拉取失败：${message}`,
    modelsRefreshNoKey: (name) => `${name} 还没有 API Key，先填 Key 再拉取`,
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
    clipHeading: "网页正文",
    clipMaterials: (count) => `网页正文 · ${count} 份材料`,
    clipNth: (index) => `材料 ${index}`,
    clipEditTitle: (index) => `材料 ${index} 标题`,
    deleteClip: "删除这份",
    confirmDeleteClip: (title) => `确定删除「${title}」这份材料吗？磁盘上已存的图片文件不会被删。`,
    clipDeleted: "已删除这份材料",
    clipDeletedKeepFiles: (dir) => `已删除这份材料，图片文件仍留在 ${dir}`,
    absorbPaper: "并入另一篇",
    absorbTitle: "并入另一篇论文",
    absorbHint: "当前这篇会被并进你选中的论文，剪藏材料、外部链接和标签都会搬过去，然后这条记录消失",
    absorbFilter: "搜索目标论文",
    confirmAbsorb: (source, target) => `把《${source}》并进《${target}》？并完之后前者会消失。`,
    absorbed: (title) => `已并入《${title}》`,
    notesHeading: "备注 / 对话记录",
    clipBadge: (count) => (count > 1 ? `网页剪藏 ${count} 份` : "网页剪藏"),
    clipEditLabel: "网页正文（Markdown，清空即删除剪藏）",
    expandClip: "展开全文",
    collapseClip: "收起正文",
    refreshClipAssets: "重新下载图片",
    refreshingClipAssets: "下载中…",
    clipMeta: (words, images) => `${words} 字${images ? ` · ${images} 张图` : ""}`,
    clipAssetsDone: (saved) => `${saved} 张图已存到磁盘`,
    clipAssetsPartial: (saved, total) => `磁盘上 ${saved}/${total} 张，其余仍走原链接`,
    clipAssetsPending: "图片下载中…",
    clipAssetsMissing: "图片还没存到磁盘，公众号等站点可能显示不出来",
    clipAssetsToast: (title, saved, total) => `「${title}」已存 ${saved}/${total} 张图到磁盘`,
    clipAssetsFailedToast: (title) => `「${title}」图片下载失败`,
    openClipFolder: "打开图片文件夹",
    clipFolderHint: (dir) => `图片存在下载目录的 ${dir}`,
    clipFileAccessBlocked: "图片已经存到磁盘了，但 Chrome 还不允许本扩展读本地文件，所以这里显示的是网页原图（公众号会变成占位图）。去 chrome://extensions → Paper_Mind → 打开「允许访问文件网址」，回来刷新即可。",
    viewDetail: "查看详情",
    openSource: "打开链接",
    deletePaper: "删除论文",
    paperDeleted: "论文已删除，未被其他论文使用的标签也已清理",
    created: "创建",
    updated: "更新",
    valueScoreMeta: (label) => `价值评分：${label}`,
    unscored: "Null",
    similarity: "相似度",
    saving: "保存中...",
    generating: "生成中...",
    searching: "检索中...",
    paperSaved: "论文已保存，人工标签已加入标签库",
    duplicatePaperSaved: "这篇论文已存在，未重复添加；新标签已合并到已有论文",
    duplicatePaperMerged: "已合并到已有论文，标签、简介和对话记录已做并集",
    duplicatePrompt: (title, score) => `库里已有高度相似的论文：\n${title}\n相似度：${Math.round(score * 100)}%\n\n选择“确定”合并到已有论文；选择“取消”后可继续选择是否新建。`,
    duplicateCreatePrompt: "是否仍然新建一篇独立论文？",
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
    mergePrompt: "建议每篇使用 3–6 个核心标签。优先复用已有标签；保存后 AI 自动编写说明。",
    createTag: (name) => `新建标签：${name}`,
    tagInputPlaceholder: "搜索已有标签或输入新标签"
  },
  en: {
    appName: "Paper_Mind",
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
    manualTagsOnly: "Your tags · AI descriptions",
    paperTitle: "Paper title",
    paperTitlePlaceholder: "Enter paper title",
    valueScore: "Value score",
    citations: (count) => `${count} citations`,
    citationsUnknown: "Citations N/A",
    citationsLoading: "Updating citations…",
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
    quickPaperSearch: "Quick local search for papers or tags",
    quickTagSearch: "Quick local tag search",
    paperLibraryListView: "Paper List",
    paperLibraryMapView: "Tag Map",
    paperLibrarySort: "Sort",
    sortBySimilarity: "Tag similarity",
    sortByCreated: "Recently added",
    sortByUpdated: "Recently updated",
    sortByTitle: "Title",
    sortByCitations: "Citations",
    refreshCitations: "Refresh all citations",
    refreshCitationsBusy: "Refreshing…",
    refreshCitationsRunning: "Citation refresh already running, please wait…",
    refreshCitationsStart: (count) => `Refreshing ${count} papers from Semantic Scholar, rate-limited one by one…`,
    refreshCitationsEmpty: "No papers in the library yet",
    refreshCitationsSummary: (s) =>
      `Done: ${s.ok} ok, ${s.notfound} not found, ${s.blocked} rate-limited, ${s.error} failed (of ${s.total})` +
      (s.blocked ? ". Rate-limited (429) — just click refresh again later to fill them in" : ""),
    refreshOneCitation: "Update citations",
    refreshOneCitationBusy: "Updating…",
    refreshOneCitationOk: (count) => `Citations updated: ${count}`,
    refreshOneCitationNotFound: "No citation data found for this paper",
    refreshOneCitationFailed: "Failed to fetch citations, please try again later",
    paperClusters: (count) => `${count} tag clusters`,
    untaggedCluster: "Unsorted",
    clusterPaperCount: (count) => `${count} papers`,
    mapTitle: "Tag-Paper Map",
    mapHint: "Click a tag or paper to highlight their mapping",
    mapFilterPlaceholder: "Search tags or papers",
    mapMatchAny: "Any selected tag",
    mapMatchAll: "All selected tags",
    mapFocusToggle: "Focus selection",
    mapFocusTitle: "When on, selecting a tag or paper shows only related items instead of dimming the rest",
    mapClearSelection: "Clear selection",
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
    updateRecommendations: "Update via LLM",
    recommendedAt: (time) => `Recommended at ${time}`,
    noNewPapersSinceLast: "No new papers since the last run; recommendations unchanged",
    autoRecommendDone: (title) => `LLM recommendations generated for "${title}"`,
    llmSearch: "LLM Search",
    llmSearchNeedQuery: "Type what you're looking for first, then click LLM Search",
    llmSearchPaperTitle: (query, count) => `LLM search "${query}" · ${count} candidates`,
    llmSearchTagHead: (query, count) => `LLM search "${query}" · ${count} candidate tags · edit the filter box to show all`,
    llmSearchNoResults: "The model found no relevant candidates",
    llmSearchFallback: (error) => `Model unavailable; local search was used: ${error}`,
    translateAbstract: "Translate to Chinese",
    translating: "Translating...",
    abstractTranslatedToast: (title) => `Chinese abstract generated for "${title}"`,
    llmSimilarStoredEmpty: "The model found no similar papers last time; update after adding new papers",
    llmSimilarEmpty: "Click Generate and the model will read each paper's abstract and conversation to recommend similar papers",
    keySavedPlaceholder: "Saved · leave empty to keep",
    keyMissingPlaceholder: "Not configured, enter API key",
    externalLinks: "External Resources",
    linkUrlPlaceholder: "Paste a link, e.g. Xiaohongshu / Zhihu / WeChat article",
    linkTitlePlaceholder: "Note title (optional)",
    addLink: "Add Link",
    addingLink: "Adding...",
    noLinks: "No external resources yet; save Xiaohongshu, Zhihu, or WeChat links here",
    linkAdded: "Link added",
    linkDeleted: "Link deleted",
    deleteLink: "Delete link",
    confirmDeleteLink: (title) => `Delete external resource "${title}"?`,
    invalidLink: "The link must start with http:// or https://",
    webLink: "Web",
    refreshPreview: "Refresh preview",
    refreshingPreview: "Fetching...",
    previewRefreshed: "Preview updated",
    previewNotFound: "Could not fetch a preview; the page may require login or block crawlers",
    conversationHeading: "alphaXiv Conversation",
    expandConversation: "Show all",
    collapseConversation: "Collapse",
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
    tagViewGrouped: "By Topic",
    tagViewFlat: "Flat",
    tagThresholdLabel: "Threshold",
    tagThresholdTitle: "Minimum paper overlap for a tag to join a group: lower → fewer, larger groups; higher → smaller, tighter groups",
    tagGroupOther: "Other",
    tagGroupMeta: (tagCount, paperCount) => `${tagCount} tags · ${paperCount} papers`,
    uncurated: "Not Reviewed",
    generateMergeSuggestions: "Generate Merge Suggestions",
    analyzeRedundantTags: "Analyze Redundant Tags",
    redundancyNoSuggestions: "No redundant tags with identical paper sets were found",
    redundancySuggestions: (count) => `Found ${count} redundant-tag suggestions to review`,
    keepTag: "Keep Tag",
    tagDetail: "Tag Detail",
    clickTag: "Click a tag on the left",
    modelSettings: "Model Settings",
    apiKeyLocal: "API keys are stored locally in Chrome extension storage",
    defaultModel: "Default Model",
    saveSettings: "Save Settings",
    testModel: "Test Model",
    refreshAllModels: "Refresh All Model Lists",
    refreshModelsTitle: (name) => `Fetch models currently available on ${name}`,
    customModelOption: "Custom (type a model name)",
    customModelPlaceholder: "Type a model name",
    modelTraitReasoning: "deep thinking",
    modelTraitFast: "fast & cheap",
    modelTraitQuality: "higher quality",
    modelTraitVision: "reads images",
    modelTraitLong: "long context",
    modelTraitCode: "coding focused",
    modelCatalogRemote: (count, time) => `${count} models available · fetched ${time} · 🔄 to refetch`,
    modelCatalogPreset: "Built-in fallback list; click 🔄 to fetch what this provider offers now",
    modelCatalogNoKey: "Add (or save) the API key first, then click 🔄 to fetch available models",
    modelCatalogFailed: (message) => `Fetch failed: ${message} (showing the built-in fallback list)`,
    refreshingModels: "Fetching...",
    modelsRefreshed: (name, count) => `${name}: ${count} models available`,
    modelsRefreshFailed: (name, message) => `${name} fetch failed: ${message}`,
    modelsRefreshNoKey: (name) => `${name} has no API key yet; add one before fetching`,
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
    clipHeading: "Page content",
    clipMaterials: (count) => `Page content · ${count} materials`,
    clipNth: (index) => `Material ${index}`,
    clipEditTitle: (index) => `Material ${index} title`,
    deleteClip: "Remove",
    confirmDeleteClip: (title) => `Remove the material "${title}"? Images already saved to disk are kept.`,
    clipDeleted: "Material removed",
    clipDeletedKeepFiles: (dir) => `Material removed; the image files stay in ${dir}`,
    absorbPaper: "Merge into…",
    absorbTitle: "Merge into another paper",
    absorbHint: "This entry is merged into the paper you pick: clips, links, and tags move over, then this entry disappears",
    absorbFilter: "Search target paper",
    confirmAbsorb: (source, target) => `Merge "${source}" into "${target}"? The former will disappear.`,
    absorbed: (title) => `Merged into "${title}"`,
    notesHeading: "Notes / Conversation",
    clipBadge: (count) => (count > 1 ? `${count} web clips` : "Web clip"),
    clipEditLabel: "Page content (Markdown; clearing it removes the clip)",
    expandClip: "Expand",
    collapseClip: "Collapse",
    refreshClipAssets: "Re-download images",
    refreshingClipAssets: "Downloading...",
    clipMeta: (words, images) => `${words} chars${images ? ` · ${images} images` : ""}`,
    clipAssetsDone: (saved) => `${saved} images saved to disk`,
    clipAssetsPartial: (saved, total) => `${saved}/${total} images on disk; the rest still load from the source`,
    clipAssetsPending: "Downloading images...",
    clipAssetsMissing: "Images are not on disk yet and may fail to load",
    clipAssetsToast: (title, saved, total) => `"${title}": ${saved}/${total} images saved to disk`,
    clipAssetsFailedToast: (title) => `"${title}": image download failed`,
    openClipFolder: "Open image folder",
    clipFolderHint: (dir) => `Images are in ${dir} inside your downloads folder`,
    clipFileAccessBlocked: "The images are on disk, but Chrome does not let this extension read local files yet, so the originals are shown instead (WeChat serves a placeholder). Enable \"Allow access to file URLs\" for Paper_Mind in chrome://extensions, then reload this page.",
    viewDetail: "View Detail",
    openSource: "Open Link",
    deletePaper: "Delete Paper",
    paperDeleted: "Paper deleted; unused tags were cleaned up",
    created: "Created",
    updated: "Updated",
    valueScoreMeta: (label) => `Value score: ${label}`,
    unscored: "Null",
    similarity: "Similarity",
    saving: "Saving...",
    generating: "Generating...",
    searching: "Searching...",
    paperSaved: "Paper saved and manual tags were added",
    duplicatePaperSaved: "This paper already exists. It was not duplicated; new tags were merged into the existing paper",
    duplicatePaperMerged: "Merged into the existing paper; tags, abstract, and conversation were unioned",
    duplicatePrompt: (title, score) => `A highly similar paper already exists:\n${title}\nSimilarity: ${Math.round(score * 100)}%\n\nChoose OK to merge into the existing paper. Choose Cancel to decide whether to create a separate paper.`,
    duplicateCreatePrompt: "Create a separate new paper anyway?",
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
    mergePrompt: "Use 3–6 core tags. Reuse existing tags; AI writes descriptions after saving.",
    createTag: (name) => `Create tag: ${name}`,
    tagInputPlaceholder: "Search existing tags or enter a new tag"
  }
};

const ui = (zh, en) => state.language === "en" ? en : zh;
function renderLibraryLabels() {
  const labels = {
    libraryEyebrow: ["从记忆中的概念出发", "START WITH WHAT YOU REMEMBER"],
    libraryHeading: ["通过脑海中的标签，找到你的论文", "Find your papers through the tags you remember"],
    libraryHint: ["从记得的关键词或概念开始，搜索并选择标签，找回读过的论文。", "Start with a keyword or concept you remember. Search and select tags to find papers you have read."],
    libraryAddPaper: ["＋ 添加论文", "+ Add paper"],
    clearLibraryFilters: ["清除筛选", "Clear filters"],
    librarySearchHelp: ["多个关键词用空格分隔；英文短语可加双引号。⌘ / Ctrl K 快速搜索", 'Separate keywords with spaces; use quotes for phrases. ⌘ / Ctrl K to search'],
    tagHealthTitle: ["让标签保持精简", "A focused tag library"],
    describeTagsButton: ["补全 / 更新标签说明", "Update tag descriptions"],
    tagPolicyLegend: ["标签管理", "Tag management"],
    maxTagsPerPaperLabel: ["每篇论文标签上限", "Tags per paper"],
    maxTagsLabel: ["标签库总数上限", "Total tag limit"],
    autoDescribeTagsLabel: ["保存后自动用 LLM 生成或更新标签说明", "Automatically write tag descriptions with AI after saving"],
    tagPolicyHint: ["优先复用已有标签与别名。上限只限制新增，不删除已有标签。自动说明会将关联论文的摘要、笔记和正文片段发送给你配置的模型。", "Reuse existing tags and aliases. Limits apply to additions; existing tags are kept. Descriptions send excerpts of linked papers and notes to your configured model."]
  };
  for (const [id, text] of Object.entries(labels)) {
    const el = document.getElementById(id);
    if (el && !el.disabled) el.textContent = ui(...text);
  }
  document.getElementById("libraryTagFilter").placeholder = ui("查找标签或标签说明", "Find tags or descriptions");
  els.paperLibraryFilter.placeholder = ui("搜索标题、标签、说明与正文…", "Search titles, tags, descriptions and content…");
  document.getElementById("libraryMatchMode").options[0].textContent = ui("包含全部所选标签", "Match all selected tags");
  document.getElementById("libraryMatchMode").options[1].textContent = ui("包含任一所选标签", "Match any selected tag");
  document.getElementById("libraryMinScore").options[0].textContent = ui("全部评分", "Any score");
  for (const option of [...document.getElementById("libraryMinScore").options].slice(1)) option.textContent = ui("评分 ≥ ", "Score ≥ ") + option.value;
}

function tagDescriptionLabel(tag) {
  if (isSystemTag(tag)) return tag.description;
  if (tag.description) return tag.description;
  return tag.descriptionError || ui("等待 AI 根据关联论文生成说明", "Awaiting a description from linked papers");
}

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 无序/有序列表项：捕获缩进、标记、标记后空白、正文
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])(\s+)(\S.*)$/;
const CJK_CHAR = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;

// 没有引入 KaTeX，公式只做"尽力而为"的可读化：常见命令转 Unicode，上下标转 sub/sup
const MATH_SYMBOLS = {
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\epsilon": "ε", "\\varepsilon": "ε",
  "\\zeta": "ζ", "\\eta": "η", "\\theta": "θ", "\\vartheta": "ϑ", "\\iota": "ι", "\\kappa": "κ",
  "\\lambda": "λ", "\\mu": "μ", "\\nu": "ν", "\\xi": "ξ", "\\pi": "π", "\\rho": "ρ", "\\sigma": "σ",
  "\\tau": "τ", "\\upsilon": "υ", "\\phi": "φ", "\\varphi": "φ", "\\chi": "χ", "\\psi": "ψ", "\\omega": "ω",
  "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ", "\\Lambda": "Λ", "\\Xi": "Ξ", "\\Pi": "Π",
  "\\Sigma": "Σ", "\\Upsilon": "Υ", "\\Phi": "Φ", "\\Psi": "Ψ", "\\Omega": "Ω",
  "\\times": "×", "\\cdot": "·", "\\div": "÷", "\\pm": "±", "\\mp": "∓", "\\odot": "⊙", "\\oplus": "⊕",
  "\\leq": "≤", "\\le": "≤", "\\geq": "≥", "\\ge": "≥", "\\neq": "≠", "\\ne": "≠", "\\approx": "≈",
  "\\equiv": "≡", "\\sim": "∼", "\\propto": "∝", "\\ll": "≪", "\\gg": "≫",
  "\\rightarrow": "→", "\\leftarrow": "←", "\\leftrightarrow": "↔", "\\Rightarrow": "⇒", "\\Leftarrow": "⇐",
  "\\to": "→", "\\mapsto": "↦", "\\uparrow": "↑", "\\downarrow": "↓",
  "\\infty": "∞", "\\partial": "∂", "\\nabla": "∇", "\\sum": "Σ", "\\prod": "∏", "\\int": "∫",
  "\\sqrt": "√", "\\in": "∈", "\\notin": "∉", "\\subseteq": "⊆", "\\subset": "⊂", "\\supseteq": "⊇",
  "\\cup": "∪", "\\cap": "∩", "\\forall": "∀", "\\exists": "∃", "\\emptyset": "∅",
  "\\angle": "∠", "\\perp": "⊥", "\\parallel": "‖", "\\ldots": "…", "\\cdots": "⋯", "\\dots": "…",
  "\\star": "⋆", "\\ast": "∗", "\\circ": "∘", "\\lVert": "‖", "\\rVert": "‖", "\\|": "‖",
  "\\ell": "ℓ", "\\top": "⊤", "\\bot": "⊥", "\\otimes": "⊗", "\\prime": "′", "\\degree": "°",
  "\\langle": "⟨", "\\rangle": "⟩", "\\lfloor": "⌊", "\\rfloor": "⌋", "\\lceil": "⌈", "\\rceil": "⌉",
  "\\%": "%", "\\&": "&", "\\#": "#", "\\_": "_", "\\{": "{", "\\}": "}", "\\$": "$", "\\\\": " "
};

// \hat{z} 之类的重音符：用组合变音符号贴回字母上，保住 ẑ 和 z 的区别
const MATH_ACCENTS = {
  hat: "̂", bar: "̄", tilde: "̃", vec: "⃗",
  dot: "̇", ddot: "̈", check: "̌", acute: "́", grave: "̀"
};
// 长命令优先，避免 \subset 把 \subseteq 吃掉
const MATH_SYMBOL_RULES = Object.entries(MATH_SYMBOLS)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([command, symbol]) => [
    new RegExp(escapeRegExp(command) + (/[a-zA-Z]$/.test(command) ? "(?![a-zA-Z])" : ""), "g"),
    symbol
  ]);

// 上下标能承接的单个符号：字母数字、希腊字母、ℓ 这类字母符号（避开 & 以免咬碎 HTML 实体）
const MATH_SCRIPT_CHAR = "[\\w\\u0370-\\u03ff\\u2100-\\u214f]";

function prettifyMath(source) {
  let text = String(source || "").trim();
  text = text.replace(/\\(?:left|right|displaystyle|limits|nonumber|quad|qquad|,|;|:|!)(?![a-zA-Z])/g, "");
  text = text.replace(/\\(?:text|textit|textbf|textrm|mathrm|mathbf|mathit|mathcal|mathbb|operatorname)\s*\{([^{}]*)\}/g, "$1");
  text = text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  text = text.replace(/\\(hat|bar|tilde|vec|ddot|dot|check|acute|grave)\s*(?:\{(\S)\}|(\S))/g, (_, accent, braced, bare) => `${braced || bare}${MATH_ACCENTS[accent]}`);
  for (const [pattern, symbol] of MATH_SYMBOL_RULES) text = text.replace(pattern, symbol);
  // 剩下没收录的命令去掉反斜杠，留个可读的词比留个 \foo 好看
  text = text.replace(/\\([a-zA-Z]+)/g, "$1");
  return escapeHtml(text)
    .replace(/\^\{([^{}]*)\}/g, "<sup>$1</sup>")
    .replace(/_\{([^{}]*)\}/g, "<sub>$1</sub>")
    .replace(new RegExp(`\\^(${MATH_SCRIPT_CHAR})`, "g"), "<sup>$1</sup>")
    .replace(new RegExp(`_(${MATH_SCRIPT_CHAR})`, "g"), "<sub>$1</sub>")
    .replace(/[{}]/g, "");
}

// alphaXiv 会在正文里插 <alphaxiv-paper-citation paper=... title=... page=...>，转成可点的引用角标
function renderCitationTag(attributes) {
  const attribute = (name) => (attributes.match(new RegExp(`${name}="([^"]*)"`, "i")) || [])[1] || "";
  const paper = attribute("paper");
  const label = attribute("title") || paper || "citation";
  const page = attribute("page");
  if (!paper) return `<span class="md-citation">${escapeHtml(label)}</span>`;
  const href = `https://www.alphaxiv.org/abs/${encodeURIComponent(paper)}${page ? `?page=${encodeURIComponent(page)}` : ""}`;
  return `<a class="md-citation" href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function renderInlineMarkdown(value) {
  const stash = [];
  // 已经定型的片段先占位存起来，避免后面的强调/转义规则把公式和代码打散
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  let text = String(value ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<alphaxiv-thinking-title\b[^>]*?title="([^"]*)"[^>]*>/gi, (_, title) => keep(`<span class="md-thinking">${escapeHtml(title)}</span>`))
    .replace(/<alphaxiv-paper-citation\b([^>]*)>/gi, (_, attributes) => keep(renderCitationTag(attributes)))
    .replace(/<(\/?)(details|summary|br)\b[^>]*>/gi, (_, slash, tag) => keep(`<${slash}${tag.toLowerCase()}>`))
    .replace(/`([^`]+)`/g, (_, code) => keep(`<code>${escapeHtml(code)}</code>`))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => keep(`<span class="md-math">${prettifyMath(math)}</span>`))
    .replace(/\$(?!\s)([^$\n]*[^\s$])\$/g, (_, math) => keep(`<span class="md-math">${prettifyMath(math)}</span>`));

  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>")
    .replace(/(?<![\w*])\*(?=\S)([^*\n]*\S)\*(?![\w*])/g, "<em>$1</em>")
    .replace(/(?<![\w_])_(?=\S)([^_\n]*\S)_(?![\w_])/g, "<em>$1</em>")
    .replace(/\u0000(\d+)\u0000/g, (_, index) => stash[Number(index)]);
}

function indentWidth(line) {
  return line.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
}

function isThematicBreak(line) {
  return /^(-\s*){3,}$|^(\*\s*){3,}$|^(_\s*){3,}$/.test(line);
}

function isTableDivider(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(trimmed);
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

// 段落内的换行拼回一行：中文之间不补空格，否则会多出难看的间隙
function joinWrappedLines(parts) {
  return parts.reduce((merged, line) => {
    if (!merged) return line;
    const glue = CJK_CHAR.test(merged.slice(-1)) && CJK_CHAR.test(line.slice(0, 1)) ? "" : " ";
    return merged + glue + line;
  }, "");
}

function startsNewBlock(line, nextLine) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return true;
  if (/^(```|~~~)/.test(trimmed)) return true;
  if (trimmed.startsWith("<!--")) return true;
  if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) return true;
  if (isThematicBreak(trimmed)) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (trimmed.startsWith(">")) return true;
  if (/^<\/?(details|summary)\b/i.test(trimmed)) return true;
  if (LIST_ITEM.test(line)) return true;
  if (trimmed.includes("|") && isTableDivider(nextLine)) return true;
  return false;
}

function renderTableBlock(head, alignments, rows) {
  const cell = (tag, value, column) => {
    const align = alignments[column];
    return `<${tag}${align ? ` style="text-align:${align}"` : ""}>${renderInlineMarkdown(value)}</${tag}>`;
  };
  const thead = `<thead><tr>${head.map((value, column) => cell("th", value, column)).join("")}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows.map((row) => `<tr>${head.map((_, column) => cell("td", row[column] ?? "", column)).join("")}</tr>`).join("")}</tbody>`
    : "";
  return `<div class="md-table-wrap"><table>${thead}${tbody}</table></div>`;
}

// 列表项开头的纯文字段落去掉 <p>，保持紧凑；后面跟的嵌套列表等块级结构原样保留
function unwrapSingleParagraph(html) {
  const match = html.match(/^<p>([\s\S]*?)<\/p>((?:<ul>|<ol)[\s\S]*)?$/);
  if (!match || match[1].includes("<p>")) return html;
  return match[1] + (match[2] || "");
}

function renderListBlock(blockLines, baseIndent) {
  const items = [];
  let current = null;
  for (const line of blockLines) {
    const item = indentWidth(line) === baseIndent ? line.match(LIST_ITEM) : null;
    if (item) {
      current = {
        marker: item[2],
        markerWidth: baseIndent + item[2].length + item[3].replace(/\t/g, "    ").length,
        content: [item[4]]
      };
      items.push(current);
      continue;
    }
    if (!current) continue;
    // 续行按标记宽度回退缩进，交给 renderBlocks 递归处理嵌套列表/代码块
    current.content.push(line.trim() ? line.replace(/^[ \t]+/, (lead) => " ".repeat(Math.max(0, lead.replace(/\t/g, "    ").length - current.markerWidth))) : "");
  }
  if (!items.length) return "";
  const body = items.map((item) => `<li>${unwrapSingleParagraph(renderBlocks(item.content))}</li>`).join("");
  if (!/^\d/.test(items[0].marker)) return `<ul>${body}</ul>`;
  const start = Number.parseInt(items[0].marker, 10);
  return `<ol${Number.isFinite(start) && start !== 1 ? ` start="${start}"` : ""}>${body}</ol>`;
}

/* ---- mermaid flowchart 的轻量渲染 ----
   对话记录里的图全是 flowchart LR，为它打包整个 mermaid（2MB+）不划算。
   这里只认实际用到的那一小撮语法，画成 SVG；认不出来就退回代码块原样显示。 */

const MERMAID_FONT = 12;
const MERMAID_LINE_HEIGHT = 17;
const MERMAID_PAD_X = 14;
const MERMAID_PAD_Y = 9;
const MERMAID_COLUMN_GAP = 60;
const MERMAID_ROW_GAP = 20;
const MERMAID_SHAPES = [
  [/^([\w-]+)\(\((.*)\)\)$/, "circle"],
  [/^([\w-]+)\[\((.*)\)\]$/, "cylinder"],
  [/^([\w-]+)\[\[(.*)\]\]$/, "subroutine"],
  [/^([\w-]+)\{\{(.*)\}\}$/, "hexagon"],
  [/^([\w-]+)\[(.*)\]$/, "rect"],
  [/^([\w-]+)\((.*)\)$/, "round"],
  [/^([\w-]+)\{(.*)\}$/, "diamond"],
  [/^([\w-]+)>(.*)\]$/, "flag"]
];

// 没有 canvas 量文字，按中文一个字宽、西文半个字宽估
function mermaidTextWidth(text) {
  let width = 0;
  for (const char of String(text)) width += CJK_CHAR.test(char) ? MERMAID_FONT : MERMAID_FONT * 0.56;
  return width;
}

function mermaidLabelLines(label) {
  const lines = String(label ?? "")
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : [""];
}

function parseMermaidNode(text, nodes, order) {
  const token = text.trim();
  if (!token) return null;
  for (const [pattern, shape] of MERMAID_SHAPES) {
    const match = token.match(pattern);
    if (!match) continue;
    const node = nodes.get(match[1]) || { id: match[1], shape, lines: [""], order: order.value++ };
    node.shape = shape;
    node.lines = mermaidLabelLines(match[2]);
    nodes.set(node.id, node);
    return node.id;
  }
  if (!/^[\w-]+$/.test(token)) return null;
  if (!nodes.has(token)) nodes.set(token, { id: token, shape: "rect", lines: [token], order: order.value++ });
  return token;
}

function parseMermaidFlowchart(source) {
  const lines = source.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("%%"));
  if (!lines.length) return null;
  const header = lines[0].match(/^(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)\s*$/i);
  if (!header) return null;

  const nodes = new Map();
  const edges = [];
  const groups = [];
  const order = { value: 0 };
  const stack = [];
  let unresolved = 0;

  for (const raw of lines.slice(1)) {
    if (/^direction\s+/i.test(raw)) continue;
    if (/^(style|classDef|class|linkStyle|click|linkStyle)\b/i.test(raw)) continue;
    if (/^end$/i.test(raw)) {
      stack.pop();
      continue;
    }
    const group = raw.match(/^subgraph\s+(.+)$/i);
    if (group) {
      const shaped = group[1].match(/^([\w-]+)\[(.*)\]$/);
      const entry = {
        id: shaped ? shaped[1] : group[1].trim(),
        lines: mermaidLabelLines(shaped ? shaped[2] : group[1]),
        members: []
      };
      groups.push(entry);
      stack.push(entry);
      continue;
    }

    // 带标签的连线有三种写法，先都归一成 `箭头|标签|`，后面只处理一种
    const line = raw
      .replace(/-\.\s*([^.|]+?)\s*\.->/g, "-.->|$1|")
      .replace(/--\s+([^|\n>-][^|\n>]*?)\s+-->/g, "-->|$1|")
      .replace(/==\s+([^|\n>=][^|\n>]*?)\s+==>/g, "==>|$1|");
    const arrows = /(-\.->|==>|-->|---)\s*(?:\|([^|]*)\|)?/g;
    const segments = [];
    let cursor = 0;
    let match;
    while ((match = arrows.exec(line))) {
      segments.push({ text: line.slice(cursor, match.index), arrow: match[1], label: match[2] || "" });
      cursor = arrows.lastIndex;
    }
    const owner = stack[stack.length - 1];
    if (!segments.length) {
      const only = parseMermaidNode(line, nodes, order);
      if (only && owner) owner.members.push(only);
      continue;
    }
    segments.push({ text: line.slice(cursor), arrow: null, label: "" });
    let previous = null;
    for (const segment of segments) {
      const id = parseMermaidNode(segment.text, nodes, order);
      if (!id) unresolved += 1;
      if (id && owner && !owner.members.includes(id)) owner.members.push(id);
      if (previous && id) edges.push({ from: previous.id, to: id, label: previous.label, dashed: previous.arrow === "-.->" });
      previous = id ? { id, label: segment.label, arrow: segment.arrow } : null;
    }
  }
  // 有认不出来的写法就整块退回代码块——画一张缺边的图比不画更误导
  if (unresolved) return null;

  if (!nodes.size) return null;
  // 子图当成一个整体节点参与布局，成员在它内部竖排
  for (const group of groups) {
    group.members = group.members.filter((id) => nodes.has(id) && id !== group.id);
    if (nodes.has(group.id)) nodes.get(group.id).isGroup = true;
  }
  return { direction: header[1].toUpperCase(), nodes: [...nodes.values()], edges, groups };
}

function layoutMermaid(graph) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const grouped = new Set();
  for (const group of graph.groups) {
    for (const id of group.members) grouped.add(id);
  }

  for (const node of graph.nodes) {
    const width = Math.max(...node.lines.map(mermaidTextWidth), 10) + MERMAID_PAD_X * 2;
    const height = node.lines.length * MERMAID_LINE_HEIGHT + MERMAID_PAD_Y * 2;
    const roomy = node.shape === "diamond" || node.shape === "circle" || node.shape === "hexagon";
    node.width = Math.max(roomy ? width * 1.3 : width, 64);
    node.height = Math.max(roomy ? height * 1.25 : height, 34);
  }
  // 子图节点撑到能装下所有成员
  for (const group of graph.groups) {
    const host = byId.get(group.id);
    if (!host || !group.members.length) continue;
    const members = group.members.map((id) => byId.get(id));
    host.width = Math.max(...members.map((m) => m.width)) + MERMAID_PAD_X * 2;
    host.height = members.reduce((sum, m) => sum + m.height, 0) + (members.length - 1) * 12
      + group.lines.length * MERMAID_LINE_HEIGHT + MERMAID_PAD_Y * 3;
    host.shape = "group";
    host.lines = group.lines;
  }

  const laidOut = graph.nodes.filter((node) => !grouped.has(node.id));
  const outgoing = new Map(laidOut.map((node) => [node.id, []]));
  const incoming = new Set();
  const spanning = graph.edges.filter((edge) => outgoing.has(edge.from) && outgoing.has(edge.to));
  for (const edge of spanning) {
    outgoing.get(edge.from).push(edge);
    incoming.add(edge.to);
  }

  // 先用 DFS 找出回边，剩下的当 DAG 做最长路径分层，避免环把层号顶到天上
  const state = new Map();
  const backEdges = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const edge of outgoing.get(id) || []) {
      const seen = state.get(edge.to) || 0;
      if (seen === 1) backEdges.add(edge);
      else if (seen === 0) visit(edge.to);
    }
    state.set(id, 2);
  };
  for (const node of laidOut) if (!state.get(node.id)) visit(node.id);

  const layer = new Map(laidOut.map((node) => [node.id, 0]));
  const forward = spanning.filter((edge) => !backEdges.has(edge));
  for (let pass = 0; pass <= laidOut.length; pass += 1) {
    let moved = false;
    for (const edge of forward) {
      if (layer.get(edge.to) < layer.get(edge.from) + 1) {
        layer.set(edge.to, layer.get(edge.from) + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const columns = [];
  for (const node of [...laidOut].sort((a, b) => a.order - b.order)) {
    const index = layer.get(node.id);
    (columns[index] ||= []).push(node);
  }

  // 带文字的连线要留出放标签的横向空间，否则标签会盖在方框上
  const gapAfter = columns.map(() => MERMAID_COLUMN_GAP);
  for (const edge of forward) {
    if (!edge.label) continue;
    const column = layer.get(edge.from);
    // 标签底衬会盖住连线，两头各留 28px 露出线段，否则看着像没连上
    const needed = Math.max(...mermaidLabelLines(edge.label).map(mermaidTextWidth)) + 64;
    if (needed > gapAfter[column]) gapAfter[column] = needed;
  }

  const rowHeight = Math.max(...laidOut.map((node) => node.height)) + MERMAID_ROW_GAP;
  const tallest = Math.max(...columns.map((column) => column.length));
  const height = tallest * rowHeight + 16;
  let x = 8;
  let trailing = 0;
  columns.forEach((column, index) => {
    const columnWidth = Math.max(...column.map((node) => node.width));
    column.forEach((node, row) => {
      node.x = x + (columnWidth - node.width) / 2;
      node.y = height / 2 + (row - (column.length - 1) / 2) * rowHeight - node.height / 2;
    });
    trailing = gapAfter[index];
    x += columnWidth + trailing;
  });
  x -= trailing;

  // 成员按声明顺序塞进子图框里
  for (const group of graph.groups) {
    const host = byId.get(group.id);
    if (!host || !group.members.length) continue;
    let top = host.y + group.lines.length * MERMAID_LINE_HEIGHT + MERMAID_PAD_Y * 2;
    for (const id of group.members) {
      const member = byId.get(id);
      member.x = host.x + (host.width - member.width) / 2;
      member.y = top;
      top += member.height + 12;
    }
  }

  return { nodes: graph.nodes, edges: graph.edges, byId, width: x + 8, height };
}

function mermaidShapeSvg(node) {
  const { x, y, width: w, height: h } = node;
  const points = (list) => list.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  switch (node.shape) {
    case "circle":
      return `<ellipse class="mm-shape" cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
    case "round":
    case "cylinder":
      return `<rect class="mm-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
    case "diamond":
      return `<polygon class="mm-shape" points="${points([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]])}"/>`;
    case "hexagon":
      return `<polygon class="mm-shape" points="${points([[x + 14, y], [x + w - 14, y], [x + w, y + h / 2], [x + w - 14, y + h], [x + 14, y + h], [x, y + h / 2]])}"/>`;
    case "flag":
      return `<polygon class="mm-shape" points="${points([[x, y], [x + w - 12, y], [x + w, y + h / 2], [x + w - 12, y + h], [x, y + h]])}"/>`;
    case "group":
      return `<rect class="mm-group" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`;
    default:
      return `<rect class="mm-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>`;
  }
}

function mermaidLabelSvg(node) {
  const centerX = node.x + node.width / 2;
  // 子图标题贴顶，普通节点文字居中
  const top = node.shape === "group"
    ? node.y + MERMAID_PAD_Y + MERMAID_LINE_HEIGHT * 0.75
    : node.y + node.height / 2 - ((node.lines.length - 1) * MERMAID_LINE_HEIGHT) / 2 + 4;
  return node.lines
    .map((line, row) => `<text class="mm-text${node.shape === "group" ? " mm-text-group" : ""}" x="${centerX.toFixed(1)}" y="${(top + row * MERMAID_LINE_HEIGHT).toFixed(1)}" text-anchor="middle">${escapeHtml(line)}</text>`)
    .join("");
}

function mermaidEdgeSvg(edge, byId) {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return "";
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  let path;
  let midX;
  let midY;
  if (endX >= startX) {
    const bend = Math.max((endX - startX) / 2, 18);
    path = `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
    midX = (startX + endX) / 2;
    midY = (startY + endY) / 2;
  } else {
    // 回边：从下方绕过去，免得和正向边糊在一起
    const dip = Math.max(from.height, to.height) / 2 + 26;
    const belowY = Math.max(startY, endY) + dip;
    path = `M ${from.x + from.width / 2} ${from.y + from.height} C ${from.x + from.width / 2} ${belowY}, ${to.x + to.width / 2} ${belowY}, ${to.x + to.width / 2} ${to.y + to.height}`;
    midX = (from.x + from.width / 2 + to.x + to.width / 2) / 2;
    midY = belowY - 4;
  }
  const line = `<path class="mm-edge${edge.dashed ? " mm-dashed" : ""}" d="${path}" marker-end="url(#mm-arrow)"/>`;
  if (!edge.label) return line;
  const labelLines = mermaidLabelLines(edge.label);
  const boxWidth = Math.max(...labelLines.map(mermaidTextWidth)) + 8;
  const boxHeight = labelLines.length * 14 + 4;
  const text = labelLines
    .map((entry, row) => `<text class="mm-edge-text" x="${midX.toFixed(1)}" y="${(midY - boxHeight / 2 + 14 + row * 14).toFixed(1)}" text-anchor="middle">${escapeHtml(entry)}</text>`)
    .join("");
  return `${line}<rect class="mm-edge-box" x="${(midX - boxWidth / 2).toFixed(1)}" y="${(midY - boxHeight / 2).toFixed(1)}" width="${boxWidth.toFixed(1)}" height="${boxHeight}" rx="3"/>${text}`;
}

function renderMermaidFlowchart(source) {
  let graph;
  try {
    graph = parseMermaidFlowchart(source);
    if (!graph) return "";
    graph = layoutMermaid(graph);
  } catch (error) {
    return "";
  }
  if (!Number.isFinite(graph.width) || !Number.isFinite(graph.height)) return "";
  // 回边要绕到框底下，给底部留点余量
  const height = Math.ceil(graph.height + 40);
  const width = Math.ceil(graph.width);
  const defs = '<defs><marker id="mm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="mm-arrow-head" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>';
  const shapes = graph.nodes.map((node) => `${mermaidShapeSvg(node)}${mermaidLabelSvg(node)}`).join("");
  const edges = graph.edges.map((edge) => mermaidEdgeSvg(edge, graph.byId)).join("");
  return `<div class="md-mermaid"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${defs}${edges}${shapes}</svg></div>`;
}

function renderBlocks(lines) {
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^(```|~~~)\s*([^\s`~]*)/);
    if (fence) {
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      if (fence[2].toLowerCase() === "mermaid") {
        const diagram = renderMermaidFlowchart(body.join("\n"));
        if (diagram) {
          html.push(diagram);
          continue;
        }
      }
      const language = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : "";
      html.push(`<pre><code${language}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // alphaXiv 会插 <!-- Bar Chart: ... --> 这类占位注释，整段丢掉
    if (trimmed.startsWith("<!--")) {
      while (index < lines.length && !lines[index].includes("-->")) index += 1;
      index += 1;
      continue;
    }

    const opener = trimmed.startsWith("$$") ? "$$" : trimmed.startsWith("\\[") ? "\\[" : "";
    const closer = opener === "$$" ? "$$" : "\\]";
    const opened = opener ? trimmed.slice(opener.length) : "";
    // 只有确实找得到结束定界符才当公式块，否则孤零零的 $$ 会把后面整篇吃掉
    if (opener && (opened.includes(closer) || lines.slice(index + 1).some((line) => line.includes(closer)))) {
      const body = [];
      let rest = "";
      let head = opened;
      index += 1;
      for (;;) {
        const closeAt = head.indexOf(closer);
        if (closeAt >= 0) {
          body.push(head.slice(0, closeAt));
          rest = head.slice(closeAt + closer.length).trim();
          break;
        }
        body.push(head);
        head = lines[index];
        index += 1;
      }
      html.push(`<div class="md-math-block">${prettifyMath(body.join("\n"))}</div>`);
      // 公式后面常跟着 [出处](链接) 之类的尾巴，单独成段
      if (rest) html.push(`<p>${renderInlineMarkdown(rest)}</p>`);
      continue;
    }

    if (isThematicBreak(trimmed)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    // <details>/<summary> 是 alphaXiv 折叠历史消息用的，直通输出，不要包进 <p>
    if (/^<\/?(details|summary)\b/i.test(trimmed)) {
      html.push(renderInlineMarkdown(trimmed));
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoted = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderBlocks(quoted)}</blockquote>`);
      continue;
    }

    if (trimmed.includes("|") && isTableDivider(lines[index + 1])) {
      const head = splitTableRow(trimmed);
      const alignments = splitTableRow(lines[index + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        if (left && right) return "center";
        if (right) return "right";
        return "";
      });
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().includes("|") && !isTableDivider(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      html.push(renderTableBlock(head, alignments, rows));
      continue;
    }

    if (LIST_ITEM.test(raw)) {
      const baseIndent = indentWidth(raw);
      const block = [];
      while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
          const next = lines[index + 1];
          // 空行后仍在更深缩进或同级列表项内，说明列表还没结束
          if (next && next.trim() && (indentWidth(next) > baseIndent || (indentWidth(next) === baseIndent && LIST_ITEM.test(next)))) {
            block.push("");
            index += 1;
            continue;
          }
          break;
        }
        const width = indentWidth(line);
        if (width < baseIndent) break;
        if (width === baseIndent && !LIST_ITEM.test(line)) break;
        block.push(line);
        index += 1;
      }
      html.push(renderListBlock(block, baseIndent));
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && !startsNewBlock(lines[index], lines[index + 1])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInlineMarkdown(joinWrappedLines(paragraph))}</p>`);
  }

  return html.join("");
}

function renderMarkdown(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return `<p class="empty">${escapeHtml(t("noConversation"))}</p>`;
  return renderBlocks(text.split("\n"));
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

function normalizeValueScore(value, fallback = 3) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  const base = Number.isFinite(numeric) ? numeric : fallback;
  if (base === null || base === undefined || base === "") return null;
  return Math.min(5, Math.max(1, Math.round(base * 2) / 2));
}

function valueScoreLabel(score) {
  const normalized = normalizeValueScore(score);
  if (normalized === null) return t("unscored");
  const labels = VALUE_SCORE_LABELS[state.language] || VALUE_SCORE_LABELS.zh;
  if (Number.isInteger(normalized)) return `${normalized}${state.language === "en" ? " pts" : "分"}=${labels[normalized]}`;
  const lower = Math.floor(normalized);
  const upper = Math.ceil(normalized);
  return `${normalized}${state.language === "en" ? " pts" : "分"}=${labels[lower]} / ${labels[upper]}`;
}

function paperValueScore(paper, fallback = null) {
  return normalizeValueScore(paper?.valueScore, fallback);
}

function paperTitleColor() {
  return "var(--ink)";
}

function paperTitleStyle(paper) {
  const color = paperTitleColor(paper);
  return color ? `color: ${color};` : "";
}

function paperTitleHtml(paper, tagName = "h4") {
  return `<${tagName} class="paper-title-by-score" style="${paperTitleStyle(paper)}">${escapeHtml(paper.title)}</${tagName}>`;
}

function renderValueScore(input, output) {
  const score = normalizeValueScore(input.value);
  input.value = String(score);
  output.textContent = valueScoreLabel(score);
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
  renderLibraryLabels();
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
  els.paperValueScoreLabel.textContent = t("valueScore");
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
  setPlaceholder("#paperLibraryFilter", ui("搜索标题、标签、说明与正文…", "Search titles, tags, descriptions and content…"));
  setText("#paperLibraryLlmSearchButton", t("llmSearch"));
  setText("#tagLibraryLlmSearchButton", t("llmSearch"));
  setText("#translateAbstractButton", t("translateAbstract"));
  setText("#paperLibraryTagMeta", t("sortedByPaperCount"));
  setText('[data-paper-library-mode="list"]', t("paperLibraryListView"));
  setText('[data-paper-library-mode="map"]', t("paperLibraryMapView"));
  setText("#paperLibrarySortLabel", t("paperLibrarySort"));
  els.paperLibrarySort.options[0].textContent = t("sortBySimilarity");
  els.paperLibrarySort.options[1].textContent = t("sortByCreated");
  els.paperLibrarySort.options[2].textContent = t("sortByUpdated");
  els.paperLibrarySort.options[3].textContent = t("sortByTitle");
  els.paperLibrarySort.options[4].textContent = t("sortByCitations");
  if (!state.citationRefreshStarted) els.refreshCitationsButton.textContent = t("refreshCitations");
  setText("#paperMapTitle", t("mapTitle"));
  setText("#paperMapHint", t("mapHint"));
  setPlaceholder("#paperMapFilter", t("mapFilterPlaceholder"));
  els.paperMapMatchMode.options[0].textContent = t("mapMatchAny");
  els.paperMapMatchMode.options[1].textContent = t("mapMatchAll");
  els.paperMapFocusToggle.textContent = t("mapFocusToggle");
  els.paperMapFocusToggle.title = t("mapFocusTitle");
  els.paperMapClearButton.textContent = t("mapClearSelection");

  setText("#backToPapersButton", t("backToPapers"));
  setText("#refreshPaperDetailCitationButton", t("refreshOneCitation"));
  setText("#editPaperDetailButton", t("editPaper"));
  setText("#cancelPaperDetailEditButton", t("cancelEdit"));
  setText("#paperDetailTitleLabel", t("paperTitle"));
  els.paperDetailValueScoreLabel.textContent = t("valueScore");
  setText("#paperDetailAbstractLabel", t("abstract"));
  setText("#openClipFolderButton", t("openClipFolder"));
  setText("#absorbPaperButton", t("absorbPaper"));
  setText("#absorbDialogTitle", t("absorbTitle"));
  setText("#absorbDialogHint", t("absorbHint"));
  setPlaceholder("#absorbFilter", t("absorbFilter"));
  setText("#paperDetailConversationLabel", t("conversation"));
  setText("#paperDetailAbstractHeading", t("abstract"));
  setText("#paperDetailConversationHeading", t("conversationHeading"));
  setText("#paperDetailLinksHeading", t("externalLinks"));
  setPlaceholder("#paperLinkUrl", t("linkUrlPlaceholder"));
  setPlaceholder("#paperLinkTitle", t("linkTitlePlaceholder"));
  setText("#paperLinkSubmit", t("addLink"));
  els.toggleConversationButton.textContent = state.conversationExpanded ? t("collapseConversation") : t("expandConversation");
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
  setText('[data-tag-view="grouped"]', t("tagViewGrouped"));
  setText('[data-tag-view="flat"]', t("tagViewFlat"));
  els.tagThresholdLabel.textContent = t("tagThresholdLabel");
  els.tagThresholdControl.title = t("tagThresholdTitle");
  setPlaceholder("#tagLibraryFilter", t("quickTagSearch"));
  setText("#analyzeRedundantTagsButton", t("analyzeRedundantTags"));
  setText("#refreshGraphButton", t("generateMergeSuggestions"));
  if (!state.activeTagId) {
    setText("#selectedTagName", t("tagDetail"));
    setText("#selectedTagMeta", t("clickTag"));
  }

  setText("#view-settings .panel-head h3", t("modelSettings"));
  setText("#view-settings .panel-head .muted", t("apiKeyLocal"));
  setText("#view-settings fieldset:not(.tag-policy-settings) legend", t("defaultModel"));
  setText("#settingsForm .primary-button", t("saveSettings"));
  setText("#openModelTest", t("testModel"));
  setText("#refreshAllModels", t("refreshAllModels"));
  renderModelPickers();
  setText("#dataTransferTitle", t("dataTransfer"));
  setText("#dataTransferHint", t("dataTransferHint"));
  setText("#exportDataButton", t("exportData"));
  setText("#importDataButton", t("importData"));

  els.viewTitle.textContent = t(document.querySelector(".nav-item.active")?.dataset.view || (state.activePaperId ? "paperDetail" : "library"));
  renderValueScore(els.paperValueScore, els.paperValueScoreText);
  renderValueScore(els.paperDetailValueScore, els.paperDetailValueScoreText);
}

const CITATION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
// Semantic Scholar 免费接口有共享限额，逐篇之间留较短且带抖动的间隔（约 1.2~2.4 秒）以避免触发 429。
const CITATION_REFRESH_DELAY_MS = 1200;
const CITATION_REFRESH_JITTER_MS = 1200;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const citationDelay = () => delay(CITATION_REFRESH_DELAY_MS + Math.floor(Math.random() * CITATION_REFRESH_JITTER_MS));

async function loadState() {
  const payload = await api("/api/state");
  state.papers = payload.papers || [];
  state.tags = payload.tags || [];
  state.topicPacks = payload.topicPacks || [];
  state.meta = payload.meta || {};
  state.config = payload.config || {};
  // 后端存过的模型清单先铺上，设置页立刻有东西可选，不用等联网
  state.modelCatalog = { ...(payload.config?.modelCatalog || {}), ...state.modelCatalog };
  state.lastSyncedAt = Date.now();
  applyLanguage();
  renderAll();
  refreshStaleCitations();
}

function citationIsStale(paper) {
  if (state.citationRefreshing.has(paper.id)) return false;
  const updated = Date.parse(paper.citationUpdatedAt || "") || 0;
  return !updated || Date.now() - updated > CITATION_MAX_AGE_MS;
}

async function refreshPaperCitation(paperId) {
  state.citationRefreshing.add(paperId);
  try {
    const result = await api(`/api/papers/${encodeURIComponent(paperId)}/citation`, { method: "POST" });
    const updated = result?.paper;
    if (updated) {
      const index = state.papers.findIndex((item) => item.id === paperId);
      if (index >= 0) state.papers[index] = updated;
    }
    return updated || null;
  } finally {
    state.citationRefreshing.delete(paperId);
  }
}

function renderCitationViews(paperId) {
  renderPapers();
  renderPaperLibrary();
  if (state.activePaperId === paperId) renderPaperDetail(state.activePaperId);
}

function citationLooksBlocked(paper) {
  return /拦截|验证|429|captcha|超时/i.test(paper?.citationError || "");
}

// 逐篇刷新引用量并限速，降低被 Google Scholar 验证码拦截的概率。
// 打开管理页面时只处理过期（>2 周）或从未获取过的论文；force=true（手动按钮）则刷新全部。
// 返回 { total, ok, notfound, blocked, error }，供手动刷新展示结果。
async function refreshStaleCitations({ force = false } = {}) {
  if (state.citationRefreshStarted) return null;
  state.citationRefreshStarted = true;
  els.refreshCitationsButton.disabled = true;
  els.refreshCitationsButton.textContent = t("refreshCitationsBusy");
  const summary = { total: 0, ok: 0, notfound: 0, blocked: 0, error: 0 };
  try {
    const targets = state.papers.filter((paper) => force || citationIsStale(paper)).map((paper) => paper.id);
    summary.total = targets.length;
    for (const paperId of targets) {
      if (!state.papers.some((paper) => paper.id === paperId)) continue;
      let updated = null;
      try {
        updated = await refreshPaperCitation(paperId);
      } catch (err) {
        console.error("[Paper_Mind] 引用量刷新异常", paperId, err);
      }
      const status = updated?.citationStatus;
      if (status === "ok") summary.ok += 1;
      else if (status === "notfound") summary.notfound += 1;
      else if (citationLooksBlocked(updated)) summary.blocked += 1;
      else summary.error += 1;
      if (updated?.citationError) console.warn("[Paper_Mind] 引用量未获取", updated.title, updated.citationError);
      renderCitationViews(paperId);
      await citationDelay();
    }
  } finally {
    state.citationRefreshStarted = false;
    els.refreshCitationsButton.disabled = false;
    els.refreshCitationsButton.textContent = t("refreshCitations");
  }
  return summary;
}

function citationSummaryText(summary) {
  if (!summary || !summary.total) return t("refreshCitationsEmpty");
  return t("refreshCitationsSummary", summary);
}

// 新增论文后立即获取一次引用量，并即时显示“更新中…”。
async function refreshCitationForNewPaper(paperId) {
  if (!paperId) return;
  state.citationRefreshing.add(paperId);
  renderCitationViews(paperId);
  try {
    await refreshPaperCitation(paperId);
  } catch {
    // 获取失败时保留占位，下次打开管理页面会重试
  }
  renderCitationViews(paperId);
}

async function syncState({ render = false, force = false } = {}) {
  if (!force && Date.now() - state.lastSyncedAt < 1200) return;
  const payload = await api("/api/state");
  state.papers = payload.papers || [];
  state.tags = payload.tags || [];
  state.topicPacks = payload.topicPacks || [];
  state.meta = payload.meta || {};
  state.config = payload.config || {};
  // 后端存过的模型清单先铺上，设置页立刻有东西可选，不用等联网
  state.modelCatalog = { ...(payload.config?.modelCatalog || {}), ...state.modelCatalog };
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
  if (state.activePaperId && !state.paperDetailEditing) renderPaperDetail(state.activePaperId);
}

function renderStats() {
  els.paperCount.textContent = state.papers.length;
  els.tagCount.textContent = state.tags.length;
}

const PROVIDER_VIEWS = {
  qwen: {
    name: "Qwen/百炼",
    modelField: "qwenModel",
    hasKeyField: "hasQwenKey",
    baseUrlField: "qwenBaseUrl",
    defaultModel: "qwen3.7-max",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  },
  zhipu: {
    name: "智谱 GLM",
    modelField: "zhipuModel",
    hasKeyField: "hasZhipuKey",
    baseUrlField: "zhipuBaseUrl",
    defaultModel: "glm-5.1",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4"
  },
  kimi: {
    name: "Kimi Code",
    modelField: "kimiModel",
    hasKeyField: "hasKimiKey",
    baseUrlField: "kimiBaseUrl",
    defaultModel: "kimi-for-coding",
    defaultBaseUrl: "https://api.kimi.com/coding/v1"
  },
  deepseek: {
    name: "DeepSeek",
    modelField: "deepseekModel",
    hasKeyField: "hasDeepseekKey",
    baseUrlField: "deepseekBaseUrl",
    defaultModel: "deepseek-v4-pro",
    defaultBaseUrl: "https://api.deepseek.com"
  }
};

const MODEL_PROVIDERS = Object.keys(PROVIDER_VIEWS);
const CUSTOM_MODEL_VALUE = "__custom__";
// 拉过的模型清单超过一天就在打开设置页时自动再拉一次
const MODEL_CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function modelPickerEls(provider) {
  return {
    select: document.querySelector(`[data-model-select="${provider}"]`),
    input: document.querySelector(`[data-model-input="${provider}"]`),
    hint: document.querySelector(`[data-model-hint="${provider}"]`),
    refreshButton: document.querySelector(`[data-refresh-models="${provider}"]`),
    keyInput: els[`${provider}Key`],
    baseUrlInput: els[`${provider}BaseUrl`]
  };
}

function modelCatalogFor(provider) {
  return state.modelCatalog[provider] || state.config.modelCatalog?.[provider] || { models: [], source: "preset" };
}

function modelOptionLabel(model) {
  const traitKeys = {
    reasoning: "modelTraitReasoning",
    fast: "modelTraitFast",
    quality: "modelTraitQuality",
    vision: "modelTraitVision",
    long: "modelTraitLong",
    code: "modelTraitCode"
  };
  const traits = (model.traits || []).map((trait) => traitKeys[trait]).filter(Boolean).map((key) => t(key));
  return traits.length ? `${model.id} — ${traits.join(" / ")}` : model.id;
}

// 当前生效的模型名：选了"自定义"就读输入框，否则读下拉框
function currentModelValue(provider) {
  const { select, input } = modelPickerEls(provider);
  if (!select) return input?.value.trim() || "";
  if (select.value === CUSTOM_MODEL_VALUE) return input?.value.trim() || "";
  return select.value || input?.value.trim() || "";
}

function renderModelPicker(provider) {
  const { select, input } = modelPickerEls(provider);
  if (!select || !input) return;
  const view = PROVIDER_VIEWS[provider];
  const catalog = modelCatalogFor(provider);
  const models = catalog.models || [];
  const recommended = new Set(catalog.recommended || []);
  const current = input.value.trim() || state.config[view.modelField] || view.defaultModel;
  const isCustom = state.customModelProviders.has(provider);

  const seen = new Set();
  const options = [];
  // 当前设置的模型即使不在清单里也要留一行，不然打开设置页就被悄悄换掉了
  if (current && !models.some((model) => model.id === current)) {
    options.push({ id: current, traits: [], group: "current" });
    seen.add(current);
  }
  for (const model of models) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    options.push({ ...model, group: recommended.has(model.id) ? "recommended" : "all" });
  }

  const groups = [
    { key: "current", label: state.language === "en" ? "Currently set" : "当前设置" },
    { key: "recommended", label: state.language === "en" ? "Recommended" : "常用推荐" },
    { key: "all", label: state.language === "en" ? "All available" : "全部可用" }
  ];
  select.innerHTML = "";
  for (const group of groups) {
    const items = options.filter((option) => option.group === group.key);
    if (!items.length) continue;
    // 只有一组时不套 optgroup，省得下拉框多一层没意义的标题
    const parent = options.some((option) => option.group !== group.key)
      ? Object.assign(document.createElement("optgroup"), { label: group.label })
      : select;
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = modelOptionLabel(item);
      parent.append(option);
    }
    if (parent !== select) select.append(parent);
  }
  const customOption = document.createElement("option");
  customOption.value = CUSTOM_MODEL_VALUE;
  customOption.textContent = t("customModelOption");
  select.append(customOption);

  select.value = isCustom ? CUSTOM_MODEL_VALUE : current;
  input.hidden = !isCustom;
  input.placeholder = isCustom ? t("customModelPlaceholder") : view.defaultModel;
  renderModelHint(provider);
}

function renderModelHint(provider) {
  const { hint, refreshButton } = modelPickerEls(provider);
  if (refreshButton) refreshButton.title = t("refreshModelsTitle", PROVIDER_VIEWS[provider].name);
  if (!hint) return;
  const catalog = modelCatalogFor(provider);
  if (catalog.error) {
    hint.textContent = t("modelCatalogFailed", catalog.error);
    return;
  }
  if (catalog.reason === "no-key") {
    hint.textContent = t("modelCatalogNoKey");
    return;
  }
  if (catalog.source === "remote") {
    hint.textContent = t("modelCatalogRemote", (catalog.models || []).length, catalog.updatedAt ? formatDate(catalog.updatedAt) : "");
    return;
  }
  hint.textContent = t("modelCatalogPreset");
}

function renderModelPickers() {
  MODEL_PROVIDERS.forEach(renderModelPicker);
}

// 拉某个后端当前可用的模型。Key / Base URL 优先用输入框里的值，
// 这样刚粘上 Key 还没点保存也能先看看有哪些模型。
async function refreshModelCatalog(provider, { silent = false } = {}) {
  const { refreshButton, keyInput, baseUrlInput } = modelPickerEls(provider);
  const view = PROVIDER_VIEWS[provider];
  const typedKey = keyInput?.value.trim() || "";
  if (!typedKey && !state.config[view.hasKeyField]) {
    state.modelCatalog[provider] = { ...modelCatalogFor(provider), reason: "no-key", error: "" };
    renderModelHint(provider);
    if (!silent) toast(t("modelsRefreshNoKey", view.name));
    return null;
  }
  const done = refreshButton && !silent ? setBusy(refreshButton, "…") : () => {};
  try {
    const catalog = await api("/api/models", {
      method: "POST",
      body: JSON.stringify({
        provider,
        refresh: true,
        key: typedKey,
        baseUrl: baseUrlInput?.value.trim() || ""
      })
    });
    state.modelCatalog[provider] = catalog;
    state.modelsAutoRefreshed.add(provider);
    renderModelPicker(provider);
    if (!silent) {
      if (catalog.error) toast(t("modelsRefreshFailed", view.name, catalog.error));
      else toast(t("modelsRefreshed", view.name, (catalog.models || []).length));
    }
    return catalog;
  } catch (err) {
    state.modelCatalog[provider] = { ...modelCatalogFor(provider), reason: "request-failed", error: err.message };
    renderModelHint(provider);
    if (!silent) toast(t("modelsRefreshFailed", view.name, err.message));
    return null;
  } finally {
    done();
  }
}

// 打开设置页时，给已配好 Key 但清单缺失/过期的后端悄悄拉一次
function autoRefreshModelCatalogs() {
  for (const provider of MODEL_PROVIDERS) {
    if (state.modelsAutoRefreshed.has(provider)) continue;
    if (!state.config[PROVIDER_VIEWS[provider].hasKeyField]) continue;
    const catalog = modelCatalogFor(provider);
    const age = catalog.updatedAt ? Date.now() - Date.parse(catalog.updatedAt) : Infinity;
    if (catalog.source === "remote" && age < MODEL_CATALOG_MAX_AGE_MS) continue;
    state.modelsAutoRefreshed.add(provider);
    refreshModelCatalog(provider, { silent: true });
  }
}

function renderModelStatus() {
  const cfg = state.config;
  const view = PROVIDER_VIEWS[cfg.provider] || PROVIDER_VIEWS.qwen;
  els.modelStatus.textContent = cfg[view.hasKeyField] ? t("modelConfigured", view.name, cfg[view.modelField]) : t("modelMissing", view.name);
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
  document.getElementById("maxTagsPerPaper").value = cfg.maxTagsPerPaper || DEFAULT_TAG_POLICY.maxTagsPerPaper;
  document.getElementById("maxTags").value = cfg.maxTags || DEFAULT_TAG_POLICY.maxTags;
  document.getElementById("autoDescribeTags").checked = cfg.autoDescribeTags !== false;
  document.querySelectorAll('input[name="provider"]').forEach((input) => {
    input.checked = input.value === (cfg.provider || "qwen");
  });
  for (const provider of MODEL_PROVIDERS) {
    const view = PROVIDER_VIEWS[provider];
    const { input, baseUrlInput } = modelPickerEls(provider);
    // 下拉框里没有的模型 = 用户手填的，保持"自定义"状态别被清单顶掉
    const saved = cfg[view.modelField] || view.defaultModel;
    const known = (modelCatalogFor(provider).models || []).some((model) => model.id === saved);
    if (known || saved === view.defaultModel) state.customModelProviders.delete(provider);
    else state.customModelProviders.add(provider);
    input.value = saved;
    baseUrlInput.value = cfg[view.baseUrlField] || view.defaultBaseUrl;
    els[`${provider}Key`].placeholder = cfg[view.hasKeyField] ? t("keySavedPlaceholder") : t("keyMissingPlaceholder");
  }
  renderModelPickers();
}

function renderPapers(target = els.paperList, papers = state.papers) {
  const filter = target === els.paperList ? els.paperFilter.value.trim().toLowerCase() : "";
  const visible = papers.filter((paper) => paperSearchScore(paper, state.tags, filter) > 0).slice(0, 30);
  if (!visible.length) {
    target.innerHTML = `<div class="empty">${escapeHtml(t("noPapers"))}</div>`;
    return;
  }
  target.innerHTML = visible
    .map((paper) => {
      const tags = (paper.tagIds || []).map(tagById).filter(Boolean);
      return `
        <article class="paper-card" data-open-paper-id="${escapeHtml(paper.id)}" role="button" tabindex="0" aria-label="${escapeHtml(paper.title)}">
          ${paperTitleHtml(paper)}
          ${paperCardMetaHtml(paper)}
          <p>${escapeHtml(truncate(paper.abstract || t("noAbstract")))}</p>
          <div class="chip-row">
            ${tags.map((tag) => `<button type="button" class="tag-chip" data-library-tag-id="${escapeHtml(tag.id)}" title="${escapeHtml(tagDescriptionLabel(tag))}">${escapeHtml(tag.name)}</button>`).join("")}
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
  const tags = paperTags(paper).flatMap((tag) => [tag.name, ...(tag.aliases || []), tag.description]).join(" ");
  return normalizeText(`${paper.title} ${paper.abstract} ${paper.abstractZh} ${paper.conversation} ${paperClips(paper).map((clip) => clip.markdown).join(" ")} ${tags}`);
}

function paperSourceUrl(paper) {
  const explicit = String(paper?.sourceUrl || "").trim();
  if (/^https?:\/\//i.test(explicit)) return explicit;
  const conversation = String(paper?.conversation || "");
  const labelled = conversation.match(/(?:来源页面|Source page)：?\s*(https?:\/\/\S+)/i);
  if (labelled) return labelled[1].trim();
  const anyUrl = conversation.match(/https?:\/\/\S+/i);
  return anyUrl ? anyUrl[0].trim() : "";
}

function sourceLinkHtml(paper, className = "source-link") {
  const url = paperSourceUrl(paper);
  if (!url) return "";
  return `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("openSource"))}</a>`;
}

function sourceDomain(paper) {
  const url = paperSourceUrl(paper);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function paperCitationText(paper) {
  if (!paper) return "";
  if (paper.citationStatus === "ok" && typeof paper.citationCount === "number") return t("citations", paper.citationCount);
  if (state.citationRefreshing.has(paper.id)) return t("citationsLoading");
  if (paper.citationStatus === "error" || paper.citationStatus === "notfound") return t("citationsUnknown");
  return "";
}

function paperCardMetaHtml(paper) {
  const score = paperValueScore(paper);
  const parts = [score !== null ? `★ ${score} / 5` : "", formatDate(paper.createdAt || paper.updatedAt), paperClips(paper).length ? t("clipBadge", paperClips(paper).length) : "", sourceDomain(paper), paperCitationText(paper)].filter(Boolean);
  return parts.length ? `<small class="paper-card-meta">${escapeHtml(parts.join(" · "))}</small>` : "";
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
  if (mode === "citations") {
    const count = (paper) => (paper.citationStatus === "ok" && typeof paper.citationCount === "number" ? paper.citationCount : -1);
    return items.sort((a, b) => count(b) - count(a) || paperTime(b, "createdAt") - paperTime(a, "createdAt"));
  }
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

// LLM 检索候选：论文卡片 + 模型给的中文理由和置信度
function renderLlmPaperMatchesHtml(matches) {
  const hits = matches.filter((match) => paperById(match.paperId));
  if (!hits.length) return `<div class="empty">${escapeHtml(t("llmSearchNoResults"))}</div>`;
  return hits
    .map(
      (match) => `
        <div class="llm-search-hit">
          ${renderPaperCardsHtml([paperById(match.paperId)], { includeTags: true })}
          <div class="llm-search-reason">${escapeHtml(match.reason || "")} · ${(Number(match.confidence || 0) * 100).toFixed(0)}%</div>
        </div>
      `
    )
    .join("");
}

function renderPaperLibrary() {
  const query = els.paperLibraryFilter.value.trim();
  state.libraryTagIds = state.libraryTagIds.filter((id) => tagById(id));
  const selected = state.libraryTagIds;
  const matchMode = document.getElementById("libraryMatchMode").value;
  const minScore = Number(document.getElementById("libraryMinScore").value);
  const facetMatch = (paper) => (!minScore || Number(paper.valueScore) >= minScore) && (!selected.length || (matchMode === "all" ? selected.every((id) => paper.tagIds?.includes(id)) : selected.some((id) => paper.tagIds?.includes(id))));
  const llm = state.paperLlmSearch;
  let matches = [];
  let papers;
  if (llm) {
    matches = llm.matches.filter((match) => paperById(match.paperId) && facetMatch(paperById(match.paperId)));
    papers = matches.map((match) => paperById(match.paperId));
  } else {
    const scored = state.papers.filter(facetMatch).map((paper) => ({ paper, score: paperSearchScore(paper, state.tags, query) })).filter((item) => item.score > 0);
    papers = query ? scored.sort((a, b) => b.score - a.score).map((item) => item.paper) : sortPapersForLibrary(scored.map((item) => item.paper));
  }
  const pageSize = 24;
  const pages = Math.max(1, Math.ceil(papers.length / pageSize));
  state.libraryPage = Math.min(pages, state.libraryPage);
  const page = papers.slice((state.libraryPage - 1) * pageSize, state.libraryPage * pageSize);
  els.paperLibraryList.setAttribute("aria-busy", "false");
  setText("#paperLibraryTitle", `${llm ? ui("AI 检索", "AI search") : ui("论文", "Papers")} · ${papers.length} / ${state.papers.length}`);
  const note = llm && !llm.llmUsed ? `<p class="search-notice">${escapeHtml(t("llmSearchFallback", llm.error))}</p>` : "";
  els.paperLibraryList.innerHTML = note + (papers.length ? (llm ? renderLlmPaperMatchesHtml(matches.slice((state.libraryPage - 1) * pageSize, state.libraryPage * pageSize)) : !query && els.paperLibrarySort.value === "similar" ? renderPaperClustersHtml(clusterPapersByTags(page)) : renderPaperCardsHtml(page, { includeTags: true })) : `<div class="library-empty"><span class="empty-symbol">⌕</span><h4>${ui(state.papers.length ? "没有找到匹配论文" : "从第一篇论文开始", state.papers.length ? "No matching papers" : "Start with your first paper")}</h4><p>${ui(state.papers.length ? "试试更短的关键词，或移除部分标签和评分筛选。" : "添加论文、摘要和核心标签，让研究积累变得有序。", state.papers.length ? "Try a shorter query or remove a filter." : "Save a paper, its abstract and a few useful tags.")}</p><button type="button" class="secondary-button" data-library-empty>${ui(state.papers.length ? "清除筛选" : "添加论文", state.papers.length ? "Clear filters" : "Add paper")}</button></div>`);
  document.getElementById("activeLibraryFilters").innerHTML = selected.map((id) => `<button class="tag-chip selected" type="button" data-library-tag-id="${escapeHtml(id)}" title="${escapeHtml(tagDescriptionLabel(tagById(id)))}">${escapeHtml(tagById(id).name)} ×</button>`).join("");
  document.getElementById("clearLibraryFilters").hidden = !query && !selected.length && !minScore && !llm;
  document.getElementById("libraryPagination").innerHTML = pages > 1 ? `<button type="button" class="secondary-button small-button" data-library-page="${state.libraryPage - 1}" ${state.libraryPage === 1 ? "disabled" : ""}>${ui("上一页", "Previous")}</button><span>${state.libraryPage} / ${pages}</span><button type="button" class="secondary-button small-button" data-library-page="${state.libraryPage + 1}" ${state.libraryPage === pages ? "disabled" : ""}>${ui("下一页", "Next")}</button>` : "";
  document.querySelectorAll("[data-paper-library-mode]").forEach((button) => button.classList.toggle("active", button.dataset.paperLibraryMode === state.paperLibraryMode));
  els.paperLibraryListMode.classList.toggle("is-hidden", state.paperLibraryMode !== "list");
  els.paperLibraryMapMode.classList.toggle("is-hidden", state.paperLibraryMode !== "map");
  const tagQuery = document.getElementById("libraryTagFilter").value;
  const tags = [...state.tags].filter((tag) => matchesText(`${tag.name} ${(tag.aliases || []).join(" ")} ${tag.description || ""}`, tagQuery)).sort(compareTags);
  els.paperLibraryTagMeta.textContent = ui("点击组合筛选", "Combine tags to filter");
  els.paperLibraryTagList.innerHTML = tags.slice(0, state.libraryTagLimit).map((tag) => `<button class="tag-summary-item ${selected.includes(tag.id) ? "selected" : ""}" data-library-tag-id="${escapeHtml(tag.id)}" type="button" aria-pressed="${selected.includes(tag.id)}" title="${escapeHtml(tagDescriptionLabel(tag))}"><strong>${escapeHtml(tag.name)}</strong><span>${tag.paperIds?.length || 0}</span><small>${escapeHtml(truncate(tagDescriptionLabel(tag), 80))}</small></button>`).join("") || `<p class="empty">${ui("没有匹配标签", "No matching tags")}</p>`;
  const more = document.getElementById("showMoreLibraryTags");
  more.hidden = tags.length <= state.libraryTagLimit;
  more.textContent = ui(`显示更多（还有 ${Math.max(0, tags.length - state.libraryTagLimit)} 个）`, `Show more (${Math.max(0, tags.length - state.libraryTagLimit)} remaining)`);
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

function paperMatchesSelectedTags(paper, selectedTags) {
  if (!selectedTags.size) return false;
  const tagIds = new Set(paper.tagIds || []);
  return els.paperMapMatchMode.value === "all"
    ? [...selectedTags].every((id) => tagIds.has(id))
    : [...selectedTags].some((id) => tagIds.has(id));
}

function renderPaperMap() {
  if (!els.paperMapTags || state.paperLibraryMode !== "map") return;
  const query = normalizeText(els.paperMapFilter?.value || "");
  const selectedTags = new Set(state.selectedMapTagIds);
  const selectedPaper = paperById(state.selectedMapPaperId);
  const hasSelection = Boolean(selectedTags.size || selectedPaper);
  const focusOn = state.paperMapFocus !== "off";
  const focusActive = focusOn && hasSelection;
  const filteredPapers = state.papers.filter((paper) => {
    return !query || paperSearchText(paper).includes(query);
  });

  els.paperMapFocusToggle.classList.toggle("active", focusOn);
  els.paperMapClearButton.classList.toggle("is-hidden", !hasSelection);

  const filteredPaperIds = new Set(filteredPapers.map((paper) => paper.id));
  let candidatePapers = sortPapersForLibrary(state.papers).filter((paper) => filteredPaperIds.has(paper.id));
  if (focusActive) {
    candidatePapers = selectedPaper
      ? candidatePapers.filter((paper) => paper.id === selectedPaper.id)
      : candidatePapers.filter((paper) => paperMatchesSelectedTags(paper, selectedTags));
  }
  const papers = candidatePapers.slice(0, query ? 80 : 60);

  const visiblePaperIds = new Set(papers.map((paper) => paper.id));
  const tagQueryMatches = (tag) => !query || normalizeText(`${tag.name} ${(tag.aliases || []).join(" ")}`).includes(query);
  let tags = [...state.tags]
    .filter((tag) => {
      const hasVisiblePaper = (tag.paperIds || []).some((id) => visiblePaperIds.has(id));
      return hasVisiblePaper || tagQueryMatches(tag);
    })
    .sort(compareTags);
  if (focusActive && selectedPaper) {
    tags = tags.filter((tag) => (selectedPaper.tagIds || []).includes(tag.id));
  } else if (selectedTags.size) {
    tags = tags.sort((a, b) => (selectedTags.has(b.id) ? 1 : 0) - (selectedTags.has(a.id) ? 1 : 0) || compareTags(a, b));
  }
  const visibleTagIds = new Set(tags.map((tag) => tag.id));

  els.paperMapHint.textContent = hasSelection
    ? t("mapVisibleMeta", tags.length, papers.length)
    : t("mapHint");
  els.paperMapTags.innerHTML = tags.length
    ? tags
        .map((tag) => {
          const selected = selectedTags.has(tag.id);
          const relatedToPaper = selectedPaper && (selectedPaper.tagIds || []).includes(tag.id);
          const active = selected || relatedToPaper;
          const dimmed = !focusActive && hasSelection && !active;
          return `
            <div class="map-node map-tag-node${active ? " active" : ""}${dimmed ? " dimmed" : ""}${isSystemTag(tag) ? " system" : ""}">
              <button class="map-node-main" type="button" data-map-tag-id="${tag.id}">
                <strong>${escapeHtml(tag.name)}</strong>
                <span>${escapeHtml(t("tagPaperCount", tag.paperIds?.length || 0))}</span>
              </button>
              <button class="map-node-open" type="button" data-open-map-tag-id="${tag.id}">${escapeHtml(t("viewDetail"))}</button>
            </div>
          `;
        })
        .join("")
    : `<div class="empty">${escapeHtml(t("noTags"))}</div>`;

  els.paperMapPapers.innerHTML = papers.length
    ? papers
        .map((paper) => {
          const selected = paper.id === state.selectedMapPaperId;
          const relatedToTags = paperMatchesSelectedTags(paper, selectedTags);
          const active = selected || relatedToTags;
          const dimmed = !focusActive && hasSelection && !active;
          const tagsForPaper = paperTags(paper).filter((tag) => visibleTagIds.has(tag.id)).slice(0, 5);
          return `
            <div class="map-node map-paper-node${active ? " active" : ""}${dimmed ? " dimmed" : ""}">
              <button class="map-node-main" type="button" data-map-paper-id="${paper.id}">
                <strong class="paper-title-by-score" style="${paperTitleStyle(paper)}">${escapeHtml(paper.title)}</strong>
                <span>${tagsForPaper.map((tag) => escapeHtml(tag.name)).join(" · ") || escapeHtml(t("noTags"))}</span>
              </button>
              <button class="map-node-open" type="button" data-open-map-paper-id="${paper.id}">${escapeHtml(t("viewDetail"))}</button>
            </div>
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
  els.paperMapSvg.style.width = `${width}px`;
  els.paperMapSvg.style.height = `${height}px`;
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
      const paper = paperById(paperId);
      const paperTagIds = new Set(paper?.tagIds || []);
      const paperMatchesSelectedTags =
        selectedTags.size &&
        (els.paperMapMatchMode.value === "all"
          ? [...selectedTags].every((id) => paperTagIds.has(id))
          : [...selectedTags].some((id) => paperTagIds.has(id)));
      const active = selectedPaperId === paperId || (selectedTags.has(tag.id) && paperMatchesSelectedTags);
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
        <article class="paper-card recommendation-card" data-open-paper-id="${paper.id}">
          ${paperTitleHtml(paper)}
          <p>${escapeHtml(match.reason || truncate(paper.abstract || t("noAbstract")))}</p>
          <div class="chip-row">${tags.slice(0, 5).map((tag) => `<button type="button" class="tag-chip" data-library-tag-id="${escapeHtml(tag.id)}" title="${escapeHtml(tagDescriptionLabel(tag))}">${escapeHtml(tag.name)}</button>`).join("")}</div>
          <small>${escapeHtml(t("similarity"))} ${(score * 100).toFixed(0)}%</small>
        </article>
      `;
    })
    .join("");
}

function paperCardActions(paper) {
  return `
    <div class="paper-card-actions">
      ${sourceLinkHtml(paper, "secondary-button source-link")}
      <button class="secondary-button" data-refresh-citation-id="${paper.id}" type="button">${escapeHtml(t("refreshOneCitation"))}</button>
      <button class="secondary-button danger-button" data-delete-paper-id="${paper.id}" type="button">${escapeHtml(t("deletePaper"))}</button>
    </div>
  `;
}

const LINK_PLATFORMS = [
  { domains: ["xiaohongshu.com", "xhslink.com"], name: "小红书", className: "xiaohongshu" },
  { domains: ["zhihu.com"], name: "知乎", className: "zhihu" },
  { domains: ["weixin.qq.com"], name: "公众号", className: "weixin" },
  { domains: ["bilibili.com", "b23.tv"], name: "B站", className: "bilibili" },
  { domains: ["weibo.com", "weibo.cn"], name: "微博", className: "weibo" },
  { domains: ["github.com"], name: "GitHub", className: "github" },
  { domains: ["arxiv.org"], name: "arXiv", className: "arxiv" },
  { domains: ["juejin.cn"], name: "掘金", className: "juejin" },
  { domains: ["csdn.net"], name: "CSDN", className: "csdn" },
  { domains: ["x.com", "twitter.com"], name: "X/推特", className: "twitter" },
  { domains: ["youtube.com", "youtu.be"], name: "YouTube", className: "youtube" },
  { domains: ["douyin.com"], name: "抖音", className: "douyin" }
];

function linkPlatform(linkUrl) {
  let host = "";
  try {
    host = new URL(linkUrl).hostname.toLowerCase();
  } catch {
    return { name: t("webLink"), className: "generic", host: "" };
  }
  for (const platform of LINK_PLATFORMS) {
    if (platform.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return { name: platform.name, className: platform.className, host };
    }
  }
  return { name: t("webLink"), className: "generic", host };
}

function renderPaperLinks(paper) {
  const links = paper?.links || [];
  if (!links.length) {
    els.paperDetailLinks.innerHTML = `<div class="empty">${escapeHtml(t("noLinks"))}</div>`;
    return;
  }
  els.paperDetailLinks.innerHTML = links
    .map((link) => {
      const platform = linkPlatform(link.url);
      const cardTitle = link.title || link.previewTitle || truncate(link.url, 60);
      const description = truncate(link.previewDescription || "", 90);
      const source = link.previewSiteName || platform.host || link.url;
      return `
        <div class="link-card">
          <a class="link-preview-card" href="${escapeHtml(safeWebUrl(link.url))}" target="_blank" rel="noopener noreferrer">
            <span class="link-thumb ${platform.className}">
              <span class="link-thumb-label">${escapeHtml(platform.name)}</span>
              ${safeWebUrl(link.previewImage) ? `<img src="${escapeHtml(safeWebUrl(link.previewImage))}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
              <span class="link-badge">${escapeHtml(platform.name)}</span>
            </span>
            <span class="link-text">
              <strong>${escapeHtml(cardTitle)}</strong>
              ${description ? `<span class="link-description">${escapeHtml(description)}</span>` : ""}
              <small>${escapeHtml(source)}</small>
            </span>
          </a>
          <span class="link-card-actions">
            <button class="icon-button refresh-link-preview" type="button" data-link-id="${link.id}" title="${escapeHtml(t("refreshPreview"))}">↻</button>
            <button class="icon-button remove-link" type="button" data-link-id="${link.id}" title="${escapeHtml(t("deleteLink"))}">×</button>
          </span>
        </div>
      `;
    })
    .join("");
  els.paperDetailLinks.querySelectorAll(".link-thumb img").forEach((img) => {
    img.addEventListener("error", () => img.remove());
  });
}

function renderLlmSimilarSection(paper) {
  const stored = paper?.llmSimilar;
  if (!stored) {
    els.llmSimilarMeta.textContent = "";
    els.loadLlmSimilarButton.textContent = t("generateRecommendations");
    els.llmSimilarPaperList.innerHTML = `<div class="empty">${escapeHtml(t("llmSimilarEmpty"))}</div>`;
    return;
  }
  const validMatches = (stored.matches || []).filter((match) => paperById(match.paperId));
  els.llmSimilarMeta.textContent = stored.updatedAt ? t("recommendedAt", formatDate(stored.updatedAt)) : "";
  els.loadLlmSimilarButton.textContent = t("updateRecommendations");
  renderSimilarResults(els.llmSimilarPaperList, validMatches, t("llmSimilarStoredEmpty"));
}

const CONVERSATION_PREVIEW_HEIGHT = 240;

function updateConversationCollapse() {
  const content = els.paperDetailConversation;
  const expanded = Boolean(state.conversationExpanded);
  content.classList.toggle("collapsed", !expanded);
  els.toggleConversationButton.textContent = expanded ? t("collapseConversation") : t("expandConversation");
  const overflowing = content.scrollHeight > CONVERSATION_PREVIEW_HEIGHT + 20;
  els.toggleConversationButton.hidden = !overflowing && !expanded;
  content.classList.toggle("has-fade", overflowing && !expanded);
}

function setPaperDetailEditMode(editing) {
  state.paperDetailEditing = Boolean(editing);
  els.paperDetailReadView.classList.toggle("is-hidden", state.paperDetailEditing);
  els.paperDetailTagForm.classList.toggle("is-hidden", !state.paperDetailEditing);
  els.editPaperDetailButton.classList.toggle("is-hidden", state.paperDetailEditing);
  els.paperDetailReadView.setAttribute("aria-hidden", String(state.paperDetailEditing));
  els.paperDetailTagForm.setAttribute("aria-hidden", String(!state.paperDetailEditing));
}

/* ----- 网页剪藏正文 ----- */

const CLIP_PREVIEW_HEIGHT = 420;

function releaseClipAssets() {
  for (const objectUrl of state.clipAssets?.urlMap?.values() || []) {
    if (String(objectUrl).startsWith("blob:")) URL.revokeObjectURL(objectUrl);
  }
  state.clipAssets = null;
}

// 磁盘路径 → file:// 地址：逐段编码，文件名里的空格、井号和中文都不会把地址拼断
function fileUrl(absolutePath) {
  return `file://${String(absolutePath).split("/").map(encodeURIComponent).join("/")}`;
}

// 图片走本地文件：公众号图床按 Referer 防盗链，直接引原地址只会拿到"未经允许不可引用"的占位图
function diskAssetMap(clip) {
  const map = new Map();
  for (const asset of clip?.assets || []) {
    if (asset?.url && asset.file) map.set(asset.url, fileUrl(asset.file));
  }
  return map;
}

// v1.1 把图片存在浏览器 IndexedDB 里，还没迁移到磁盘的老剪藏走这条路显示
async function loadClipAssets(paperId) {
  if (state.clipAssets?.paperId === paperId) return state.clipAssets;
  releaseClipAssets();
  const urlMap = new Map();
  try {
    const firstClipId = paperClips(paperById(paperId))[0]?.id || "";
    const result = await api(`/api/papers/${encodeURIComponent(paperId)}/clips/${encodeURIComponent(firstClipId)}/assets`);
    for (const asset of result.legacy || []) {
      if (asset?.url && asset.blob) urlMap.set(asset.url, URL.createObjectURL(asset.blob));
    }
    // 老剪藏的图片还在浏览器里，顺手叫后台搬到磁盘（用已有副本，不用重新联网）
    if (urlMap.size) chrome.runtime.sendMessage({ type: "clip-archive-images", paperId }).catch(() => {});
  } catch {
    // 读不出来就整篇回落到原始地址
  }
  state.clipAssets = { paperId, urlMap };
  return state.clipAssets;
}

// renderInlineMarkdown 会把地址里的 & 转义掉，比对存档要先还原
function decodeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&amp;", "&");
}

function applyClipAssets(html, urlMap) {
  if (!urlMap?.size) return html;
  // 原地址留在 data-remote 上：本地文件读不到时 onerror 会回落过去，正文不至于开天窗
  return html.replace(/<img src="([^"]+)"/g, (match, src) => {
    const local = urlMap.get(decodeHtmlAttribute(src));
    return local ? `<img data-remote="${src}" src="${escapeHtml(local)}"` : match;
  });
}

function paperClips(paper) {
  return Array.isArray(paper?.clips) ? paper.clips : [];
}

function clipMetaText(clip) {
  const parts = [];
  if (clip.siteName) parts.push(clip.siteName);
  if (clip.author && clip.author !== clip.siteName) parts.push(clip.author);
  parts.push(t("clipMeta", clip.textLength, clip.imageCount));
  if (clip.imageCount) {
    if (clip.assetStatus === "done") parts.push(t("clipAssetsDone", clip.assetSavedCount));
    else if (clip.assetStatus === "partial") parts.push(t("clipAssetsPartial", clip.assetSavedCount, clip.imageCount));
    else if (clip.assetStatus === "pending") parts.push(t("clipAssetsPending"));
    else parts.push(t("clipAssetsMissing"));
  }
  if (clip.assetError) parts.push(clip.assetError);
  return parts.join(" · ");
}

function clipSourceDomain(clip) {
  try {
    return new URL(clip.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function updateClipCollapse(section, clipId) {
  const content = section.querySelector(".clip-body");
  const toggle = section.querySelector("[data-clip-action='toggle']");
  const expanded = state.expandedClipIds.has(clipId);
  content.classList.toggle("collapsed", !expanded);
  toggle.textContent = expanded ? t("collapseClip") : t("expandClip");
  const overflowing = content.scrollHeight > CLIP_PREVIEW_HEIGHT + 20;
  toggle.hidden = !overflowing && !expanded;
  content.classList.toggle("has-fade", overflowing && !expanded);
}

function clipSectionHtml(clip, index, total) {
  const heading = clip.title || (total > 1 ? t("clipNth", index + 1) : t("clipHeading"));
  const domain = clipSourceDomain(clip);
  const link = clip.sourceUrl
    ? ` <a class="source-inline-link" href="${escapeHtml(clip.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(domain || t("openSource"))}</a>`
    : "";
  return `
    <section class="clip-section" data-clip-id="${escapeHtml(clip.id)}">
      <div class="clip-section-head">
        <h4 class="clip-section-title">${escapeHtml(heading)}</h4>
        <span class="clip-meta muted">${escapeHtml(clipMetaText(clip))}${link}</span>
        <div class="clip-section-actions">
          <button class="secondary-button small-button" type="button" data-clip-action="toggle">${escapeHtml(t("expandClip"))}</button>
          ${clip.imageCount ? `<button class="secondary-button small-button" type="button" data-clip-action="refresh">${escapeHtml(t("refreshClipAssets"))}</button>` : ""}
          <button class="secondary-button small-button" type="button" data-clip-action="delete">${escapeHtml(t("deleteClip"))}</button>
        </div>
      </div>
      <div class="markdown-body clip-body collapsed"></div>
    </section>
  `;
}

// 本地图片没就位之前先不插正文：否则浏览器会先去拉原图，闪一下防盗链占位图
function renderClipSections(paper) {
  const clips = paperClips(paper);
  els.paperDetailClips.innerHTML = clips.map((clip, index) => clipSectionHtml(clip, index, clips.length)).join("");

  const needLegacy = clips.some((clip) => clip.imageCount > (clip.assets || []).filter((asset) => asset.file).length);
  const legacyLoaded = state.clipAssets?.paperId === paper.id;
  if (needLegacy && !legacyLoaded) {
    for (const section of els.paperDetailClips.querySelectorAll(".clip-section")) {
      section.querySelector(".clip-body").innerHTML = `<p class="empty">${escapeHtml(t("clipAssetsPending"))}</p>`;
    }
    loadClipAssets(paper.id).then(() => {
      if (state.activePaperId !== paper.id) return;
      const current = paperById(paper.id);
      if (current) renderClipSections(current);
    });
    return;
  }

  const legacyMap = legacyLoaded ? state.clipAssets.urlMap : new Map();
  for (const section of els.paperDetailClips.querySelectorAll(".clip-section")) {
    const clip = clips.find((item) => item.id === section.dataset.clipId);
    if (!clip) continue;
    const urlMap = new Map([...legacyMap, ...diskAssetMap(clip)]);
    section.querySelector(".clip-body").innerHTML = applyClipAssets(renderMarkdown(clip.markdown), urlMap);
    updateClipCollapse(section, clip.id);
  }
  renderClipWarning(paper);
}

// Chrome 没给扩展开"允许访问文件网址"时，file:// 图会加载失败，这里给一句能照做的提示
function renderClipWarning(paper) {
  const blocked = state.clipFileAccessBlocked && paperClips(paper).some((clip) => (clip.assets || []).some((asset) => asset.file));
  els.paperDetailClipWarning.hidden = !blocked;
  els.paperDetailClipWarning.textContent = blocked ? t("clipFileAccessBlocked") : "";
}

// 摘要区块：有网页剪藏时把各份材料的正文（含图片）铺在这里；普通论文保持原来的摘要 + 中英切换 + 翻译
function renderAbstractSection(paper) {
  const clips = paperClips(paper);
  const hasZh = Boolean(paper?.abstractZh);
  const hasEn = Boolean(paper?.abstract);
  els.abstractLangToggle.hidden = clips.length > 0 || !(hasZh && hasEn);
  els.translateAbstractButton.hidden = clips.length > 0 || !hasEn || hasZh;
  els.openClipFolderButton.hidden = !clips.some((clip) => (clip.assets || []).some((asset) => asset.file));
  els.paperDetailAbstract.hidden = clips.length > 0;
  setText("#paperDetailAbstractHeading", clips.length > 1 ? t("clipMaterials", clips.length) : clips.length ? t("clipHeading") : t("abstract"));

  if (!clips.length) {
    els.paperDetailClips.innerHTML = "";
    els.paperDetailClipWarning.hidden = true;
    const lang = hasZh && (state.abstractLang === "zh" || !hasEn) ? "zh" : "en";
    els.abstractLangToggle.querySelectorAll("[data-abstract-lang]").forEach((button) => {
      button.classList.toggle("active", button.dataset.abstractLang === lang);
    });
    els.paperDetailAbstract.textContent = (lang === "zh" ? paper?.abstractZh : paper?.abstract) || t("noAbstract");
    return;
  }

  renderClipSections(paper);
}

function renderClipEditors(paper) {
  const clips = paperClips(paper);
  els.paperDetailClipsEditor.innerHTML = clips
    .map(
      (clip, index) => `
        <div class="clip-editor-item" data-clip-id="${escapeHtml(clip.id)}">
          <label>
            <span>${escapeHtml(t("clipEditTitle", index + 1))}</span>
            <input class="clip-title-input" autocomplete="off" value="${escapeHtml(clip.title || "")}" />
          </label>
          <label>
            <span>${escapeHtml(t("clipEditLabel"))}</span>
            <textarea class="clip-markdown-input" rows="10">${escapeHtml(clip.markdown || "")}</textarea>
          </label>
        </div>
      `
    )
    .join("");
}

function renderPaperDetail(paperId) {
  const paper = paperById(paperId);
  if (!paper) {
    els.paperDetailTitle.textContent = state.language === "en" ? "Paper not found" : "论文不存在";
    els.paperDetailTitle.classList.remove("paper-title-by-score");
    els.paperDetailTitle.style.removeProperty("color");
    els.paperDetailMeta.textContent = "";
    els.paperDetailTags.innerHTML = "";
    els.paperDetailTagList.innerHTML = "";
    els.paperDetailTitleInput.value = "";
    els.paperDetailValueScore.value = "3";
    renderValueScore(els.paperDetailValueScore, els.paperDetailValueScoreText);
    els.paperDetailAbstractInput.value = "";
    els.paperDetailConversationInput.value = "";
    els.paperDetailClipsEditor.innerHTML = "";
    renderAbstractSection(null);
    els.paperDetailConversation.innerHTML = `<p class="empty">${escapeHtml(t("noConversation"))}</p>`;
    renderPaperLinks(null);
    updateConversationCollapse();
    setPaperDetailEditMode(false);
    renderSimilarResults(els.tagSimilarPaperList, []);
    renderLlmSimilarSection(null);
    return;
  }

  state.activePaperId = paper.id;
  const tags = paperTags(paper);
  els.paperDetailTitle.textContent = paper.title;
  els.paperDetailTitle.classList.add("paper-title-by-score");
  const detailTitleColor = paperTitleColor(paper);
  if (detailTitleColor) els.paperDetailTitle.style.color = detailTitleColor;
  else els.paperDetailTitle.style.removeProperty("color");
  const detailCitation = paperCitationText(paper);
  els.paperDetailMeta.innerHTML = `${escapeHtml(t("created"))} ${escapeHtml(formatDate(paper.createdAt))} · ${escapeHtml(t("updated"))} ${escapeHtml(formatDate(paper.updatedAt))} · ${escapeHtml(t("valueScoreMeta", valueScoreLabel(paperValueScore(paper))))}${detailCitation ? ` · ${escapeHtml(detailCitation)}` : ""}${paperSourceUrl(paper) ? ` · ${sourceLinkHtml(paper, "source-inline-link")}` : ""}`;
  els.paperDetailTags.innerHTML = tags.length ? tags.map((tag) => `<button type="button" class="tag-chip" data-library-tag-id="${escapeHtml(tag.id)}" title="${escapeHtml(tagDescriptionLabel(tag))}">${escapeHtml(tag.name)}</button>`).join("") : `<span class="empty">${escapeHtml(t("noTags"))}</span>`;
  renderAbstractSection(paper);
  els.absorbPaperButton.hidden = state.papers.length < 2;
  setText("#paperDetailConversationHeading", paperClips(paper).length ? t("notesHeading") : t("conversationHeading"));
  els.paperDetailConversation.innerHTML = renderMarkdown(paper.conversation);
  updateConversationCollapse();
  renderPaperLinks(paper);
  els.paperDetailTitleInput.value = paper.title || "";
  els.paperDetailValueScore.value = String(paperValueScore(paper, 3));
  renderValueScore(els.paperDetailValueScore, els.paperDetailValueScoreText);
  els.paperDetailAbstractInput.value = paper.abstract || "";
  els.paperDetailConversationInput.value = paper.conversation || "";
  renderClipEditors(paper);
  els.paperDetailTagList.innerHTML = (tags.length ? tags : [{ name: "" }]).map((tag) => tagInputRow(tag.name, t("tagInputPlaceholder"))).join("");
  setPaperDetailEditMode(state.paperDetailEditing);
  renderSimilarResults(els.tagSimilarPaperList, localSimilarPapers(paper.id), t("similarEmpty"));
  renderLlmSimilarSection(paper);
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

function paperContextTextForTagInput(input) {
  if (input.closest("#paperDetailTagForm")) {
    return `${els.paperDetailTitleInput.value} ${els.paperDetailAbstractInput.value} ${els.paperDetailConversationInput.value}`;
  }
  if (input.closest("#topicPackForm")) {
    return `${els.topicPackName.value} ${els.topicPackDescription.value}`;
  }
  return `${document.querySelector("#paperTitle").value} ${document.querySelector("#paperAbstract").value} ${document.querySelector("#paperConversation").value}`;
}

function matchingTags(query, context = "", selected = []) {
  return suggestTags(state.tags, query, { context, selected });
}

let suggestionListId = 0;
function renderTagSuggestions(input) {
  const box = input.closest(".tag-combobox");
  const suggestions = box?.querySelector(".tag-suggestions");
  if (!suggestions) return;
  const selected = [...(input.closest(".manual-tag-list")?.querySelectorAll(".manual-tag-input") || [])].filter((el) => el !== input).map((el) => el.value);
  const matches = matchingTags(input.value, paperContextTextForTagInput(input), selected);
  const current = input.value.trim();
  const exact = current && state.tags.some((tag) => [tag.name, ...(tag.aliases || [])].some((name) => canonicalTagKey(name) === canonicalTagKey(current)));
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
          <span>${escapeHtml(tag.name)}<small class="suggestion-description">${escapeHtml(truncate(tagDescriptionLabel(tag), 80))}</small></span>
          <small>${escapeHtml(t("tagPaperCount", tag.paperIds?.length || 0))}</small>
        </button>
      `
      )
      .join("") + createOption;
  suggestions.hidden = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  suggestions.id ||= `tag-options-${++suggestionListId}`;
  suggestions.setAttribute("role", "listbox");
  input.setAttribute("aria-controls", suggestions.id);
  input.removeAttribute("aria-activedescendant");
  suggestions.querySelectorAll(".tag-suggestion").forEach((option, index) => { option.id = `${suggestions.id}-${index}`; option.setAttribute("role", "option"); option.setAttribute("aria-selected", "false"); });
}

function hideTagSuggestions(root = document) {
  root.querySelectorAll(".tag-suggestions").forEach((el) => {
    el.hidden = true;
    const input = el.parentElement.querySelector("input");
    input?.setAttribute("aria-expanded", "false");
    input?.removeAttribute("aria-activedescendant");
  });
}

function createTagInputRow(value = "", placeholder = "") {
  const template = document.createElement("template");
  template.innerHTML = tagInputRow(value, placeholder).trim();
  return template.content.firstElementChild;
}

function tagCardHtml(tag) {
  const selected = tag.id === state.activeTagId ? " selected" : "";
  const system = isSystemTag(tag) ? " system-tag" : "";
  return `
    <div class="tag-library-card${selected}${system}" data-tag-id="${tag.id}" draggable="${isSystemTag(tag) ? "false" : "true"}" role="button" tabindex="0">
      <strong>${escapeHtml(tag.name)}</strong>
      <span>${escapeHtml(t("tagPaperCountLong", tag.paperIds?.length || 0))}</span>
      <p class="tag-card-description">${escapeHtml(tagDescriptionLabel(tag))}</p>
      ${(tag.aliases || []).length ? `<small>${escapeHtml(tag.aliases.slice(0, 3).join(" / "))}</small>` : ""}
    </div>
  `;
}

function tagOverlapScore(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const id of setA) {
    if (setB.has(id)) shared += 1;
  }
  return shared / Math.min(setA.size, setB.size);
}

function clusterTagsByTopic(tags) {
  const sorted = [...tags].sort((a, b) => (b.paperIds?.length || 0) - (a.paperIds?.length || 0) || a.name.localeCompare(b.name, "zh-CN"));
  const clusters = [];
  const threshold = state.tagGroupThreshold / 100;
  for (const tag of sorted) {
    const set = new Set(tag.paperIds || []);
    let best = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      let score = 0;
      for (const member of cluster.members) {
        score = Math.max(score, tagOverlapScore(set, member.set));
        if (score >= 1) break;
      }
      if (score > bestScore) {
        bestScore = score;
        best = cluster;
      }
    }
    if (best && set.size && bestScore >= threshold) best.members.push({ tag, set });
    else clusters.push({ members: [{ tag, set }] });
  }
  return clusters;
}

function renderTagTree() {
  const query = normalizeText(els.tagLibraryFilter?.value || "");
  let visibleTags = state.tags.filter((tag) => {
    if (!query) return true;
    const linkedTitles = (tag.paperIds || []).map((id) => paperById(id)?.title || "").join(" ");
    return matchesText(`${tag.name} ${(tag.aliases || []).join(" ")} ${tag.description || ""} ${linkedTitles}`, query);
  });
  const normal = state.tags.filter((tag) => !isSystemTag(tag));
  const missing = normal.filter((tag) => !tag.description || tag.descriptionStatus !== "ready").length;
  const errors = normal.filter((tag) => tag.descriptionError).length;
  const singles = normal.filter((tag) => tag.paperIds?.length === 1).length;
  document.getElementById("tagHealthSummary").textContent = ui(`${normal.length} / ${state.config.maxTags || 80} 个标签 · ${missing} 个说明待更新${errors ? `（${errors} 个失败，可重试）` : ""} · ${singles} 个仅关联一篇论文`, `${normal.length} / ${state.config.maxTags || 80} tags · ${missing} descriptions pending · ${errors} failed · ${singles} used once`);
  const tagTotal = visibleTags.length;
  visibleTags = visibleTags.sort(compareTags).slice(0, state.tagDisplayLimit);
  let moreButton = document.getElementById("moreTagCards");
  if (!moreButton) { moreButton = document.createElement("button"); moreButton.id = "moreTagCards"; moreButton.type = "button"; moreButton.className = "text-button"; els.tagTree.after(moreButton); moreButton.addEventListener("click", () => { state.tagDisplayLimit += 48; renderTagTree(); }); }
  moreButton.hidden = tagTotal <= state.tagDisplayLimit || Boolean(state.tagLlmSearch);
  moreButton.textContent = ui(`显示更多标签（${Math.max(0, tagTotal - state.tagDisplayLimit)}）`, `Show more tags (${Math.max(0, tagTotal - state.tagDisplayLimit)})`);
  document.querySelectorAll("[data-tag-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tagView === state.tagLibraryView);
  });
  els.tagThresholdControl.classList.toggle("is-hidden", state.tagLibraryView !== "grouped");
  els.tagThresholdRange.value = String(state.tagGroupThreshold);
  els.tagThresholdValue.textContent = `${state.tagGroupThreshold}%`;

  // LLM 检索模式：按模型给的相关度顺序展示候选标签和理由
  const llmSearch = state.tagLlmSearch;
  if (llmSearch) {
    const hits = llmSearch.matches.filter((match) => tagById(match.tagId));
    const note = llmSearch.llmUsed ? "" : `<div class="empty">${escapeHtml(t("llmSearchFallback", llmSearch.error))}</div>`;
    const head = `<div class="empty">${escapeHtml(t("llmSearchTagHead", llmSearch.query, hits.length))}</div>`;
    els.tagTree.innerHTML =
      head +
      note +
      (hits.length
        ? `<div class="tag-library-grid">${hits
            .map(
              (match) => `
                <div class="llm-search-hit">
                  ${tagCardHtml(tagById(match.tagId))}
                  <div class="llm-search-reason">${escapeHtml(match.reason || "")} · ${(Number(match.confidence || 0) * 100).toFixed(0)}%</div>
                </div>
              `
            )
            .join("")}</div>`
        : `<div class="empty">${escapeHtml(t("llmSearchNoResults"))}</div>`);
    return;
  }

  if (!visibleTags.length) {
    els.tagTree.innerHTML = `<div class="empty">${escapeHtml(t("noTags"))}</div>`;
    return;
  }

  if (state.tagLibraryView === "flat") {
    const orderedTags = [...visibleTags].sort(compareTags);
    els.tagTree.innerHTML = `<div class="tag-library-grid">${orderedTags.map(tagCardHtml).join("")}</div>`;
    return;
  }

  const normalTags = visibleTags.filter((tag) => !isSystemTag(tag));
  const systemTags = visibleTags.filter(isSystemTag);
  const clusters = clusterTagsByTopic(normalTags);
  const groups = clusters
    .filter((cluster) => cluster.members.length > 1)
    .map((cluster) => {
      const union = new Set();
      for (const member of cluster.members) {
        for (const id of member.set) union.add(id);
      }
      return {
        label: cluster.members.slice(0, 3).map((member) => member.tag.name).join(" / "),
        tags: cluster.members.map((member) => member.tag),
        paperCount: union.size
      };
    })
    .sort((a, b) => b.tags.length - a.tags.length || b.paperCount - a.paperCount || a.label.localeCompare(b.label, "zh-CN"));

  const leftovers = [
    ...clusters.filter((cluster) => cluster.members.length === 1).map((cluster) => cluster.members[0].tag).sort(compareTags),
    ...systemTags
  ];
  if (leftovers.length) {
    const union = new Set();
    for (const tag of leftovers) {
      for (const id of tag.paperIds || []) union.add(id);
    }
    groups.push({ label: t("tagGroupOther"), tags: leftovers, paperCount: union.size });
  }

  els.tagTree.innerHTML = groups
    .map(
      (group) => `
        <section class="tag-group">
          <div class="tag-group-head">
            <strong>${escapeHtml(group.label)}</strong>
            <span>${escapeHtml(t("tagGroupMeta", group.tags.length, group.paperCount))}</span>
          </div>
          <div class="tag-library-grid">${group.tags.map(tagCardHtml).join("")}</div>
        </section>
      `
    )
    .join("");
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
    <div class="tag-description-block"><p>${escapeHtml(tagDescriptionLabel(tag))}</p>${!isSystemTag(tag) ? `<small class="muted">${escapeHtml(tag.descriptionModel ? `${tag.descriptionProvider} / ${tag.descriptionModel} · ${formatDate(tag.descriptionUpdatedAt)}` : ui("根据你提供的标签和关联论文生成", "Based on your tag and linked papers"))} ${tag.descriptionStatus === "stale" ? ui(" · 待更新", " · Update pending") : ""}</small>${tag.descriptionError ? `<p class="description-error">${escapeHtml(tag.descriptionError)}</p>` : ""}` : ""}</div>
    <div class="button-row">
      <button class="secondary-button" type="button" data-filter-from-tag="${escapeHtml(tag.id)}">${ui("在论文库中筛选", "Filter library")}</button>
      ${!isSystemTag(tag) ? `<button class="secondary-button" type="button" data-describe-tag="${escapeHtml(tag.id)}">${ui("重新生成说明", "Regenerate description")}</button>` : ""}
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
      const allTags = uniq([merge.canonical, ...sourceTags]);
      return `
        <article class="merge-review-card" data-merge-index="${index}">
          <div class="merge-route">
            <span class="merge-target">${escapeHtml(merge.canonical)}</span>
            <span class="merge-arrow">${state.language === "en" ? "keep" : "保留"}</span>
          </div>
          <label class="merge-canonical-control">
            <span>${escapeHtml(t("keepTag"))}</span>
            <select data-merge-canonical="${index}">
              ${allTags.map((name) => `<option value="${escapeHtml(name)}" ${name === merge.canonical ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
          <div class="merge-sources">
            ${allTags.map((name) => `<span class="tag-chip">${escapeHtml(name)}</span>`).join("")}
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

function renderPaperCardsHtml(papers, { includeTags = false } = {}) {
  if (!papers.length) return `<div class="empty">${escapeHtml(t("noPapers"))}</div>`;
  return papers
    .map(
      (paper) => {
        const tags = includeTags ? paperTags(paper) : [];
        return `
          <article class="paper-card" data-open-paper-id="${escapeHtml(paper.id)}" role="button" tabindex="0" aria-label="${escapeHtml(paper.title)}">
            ${paperTitleHtml(paper)}
            ${paperCardMetaHtml(paper)}
            <p>${escapeHtml(truncate(paper.abstract || t("noAbstract")))}</p>
            ${includeTags ? `<div class="chip-row">${tags.map((tag) => `<button type="button" class="tag-chip" data-library-tag-id="${escapeHtml(tag.id)}" title="${escapeHtml(tagDescriptionLabel(tag))}">${escapeHtml(tag.name)}</button>`).join("")}</div>` : ""}
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
  state.conversationExpanded = false;
  state.expandedClipIds.clear();
  // 换了一篇就把上一篇的 blob URL 释放掉，不然翻几十篇会一直占着内存
  if (state.clipAssets && state.clipAssets.paperId !== paperId) releaseClipAssets();
  // 先切视图再渲染：折叠逻辑要测量内容高度，元素必须可见
  switchView("paperDetail");
  renderPaperDetail(paper.id);
}

function clearLibraryFilters() {
  state.libraryTagIds = []; state.libraryPage = 1; state.paperLlmSearch = null; state.searchRequest++;
  els.paperLibraryFilter.value = "";
  document.getElementById("libraryMinScore").value = "0";
  document.getElementById("libraryTagFilter").value = "";
  renderPaperLibrary();
}

document.getElementById("libraryAddPaper").addEventListener("click", () => { switchView("library"); document.getElementById("paperTitle").focus(); });
document.getElementById("clearLibraryFilters").addEventListener("click", clearLibraryFilters);
for (const id of ["libraryMatchMode", "libraryMinScore"]) document.getElementById(id).addEventListener("change", () => { state.libraryPage = 1; renderPaperLibrary(); });
document.getElementById("libraryTagFilter").addEventListener("input", () => { state.libraryTagLimit = 16; renderPaperLibrary(); });
document.getElementById("showMoreLibraryTags").addEventListener("click", () => { state.libraryTagLimit += 16; renderPaperLibrary(); });
document.body.addEventListener("click", (event) => {
  const tag = event.target.closest("[data-library-tag-id], [data-filter-from-tag]");
  if (tag) {
    const id = tag.dataset.libraryTagId || tag.dataset.filterFromTag;
    state.libraryTagIds = tag.dataset.filterFromTag ? [id] : state.libraryTagIds.includes(id) ? state.libraryTagIds.filter((value) => value !== id) : [...state.libraryTagIds, id];
    state.libraryPage = 1;
    state.paperLibraryMode = "list";
    switchView("papers"); renderPaperLibrary();
  }
  const page = event.target.closest("[data-library-page]");
  if (page) { state.libraryPage = Number(page.dataset.libraryPage); renderPaperLibrary(); els.paperLibraryList.scrollIntoView({ block: "start", behavior: "smooth" }); }
  if (event.target.closest("[data-library-empty]")) { if (state.papers.length) clearLibraryFilters(); else switchView("library"); }
});

document.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !document.querySelector("dialog[open]")) {
    event.preventDefault(); state.paperLibraryMode = "list"; switchView("papers"); renderPaperLibrary(); els.paperLibraryFilter.focus(); els.paperLibraryFilter.select(); return;
  }
  const input = event.target.closest(".manual-tag-input");
  if (input) {
    const list = input.parentElement.querySelector(".tag-suggestions");
    if (!list || list.hidden) return;
    const options = [...list.querySelectorAll(".tag-suggestion")];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation();
      let index = options.findIndex((option) => option.classList.contains("active"));
      index = (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options.forEach((option, position) => { option.classList.toggle("active", position === index); option.setAttribute("aria-selected", String(position === index)); });
      if (options[index]) { input.setAttribute("aria-activedescendant", options[index].id); options[index].scrollIntoView({ block: "nearest" }); }
    } else if (event.key === "Enter") {
      const active = options.find((option) => option.classList.contains("active"));
      if (active) { event.preventDefault(); event.stopPropagation(); active.click(); }
    } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); hideTagSuggestions(); }
    return;
  }
  if (["Enter", " "].includes(event.key) && event.target.matches('[role="button"][data-open-paper-id], .tag-library-card')) { event.preventDefault(); event.target.click(); }
}, true);

async function generateDescriptions(button, tagId = "") {
  const done = setBusy(button, ui("生成中…", "Generating…"));
  try {
    const result = await api("/api/tags/describe", { method: "POST", body: { tagIds: tagId ? [tagId] : [], force: Boolean(tagId), retry: true } });
    if (result.tags) state.tags = result.tags;
    renderTagTree(); renderTagDetail(); renderPaperLibrary();
    toast(result.error || (result.failed ? ui(`${result.failed} 个说明生成失败，请在标签详情中重试`, `${result.failed} descriptions failed; retry in tag details`) : ui(`已更新 ${result.generated} 个标签说明${result.remaining ? "，其余将在后台继续" : ""}`, `Updated ${result.generated} descriptions${result.remaining ? "; continuing in the background" : ""}`)));
    if (result.remaining && !result.error) chrome.runtime.sendMessage({ type: "auto-describe-tags", retry: true }).catch(() => {});
  } catch (err) { toast(err.message); } finally { done(); }
}
document.getElementById("describeTagsButton").addEventListener("click", (event) => generateDescriptions(event.currentTarget));
document.getElementById("tagDetail").addEventListener("click", (event) => { const button = event.target.closest("[data-describe-tag]"); if (button) generateDescriptions(button, button.dataset.describeTag); });


function switchView(name) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  const viewId = `view-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  els.viewTitle.textContent = t(name) || t("appName");
  if (name === "settings") autoRefreshModelCatalogs();
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
    valueScore: normalizeValueScore(els.paperValueScore.value),
    manualTags: collectManualTags()
  };
}

async function chooseDuplicateAction(payload) {
  const duplicate = await api("/api/papers/check-duplicate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (!duplicate.duplicate) return "";
  const merge = window.confirm(t("duplicatePrompt", duplicate.paper?.title || "", duplicate.score || 1));
  if (merge) return "merge";
  const create = window.confirm(t("duplicateCreatePrompt"));
  return create ? "create" : "cancel";
}

function collectSettingsForm() {
  const payload = {
    maxTagsPerPaper: Number(document.getElementById("maxTagsPerPaper").value),
    maxTags: Number(document.getElementById("maxTags").value),
    autoDescribeTags: document.getElementById("autoDescribeTags").checked,
    provider: document.querySelector('input[name="provider"]:checked')?.value || "qwen"
  };
  for (const provider of MODEL_PROVIDERS) {
    const view = PROVIDER_VIEWS[provider];
    payload[`${provider}Key`] = els[`${provider}Key`].value.trim();
    payload[view.modelField] = currentModelValue(provider);
    payload[view.baseUrlField] = els[view.baseUrlField].value.trim();
  }
  return payload;
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

els.paperValueScore.addEventListener("input", () => renderValueScore(els.paperValueScore, els.paperValueScoreText));
els.paperDetailValueScore.addEventListener("input", () => renderValueScore(els.paperDetailValueScore, els.paperDetailValueScoreText));

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
    input?.focus();
    hideTagSuggestions(row || document);
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
    const payload = collectPaperForm();
    const duplicateAction = await chooseDuplicateAction(payload);
    if (duplicateAction === "cancel") return;
    const result = await api("/api/papers", {
      method: "POST",
      body: JSON.stringify({ ...payload, duplicateAction })
    });
    state.papers = result.papers || [result.paper, ...state.papers.filter((paper) => paper.id !== result.paper.id)];
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    els.paperForm.reset();
    els.paperValueScore.value = "3";
    renderValueScore(els.paperValueScore, els.paperValueScoreText);
    resetManualTagInputs();
    els.previewTags.textContent = t("mergePrompt");
    els.previewTags.classList.add("empty");
    renderAll();
    refreshCitationForNewPaper(result.paper?.id);
    toast(result.duplicateMerged ? t("duplicatePaperMerged") : result.duplicate ? t("duplicatePaperSaved") : t("paperSaved"));
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
  if (event.isComposing || event.key !== "Enter") return;
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
  if (event.isComposing || event.key !== "Enter") return;
  event.preventDefault();
  const row = createTagInputRow("", t("tagInputPlaceholder"));
  els.paperDetailTagList.append(row);
  row.querySelector(".manual-tag-input").focus();
});

els.paperFilter.addEventListener("input", () => renderPapers());

els.paperLibraryFilter.addEventListener("input", () => {
  state.searchRequest++;
  state.libraryPage = 1;
  state.paperLlmSearch = null; // 修改检索词即退出 LLM 结果模式，回到本地即时过滤
  renderPaperLibrary();
});

els.paperLibraryLlmSearchButton.addEventListener("click", async () => {
  const query = els.paperLibraryFilter.value.trim();
  if (!query) {
    toast(t("llmSearchNeedQuery"));
    els.paperLibraryFilter.focus();
    return;
  }
  const request = ++state.searchRequest;
  const done = setBusy(els.paperLibraryLlmSearchButton, t("searching"));
  try {
    const result = await api("/api/search-papers", { method: "POST", body: JSON.stringify({ query }) });
    if (request !== state.searchRequest || query !== els.paperLibraryFilter.value.trim()) return;
    state.libraryPage = 1;
    state.paperLlmSearch = { query, matches: result.matches || [], llmUsed: result.llmUsed, error: result.error || "" };
    renderPaperLibrary();
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.paperLibrarySort.addEventListener("change", () => renderPaperLibrary());

els.refreshCitationsButton.addEventListener("click", async () => {
  if (state.citationRefreshStarted) {
    toast(t("refreshCitationsRunning"));
    return;
  }
  if (!state.papers.length) {
    toast(t("refreshCitationsEmpty"));
    return;
  }
  toast(t("refreshCitationsStart", state.papers.length));
  const summary = await refreshStaleCitations({ force: true });
  toast(citationSummaryText(summary));
});

els.tagLibraryFilter.addEventListener("input", () => {
  state.tagSearchRequest++;
  state.tagDisplayLimit = 48;
  state.tagLlmSearch = null; // 修改检索词即退出 LLM 结果模式，回到本地即时过滤
  renderTagTree();
});

els.tagLibraryLlmSearchButton.addEventListener("click", async () => {
  const query = els.tagLibraryFilter.value.trim();
  if (!query) {
    toast(t("llmSearchNeedQuery"));
    els.tagLibraryFilter.focus();
    return;
  }
  const request = ++state.tagSearchRequest;
  const done = setBusy(els.tagLibraryLlmSearchButton, t("searching"));
  try {
    // 复用智能检索的 LLM 标签检索路由
    const result = await api("/api/search", { method: "POST", body: JSON.stringify({ query }) });
    if (request !== state.tagSearchRequest || query !== els.tagLibraryFilter.value.trim()) return;
    state.tagLlmSearch = { query, matches: result.matches || [], llmUsed: result.llmUsed, error: result.error || "" };
    renderTagTree();
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

document.querySelectorAll("[data-tag-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.tagLibraryView = button.dataset.tagView === "flat" ? "flat" : "grouped";
    localStorage.setItem("tagLibraryView", state.tagLibraryView);
    renderTagTree();
  });
});

els.tagThresholdRange.addEventListener("input", () => {
  state.tagGroupThreshold = Math.min(90, Math.max(10, Number(els.tagThresholdRange.value) || 50));
  localStorage.setItem("tagGroupThreshold", String(state.tagGroupThreshold));
  renderTagTree();
});

document.querySelectorAll("[data-paper-library-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.paperLibraryMode = button.dataset.paperLibraryMode === "map" ? "map" : "list";
    localStorage.setItem("paperLibraryMode", state.paperLibraryMode);
    renderPaperLibrary();
  });
});

els.paperMapFilter.addEventListener("input", () => renderPaperMap());
els.paperMapMatchMode.addEventListener("change", () => renderPaperMap());

els.paperMapFocusToggle.addEventListener("click", () => {
  state.paperMapFocus = state.paperMapFocus === "off" ? "on" : "off";
  localStorage.setItem("paperMapFocus", state.paperMapFocus);
  renderPaperMap();
});

els.paperMapClearButton.addEventListener("click", () => {
  state.selectedMapTagIds = [];
  state.selectedMapPaperId = null;
  renderPaperMap();
});
els.paperMapShell.addEventListener("scroll", () => requestAnimationFrame(drawPaperMapLines), true);
window.addEventListener("resize", () => requestAnimationFrame(drawPaperMapLines));

els.paperLibraryMapMode.addEventListener("click", (event) => {
  const openTagButton = event.target.closest("[data-open-map-tag-id]");
  if (openTagButton) {
    state.activeTagId = openTagButton.dataset.openMapTagId;
    switchView("tags");
    renderTagDetail();
    return;
  }

  const openPaperButton = event.target.closest("[data-open-map-paper-id]");
  if (openPaperButton) {
    showPaper(openPaperButton.dataset.openMapPaperId);
    return;
  }

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

els.refreshPaperDetailCitationButton.addEventListener("click", async () => {
  const paperId = state.activePaperId;
  if (!paperId || !paperById(paperId)) return;
  const done = setBusy(els.refreshPaperDetailCitationButton, t("refreshOneCitationBusy"));
  try {
    const updated = await refreshPaperCitation(paperId);
    renderCitationViews(paperId);
    if (updated?.citationStatus === "ok" && typeof updated.citationCount === "number") {
      toast(t("refreshOneCitationOk", updated.citationCount));
    } else if (updated?.citationStatus === "notfound") {
      toast(t("refreshOneCitationNotFound"));
    } else {
      toast(updated?.citationError || t("refreshOneCitationFailed"));
    }
  } catch (err) {
    toast(err.message || t("refreshOneCitationFailed"));
  } finally {
    done();
  }
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
  const previousClip = paperById(paperId)?.clip?.markdown || "";
  try {
    const result = await api(`/api/papers/${encodeURIComponent(paperId)}`, {
      method: "PUT",
      body: JSON.stringify({
        title,
        abstract: els.paperDetailAbstractInput.value.trim(),
        conversation: els.paperDetailConversationInput.value.trim(),
        valueScore: normalizeValueScore(els.paperDetailValueScore.value),
        manualTags
      })
    });

    // 各份材料的标题/正文单独走 clips 接口
    let latest = result.paper;
    for (const item of els.paperDetailClipsEditor.querySelectorAll(".clip-editor-item")) {
      const clipId = item.dataset.clipId;
      const clip = paperClips(latest).find((entry) => entry.id === clipId);
      if (!clip) continue;
      const title = item.querySelector(".clip-title-input").value.trim();
      const markdown = item.querySelector(".clip-markdown-input").value;
      if (title === (clip.title || "") && markdown.trim() === clip.markdown) continue;
      const clipResult = await api(`/api/papers/${encodeURIComponent(paperId)}/clips/${encodeURIComponent(clipId)}`, {
        method: "PUT",
        body: JSON.stringify({ title, markdown })
      });
      latest = clipResult.paper;
      releaseClipAssets();
    }
    result.paper = latest;
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    const index = state.papers.findIndex((paper) => paper.id === paperId);
    if (index >= 0) state.papers[index] = result.paper;
    state.paperDetailEditing = false;
    // 正文没动就别丢图片缓存，否则每次保存都要重新读一遍存档
    if ((result.paper?.clip?.markdown || "") !== previousClip) releaseClipAssets();
    renderAll();
    toast(t("paperUpdated"));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.toggleConversationButton.addEventListener("click", () => {
  state.conversationExpanded = !state.conversationExpanded;
  updateConversationCollapse();
});

// 每份材料的展开 / 重下图片 / 删除，都走事件委托
els.paperDetailClips.addEventListener("click", async (event) => {
  const section = event.target.closest(".clip-section");
  if (!section) return;
  const clipId = section.dataset.clipId;
  const paper = paperById(state.activePaperId);
  if (!paper) return;
  const button = event.target.closest("[data-clip-action]");

  if (!button) {
    // 点正文空白处也能展开
    if (state.expandedClipIds.has(clipId) || event.target.closest("a, img")) return;
    state.expandedClipIds.add(clipId);
    updateClipCollapse(section, clipId);
    return;
  }

  if (button.dataset.clipAction === "toggle") {
    if (state.expandedClipIds.has(clipId)) state.expandedClipIds.delete(clipId);
    else state.expandedClipIds.add(clipId);
    updateClipCollapse(section, clipId);
    return;
  }

  if (button.dataset.clipAction === "refresh") {
    // 下载交给后台（service worker + offscreen 文档）：只有那边能把图片写成磁盘文件，
    // 完成后会广播 clip-archive-images-done，下面的监听器负责刷新界面
    const done = setBusy(button, t("refreshingClipAssets"));
    state.clipArchiveRestore = done;
    try {
      await chrome.runtime.sendMessage({ type: "clip-archive-images", paperId: paper.id, clipId, refresh: true });
    } catch (err) {
      toast(err.message);
      state.clipArchiveRestore = null;
      done();
    }
    return;
  }

  if (button.dataset.clipAction === "delete") {
    const clip = paperClips(paper).find((item) => item.id === clipId);
    if (!confirm(t("confirmDeleteClip", clip?.title || t("clipHeading")))) return;
    try {
      const result = await api(`/api/papers/${encodeURIComponent(paper.id)}/clips/${encodeURIComponent(clipId)}`, { method: "DELETE" });
      const index = state.papers.findIndex((item) => item.id === paper.id);
      if (index !== -1) state.papers[index] = result.paper;
      releaseClipAssets();
      renderAll();
      toast(result.assetDir ? t("clipDeletedKeepFiles", result.assetDir) : t("clipDeleted"));
    } catch (err) {
      toast(err.message);
    }
  }
});

els.openClipFolderButton.addEventListener("click", () => {
  // 下载记录抓完就抹掉了（不然一篇几十张图会刷屏下载列表），只能打开下载目录根
  chrome.downloads.showDefaultFolder();
});

// 本地图读不到就退回原始网址，并把"没开文件访问"的提示亮出来
els.paperDetailClips.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (img?.tagName !== "IMG") return;
    const remote = img.dataset.remote;
    if (!remote || !String(img.getAttribute("src")).startsWith("file://")) return;
    state.clipFileAccessBlocked = true;
    img.src = remote;
    renderClipWarning(paperById(state.activePaperId));
  },
  true
);

/* ----- 把当前这篇并进另一篇论文 ----- */

function renderAbsorbList() {
  const filter = normalizeText(els.absorbFilter.value);
  const candidates = state.papers
    .filter((paper) => paper.id !== state.activePaperId)
    .filter((paper) => !filter || paperSearchText(paper).includes(filter))
    .slice(0, 50);
  els.absorbList.innerHTML = candidates.length
    ? candidates
        .map(
          (paper) => `
            <button class="absorb-item" type="button" data-absorb-target="${escapeHtml(paper.id)}">
              <strong>${escapeHtml(paper.title)}</strong>
              <small>${escapeHtml([formatDate(paper.createdAt), sourceDomain(paper), paperClips(paper).length ? t("clipBadge", paperClips(paper).length) : ""].filter(Boolean).join(" · "))}</small>
            </button>
          `
        )
        .join("")
    : `<div class="empty">${escapeHtml(t("noPapers"))}</div>`;
}

els.absorbPaperButton.addEventListener("click", () => {
  els.absorbFilter.value = "";
  renderAbsorbList();
  els.absorbDialog.showModal();
});

els.closeAbsorbDialog.addEventListener("click", () => els.absorbDialog.close());
els.absorbFilter.addEventListener("input", renderAbsorbList);

els.absorbList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-absorb-target]");
  if (!button) return;
  const targetId = button.dataset.absorbTarget;
  const sourceId = state.activePaperId;
  const target = paperById(targetId);
  const source = paperById(sourceId);
  if (!target || !source) return;
  if (!confirm(t("confirmAbsorb", source.title, target.title))) return;
  try {
    const result = await api(`/api/papers/${encodeURIComponent(targetId)}/absorb`, {
      method: "POST",
      body: JSON.stringify({ sourcePaperId: sourceId })
    });
    state.papers = result.papers || state.papers;
    state.tags = result.tags || state.tags;
    state.meta = result.meta || state.meta;
    state.activePaperId = targetId;
    releaseClipAssets();
    els.absorbDialog.close();
    renderAll();
    toast(t("absorbed", target.title));
  } catch (err) {
    toast(err.message);
  }
});

els.paperLinkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const paperId = state.activePaperId;
  if (!paperId) return;
  const linkUrl = els.paperLinkUrl.value.trim();
  if (!/^https?:\/\//i.test(linkUrl)) {
    toast(t("invalidLink"));
    return;
  }
  const done = setBusy(els.paperLinkSubmit, t("addingLink"));
  try {
    const result = await api(`/api/papers/${encodeURIComponent(paperId)}/links`, {
      method: "POST",
      body: JSON.stringify({ url: linkUrl, title: els.paperLinkTitle.value.trim() })
    });
    const index = state.papers.findIndex((paper) => paper.id === paperId);
    if (index >= 0) state.papers[index] = result.paper;
    els.paperLinkUrl.value = "";
    els.paperLinkTitle.value = "";
    renderPaperLinks(result.paper);
    toast(t("linkAdded"));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

els.paperDetailLinks.addEventListener("click", async (event) => {
  const refreshButton = event.target.closest(".refresh-link-preview");
  if (refreshButton) {
    const paperId = state.activePaperId;
    const link = (paperById(paperId)?.links || []).find((item) => item.id === refreshButton.dataset.linkId);
    if (!link) return;
    const done = setBusy(refreshButton, "…");
    try {
      const result = await api(`/api/papers/${encodeURIComponent(paperId)}/links/${encodeURIComponent(link.id)}/preview`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const index = state.papers.findIndex((item) => item.id === paperId);
      if (index >= 0) state.papers[index] = result.paper;
      renderPaperLinks(result.paper);
      toast(result.previewFound ? t("previewRefreshed") : t("previewNotFound"));
    } catch (err) {
      toast(err.message);
      done();
    }
    return;
  }

  const removeButton = event.target.closest(".remove-link");
  if (!removeButton) return;
  const paperId = state.activePaperId;
  const paper = paperById(paperId);
  const link = (paper?.links || []).find((item) => item.id === removeButton.dataset.linkId);
  if (!link) return;
  if (!window.confirm(t("confirmDeleteLink", link.title || link.previewTitle || link.url))) return;
  const done = setBusy(removeButton, "...");
  try {
    const result = await api(`/api/papers/${encodeURIComponent(paperId)}/links/${encodeURIComponent(link.id)}`, {
      method: "DELETE"
    });
    const index = state.papers.findIndex((item) => item.id === paperId);
    if (index >= 0) state.papers[index] = result.paper;
    renderPaperLinks(result.paper);
    toast(t("linkDeleted"));
  } catch (err) {
    toast(err.message);
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
    done();
    if (result.paper) {
      const index = state.papers.findIndex((item) => item.id === paperId);
      if (index >= 0) state.papers[index] = result.paper;
    }
    if (result.llmUsed && result.paper?.llmSimilar) {
      renderLlmSimilarSection(result.paper);
      if (result.noNewPapers) toast(t("noNewPapersSinceLast"));
    } else {
      // 模型不可用：展示返回的兜底/历史结果，但不改按钮和时间戳
      renderSimilarResults(els.llmSimilarPaperList, result.matches || [], t("llmUnavailable", result.error));
      if (!result.llmUsed) toast(t("llmUnavailable", result.error));
    }
  } catch (err) {
    done();
    els.llmSimilarPaperList.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
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
    if (event.isComposing || event.key !== "Enter") return;
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
  if (event.target.closest("a, [data-library-tag-id], [data-filter-from-tag], [data-describe-tag]")) return;

  const refreshCitationButton = event.target.closest("[data-refresh-citation-id]");
  if (refreshCitationButton) {
    const paperId = refreshCitationButton.dataset.refreshCitationId;
    const paper = paperById(paperId);
    if (!paper) return;
    const done = setBusy(refreshCitationButton, t("refreshOneCitationBusy"));
    try {
      const updated = await refreshPaperCitation(paperId);
      renderCitationViews(paperId);
      if (updated?.citationStatus === "ok" && typeof updated.citationCount === "number") {
        toast(t("refreshOneCitationOk", updated.citationCount));
      } else if (updated?.citationStatus === "notfound") {
        toast(t("refreshOneCitationNotFound"));
      } else {
        toast(updated?.citationError || t("refreshOneCitationFailed"));
      }
    } catch (err) {
      toast(err.message || t("refreshOneCitationFailed"));
    } finally {
      done();
    }
    return;
  }

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
    return;
  }

  const paperCard = event.target.closest("[data-open-paper-id]");
  if (paperCard && !window.getSelection()?.toString()) {
    showPaper(paperCard.dataset.openPaperId);
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

els.analyzeRedundantTagsButton.addEventListener("click", async () => {
  const done = setBusy(els.analyzeRedundantTagsButton, t("generating"));
  try {
    const result = await api("/api/tags/analyze-redundancy", {
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
    toast(mergeCount ? t("redundancySuggestions", mergeCount) : t("redundancyNoSuggestions"));
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
    const selectedCanonical = els.mergeReviewList.querySelector(`[data-merge-canonical="${index}"]`)?.value || merge.canonical;
    const allNames = uniq([merge.canonical, ...splitMergeTags(merge.tags)]);
    const reviewedMerge = {
      ...merge,
      canonical: selectedCanonical,
      tags: allNames.filter((name) => normalizeText(name) !== normalizeText(selectedCanonical))
    };
    const done = setBusy(approveButton, state.language === "en" ? "Merging..." : "合并中...");
    try {
      await mergeTags(reviewedMerge);
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
        clearZhipuKey: els.clearZhipuKey.checked,
        clearKimiKey: els.clearKimiKey.checked,
        clearDeepseekKey: els.clearDeepseekKey.checked
      })
    });
    state.config = result.config;
    els.qwenKey.value = "";
    els.zhipuKey.value = "";
    els.kimiKey.value = "";
    els.deepseekKey.value = "";
    els.clearQwenKey.checked = false;
    els.clearZhipuKey.checked = false;
    els.clearKimiKey.checked = false;
    els.clearDeepseekKey.checked = false;
    state.modelCatalog = { ...state.modelCatalog, ...(result.config?.modelCatalog || {}) };
    renderModelStatus();
    renderSettings();
    toast(t("settingsSaved"));
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

document.querySelectorAll("[data-model-select]").forEach((select) => {
  select.addEventListener("change", () => {
    const provider = select.dataset.modelSelect;
    const { input } = modelPickerEls(provider);
    if (select.value === CUSTOM_MODEL_VALUE) {
      state.customModelProviders.add(provider);
      input.hidden = false;
      input.placeholder = t("customModelPlaceholder");
      input.focus();
      input.select();
      return;
    }
    // 选了清单里的模型：同步到隐藏输入框，保存时两边取值一致
    state.customModelProviders.delete(provider);
    input.value = select.value;
    input.hidden = true;
  });
});

document.querySelectorAll("[data-refresh-models]").forEach((button) => {
  button.addEventListener("click", () => refreshModelCatalog(button.dataset.refreshModels));
});

els.refreshAllModels.addEventListener("click", async () => {
  const done = setBusy(els.refreshAllModels, t("refreshingModels"));
  try {
    await Promise.all(MODEL_PROVIDERS.map((provider) => refreshModelCatalog(provider, { silent: true })));
    const remote = MODEL_PROVIDERS.filter((provider) => modelCatalogFor(provider).source === "remote");
    const total = remote.reduce((sum, provider) => sum + (modelCatalogFor(provider).models || []).length, 0);
    toast(
      state.language === "en"
        ? `Fetched ${total} models from ${remote.length} providers`
        : `已从 ${remote.length} 个后端拉到 ${total} 个可用模型`
    );
  } finally {
    done();
  }
});

els.exportDataButton.addEventListener("click", async () => {
  const done = setBusy(els.exportDataButton, state.language === "en" ? "Exporting..." : "导出中...");
  try {
    const payload = await api("/api/export");
    downloadJson(`Paper_Mind-${new Date().toISOString().slice(0, 10)}.json`, payload);
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

els.abstractLangToggle.addEventListener("click", (event) => {
  const button = event.target.closest("[data-abstract-lang]");
  if (!button) return;
  state.abstractLang = button.dataset.abstractLang === "en" ? "en" : "zh";
  localStorage.setItem("abstractLang", state.abstractLang);
  renderAbstractSection(paperById(state.activePaperId));
});

els.translateAbstractButton.addEventListener("click", async () => {
  const paper = paperById(state.activePaperId);
  if (!paper) return;
  const done = setBusy(els.translateAbstractButton, t("translating"));
  try {
    const result = await api(`/api/papers/${encodeURIComponent(paper.id)}/translate-abstract`, { method: "POST" });
    if (result.translated && result.paper) {
      const index = state.papers.findIndex((item) => item.id === result.paper.id);
      if (index !== -1) state.papers[index] = result.paper;
      state.abstractLang = "zh";
      localStorage.setItem("abstractLang", "zh");
      renderAbstractSection(result.paper);
    } else if (result.error) {
      toast(result.error);
    }
  } catch (err) {
    toast(err.message);
  } finally {
    done();
  }
});

// 后台自动任务（翻译摘要 / 相似推荐）完成后，实时更新管理页数据；
// 如果正好开着这篇论文的详情页，直接刷新对应区块
chrome.runtime?.onMessage?.addListener((message) => {
  if (message?.type === "tag-descriptions-updated") {
    api("/api/state").then((data) => { state.tags = data.tags; renderTagTree(); renderTagDetail(); renderPaperLibrary(); }).catch(() => {});
    return;
  }
  if (message?.type === "clip-archive-images-failed") {
    if (state.clipArchiveRestore) {
      state.clipArchiveRestore();
      state.clipArchiveRestore = null;
    }
    toast(message.error || t("clipAssetsFailedToast", ""));
    return;
  }
  if (!message?.paper?.id) return;
  if (!["auto-recommend-similar-done", "auto-translate-abstract-done", "clip-archive-images-done"].includes(message.type)) return;
  if (state.clipArchiveRestore) {
    state.clipArchiveRestore();
    state.clipArchiveRestore = null;
  }
  const index = state.papers.findIndex((paper) => paper.id === message.paper.id);
  if (index === -1) return;
  state.papers[index] = message.paper;
  if (message.type === "clip-archive-images-done") {
    if (state.activePaperId === message.paper.id) {
      releaseClipAssets();
      state.clipFileAccessBlocked = false;
      renderAbstractSection(message.paper);
    }
    toast(message.saved ? t("clipAssetsToast", message.paper.title || "", message.saved, message.total) : t("clipAssetsFailedToast", message.paper.title || ""));
  } else if (message.type === "auto-recommend-similar-done") {
    if (state.activePaperId === message.paper.id) renderLlmSimilarSection(message.paper);
    toast(t("autoRecommendDone", message.paper.title || ""));
  } else {
    if (state.activePaperId === message.paper.id) renderAbstractSection(message.paper);
    toast(t("abstractTranslatedToast", message.paper.title || ""));
  }
});

resetTopicForm();
// 打开管理页时让后台补跑没存成的剪藏图片（service worker 被回收过就会卡在 pending）
chrome.runtime?.sendMessage?.({ type: "clip-archive-sweep" })?.catch?.(() => {});
loadState()
  .then(() => {
    const hashMatch = location.hash.match(/^#paper=(.+)$/);
    if (hashMatch) showPaper(decodeURIComponent(hashMatch[1]));
    else switchView("papers");
    chrome.runtime.sendMessage({ type: "auto-describe-tags" }).catch(() => {});
  })
  .catch((err) => toast(err.message));

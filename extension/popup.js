import { tagKey, splitTags, suggestTags, DEFAULT_TAG_POLICY } from "./library-tools.js";
import { handleApi } from "./storage.js";
import { CLIP_MIN_TEXT_LENGTH, buildClipRecord, clipExcerpt, pageClipExtractor } from "./clipper.js";

const isMac = (navigator.userAgentData?.platform || navigator.userAgent).toUpperCase().includes("MAC");

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
  tags: [],
  config: {},
  paperCount: 0,
  selectedTags: [],
  currentTab: null,
  language: localStorage.getItem("paperTagLanguage") || "zh",
  loaded: false,
  submitting: false,
  suggestionIndex: -1,
  existingPaper: null,
  forceCreate: false,
  clip: null,
  clipEnabled: false,
  clipPreviewOpen: false,
  // 识别到"这份剪藏是库里某篇论文的解读"时的候选和选择
  mergeTarget: null,
  mergeChoice: "merge"
};

const els = {
  popupTitle: document.querySelector("#popupTitle"),
  serverStatus: document.querySelector("#serverStatus"),
  languageSelect: document.querySelector("#languageSelect"),
  reloadButton: document.querySelector("#reloadButton"),
  openManagerButton: document.querySelector("#openManagerButton"),
  form: document.querySelector("#paperForm"),
  titleLabel: document.querySelector("#titleLabel"),
  title: document.querySelector("#titleInput"),
  valueScoreLabel: document.querySelector("#valueScoreLabel"),
  valueScore: document.querySelector("#valueScoreInput"),
  valueScoreText: document.querySelector("#valueScoreText"),
  abstractLabel: document.querySelector("#abstractLabel"),
  abstract: document.querySelector("#abstractInput"),
  notesLabel: document.querySelector("#notesLabel"),
  conversation: document.querySelector("#conversationInput"),
  tagsLabel: document.querySelector("#tagsLabel"),
  tagBox: document.querySelector("#tagBox"),
  tagInput: document.querySelector("#tagInput"),
  tagSuggestions: document.querySelector("#tagSuggestions"),
  quickTags: document.querySelector("#quickTags"),
  quickTagsLabel: document.querySelector("#quickTagsLabel"),
  quickTagsList: document.querySelector("#quickTagsList"),
  savedBanner: document.querySelector("#savedBanner"),
  savedBannerText: document.querySelector("#savedBannerText"),
  savedBannerTags: document.querySelector("#savedBannerTags"),
  savedOpenButton: document.querySelector("#savedOpenButton"),
  savedCreateNewButton: document.querySelector("#savedCreateNewButton"),
  duplicatePanel: document.querySelector("#duplicatePanel"),
  duplicateText: document.querySelector("#duplicateText"),
  duplicateTagsLine: document.querySelector("#duplicateTagsLine"),
  dupCreateButton: document.querySelector("#dupCreateButton"),
  dupCancelButton: document.querySelector("#dupCancelButton"),
  saveButton: document.querySelector("#saveButton"),
  message: document.querySelector("#message"),
  clipPanel: document.querySelector("#clipPanel"),
  clipEnabled: document.querySelector("#clipEnabledInput"),
  clipToggleLabel: document.querySelector("#clipToggleLabel"),
  clipPreviewButton: document.querySelector("#clipPreviewButton"),
  clipStats: document.querySelector("#clipStats"),
  clipPreview: document.querySelector("#clipPreview"),
  mergePanel: document.querySelector("#mergePanel"),
  mergeText: document.querySelector("#mergeText"),
  mergeChoiceMerge: document.querySelector("#mergeChoiceMerge"),
  mergeChoiceNew: document.querySelector("#mergeChoiceNew")
};

const translations = {
  zh: {
    title: "收藏论文",
    connecting: "读取本地论文库…",
    statusReady: (papers, tags) => `本地论文库 · ${papers} 篇论文 · ${tags} 个标签`,
    disconnected: "本地论文库不可用",
    storageError: (message) => `插件本地存储暂时不可用：${message}`,
    manager: "管理",
    openManagerTitle: "打开管理页",
    reloadTitle: "重新读取当前页面",
    paperTitle: "论文标题",
    titlePlaceholder: "已自动读取页面标题，可修改",
    valueScore: "价值评分",
    abstract: "摘要",
    abstractPlaceholder: "自动读取页面摘要，也可手动粘贴 abstract",
    notes: "备注 / 对话记录",
    notesPlaceholder: "保存来源链接、选中文本或阅读笔记",
    tags: "标签",
    tagInputPlaceholder: "输入或搜索标签，回车添加",
    quickTags: "全部标签",
    createTag: (name) => `新建「${name}」`,
    paperCount: (count) => `${count} 篇`,
    removeTag: "移除标签",
    save: "保存到论文库",
    updateExisting: "合并更新已有论文",
    alreadySaved: (date) => `✓ 这篇论文已收藏过${date ? `（${date}）` : ""}，保存会合并更新`,
    viewInManager: "在管理页查看",
    createSeparate: "仍要新建一篇",
    saving: "保存中…",
    saved: "已收藏到本地论文库 ✓",
    savedWithAuto: "已收藏 ✓ 后台正在翻译摘要并生成相似推荐…",
    savedDuplicate: "已存在相似论文，新标签已合并到已有论文",
    savedMerged: "已合并到已有论文，标签、摘要和备注已取并集",
    titleRequired: "请填写论文标题",
    duplicateFound: (title, score) => `库里已有标题相似的论文（相似度 ${Math.round(score * 100)}%）：${title}\n如果不是同一篇，请点「仍然新建」。`,
    duplicateTags: (names) => `已有标签：${names}`,
    dupCreate: "仍然新建",
    dupCancel: "取消",
    sourcePage: (url) => `来源页面：${url}`,
    selectedText: "选中文本：",
    clipboardLabel: "剪贴板内容：",
    clipToggle: "保存网页正文",
    clipPreview: "预览",
    clipHidePreview: "收起",
    clipStats: (words, images) => `已读到正文 ${words} 字${images ? ` · ${images} 张图` : ""}，正文会存进「简介」里`,
    clipSource: (site, author) => [site, author].filter(Boolean).join(" · "),
    clipOffHint: "不勾选就只存标题和摘要",
    savedWithClip: (images) => `已收藏 ✓ ${images ? `后台正在把 ${images} 张图片存到下载目录…` : "网页正文已存入"}`,
    mergeFound: (title, reason) => `这篇像是《${title}》的解读（${reason}），并进去就不用存两条`,
    mergeFoundReverse: (title, reason) => `库里已经存过这篇论文的解读《${title}》（${reason}），并进去就不用存两条`,
    mergeHintPromote: "并入后：这条记录的标题、摘要和来源会换成论文本身的，已存的解读作为材料保留",
    mergeInto: "并入这篇",
    mergeSeparate: "单独保存",
    mergeHint: "并入后：正文作为一份材料挂到那篇论文下，标题和摘要不会被覆盖",
    saveMerge: (title) => `并入《${title}》`,
    savedMergedIntoPaper: (title, images) => `已并入《${title}》✓${images ? ` 后台正在存 ${images} 张图…` : ""}`
  },
  en: {
    title: "Save Paper",
    connecting: "Reading local library...",
    statusReady: (papers, tags) => `Local library · ${papers} papers · ${tags} tags`,
    disconnected: "Local library unavailable",
    storageError: (message) => `Extension storage is unavailable: ${message}`,
    manager: "Open",
    openManagerTitle: "Open manager",
    reloadTitle: "Reload current page",
    paperTitle: "Paper title",
    titlePlaceholder: "Page title is read automatically; edit as needed",
    valueScore: "Value score",
    abstract: "Abstract",
    abstractPlaceholder: "Page abstract is read automatically; paste manually if needed",
    notes: "Notes / Conversation",
    notesPlaceholder: "Source URL, selected text, or reading notes",
    tags: "Tags",
    tagInputPlaceholder: "Type to search tags, Enter to add",
    quickTags: "All tags",
    createTag: (name) => `Create "${name}"`,
    paperCount: (count) => `${count} papers`,
    removeTag: "Remove tag",
    save: "Save to Library",
    updateExisting: "Update Existing (merge)",
    alreadySaved: (date) => `✓ Already saved${date ? ` (${date})` : ""}; saving will merge updates`,
    viewInManager: "View in manager",
    createSeparate: "Create a separate entry",
    saving: "Saving...",
    saved: "Saved to the local library ✓",
    savedWithAuto: "Saved ✓ translating the abstract and generating recommendations in the background...",
    savedDuplicate: "A similar paper already exists; new tags were merged into it",
    savedMerged: "Merged into the existing paper; tags, abstract, and notes were unioned",
    titleRequired: "Paper title is required",
    duplicateFound: (title, score) => `A paper with a similar title already exists (${Math.round(score * 100)}% match): ${title}\nIf it is a different paper, click "Create anyway".`,
    duplicateTags: (names) => `Existing tags: ${names}`,
    dupCreate: "Create anyway",
    dupCancel: "Cancel",
    sourcePage: (url) => `Source page: ${url}`,
    selectedText: "Selected text:",
    clipboardLabel: "Clipboard:",
    clipToggle: "Save page content",
    clipPreview: "Preview",
    clipHidePreview: "Hide",
    clipStats: (words, images) => `Captured ${words} characters${images ? ` · ${images} images` : ""}; the content goes into the abstract`,
    clipSource: (site, author) => [site, author].filter(Boolean).join(" · "),
    clipOffHint: "Unchecked saves only the title and abstract",
    savedWithClip: (images) => `Saved ✓ ${images ? `saving ${images} images to your downloads folder...` : "page content stored"}`,
    mergeFound: (title, reason) => `This looks like a write-up of "${title}" (${reason}); merge it instead of keeping two entries`,
    mergeFoundReverse: (title, reason) => `Your library already has a write-up of this paper: "${title}" (${reason}); merge instead of keeping two entries`,
    mergeHintPromote: "Merging replaces that entry's title, abstract, and source with the paper's own; the saved write-up stays as a material",
    mergeInto: "Merge into it",
    mergeSeparate: "Keep separate",
    mergeHint: "Merging attaches this page as one more material; the paper's title and abstract stay unchanged",
    saveMerge: (title) => `Merge into "${title}"`,
    savedMergedIntoPaper: (title, images) => `Merged into "${title}" ✓${images ? ` saving ${images} images...` : ""}`
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

function normalize(value) { return tagKey(value); }

function normalizeValueScore(value, fallback = 3) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  const base = Number.isFinite(numeric) ? numeric : fallback;
  return Math.min(5, Math.max(1, Math.round(base * 2) / 2));
}

function valueScoreLabel(score) {
  const normalized = normalizeValueScore(score);
  const labels = VALUE_SCORE_LABELS[state.language] || VALUE_SCORE_LABELS.zh;
  if (Number.isInteger(normalized)) return `${normalized}${state.language === "en" ? " pts" : "分"}=${labels[normalized]}`;
  const lower = Math.floor(normalized);
  const upper = Math.ceil(normalized);
  return `${normalized}${state.language === "en" ? " pts" : "分"}=${labels[lower]} / ${labels[upper]}`;
}

function renderValueScore() {
  const score = normalizeValueScore(els.valueScore.value);
  els.valueScore.value = String(score);
  els.valueScoreText.textContent = valueScoreLabel(score);
}

function isSystemTag(tag) {
  return Boolean(tag?.system) || tag?.id === "system-unsorted";
}

async function api(path, options = {}) {
  return handleApi(path, options);
}

function setMessage(text, type = "") {
  els.message.textContent = text;
  els.message.className = `message ${type}`.trim();
}

function applyLanguage() {
  document.documentElement.lang = state.language === "en" ? "en" : "zh-CN";
  els.languageSelect.value = state.language;
  els.popupTitle.textContent = t("title");
  els.openManagerButton.textContent = t("manager");
  els.openManagerButton.title = t("openManagerTitle");
  els.reloadButton.title = t("reloadTitle");
  els.titleLabel.textContent = t("paperTitle");
  els.valueScoreLabel.textContent = t("valueScore");
  els.abstractLabel.textContent = t("abstract");
  els.notesLabel.textContent = t("notes");
  document.getElementById("pasteNotesButton").textContent = state.language === "en" ? "Paste clipboard" : "粘贴剪贴板";
  els.title.placeholder = t("titlePlaceholder");
  els.abstract.placeholder = t("abstractPlaceholder");
  els.conversation.placeholder = t("notesPlaceholder");
  els.tagsLabel.textContent = t("tags");
  els.tagInput.placeholder = t("tagInputPlaceholder");
  els.quickTagsLabel.textContent = state.language === "en" ? "Frequently used · search for more" : "常用标签 · 输入可查找更多";
  els.dupCreateButton.textContent = t("dupCreate");
  els.dupCancelButton.textContent = t("dupCancel");
  els.savedOpenButton.textContent = t("viewInManager");
  els.savedCreateNewButton.textContent = t("createSeparate");
  renderSavedBanner();
  renderSaveButton();
  renderStatus();
  renderChips();
  renderValueScore();
  renderClipPanel();
  renderMergePanel();
}

function isMergeMode() {
  return Boolean(state.existingPaper && !state.forceCreate);
}

function renderSaveButton() {
  const label = isMergingIntoPaper() ? t("saveMerge", state.mergeTarget.title) : isMergeMode() ? t("updateExisting") : t("save");
  els.saveButton.innerHTML = `${escapeHtml(label)} <kbd>${isMac ? "⌘" : "Ctrl"}⏎</kbd>`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(state.language === "en" ? "en" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function renderSavedBanner() {
  if (!isMergeMode()) {
    els.savedBanner.hidden = true;
    return;
  }
  const duplicate = state.existingPaper;
  els.savedBannerText.textContent = t("alreadySaved", formatDate(duplicate.paper?.createdAt));
  const tagNames = (duplicate.tagNames || []).filter(Boolean);
  els.savedBannerTags.hidden = !tagNames.length;
  els.savedBannerTags.textContent = tagNames.length ? t("duplicateTags", tagNames.join(state.language === "en" ? ", " : "、")) : "";
  els.savedBanner.hidden = false;
}

async function detectExistingPaper() {
  state.existingPaper = null;
  state.forceCreate = false;
  const title = els.title.value.replace(/\s+/g, " ").trim();
  const sourceUrl = state.currentTab?.url || "";
  if (title || sourceUrl) {
    try {
      const duplicate = await api("/api/papers/check-duplicate", {
        method: "POST",
        body: JSON.stringify({ title, sourceUrl })
      });
      if (duplicate.duplicate) state.existingPaper = duplicate;
    } catch {
      // Detection is best-effort; saving still re-checks duplicates.
    }
  }
  if (state.existingPaper?.paper && !state.forceCreate) {
    els.valueScore.value = String(normalizeValueScore(state.existingPaper.paper.valueScore, 3));
    renderValueScore();
  }
  renderSavedBanner();
  renderSaveButton();
}

function renderStatus() {
  els.serverStatus.textContent = state.loaded ? t("statusReady", state.paperCount, state.tags.length) : t("connecting");
}

/* ----- chip tag input ----- */

function renderChips() {
  els.tagBox.querySelectorAll(".chip").forEach((chip) => chip.remove());
  for (const name of state.selectedTags) {
    const chip = document.createElement("span");
    chip.className = "chip";
    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-remove";
    remove.title = t("removeTag");
    remove.dataset.removeTag = name;
    remove.textContent = "×";
    chip.append(label, remove);
    els.tagBox.insertBefore(chip, els.tagInput);
  }
  renderQuickTags();
}

function addTag(name) {
  const incoming = splitTags(name).map((name) => state.tags.find((tag) => [tag.name, ...(tag.aliases || [])].some((value) => tagKey(value) === tagKey(name)))?.name || name);
  const next = [...new Map([...state.selectedTags, ...incoming].map((name) => [tagKey(name), name])).values()];
  const limit = Math.max(state.config.maxTagsPerPaper || DEFAULT_TAG_POLICY.maxTagsPerPaper, state.existingPaper?.paper?.tagIds?.length || 0);
  if (next.length > limit) { setMessage(state.language === "en" ? `Use up to ${limit} core tags per paper.` : `每篇最多 ${limit} 个核心标签，细节可写入笔记。`, "error"); return; }
  state.selectedTags = next;
  renderChips();
  els.tagInput.value = "";
  hideSuggestions();
}

function removeTag(name) {
  state.selectedTags = state.selectedTags.filter((tag) => normalize(tag) !== normalize(name));
  renderChips();
}

function renderQuickTags() {
  const limit = state.config.maxTagsPerPaper || DEFAULT_TAG_POLICY.maxTagsPerPaper;
  document.getElementById("tagPolicyNote").textContent = state.language === "en" ? `${state.selectedTags.length} / ${limit} tags · reuse existing topics${state.config.autoDescribeTags !== false ? " · AI writes descriptions after saving" : ""}` : `${state.selectedTags.length} / ${limit} 个标签 · 优先复用已有概念${state.config.autoDescribeTags !== false ? " · 保存后 AI 编写说明" : ""}`;

  const selected = new Set(state.selectedTags.map(normalize));
  const top = state.tags
    .filter((tag) => !isSystemTag(tag) && !selected.has(normalize(tag.name)))
    .sort((a, b) => (b.paperIds?.length || 0) - (a.paperIds?.length || 0) || a.name.localeCompare(b.name, "zh-CN")).slice(0, 8);
  els.quickTags.hidden = !top.length;
  els.quickTagsList.innerHTML = top
    .map((tag) => `<button type="button" class="quick-tag" data-quick-tag="${escapeHtml(tag.name)}" title="${escapeHtml(tag.description || tag.name)}">${escapeHtml(tag.name)}</button>`)
    .join("");
}

/* ----- tag suggestions ----- */

function paperContextText() {
  return `${els.title.value} ${els.abstract.value} ${els.conversation.value}`;
}

function matchingTags(query) {
  return suggestTags(state.tags, query, { selected: state.selectedTags, context: paperContextText() });
}

function suggestionItems() {
  const query = els.tagInput.value.trim();
  const matches = matchingTags(query);
  const items = matches.map((tag) => ({ value: tag.name, count: tag.paperIds?.length || 0, description: tag.description || "", create: false }));
  const exact = query && state.tags.some((tag) => [tag.name, ...(tag.aliases || [])].some((name) => tagKey(name) === tagKey(query)));
  if (query && !exact) items.push({ value: query, count: 0, create: true });
  return items;
}

function renderSuggestions() {
  const items = suggestionItems();
  if (!items.length) {
    hideSuggestions();
    return;
  }
  if (state.suggestionIndex >= items.length) state.suggestionIndex = items.length - 1;
  els.tagSuggestions.innerHTML = items
    .map((item, index) => {
      const active = index === state.suggestionIndex ? " active" : "";
      if (item.create) {
        return `<button type="button" class="tag-suggestion create${active}" data-tag-value="${escapeHtml(item.value)}">${escapeHtml(t("createTag", item.value))}</button>`;
      }
      return `
        <button type="button" class="tag-suggestion${active}" data-tag-value="${escapeHtml(item.value)}">
          <span>${escapeHtml(item.value)}${item.description ? `<small class="suggestion-description">${escapeHtml(item.description)}</small>` : ""}</span>
          <small>${escapeHtml(t("paperCount", item.count))}</small>
        </button>
      `;
    })
    .join("");
  els.tagSuggestions.hidden = false;
}

function hideSuggestions() {
  state.suggestionIndex = -1;
  els.tagSuggestions.hidden = true;
  els.tagSuggestions.innerHTML = "";
}

function moveSuggestion(delta) {
  const total = els.tagSuggestions.querySelectorAll(".tag-suggestion").length;
  if (!total) return;
  state.suggestionIndex = (state.suggestionIndex + delta + total) % total;
  renderSuggestions();
  els.tagSuggestions.querySelector(".tag-suggestion.active")?.scrollIntoView({ block: "nearest" });
}

/* ----- read current page ----- */

function cleanPageTitle(value) {
  return String(value || "")
    .replace(/^\[\d{4}\.\d{4,5}(v\d+)?\]\s*/, "")
    .trim();
}

// alphaXiv/arXiv 页面的 og:description 只有截断到 ~200 字符的摘要；
// URL 里带 arXiv 编号时直接从 arXiv 官方 API 拿完整摘要
function arxivIdFromUrl(url) {
  const match = String(url || "").match(/(?:arxiv\.org|alphaxiv\.(?:io|org))\/(?:abs|pdf|html|paper)\/(\d{4}\.\d{4,5})(v\d+)?/i);
  return match ? match[1] + (match[2] || "") : "";
}

async function fetchArxivAbstract(arxivId) {
  const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`);
  if (!response.ok) return "";
  const xml = await response.text();
  const match = xml.match(/<summary>([\s\S]*?)<\/summary>/);
  if (!match) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = match[1];
  return textarea.value.replace(/\s+/g, " ").trim();
}

async function fillFullAbstractFromArxiv(tabUrl, truncatedAbstract) {
  const arxivId = arxivIdFromUrl(tabUrl);
  if (!arxivId) return;
  try {
    const fullAbstract = await fetchArxivAbstract(arxivId);
    // 只在拿到更完整的版本、且用户没改过摘要框时覆盖，避免覆盖手动编辑
    if (fullAbstract && fullAbstract.length > els.abstract.value.trim().length && els.abstract.value.trim() === truncatedAbstract) {
      els.abstract.value = fullAbstract;
    }
  } catch {
    // arXiv API 不可达时保留页面上抓到的截断版
  }
}

/* ----- 网页剪藏 ----- */

function renderClipPanel() {
  const clip = state.clip;
  els.clipPanel.hidden = !clip;
  if (!clip) {
    renderMergePanel();
    return;
  }
  els.clipEnabled.checked = state.clipEnabled;
  els.clipToggleLabel.textContent = t("clipToggle");
  els.clipPreviewButton.textContent = state.clipPreviewOpen ? t("clipHidePreview") : t("clipPreview");
  const source = t("clipSource", clip.siteName, clip.author);
  const stats = state.clipEnabled ? t("clipStats", clip.textLength, clip.imageCount) : t("clipOffHint");
  els.clipStats.textContent = [source, stats].filter(Boolean).join(" · ");
  els.clipPreview.hidden = !state.clipPreviewOpen;
  if (state.clipPreviewOpen) els.clipPreview.textContent = clip.markdown.slice(0, 4000);
  renderMergePanel();
}

function isMergingIntoPaper() {
  return Boolean(state.mergeTarget && state.mergeChoice === "merge");
}

function renderMergePanel() {
  const target = state.mergeTarget;
  els.mergePanel.hidden = !target;
  if (!target) return;
  // 两个方向文案不一样：存解读时是"挂到论文下"，存论文时是"库里已有它的解读"
  const found = target.direction === "paper-about-clip" ? t("mergeFoundReverse", target.title, target.reason) : t("mergeFound", target.title, target.reason);
  const hint = target.promote ? t("mergeHintPromote") : t("mergeHint");
  els.mergeText.textContent = `${found}。${hint}`;
  els.mergeChoiceMerge.textContent = t("mergeInto");
  els.mergeChoiceNew.textContent = t("mergeSeparate");
  els.mergeChoiceMerge.classList.toggle("active", state.mergeChoice === "merge");
  els.mergeChoiceNew.classList.toggle("active", state.mergeChoice !== "merge");
}

// 公众号解读和原论文常常是同一件事，存两条没意义。这里问后端"这份剪藏讲的是库里哪篇论文"，
// 只认 arXiv 编号 / DOI / 论文标题这类硬证据，命中才提示，免得误并。
async function detectMergeTarget() {
  state.mergeTarget = null;
  state.mergeChoice = "merge";
  const sourceUrl = state.currentTab?.url || "";
  if (!state.clip?.markdown && !els.title.value.trim() && !sourceUrl) {
    renderMergePanel();
    return;
  }
  try {
    const result = await api("/api/papers/match-clip", {
      method: "POST",
      body: JSON.stringify({
        // 剪藏正文用来找"我提到了库里哪篇论文"；标题和地址用来找"库里哪条解读讲的是我"
        markdown: state.clipEnabled && state.clip ? state.clip.markdown : "",
        title: els.title.value,
        sourceUrl
      })
    });
    const best = (result.matches || [])[0];
    // 已经识别为"这篇本身就收藏过"时不再提合并，那条路走查重逻辑
    if (best && !state.existingPaper) state.mergeTarget = best;
  } catch {
    // 配对只是锦上添花，失败就当没有
  }
  renderMergePanel();
  renderSaveButton();
}

// 正文抽取跑在页面里：公众号这类反爬站点，浏览器里的 DOM 才是拿得到全文的地方
async function readPageClip(tab) {
  state.clip = null;
  state.clipEnabled = false;
  state.clipPreviewOpen = false;
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageClipExtractor });
    const clip = result?.result;
    if (!clip?.ok) return;
    if (clip.textLength < CLIP_MIN_TEXT_LENGTH && !clip.imageCount) return;
    state.clip = clip;
    // arXiv/alphaXiv 有专门的摘要来源，整页剪下来反而是噪声，这类页面默认不勾
    state.clipEnabled = !arxivIdFromUrl(tab.url);
    if (state.clipEnabled) {
      const excerpt = clipExcerpt(clip.markdown, 600);
      if (excerpt) els.abstract.value = excerpt;
    }
  } catch {
    // chrome:// 、应用商店等页面不允许注入脚本，静默跳过
  } finally {
    renderClipPanel();
  }
}

async function readCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.currentTab = tab;
  if (!tab) return;

  els.title.value = cleanPageTitle(tab.title);
  const urlLine = tab.url ? t("sourcePage", tab.url) : "";
  els.conversation.value = urlLine;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const meta = (selector) => document.querySelector(selector)?.content?.trim() || "";
        const title =
          meta('meta[name="citation_title"]') ||
          meta('meta[property="og:title"]') ||
          document.querySelector("h1")?.innerText?.trim() ||
          document.title ||
          "";
        const description =
          meta('meta[name="citation_abstract"]') ||
          document.querySelector("blockquote.abstract")?.innerText?.replace(/^Abstract:?\s*/i, "").trim() ||
          meta('meta[name="description"]') ||
          meta('meta[property="og:description"]') ||
          "";
        const selectedText = window.getSelection()?.toString().trim() || "";
        return { title: title.trim(), description, selectedText };
      }
    });
    const page = result?.result || {};
    const pageTitle = cleanPageTitle(page.title);
    if (pageTitle && (!els.title.value || els.title.value.length > pageTitle.length + 20)) els.title.value = pageTitle;
    if (page.description) els.abstract.value = page.description;
    if (page.selectedText) {
      els.conversation.value = `${urlLine}${urlLine ? "\n\n" : ""}${t("selectedText")}\n${page.selectedText}`;
    }
    fillFullAbstractFromArxiv(tab.url, els.abstract.value.trim());
  } catch {
    // Some pages, such as chrome:// URLs or extension stores, do not allow script injection.
  }
  await readPageClip(tab);
}

async function fillConversationFromClipboard() {
  if (!navigator.clipboard?.readText) return;
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) return;
    if (els.conversation.value.includes(text)) return;
    els.conversation.value = `${els.conversation.value.trim()}${els.conversation.value.trim() ? "\n\n" : ""}${t("clipboardLabel")}\n${text}`;
  } catch {
    setMessage(state.language === "en" ? "Clipboard unavailable. Paste directly into notes." : "无法读取剪贴板，请直接粘贴到备注框。", "error");
  }
}

/* ----- save flow ----- */

function showDuplicatePanel(duplicate) {
  els.duplicateText.textContent = t("duplicateFound", duplicate.paper?.title || "", duplicate.score || 1);
  const tagNames = (duplicate.tagNames || []).filter(Boolean);
  els.duplicateTagsLine.hidden = !tagNames.length;
  els.duplicateTagsLine.textContent = tagNames.length ? t("duplicateTags", tagNames.join(state.language === "en" ? ", " : "、")) : "";
  els.duplicatePanel.hidden = false;
  els.duplicatePanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function hideDuplicatePanel() {
  els.duplicatePanel.hidden = true;
}

function collectPayload() {
  return {
    title: els.title.value.replace(/\s+/g, " ").trim(),
    abstract: els.abstract.value.trim(),
    conversation: els.conversation.value.trim(),
    sourceUrl: state.currentTab?.url || "",
    valueScore: normalizeValueScore(els.valueScore.value),
    manualTags: [...state.selectedTags],
    clip: state.clipEnabled && state.clip ? buildClipRecord(state.clip) : null,
    mergeIntoPaperId: isMergingIntoPaper() ? state.mergeTarget.paperId : "",
    promote: isMergingIntoPaper() ? Boolean(state.mergeTarget.promote) : false
  };
}

async function submitPaper(duplicateAction = "") {
  if (state.submitting) return;
  const pendingText = els.tagInput.value.trim();
  if (pendingText) addTag(pendingText);

  if (!duplicateAction) {
    if (isMergeMode()) duplicateAction = "merge";
    else if (state.forceCreate) duplicateAction = "create";
  }

  const payload = collectPayload();
  if (!payload.title && !payload.mergeIntoPaperId) {
    setMessage(t("titleRequired"), "error");
    els.title.focus();
    return;
  }

  state.submitting = true;
  els.saveButton.disabled = true;
  els.saveButton.textContent = t("saving");
  setMessage("");
  try {
    if (!duplicateAction && !payload.mergeIntoPaperId) {
      const duplicate = await api("/api/papers/check-duplicate", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (duplicate.duplicate) {
        showDuplicatePanel(duplicate);
        return;
      }
    }
    hideDuplicatePanel();
    const result = await api("/api/papers", {
      method: "POST",
      body: JSON.stringify({ ...payload, duplicateAction })
    });
    state.tags = result.tags || state.tags;
    state.paperCount = result.papers?.length ?? state.paperCount;
    state.selectedTags = [];
    els.form.reset();
    els.valueScore.value = "3";
    renderChips();
    renderValueScore();
    renderStatus();
    setMessage(
      result.mergedIntoPaper
        ? t("savedMergedIntoPaper", result.paper?.title || state.mergeTarget?.title || "", payload.clip?.imageCount || 0)
        : result.duplicateMerged
        ? t("savedMerged")
        : result.duplicate
          ? t("savedDuplicate")
          : payload.clip
            ? t("savedWithClip", payload.clip.imageCount)
            : llmConfigured()
              ? t("savedWithAuto")
              : t("saved"),
      "success"
    );
    if (result.paper?.id) {
      api(`/api/papers/${encodeURIComponent(result.paper.id)}/citation`, { method: "POST" }).catch(() => {});
    }
    await readCurrentPage();
    await detectExistingPaper();
  } catch (err) {
    setMessage(err.message, "error");
  } finally {
    state.submitting = false;
    els.saveButton.disabled = false;
    renderSaveButton();
  }
}

/* ----- state loading ----- */

// 当前选中的 LLM 是否已配好 key，配好了保存后台会自动生成相似推荐
function llmConfigured() {
  const config = state.config || {};
  const keyFlags = { qwen: "hasQwenKey", zhipu: "hasZhipuKey", kimi: "hasKimiKey", deepseek: "hasDeepseekKey" };
  return Boolean(config[keyFlags[config.provider]]);
}

async function loadState() {
  const data = await api("/api/state");
  state.tags = data.tags || [];
  state.config = data.config || {};
  state.paperCount = (data.papers || []).length;
  state.loaded = true;
  renderStatus();
  renderQuickTags();
}

async function initialize() {
  applyLanguage();
  try {
    await Promise.all([loadState(), readCurrentPage()]);
    await detectExistingPaper();
    await detectMergeTarget();
  } catch (err) {
    els.serverStatus.textContent = t("disconnected");
    setMessage(t("storageError", err.message), "error");
  }
}

/* ----- events ----- */

document.getElementById("pasteNotesButton").addEventListener("click", fillConversationFromClipboard);

els.reloadButton.addEventListener("click", async () => {
  setMessage("");
  hideDuplicatePanel();
  await initialize();
});

els.languageSelect.addEventListener("change", () => {
  state.language = els.languageSelect.value === "en" ? "en" : "zh";
  localStorage.setItem("paperTagLanguage", state.language);
  applyLanguage();
});

els.openManagerButton.addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
});

els.tagBox.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-tag]");
  if (remove) {
    removeTag(remove.dataset.removeTag);
    return;
  }
  els.tagInput.focus();
});

els.tagInput.addEventListener("input", () => {
  state.suggestionIndex = -1;
  renderSuggestions();
});

els.tagInput.addEventListener("focus", () => {
  renderSuggestions();
});

els.tagInput.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (els.tagSuggestions.hidden) renderSuggestions();
    moveSuggestion(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const active = els.tagSuggestions.querySelector(".tag-suggestion.active");
    if (!els.tagSuggestions.hidden && active) {
      addTag(active.dataset.tagValue || "");
    } else if (els.tagInput.value.trim()) {
      addTag(els.tagInput.value);
    }
    return;
  }
  if (event.key === "Escape") {
    hideSuggestions();
    return;
  }
  if (event.key === "Backspace" && !els.tagInput.value && state.selectedTags.length) {
    removeTag(state.selectedTags[state.selectedTags.length - 1]);
  }
});

els.tagSuggestions.addEventListener("click", (event) => {
  const suggestion = event.target.closest(".tag-suggestion");
  if (!suggestion) return;
  addTag(suggestion.dataset.tagValue || "");
  els.tagInput.focus();
});

els.quickTagsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick-tag]");
  if (button) addTag(button.dataset.quickTag);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".tag-box-wrap")) hideSuggestions();
});

els.title.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !(event.metaKey || event.ctrlKey)) event.preventDefault();
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    submitPaper();
  }
});

for (const field of [els.title, els.abstract, els.conversation]) {
  field.addEventListener("input", () => hideDuplicatePanel());
}

els.valueScore.addEventListener("input", renderValueScore);

els.clipEnabled.addEventListener("change", () => {
  state.clipEnabled = els.clipEnabled.checked;
  if (state.clipEnabled && state.clip && !els.abstract.value.trim()) {
    els.abstract.value = clipExcerpt(state.clip.markdown, 600);
  }
  renderClipPanel();
  // 勾不勾正文会改变配对依据，重判一次
  detectMergeTarget();
});

els.mergeChoiceMerge.addEventListener("click", () => {
  state.mergeChoice = "merge";
  renderMergePanel();
  renderSaveButton();
});

els.mergeChoiceNew.addEventListener("click", () => {
  state.mergeChoice = "new";
  renderMergePanel();
  renderSaveButton();
});

els.clipPreviewButton.addEventListener("click", () => {
  state.clipPreviewOpen = !state.clipPreviewOpen;
  renderClipPanel();
});

els.savedOpenButton.addEventListener("click", async () => {
  const paperId = state.existingPaper?.paper?.id;
  if (!paperId) return;
  await chrome.tabs.create({ url: chrome.runtime.getURL(`manager.html#paper=${encodeURIComponent(paperId)}`) });
});

els.savedCreateNewButton.addEventListener("click", () => {
  state.forceCreate = true;
  els.valueScore.value = "3";
  renderValueScore();
  renderSavedBanner();
  renderSaveButton();
});

els.dupCreateButton.addEventListener("click", () => submitPaper("create"));
els.dupCancelButton.addEventListener("click", () => {
  hideDuplicatePanel();
  setMessage("");
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPaper();
});

initialize();

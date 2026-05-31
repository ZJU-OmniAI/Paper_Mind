import { handleApi } from "./storage.js";

const state = {
  tags: [],
  currentTab: null,
  lastSyncedAt: 0,
  language: localStorage.getItem("paperTagLanguage") || "zh",
  paperFormSubmitting: false
};

const els = {
  serverStatus: document.querySelector("#serverStatus"),
  languageSelect: document.querySelector("#languageSelect"),
  openManagerButton: document.querySelector("#openManagerButton"),
  reloadButton: document.querySelector("#reloadButton"),
  form: document.querySelector("#paperForm"),
  title: document.querySelector("#titleInput"),
  abstract: document.querySelector("#abstractInput"),
  conversation: document.querySelector("#conversationInput"),
  tagRows: document.querySelector("#tagRows"),
  addTagButton: document.querySelector("#addTagButton"),
  message: document.querySelector("#message")
};

const translations = {
  zh: {
    title: "添加论文",
    connecting: "读取本地标签库中...",
    manager: "管理",
    openManagerTitle: "打开管理系统",
    reloadTitle: "重新读取当前页面",
    paperTitle: "论文标题",
    abstract: "简介摘要",
    abstractPlaceholder: "可自动读取页面描述，也可手动粘贴 abstract",
    conversation: "对话记录 / 备注",
    conversationPlaceholder: "可保存当前 URL、选中文本或你的阅读备注",
    tags: "标签",
    addTag: "添加标签",
    save: "保存到本地标签库",
    tagPlaceholder: "搜索已有标签或输入新标签",
    removeTag: "删除标签",
    createTag: (name) => `新建标签：${name}`,
    paperCount: (count) => `${count} 篇`,
    connected: (count) => `本地标签库 · ${count} 个标签`,
    disconnected: "本地标签库不可用",
    startServer: (message) => `插件本地存储暂时不可用：${message}`,
    sourcePage: (url) => `来源页面：${url}`,
    selectedText: "选中文本：",
    saving: "保存中...",
    saved: "已保存到本地论文标签库。",
    requestFailed: (status) => `请求失败：${status}`
  },
  en: {
    title: "Add Paper",
    connecting: "Reading local tag library...",
    manager: "Open",
    openManagerTitle: "Open manager",
    reloadTitle: "Reload current page",
    paperTitle: "Paper title",
    abstract: "Abstract",
    abstractPlaceholder: "Read page description automatically or paste the abstract",
    conversation: "Conversation / Notes",
    conversationPlaceholder: "Save current URL, selected text, or reading notes",
    tags: "Tags",
    addTag: "Add Tag",
    save: "Save to Local Library",
    tagPlaceholder: "Search existing tags or enter a new tag",
    removeTag: "Remove tag",
    createTag: (name) => `Create tag: ${name}`,
    paperCount: (count) => `${count} papers`,
    connected: (count) => `Local library · ${count} tags`,
    disconnected: "Local library unavailable",
    startServer: (message) => `Extension storage is unavailable: ${message}`,
    sourcePage: (url) => `Source page: ${url}`,
    selectedText: "Selected text:",
    saving: "Saving...",
    saved: "Saved to the local paper library.",
    requestFailed: (status) => `Request failed: ${status}`
  }
};

function t(key, ...args) {
  const value = translations[state.language]?.[key] ?? translations.zh[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
}

function applyLanguage() {
  document.documentElement.lang = state.language === "en" ? "en" : "zh-CN";
  els.languageSelect.value = state.language;
  document.querySelector("h1").textContent = t("title");
  if (!state.tags.length) els.serverStatus.textContent = t("connecting");
  els.openManagerButton.textContent = t("manager");
  els.openManagerButton.title = t("openManagerTitle");
  els.reloadButton.title = t("reloadTitle");
  document.querySelector('label:has(#titleInput) span').textContent = t("paperTitle");
  document.querySelector('label:has(#abstractInput) span').textContent = t("abstract");
  document.querySelector('label:has(#conversationInput) span').textContent = t("conversation");
  els.abstract.placeholder = t("abstractPlaceholder");
  els.conversation.placeholder = t("conversationPlaceholder");
  document.querySelector(".label-row span").textContent = t("tags");
  els.addTagButton.textContent = t("addTag");
  els.form.querySelector(".primary").textContent = t("save");
  document.querySelectorAll(".tag-input").forEach((input) => {
    input.placeholder = t("tagPlaceholder");
  });
  document.querySelectorAll(".remove-tag").forEach((button) => {
    button.title = t("removeTag");
  });
  if (state.tags.length) els.serverStatus.textContent = t("connected", state.tags.length);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

async function api(path, options = {}) {
  return handleApi(path, options);
}

function setMessage(text, type = "") {
  els.message.textContent = text;
  els.message.className = `message ${type}`.trim();
}

function matchingTags(query) {
  const q = normalize(query);
  const tagTime = (tag) => Date.parse(tag.updatedAt || tag.createdAt || "") || 0;
  if (!q) return [...state.tags].sort((a, b) => tagTime(b) - tagTime(a) || a.name.localeCompare(b.name, "zh-CN"));
  return [...state.tags]
    .map((tag) => {
      const names = [tag.name, ...(tag.aliases || [])].map(normalize);
      let score = 0;
      if (names.some((name) => name === q)) score = 4;
      else if (names.some((name) => name.startsWith(q))) score = 3;
      else if (names.some((name) => name.includes(q))) score = 2;
      else if (names.some((name) => q.includes(name))) score = 1;
      return { tag, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || tagTime(b.tag) - tagTime(a.tag) || a.tag.name.localeCompare(b.tag.name, "zh-CN"))
    .map((item) => item.tag);
}

function tagRow(value = "") {
  const row = document.createElement("div");
  row.className = "tag-row";
  row.innerHTML = `
    <div class="tag-combobox">
      <input class="tag-input" autocomplete="off" placeholder="${escapeHtml(t("tagPlaceholder"))}" value="${escapeHtml(value)}" />
      <div class="tag-suggestions" hidden></div>
    </div>
    <button class="remove-tag" type="button" title="${escapeHtml(t("removeTag"))}">×</button>
  `;
  return row;
}

function addTagRow(value = "") {
  const row = tagRow(value);
  els.tagRows.append(row);
  row.querySelector(".tag-input").focus();
}

function renderSuggestions(input) {
  const box = input.closest(".tag-combobox");
  const suggestions = box.querySelector(".tag-suggestions");
  const matches = matchingTags(input.value);
  const current = input.value.trim();
  const exact = current && state.tags.some((tag) => normalize(tag.name) === normalize(current));
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
          <small>${escapeHtml(t("paperCount", tag.paperIds?.length || 0))}</small>
        </button>
      `
      )
      .join("") + createOption;
  suggestions.hidden = false;
}

function hideSuggestions(root = document) {
  root.querySelectorAll(".tag-suggestions").forEach((el) => {
    el.hidden = true;
  });
}

async function readCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.currentTab = tab;
  if (!tab) return;

  els.title.value = tab.title || "";
  const urlLine = tab.url ? t("sourcePage", tab.url) : "";
  els.conversation.value = urlLine;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const description =
          document.querySelector('meta[name="description"]')?.content ||
          document.querySelector('meta[property="og:description"]')?.content ||
          "";
        const selectedText = window.getSelection()?.toString() || "";
        const title =
          document.querySelector('meta[property="og:title"]')?.content ||
          document.querySelector("h1")?.innerText ||
          document.title ||
          "";
        return {
          title: title.trim(),
          description: description.trim(),
          selectedText: selectedText.trim()
        };
      }
    });
    const page = result?.result || {};
    if (page.title && (!els.title.value || els.title.value.length > page.title.length + 20)) els.title.value = page.title;
    if (page.description) els.abstract.value = page.description;
    if (page.selectedText) {
      els.conversation.value = `${urlLine}${urlLine ? "\n\n" : ""}${t("selectedText")}\n${page.selectedText}`;
    }
  } catch {
    // Some pages, such as chrome:// URLs or extension stores, do not allow script injection.
  }
}

async function loadState() {
  const data = await api("/api/state");
  state.tags = data.tags || [];
  state.lastSyncedAt = Date.now();
  els.serverStatus.textContent = t("connected", state.tags.length);
}

async function syncTags({ force = false } = {}) {
  if (!force && Date.now() - state.lastSyncedAt < 1200) return;
  const data = await api("/api/state");
  state.tags = data.tags || [];
  state.lastSyncedAt = Date.now();
  els.serverStatus.textContent = t("connected", state.tags.length);
}

function collectTags() {
  return [...document.querySelectorAll(".tag-input")].map((input) => input.value.trim()).filter(Boolean);
}

async function initialize() {
  applyLanguage();
  try {
    await Promise.all([loadState(), readCurrentPage()]);
    if (!els.tagRows.children.length) addTagRow();
  } catch (err) {
    els.serverStatus.textContent = t("disconnected");
    setMessage(t("startServer", err.message), "error");
    if (!els.tagRows.children.length) addTagRow();
  }
}

els.reloadButton.addEventListener("click", async () => {
  setMessage("");
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

els.addTagButton.addEventListener("click", () => addTagRow());

document.addEventListener("input", (event) => {
  const input = event.target.closest(".tag-input");
  if (input) renderSuggestions(input);
});

document.addEventListener("focusin", (event) => {
  const input = event.target.closest(".tag-input");
  if (!input) return;
  renderSuggestions(input);
  syncTags({ force: true })
    .then(() => {
      if (document.activeElement === input) renderSuggestions(input);
    })
    .catch(() => {});
});

document.addEventListener("click", (event) => {
  const suggestion = event.target.closest(".tag-suggestion");
  if (suggestion) {
    const row = suggestion.closest(".tag-row");
    const input = row.querySelector(".tag-input");
    input.value = suggestion.dataset.tagValue || "";
    hideSuggestions(row);
    input.focus();
    return;
  }

  const remove = event.target.closest(".remove-tag");
  if (remove) {
    const rows = [...els.tagRows.querySelectorAll(".tag-row")];
    if (rows.length <= 1) {
      rows[0].querySelector(".tag-input").value = "";
      return;
    }
    remove.closest(".tag-row").remove();
    return;
  }

  if (!event.target.closest(".tag-combobox")) hideSuggestions();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.closest(".tag-input")) return;
  event.preventDefault();
  addTagRow();
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.paperFormSubmitting) return;
  state.paperFormSubmitting = true;
  const button = els.form.querySelector(".primary");
  button.disabled = true;
  setMessage(t("saving"));
  try {
    const result = await api("/api/papers", {
      method: "POST",
      body: JSON.stringify({
        title: els.title.value.trim(),
        abstract: els.abstract.value.trim(),
        conversation: els.conversation.value.trim(),
        manualTags: collectTags()
      })
    });
    state.tags = result.tags || state.tags;
    setMessage(t("saved"));
    els.form.reset();
    els.tagRows.innerHTML = "";
    addTagRow();
    await readCurrentPage();
  } catch (err) {
    setMessage(err.message, "error");
  } finally {
    state.paperFormSubmitting = false;
    button.disabled = false;
  }
});

initialize();

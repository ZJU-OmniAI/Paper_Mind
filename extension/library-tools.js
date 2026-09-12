// Shared, dependency-free rules for capture, library search and storage.
export const DEFAULT_TAG_POLICY = { maxTagsPerPaper: 6, maxTags: 80, autoDescribeTags: true };

export function normalizeTagName(value) {
  return String(value ?? "").normalize("NFKC").replace(/^\s*#+/, "").trim().replace(/\s+/g, " ");
}

export function searchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function tagKey(value) {
  return searchText(normalizeTagName(value));
}

export function splitTags(value) {
  const parts = (Array.isArray(value) ? value : [value]).flatMap((part) => String(part ?? "").split(/[,，;；、\n]/));
  return [...new Map(parts.map(normalizeTagName).filter(Boolean).map((name) => [tagKey(name), name])).values()];
}

export function queryTerms(query) {
  return [...searchText(query).matchAll(/"([^"]+)"|“([^”]+)”|(\S+)/g)].map((match) => match[1] || match[2] || match[3]);
}

export function matchesText(text, query) {
  const haystack = searchText(text);
  return queryTerms(query).every((term) => haystack.includes(term));
}

export function paperSearchScore(paper, tags, query) {
  const terms = queryTerms(query);
  if (!terms.length) return 1;
  const linked = tags.filter((tag) => paper.tagIds?.includes(tag.id));
  const fields = [
    [paper.title, 8],
    [linked.flatMap((tag) => [tag.name, ...(tag.aliases || [])]).join(" "), 5],
    [[paper.abstract, paper.abstractZh, paper.sourceUrl, ...(paper.links || []).flatMap((link) => [link.title, link.url])].join(" "), 3],
    [[paper.conversation, ...(paper.clips || (paper.clip ? [paper.clip] : [])).map((clip) => clip.markdown), ...linked.map((tag) => tag.description)].join(" "), 1]
  ].map(([value, weight]) => [searchText(value), weight]);
  let score = 0;
  for (const term of terms) {
    const weight = fields.find(([text]) => text.includes(term))?.[1];
    if (!weight) return 0;
    score += weight;
  }
  return score;
}

export function suggestTags(tags, query, { selected = [], context = "", limit = 8 } = {}) {
  const q = tagKey(query);
  const selectedKeys = new Set(selected.map(tagKey));
  const ctx = searchText(context);
  return tags
    .filter((tag) => !tag.system && tag.id !== "system-unsorted")
    .filter((tag) => ![tag.name, ...(tag.aliases || [])].some((name) => selectedKeys.has(tagKey(name))))
    .map((tag) => {
      const names = [tag.name, ...(tag.aliases || [])].map(tagKey);
      const match = !q || matchesText(`${names.join(" ")} ${tag.description || ""}`, q);
      const score = (names.includes(q) ? 100 : names.some((name) => name.startsWith(q)) && q ? 60 : 0)
        + (names.some((name) => ctx.includes(name)) ? 10 : 0);
      return { tag, match, score };
    })
    .filter((item) => item.match)
    .sort((a, b) => b.score - a.score || (b.tag.paperIds?.length || 0) - (a.tag.paperIds?.length || 0) || a.tag.name.localeCompare(b.tag.name))
    .slice(0, limit).map((item) => item.tag);
}

export function safeWebUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function descriptionContext(tag, papers) {
  return {
    id: tag.id, name: tag.name, aliases: tag.aliases || [],
    papers: papers.filter((paper) => paper.tagIds?.includes(tag.id))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.id.localeCompare(b.id))
      .slice(0, 6).map((paper) => ({
        id: paper.id, title: paper.title,
        abstract: String(paper.abstract || "").slice(0, 2400),
        notes: String(paper.conversation || "").slice(0, 1200),
        content: (paper.clips || []).map((clip) => clip.markdown).join("\n").slice(0, 3600)
      }))
  };
}

export function contextFingerprint(context) {
  // Deterministic cache key; never used as a security hash.
  let hash = 2166136261;
  for (const char of JSON.stringify(context)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

// A field-level three-way merge preserves unrelated background updates. An edit
// to the same field, or edit/delete conflict, fails explicitly instead of losing data.
export function mergeStoreChanges(base, edited, current) {
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const conflict = () => { throw new Error("数据已在另一个页面更新，请刷新后重试；本次修改未覆盖已有数据。"); };
  const result = structuredClone(current);
  for (const collection of ["papers", "tags", "topicPacks"]) {
    const before = new Map((base[collection] || []).map((row) => [row.id, row]));
    const next = new Map((edited[collection] || []).map((row) => [row.id, row]));
    const live = new Map((current[collection] || []).map((row) => [row.id, row]));
    for (const [id, old] of before) {
      const value = next.get(id);
      if (equal(old, value)) continue;
      const latest = live.get(id);
      if (!value) { if (latest && !equal(latest, old)) conflict(); live.delete(id); continue; }
      if (!latest) conflict();
      const merged = { ...latest };
      for (const key of new Set([...Object.keys(old), ...Object.keys(value)])) {
        if (equal(old[key], value[key]) || (collection === "tags" && key === "paperIds")) continue;
        if (key !== "updatedAt" && !equal(latest[key], old[key]) && !equal(latest[key], value[key])) conflict();
        if (Object.hasOwn(value, key)) merged[key] = value[key]; else delete merged[key];
      }
      live.set(id, merged);
    }
    for (const [id, value] of next) if (!before.has(id)) { if (live.has(id)) conflict(); live.set(id, value); }
    result[collection] = [...live.values()];
  }
  result.meta = { ...current.meta };
  for (const [key, value] of Object.entries(edited.meta || {})) {
    if (!equal(base.meta?.[key], value)) result.meta[key] = value;
  }
  return result;
}

# Changelog

Notable changes to Paper_Mind. Versions follow the `version` field in `extension/manifest.json`.

## 1.3.x — current

- **Web clipping.** Any page — WeChat articles, blogs, Zhihu answers — can be saved as an entry. The body is converted to Markdown with headings, lists, quotes, code blocks, tables and video links preserved; the opening paragraph pre-fills the abstract.
- **Clipped images are written to disk** as ordinary files under `<Downloads>/Paper_Mind剪藏/`, fetched without a referrer so referrer-protected image hosts (WeChat) return the real image instead of a placeholder. Clips stay readable after the original page is gone.
- **A paper and its write-ups become one entry.** Clipped articles are matched to papers already in the library — and papers to already-clipped articles — by arXiv ID, DOI or title, in both directions. Merged entries keep every source as a separate material with its own title, source, word count and image folder.
- **Manual merge.** "Merge into another paper" moves clips, external links and tags onto a target entry.
- **Share-link noise ignored.** One-time URL parameters (WeChat `chksm`/`scene`, Xiaohongshu `xsec_token`, …) no longer cause the same article to be stored twice.
- **Clipped body text is searchable**, so remembering one sentence from an article is enough to find it.
- Citation counts via Semantic Scholar (by arXiv ID, DOI or title).
- Migration from 1.2 and earlier: the single `clip` field becomes the first entry of a `clips` array automatically.

## 1.2 and earlier

- One clip per entry, stored in a single `clip` field.
- 1.1 kept clipped images in browser IndexedDB. On upgrade they are moved to disk automatically, reusing the copies already downloaded, and the in-browser copies are dropped.

## 1.0

- Quick paper capture from the current tab (`citation_title`, `citation_abstract`, arXiv abstracts, headings, selected text).
- Tags with chip-style input, an automatic "Unsorted" tag, and topic packs aggregating papers by included/excluded tags.
- Fast local search over the paper and tag library.
- Duplicate detection before saving; local redundant-tag analysis.
- Daily 4 PM JSON backup, plus manual import/export.
- Optional LLM features (smart search, similar-paper recommendation, tag-merge review) using the user's own Qwen/DashScope or Zhipu GLM key.
- Bilingual UI (English / Simplified Chinese) with light and dark modes.

---

Earlier history, including the retired local web-server version of the app, is preserved in the git history and on the `legacy/local-server` branch.

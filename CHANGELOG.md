# Changelog

Notable changes to Paper_Mind. Versions follow the `version` field in `extension/manifest.json`.

## Unreleased

- Fixed empty authors and abstracts, and placeholder titles such as `arXiv:2405.19209 · LLM_in_PDF`, when saving from pages the popup cannot read: PDFs opened in the LLM_in_PDF reader (`chrome-extension://…/reader/reader.html?id=…` / `?url=…`) or another extension's PDF viewer. The popup resolves the wrapped paper, fills the title, authors, year, venue and full abstract from its arXiv ID, OpenReview ID, conference landing page (NeurIPS, CVF, ACL, PMLR, JMLR, IJCAI, AAAI, RSS, IEEE) or DOI, and saves the paper's own address instead of the reader address. Lookups never overwrite fields edited while they run.
- Page reading covers more sites: case-insensitive Highwire / Dublin Core / eprints tags, `citation_authors` lists (PubMed), IEEE Xplore records, ScienceDirect author lists, academic project page templates and GitHub README titles. Abstracts come from the page's own Abstract section instead of citation-string descriptions (ACL, PMLR) or ~200-character previews (alphaXiv), and a clip excerpt no longer replaces a real abstract. Author names read "First Last" everywhere; arXiv HTML, ar5iv, Hugging Face Papers, papers.cool and Emergent Mind pages are identified by their arXiv ID.
- arXiv papers gain a venue from arXiv's journal reference or an explicit acceptance comment ("Accepted to CVPR 2026", "ICML 2026 Spotlight"); submissions, extended versions and challenge reports are ignored. A repository or project page is matched to a linked arXiv paper only when its title agrees; commentary pages are never looked up by title.
- Added **Fill paper details** to the library toolbar to complete earlier saves: missing authors, year and venue, truncated abstracts (translations are refreshed), placeholder or case-only title differences, and reader addresses. arXiv papers are fetched in one batch request; others are looked up one at a time within rate limits. A save made before the popup's lookup returns is completed once in the background. **Fill missing details** in the editor uses the same identifier-first order before falling back to Semantic Scholar / Crossref.
- Duplicate detection treats the arXiv, alphaXiv, Hugging Face Papers, ar5iv, PDF-reader and conference-PDF addresses of a paper as one source.

- Reorganized per-tag topic analysis around comparing the design thinking of papers under one tag. Five views: **Overview** (key takeaway, a design-space chart that places each paper on two macro design axes, design spectra for every axis and a shared-foundation matrix), **Design matrix** (one row per paper and one column per design question, identical choices in the same colour, rows ordered by locally computed design similarity, a similarity heatmap with the most alike and most different pairs, and the per-dimension approach map), **Compare papers**, **Methods** and **Ideas**. Axis positions are relative readings (−2 to +2) that need evidence from that paper; they are labelled as not scores or rankings. Malformed axes, positions or stances are dropped without discarding the report. Older reports keep working and gain the charts through an explicit synthesis-only “Generate design charts” update that reuses saved readings.
- Moved paper comparison from Deep exploration into a tag’s topic analysis as **Compare papers**: tick 2–8 papers of the tag (in the matrix, charts or picker), optionally state a focus, and get a stance per paper, a design comparison table whose identical choices share a colour, design spectra and follow-up questions. Comparisons read the complete saved text of the chosen papers, are scoped to that tag, are listed with it, survive JSON backups and download as Markdown. Earlier comparisons that fit no single tag remain readable under Deep exploration’s earlier-comparisons group.
- Refocused **Deep exploration** on fusing the design principles of 2–4 tags: choose the tags, review or adjust the balanced sample of at most eight papers, and get 2–3 evidence-backed design principles per tag, fused ideas that each borrow principles from at least two tags, and a fusion map linking principles to ideas. A tag’s saved topic analysis is sent as condensed background and never treated as evidence. Unsupported principles are dropped; follow-up chat and the three-round AutoResearch budget are unchanged, and earlier two-tag idea reports remain valid.
- Comparisons and fusions allow up to ten minutes per creation request; follow-ups keep the ordinary limit.

- Added per-tag topic analysis: complete saved abstracts, personal notes, memory sentences and all clipped Markdown become individual method profiles, followed by a synthesis of commonalities, differences and tradeoffs, inspirations with validation plans, reading paths and open questions. Personal interpretations remain labeled separately from paper claims; proposed ideas are not verified discoveries.
- Topic analysis now uses method block diagrams, shared-idea groups, design-family comparisons and hypothesis-to-test diagrams, with full reasoning and evidence available on expansion. Flow arrows require saved supporting evidence; structure alone does not imply order or causality. Old reports open without a model call and can gain diagrams through an explicit synthesis-only upgrade using cached profiles. Optional visual fields degrade gracefully when malformed instead of discarding a valid report. Sources remain complete; generated descriptions are more concise.
- Topic analysis starts only from explicit generate, update, retry or reanalysis actions. Paper additions, source edits and membership removals mark reports as not covering the changes without starting model calls. A requested update refreshes affected profiles and synthesizes the current paper set. Started tasks continue in the background, saving progress and preserving completed profiles and prior results on failure. Each tag retains its last successful backend/model/effort, with explicit full reanalysis or adoption of current settings available. Analyses and progress survive JSON backups; existing graph data remains compatible with saved libraries.
- Fixed topic tasks being stopped by the local bridge's generic five-minute limit. Paper reading now has ten minutes and synthesis fifteen, with a separate bounded queue wait and matching client deadlines. Retry resumes the unfinished step with saved profiles, model and effort intact; ordinary local tasks keep their existing execution limit. Managed bridge installations must be updated with `npm run bridge:install` to load the new runtime.
- Fixed macOS background model timeouts when the CLI depends on a terminal proxy. The installer now preserves only the standard proxy variables, supports updates and explicit clearing, and retains saved proxies on reinstall.
- Local backend failures now distinguish periodic usage quotas, request rate limits, authentication errors, and interrupted responses. Safe reset-time hints are shown when provided; CLI token statistics are no longer mistaken for HTTP error codes. Connection checks clarify that login status does not verify model quota or generation.
- Reorganized model settings around the selected backend: model and effort controls share a row on desktop, saved connection setup collapses, and the save/test actions show the current form selection. Independent Claude Code and Codex selections are preserved when switching backends.

- Added a bilingual **Deep exploration** conversation interface for comparing 2–8 saved papers, generating ideas from balanced samples of two different tags, and asking up to 20 follow-up questions with source excerpts and suggested questions. Selected ideas have a separate three-round budget for automatic critique, revision and experiment planning.
- Research runs send each selected paper’s complete saved text, including abstracts and translations, personal notes and all clip Markdown, alongside saved paper information, tags and link previews, without character-based source truncation. The source snapshot is reused for follow-ups; older excerpted snapshots retain their coverage labels. Model context overflows fail visibly instead of silently shortening sources. Source selection and model-processing notices remain visible. Reports and conversation history retain source excerpts, are saved locally, survive JSON export/import and can be downloaded as Markdown. Failed requests preserve completed exchanges. This version does not search the web or execute experiments.
- Expanded tag-merge review with paper examples, unique/shared paper counts, affected topic packs and a choice of retained tag. Confirmation rejects changed evidence and requires fresh analysis; failed analysis does not mark tags as reviewed.
- Added isolated model-fixture browser coverage for evidence validation, source sampling, report persistence and export, mobile layout, and exploration stopping and partial failures.

## 1.6.2

- Added a macOS bridge installer with login startup and automatic process recovery, plus status, restart, token-display and uninstall commands.
- The managed bridge uses a private runtime copy and reuses the existing loopback address and token. Background logs omit the token, and installation never terminates an unrelated process occupying the port.
- Updated setup guidance in both languages to distinguish automatic and manual bridge modes.

## 1.6.1

- Fixed citation matching that chose the most-cited similar title and incorrectly discarded valid zero counts. Exact titles, source identifiers and available author/year evidence now determine matches; ambiguous records remain unconfirmed.
- Citation lookups no longer scan notes for identifiers or infer a source from arbitrary reference links. Source paths support alphaXiv overview pages, versioned/legacy arXiv IDs and encoded DOIs.
- Added Semantic Scholar source links, matched titles and retrieval dates. Failed refreshes keep only previously verified counts with a visible warning, and retry sooner than the successful-cache interval.
- Recheck old citation caches on upgrade; invalidate counts when paper identity changes. Concurrent or delayed citation requests cannot overwrite newer results or edited papers.
- Added citation matching, cache migration, concurrency and browser interaction regression coverage.

## 1.6.0

- Added a model-settings notice covering optional text processing and save-triggered translation / recommendations.
- Added context-aware tag refinements with exact remaining-paper counts. Suggestions respect text/AI results, reading status and ratings; match-any mode explains how to switch to intersection filtering.
- Search cards now foreground the saved memory sentence and show escaped, highlighted evidence from titles, tags, notes, clipped content and publication details.
- Added editable authors, publication year and venue to capture, manual entry and paper details. Academic page metadata is extracted automatically; optional Semantic Scholar / Crossref lookup fills missing fields with identifier or unambiguous exact-title matches.
- Bibliographic facts participate in local and AI paper search and round-trip through backups. Duplicate saves preserve existing facts; attaching commentary does not replace paper authors. Delayed lookups do not overwrite edits or changed forms.
- Updated bilingual documentation and screenshots. Existing libraries receive empty optional publication fields; no tag-count limits were introduced.
- Recut both narrated videos into a roughly two-and-a-half-minute tour, showing publication details, guided 3 → 2 → 1 narrowing and highlighted memory sentences; refreshed bilingual subtitles, covers and transcripts.
- Clarified that several tags describe one paper and demonstrated combining them. Re-edited the bilingual tour to cut each shot from verified ready frames and place its narration and subtitles on the same frame-based timeline.

## 1.5.1

- Reframed both READMEs and videos around remembered research directions, algorithm names and teams, using agent optimization, OPD and team XXX as examples. The opening connects saving papers today with finding them later, and narration follows the reading process. The actual search demo matches an existing Agent optimization tag.
- Added two 1080p feature-overview videos with Mandarin and English neural male narration, simultaneous Chinese/English captions, bilingual SRTs, covers and timestamped transcripts. Both READMEs link to both editions; reproducible recording scripts exercise the actual UI against isolated demo data.
- Removed per-paper and library-wide tag-count limits from capture, storage and settings. Legacy caps no longer apply; tag reuse, aliases, descriptions and name validation remain available.
- Added independent Claude Code / Codex model and reasoning-effort selectors. Authenticated metadata-only CLI catalog discovery supports pagination, bounded probes and concurrent request sharing. Custom model IDs and CLI defaults remain available.
- Effort options follow advertised model capabilities. Settings and test overrides reach the actual CLI arguments; failed catalog refreshes preserve choices, and older bridges prompt a restart.
- Updated bilingual documentation, screenshots and regression coverage for unlimited tags, capability discovery, effort forwarding and settings persistence.

## 1.5.0

- Added a primary “remembered concept → existing tags → papers” workflow. Local names, aliases and descriptions match instantly; optional AI returns at most six validated, deduplicated tags with reasons. Choosing a tag clears stale literal paper queries. Searches never create tags, and stale AI replies cannot replace newer input.
- Added a 280-character personal memory sentence to capture, manual entry, details, cards, full-text search and model context. Reading status (To read, Reading, Read, Revisit) is a separate editable/filterable field. Both survive backups and imports; legacy records receive safe defaults without changing tags.
- Paper merges preserve the target reading progress and move additional memories into notes. Existing-paper capture can explicitly update the personal fields.
- Added an optional authenticated loopback bridge for signed-in Claude Code and Codex. It uses fixed CLI commands, stdin prompts, bounded context/output/concurrency, cancellation and temporary working directories. Added generic Chat Completions-compatible API settings alongside existing providers. Secrets stay out of public state and exported backups.
- Added local connection/login diagnostics and bilingual setup instructions. Codex avoids inheriting user-configured tools; local CLI invocation still uses model services and account limits.
- Fixed a late tag-list refresh reopening the combobox after selection. Added workflow, migration, backend, bridge security and browser regression coverage. Updated bilingual walkthroughs and screenshots.

## 1.4.0

- The paper library is now the default view, with multi-keyword search across titles, tag aliases/descriptions, abstracts, translations, notes, links and full clipped text; quoted phrases, tag intersection/union, score filters, pagination and a search shortcut.
- Tags reuse normalized names and aliases. Defaults allow 6 tags per paper and 80 tags in the library; both limits are configurable. Existing data is preserved. Merging paper records preserves their combined tags even above the per-paper limit.
- AI writes descriptions from user-selected tags and up to six linked papers (bounded abstract, notes and clip excerpts). Descriptions retain their model, timestamp, source fingerprint and failure state. Changed evidence triggers regeneration; unsuccessful requests retain previous descriptions. Batch completion continues in the background.
- Tag suggestions are relevant and bounded, support keyboard selection, and show descriptions. Frequently used tags replace the unbounded popup tag list. Tag cards and library filters show descriptions.
- Tag merges migrate research topic-pack include/exclude references; identical paper sets are explicitly described as review candidates, not proof of semantic equivalence.
- Cross-page writes use a shared lock and field-level conflict checks. Unrelated edits are preserved; conflicting edits fail explicitly. Delayed AI results cannot replace a newer search query.
- Import validation rejects unsafe IDs and malformed records; external links accept HTTP(S) only; model requests have timeouts, disallow credential redirects and require HTTPS for remote endpoints (HTTP loopback is supported).
- Clipboard text is read only after clicking Paste clipboard. Score badges replace red paper titles for readability in light and dark modes.
- Added storage, background queue, search and browser interaction regression tests.

## 1.3.x

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

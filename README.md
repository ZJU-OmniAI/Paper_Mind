<div align="center">

<img src="assets/logo.png" height="88" alt="Paper_Mind logo">

<h1>Paper_Mind</h1>

<h3>Find your papers through the concepts you remember.</h3>

<p>A lightweight paper manager built around tags and personal memories, with local storage, progressive filtering, and optional LLM assistance.</p>

[![Version](https://img.shields.io/badge/version-1.6.0-0c7d72.svg)](CHANGELOG.md)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4.svg)](extension/manifest.json)
[![License](https://img.shields.io/badge/license-Apache_2.0-0c7d72.svg)](LICENSE)

**English** · [简体中文](README_zh.md)

[Features](#features) · [Quick start](#quick-start) · [Workflow](#workflow) · [Model setup](#model-setup) · [Documentation](#documentation) · [Contributing](#development)

</div>

After reading a paper, its title and method can fade from memory. What remains might be **“something about agent optimization,” “perhaps the OPD algorithm,” or “maybe a paper from team XXX.”**

Paper_Mind captures different aspects of a paper with several tags, alongside one sentence in your own words. When you return, follow the clues you still remember: **rough concept → existing tags → narrower results → your paper**.

## Demo

English narration · **2:34** · Chinese and English subtitles. Play the video here to see the journey from saving a paper to finding it again.

https://github.com/user-attachments/assets/046375e1-bd08-4663-93ac-0858b0aeb835

[Download video](assets/videos/paper-mind-intro-en.mp4) · [Subtitles](assets/videos/paper-mind-intro-en.srt) · [Transcript](assets/videos/transcript.en.md)

## Features

| Feature | What you can do |
| --- | --- |
| **Paper capture and web clipping** | Save papers, blog posts and commentary with titles, abstracts, sources, authors, years and venues. Keep several supporting materials with one paper. |
| **Recall through concepts** | Search existing tag names, aliases and descriptions. Use optional AI matching when your memory is vague. |
| **Progressive filtering** | Select a tag, see suggestions with exact remaining counts, then combine tags, reading status and ratings to narrow the results. |
| **Personal memory** | Write a one-line memory while saving. See it alongside matching excerpts in search results to recognize the right paper. |
| **Meaningful tags** | Give each paper several tags, with no count limit. Reuse names and aliases, review merges, and generate AI descriptions from your tags and linked papers. |
| **Reading and discovery** | Track To read, Reading, Read and Revisit separately. Explore papers with shared tags, with optional AI abstract translation and content recommendations. |
| **Research topic packs** | Save inclusion and exclusion rules for a research direction. Newly saved papers appear when they match. |
| **Local data management** | Use English or Chinese, light or dark mode, JSON import/export and scheduled backups. Basic capture and search require no account. |

**Core workflows work without a model.** Optional AI supports concept matching, tag descriptions, semantic search, translation, content recommendations and tag-merge suggestions.

## Quick start

### 1. Get the project

[Download the project ZIP](https://github.com/ZJU-OmniAI/Paper_Mind/archive/refs/heads/main.zip) and extract it, or clone the repository:

```bash
git clone https://github.com/ZJU-OmniAI/Paper_Mind.git
```

### 2. Load it in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the project's **`extension/` folder**, which contains `manifest.json`.
3. Pin Paper_Mind to the browser toolbar.

**Loading the extension requires no build, npm dependencies or running server.** The local Claude Code / Codex bridge is optional; see [Model setup](#model-setup).

### 3. Save your first paper

Open a paper → click Paper_Mind → check its details → choose tags → add a memory sentence → **Save to library**. Click **Open** in the popup to browse and search your library.

To update an existing installation, update the local project files, click **Reload** for Paper_Mind in `chrome://extensions`, and reopen the manager. Restart the bridge too if you use a local CLI backend.

## Workflow

### Save clues you can return to

1. **Check the paper's details.** Review its title, abstract, authors, year and venue. Fill gaps manually or look up missing details for an existing record.
2. **Describe it with several tags.** A research direction, method and team can each be a tag. Reuse existing names and read their descriptions.
3. **Write one sentence in your own words.** For example: “Check tool evidence before an agent answers questions about a paper.” Set the reading status to Reading separately.

**One paper can have many tags; one tag can link to many papers.** Tags describe the content, while a separate field tracks reading progress. You can also save without tags and organize the paper later from Unsorted.

### Find it again, one clue at a time

| Step | Action | Result |
| --- | --- | --- |
| Recall a concept | Enter “agent optimization” in **What do you remember?** | Find existing tags with their descriptions and paper counts. |
| Follow one tag | Open its linked papers | See a related group and suggestions for narrowing it further. |
| Add another clue | Add Evaluation and choose match-all | Keep papers that match both tags. |
| Recognize your understanding | Read the memory sentence, matching excerpts and saved notes | Recover the paper and your reason for saving it. |

![Narrowing suggestions with exact counts and personal memory sentences in the results](assets/screenshots/refine-results-en.png)

`Cmd / Ctrl K` focuses search. Full-text search supports space-separated keywords and quoted phrases. Searching never creates new tags.

**[Follow the screenshot walkthrough →](docs/walkthrough.en.md)** Eight steps take the same paper from capture to rediscovery. The [detailed feature guide](docs/features.zh-CN.md) covers clipping, tags, publication details and topic packs in Chinese.

> Videos and screenshots use the actual interface with an isolated sample library. Paper details, notes and AI output are demonstration content.

## Model setup

Choose a backend in **Manager → Model settings**:

| Backend | What you need | Bridge required? |
| --- | --- | --- |
| **Claude Code / Codex** | Node.js (22 or newer recommended) and the corresponding installed, signed-in CLI | Yes; keep `npm run bridge` running while using it |
| **Model service API** | Configuration for Qwen, Zhipu GLM, Kimi Code, DeepSeek, or another Chat Completions-compatible service | No |
| **Local model API** | A running local service with a Chat Completions-compatible endpoint | No |

### Local Claude Code / Codex

1. Sign in to your chosen CLI with `claude auth login` or `codex login`.
2. From the **Paper_Mind repository root**, run:

   ```bash
   npm run bridge
   ```

3. Paste the printed URL and connection token into model settings. Click **Check local connection**.
4. Select the **model** and **reasoning effort**, save the settings, then click **Test model**.

Sign-in and connection setup are usually one-time steps. The bridge must be running whenever you use a local CLI backend. Its token is reused by default; keep the terminal open and press `Ctrl+C` to stop it. Basic capture and local search remain available without the bridge.

### API or local model service

Select a provider or **Compatible API**, enter the base URL, model ID and any required API key, then save and test. Local services without authentication may leave the key empty. Custom endpoints must support **Chat Completions**. JSON mode is off by default.

**[Configuration and troubleshooting →](docs/local-models.md#english-quick-start)** The model guide includes an English quick start; detailed diagnostics and configuration tables are primarily in Chinese.

## Data and privacy

- **Your library stays on your machine.** Papers, tags, memory sentences and reading progress live in the extension's IndexedDB. Model settings use browser local storage.
- **Export your backups.** JSON import/export is at the bottom of model settings. Automatic backups are scheduled for 4 PM and require Chrome to be running. API keys and bridge tokens are excluded.
- **Keep clipped images with your archive.** Images are saved under Chrome's downloads directory. JSON stores their paths, not their bytes. Preserve the image folders when moving your library; enable **Allow access to file URLs** to display local images.
- **AI sends relevant text to your chosen service.** After configuration, tag descriptions, abstract translation and related-paper recommendations may run in the background. A local CLI can still call a remote model. Automatic tag descriptions can be disabled in Settings.

See the [privacy policy](PRIVACY.md) for details.

## FAQ

<details>
<summary><strong>Can I use it without a model account or API key?</strong></summary>

Yes. Capture, clipping, tag management, local search, combined filters, reading states, topic packs and JSON backups work immediately. Configure a model when you want the associated AI features.

</details>

<details>
<summary><strong>How do I keep tags manageable?</strong></summary>

There is no tag-count cap. Search names, aliases and descriptions before adding a tag, and reuse existing concepts. Review merge suggestions to consolidate synonyms. AI search only matches existing tags; it does not create tags for each query.

</details>

<details>
<summary><strong>Why are an author, year or venue missing?</strong></summary>

Some pages lack complete academic metadata. Edit the fields manually, or use **Fill missing details** in the paper's edit view to query Semantic Scholar / Crossref. Lookups fill empty fields for review before saving. Missing facts are not invented by an LLM.

</details>

## Documentation

| Document | Contents |
| --- | --- |
| [Screenshot walkthrough](docs/walkthrough.en.md) | Save your first paper and find it through tags |
| [Feature reference — Chinese](docs/features.zh-CN.md) | Clipping, tags, topic packs, publication details and data management |
| [Model guide](docs/local-models.md#english-quick-start) | Local CLI and API setup; English quick start with detailed Chinese reference |
| [Changelog](CHANGELOG.md) | Changes by version |
| [Contributing](CONTRIBUTING.md) | Code layout, development conventions and validation |
| [Videos and assets](assets/videos/README.md) | Transcripts, subtitles and production notes |

## Development

Paper_Mind consists of a Chrome MV3 extension written in native JavaScript / ES modules and an optional Node.js bridge. Application code lives in `extension/`, the bridge in `bridge/`, and tests in `tests/`.

```bash
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run package:extension
```

The package is written to `dist/Paper_Mind-extension.zip`. With Chrome installed, use `PW_CHANNEL=chrome npm run test:ui` for browser tests. Reload the extension after editing to see your changes.

[Issues](https://github.com/ZJU-OmniAI/Paper_Mind/issues) and pull requests are welcome. Read the [contributing guide](CONTRIBUTING.md) before getting started.

## License

[Apache License 2.0](LICENSE).

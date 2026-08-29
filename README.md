<div align="center">

<img src="assets/logo.png" height="120" alt="Paper_Mind">

<h1>Paper_Mind</h1>

[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/License-Apache_2.0-green.svg)](https://opensource.org/licenses/Apache-2.0)
[![Version](https://img.shields.io/badge/version-1.3.3-blue.svg)](CHANGELOG.md)
[![Stars](https://img.shields.io/github/stars/ZJU-OmniAI/Paper_Mind?style=social)](https://github.com/ZJU-OmniAI/Paper_Mind/stargazers)

[English](README.md) | [中文](README_zh.md)

</div>

<div align="center">
<b>A local-first Chrome extension for collecting papers and clipping articles.</b><br>
One click saves a paper or a whole web page — text and images — into a library that lives on your own machine.
</div>

<!--
TODO: record a ~30s demo and save it as assets/demo.gif, then uncomment:
<p align="center"><img src="assets/demo.gif" alt="Paper_Mind demo" width="100%"></p>
-->

---

## Why Paper_Mind

- **No account, no server, no cloud.** Your library is an IndexedDB database inside the extension. Nothing is uploaded.
- **Clips survive the original page.** Images are downloaded as real files into your downloads folder, not kept as browser blobs — so a clipped article stays readable even after it is taken down.
- **A paper and its write-ups are one entry.** An arXiv paper, the WeChat explainer about it, and the Zhihu answer discussing it get merged into a single record instead of three.
- **Works without an API key.** LLM features are optional extras; every core function — saving, clipping, tagging, searching, backup — runs entirely offline.

## Quick start

No build step, no server. Load the extension directly:

1. Download the latest [`Paper_Mind-extension.zip`](https://github.com/ZJU-OmniAI/Paper_Mind/releases/latest) and unzip it — or clone this repo and use the `extension/` folder as-is.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `extension/` folder.
4. Pin the extension to the toolbar. Click the icon on any page to save it.

**One switch you should turn on:** in `chrome://extensions` → Paper_Mind → enable **"Allow access to file URLs"**. Without it the manager page cannot display the clipped images it saved to your disk (it falls back to the original web images and shows a hint).

Building the distributable ZIP yourself:

```bash
npm run package:extension   # writes dist/Paper_Mind-extension.zip
```

## Features

| | |
|---|---|
| 📄 **Paper capture** | Reads `citation_title` / `citation_abstract`, arXiv abstracts, headings and selected text from the current tab. Detects duplicates before saving and offers to update the existing entry instead. |
| ✂️ **Web clipping** | Turns any page — WeChat articles, blogs, Zhihu answers — into Markdown, preserving headings, lists, quotes, code blocks and tables. Images are downloaded to `<Downloads>/Paper_Mind剪藏/`. |
| 🔗 **Paper ↔ write-up merging** | Matches a clipped article to a paper already in the library by arXiv ID, DOI or title, in both directions, and offers to merge them into one record with multiple source materials. |
| 🏷️ **Tags and topic packs** | Chip-style tag input with autocomplete, an automatic "Unsorted" tag, and topic packs that aggregate papers by included/excluded tags in real time. |
| 🔍 **Local search** | Instant search across titles, abstracts, notes and clipped body text. No LLM call, no network. |
| 📈 **Citation counts** | Pulls citation counts from Semantic Scholar by arXiv ID, DOI or title. |
| 💾 **Daily backup** | Writes a JSON backup to your Chrome downloads folder every day at 4 PM. Import/export is available any time from the manager page. |
| 🤖 **Optional LLM features** | Smart search, similar-paper recommendation and tag-merge suggestions, using your own API key. |
| 🌗 **Bilingual + dark mode** | English and Simplified Chinese UI, following the system light/dark setting. |

Full feature documentation (Chinese): [`docs/features.zh-CN.md`](docs/features.zh-CN.md)

## Privacy

Paper_Mind is local-first by design:

- Papers, tags, abstracts, notes and clipped text live in the extension's own IndexedDB database on your computer.
- Model settings and any API key are stored in `chrome.storage.local` and are **never** included in exports or backups.
- Clipped images are fetched directly from the page's image hosts with no referrer, no cookies and no credentials, then written to your downloads folder.
- No analytics, no telemetry, no account service, no third-party data sharing.
- Text is sent off your machine **only** when you actively use an LLM feature, and only to the provider you configured yourself.

Full policy: [`PRIVACY.md`](PRIVACY.md)

## Optional: LLM features

Everything above works with no key. If you want smart search, similar-paper recommendations or tag-merge suggestions, open **Manager → Model settings** and add a key for one of:

- Qwen / DashScope
- Zhipu GLM

The key stays in local extension storage and is used only for requests you trigger.

## Roadmap

- [ ] Chrome Web Store listing
- [ ] Export to BibTeX / Zotero
- [ ] Firefox and Edge builds
- [ ] Configurable clip destination folder

## Contributing

Issues and pull requests are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). The extension is plain ES modules with no build step, so the loop is: edit a file in `extension/`, hit reload in `chrome://extensions`, test.

## License

Licensed under the [Apache License 2.0](LICENSE).

## Star History

<a href="https://www.star-history.com/?repos=ZJU-OmniAI%2FPaper_Mind&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ZJU-OmniAI/Paper_Mind&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ZJU-OmniAI/Paper_Mind&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ZJU-OmniAI/Paper_Mind&type=date&legend=top-left" />
 </picture>
</a>

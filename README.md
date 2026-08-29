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
<b>A tag-based library for the papers you collect.</b><br>
Click once to save a paper, sort it with tags, and actually find it again — with search and recommendations over your own collection.
</div>

<!--
TODO: record a ~30s demo and save it as assets/demo.gif, then uncomment:
<p align="center"><img src="assets/demo.gif" alt="Paper_Mind demo" width="100%"></p>
-->

---

## What it does

**1. One-click capture.** Click the icon on arXiv, alphaXiv or any paper page — title, abstract and source link are filled in for you. If the paper is already in the library, it offers to update that entry instead of creating a second one.

**2. Tags that stay tidy.** The tag box autocompletes against tags you already use, so one concept doesn't end up with three names. Anything saved without a tag lands in a built-in **Unsorted** bucket instead of quietly disappearing.

**3. Topic packs.** More than a tag filter — a pack is a live query like *include A, include B, exclude C*. Build one for "embodied AI about navigation, but not pure simulation" and every paper you save afterwards flows into it automatically.

**4. Search, local first.** Instant full-text search across titles, abstracts, notes and clipped article bodies. No network, no cost, and remembering one sentence from a paper is enough to find it. When you want something fuzzier, switch to LLM search and describe what you are after in plain language.

**5. Recommendations from your own library.** When a new paper comes in, a background job goes through what you already saved and tells you which of your papers are related. It recommends *your collection*, not the whole internet — it reconnects things you saved months apart.

**6. Tag housekeeping.** Past a few hundred papers, tags get messy. Tags covering exactly the same set of papers are found locally, with no LLM involved. Near-duplicates that only a human would notice — `multimodal` vs `多模态`, `LLM agent` vs `智能体` — are proposed by the LLM as merge suggestions that you review one by one. Nothing is merged behind your back.

**And your data stays on your machine.** Everything above lives in the extension's own database on your computer. No account, no server, no cloud, and a JSON backup written to disk every day. The LLM features are optional — without an API key you keep capture, tags, packs, local search and backup.

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

## Also in the box

| | |
|---|---|
| ✂️ **Web clipping** | A paper usually comes with write-ups — a blog post, a WeChat article, a Zhihu answer. Clip any of them and the whole article is stored as Markdown, headings, lists, tables and code blocks intact. |
| 🔗 **Write-ups live under the paper** | A clipped article is matched to a paper already in your library by arXiv ID, DOI or title (and the other way round), so one paper and its three explainers stay one entry with three materials — not four rows. |
| 🖼️ **Clipped images go to disk** | Images are downloaded as ordinary files into your downloads folder rather than kept inside the browser, so a clip is still readable after the original page is taken down. |
| 📈 **Citation counts** | Fetched from Semantic Scholar by arXiv ID, DOI or title. |
| 💾 **Daily backup** | A JSON backup lands in your downloads folder every day at 4 PM. Import/export any time from the manager page. |
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

Smart search, similar-paper recommendation and tag-merge suggestions need a model. Open **Manager → Model settings** and add a key for one of:

- Qwen / DashScope
- Zhipu GLM

The key stays in local extension storage and is used only for requests you trigger. Everything else works with no key at all.

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

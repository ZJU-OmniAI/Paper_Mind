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
<b>一个本地优先的 Chrome 扩展，用来存论文和剪网页。</b><br>
点一下图标，把一篇论文、或者一整个网页（正文 + 图片）存进只属于你自己这台机器的论文库。
</div>

<!--
TODO: 录一段约 30 秒的演示存成 assets/demo.gif，然后取消下面这行注释：
<p align="center"><img src="assets/demo.gif" alt="Paper_Mind 演示" width="100%"></p>
-->

---

## 为什么用它

- **不用注册、不用起服务、不上云。** 论文库就是扩展自己的一个 IndexedDB 数据库，存在你电脑上，什么都不会往外传。
- **原文没了，剪藏还在。** 图片会下载成磁盘上的真实文件放进下载目录，不是留在浏览器里——公众号文章哪天被删了，你存的那份照样能看。
- **论文和它的解读算一条。** arXiv 原文、公众号解读、知乎回答讲的是同一件事，会自动认出来合并成一条记录，而不是散成三条。
- **不填 API Key 也完整可用。** LLM 功能是锦上添花，存论文、剪藏、打标签、搜索、备份这些核心功能全程离线。

## 快速开始

不用编译，不用起服务，直接加载：

1. 下载最新的 [`Paper_Mind-extension.zip`](https://github.com/ZJU-OmniAI/Paper_Mind/releases/latest) 解压——或者直接把这个仓库 clone 下来，用里面的 `extension/` 目录。
2. 打开 `chrome://extensions`，右上角打开**开发者模式**。
3. 点**加载已解压的扩展程序**，选中 `extension/` 目录。
4. 把扩展固定到工具栏。之后在任意页面点图标即可保存。

**有个开关建议打开**：`chrome://extensions` → Paper_Mind → 打开**「允许访问文件网址」**。不开的话管理页读不到自己存在磁盘上的剪藏图片（会回落显示网页原图，并在正文上方提示你去哪开）。

自己打包分发用的 ZIP：

```bash
npm run package:extension   # 产出 dist/Paper_Mind-extension.zip
```

## 功能

| | |
|---|---|
| 📄 **论文快存** | 自动读取当前标签页的 `citation_title` / `citation_abstract`、arXiv 摘要、一级标题和选中文本。保存前查重，已收藏过的会提示「合并更新」而不是新建。 |
| ✂️ **网页剪藏** | 公众号、博客、知乎回答等任意网页整篇转成 Markdown，标题层级、列表、引用、代码块、表格都保留。图片下载到 `<下载目录>/Paper_Mind剪藏/`。 |
| 🔗 **论文与解读归一** | 靠 arXiv 编号 / DOI / 标题三种硬证据双向配对，把解读文章并进对应论文，一条记录下挂多份材料。 |
| 🏷️ **标签与主题包** | 芯片式标签输入带联想，未打标签自动进「待归类」，主题包可按多个包含/排除标签实时聚合论文。 |
| 🔍 **本地搜索** | 标题、摘要、备注、剪藏正文全都能搜。不调 LLM，不联网。 |
| 📈 **引用量** | 通过 arXiv 编号 / DOI / 标题从 Semantic Scholar 拉取引用数。 |
| 💾 **每日备份** | 每天下午 4 点自动往 Chrome 下载目录写一份 JSON 备份，管理页也随时可以手动导入/导出。 |
| 🤖 **可选 LLM 功能** | 智能检索、相似论文推荐、标签合并建议，用你自己的 API Key。 |
| 🌗 **双语 + 深色模式** | 中英文界面，跟随系统浅色/深色自动切换。 |

完整功能说明见 [`docs/features.zh-CN.md`](docs/features.zh-CN.md)。

## 隐私

这个扩展从设计上就是本地优先：

- 论文、标签、摘要、备注、剪藏正文都在扩展自己的 IndexedDB 里，存在你电脑上。
- 模型设置和 API Key 存在 `chrome.storage.local`，**不会**跟着导出和备份走。
- 剪藏图片直接向原网页的图床请求，不带 Referer、不带 Cookie、不带任何凭证，拿到就写进你的下载目录。
- 没有埋点、没有统计、没有账号服务、不向任何第三方共享数据。
- 只有你主动用 LLM 功能时才会有文本离开这台机器，而且只发给你自己配置的那个模型服务商。

完整声明见 [`PRIVACY.md`](PRIVACY.md)。

## 可选：LLM 功能

上面那些不填 key 全都能用。想要智能检索、相似论文推荐、标签合并建议的话，去**管理页 → 模型设置**填一个：

- 通义千问 / DashScope
- 智谱 GLM

Key 只存在本地扩展存储里，只在你主动触发的请求里用。

## 路线图

- [ ] 上架 Chrome 应用商店
- [ ] 导出 BibTeX / Zotero
- [ ] Firefox、Edge 版本
- [ ] 剪藏目录可自定义

## 参与贡献

欢迎提 Issue 和 PR，见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。扩展是纯 ES 模块、没有构建步骤，改代码的循环就是：改 `extension/` 里的文件 → 去 `chrome://extensions` 点刷新 → 试。

## 许可证

[Apache License 2.0](LICENSE)。

## Star History

<a href="https://www.star-history.com/?repos=ZJU-OmniAI%2FPaper_Mind&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ZJU-OmniAI/Paper_Mind&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ZJU-OmniAI/Paper_Mind&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ZJU-OmniAI/Paper_Mind&type=date&legend=top-left" />
 </picture>
</a>

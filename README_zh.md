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
<b>一个论文标签管理系统。</b><br>
看到好论文点一下存进来，用标签归类，之后真的能搜得到——还能在你自己的收藏里给你推相关的。
</div>

<!--
TODO: 录一段约 30 秒的演示存成 assets/demo.gif，然后取消下面这行注释：
<p align="center"><img src="assets/demo.gif" alt="Paper_Mind 演示" width="100%"></p>
-->

---

## 它能干什么

**1. 一键收藏，不用手抄。** 在 arXiv、alphaXiv 或任意论文页点一下插件图标，标题、摘要、来源链接自动填好。库里已经有这篇了会认出来，提示「更新已有」而不是再存一条。

**2. 打标签，不怕乱也不怕忘。** 输入时只显示相关候选，名称、别名和说明都能搜到。默认每篇最多 6 个标签、全库最多 80 个，可在设置中调整，已有标签不会被删除。配置模型后，AI 根据你选择的标签和关联论文内容自动编写说明；论文更新后会刷新，失败可重试。没打标签的自动进内置的**「待归类」**，不会存完就石沉大海。

**3. 主题包：按标签组合出专题。** 不是简单的标签筛选，而是一条实时的查询：*含 A、含 B、排除 C*。比如做一个「具身智能里跟导航有关、但不要纯仿真的」，之后新存的论文只要符合条件就自动进这个包。

**4. 检索：本地秒搜 + 大模型语义搜。** 本地全文搜标题、标签别名和说明、摘要、中文译文、备注、链接及剪藏正文，支持多个关键词和引号短语，并可组合标签与评分筛选；不联网、不花钱，只记得论文里某一句话也能搜出来。想模糊找的时候切到 LLM 智能检索，用大白话描述你要什么就行。

**5. 推荐：在你自己的库里找相似。** 新论文入库后后台自动跑一遍，告诉你「你之前存的这几篇跟它有关」。推的是**你的收藏**，不是全网——把你隔了几个月分别存下的东西重新串起来。

**6. 标签治理：库大了帮你收拾。** 论文攒到几百篇标签必然乱。论文集合完全重合的冗余标签，本地直接算出来，一次 LLM 都不用调；只有人才看得出的近义标签——`多模态` 和 `multimodal`、`LLM Agent` 和 `智能体`——交给 LLM 提合并建议，你一条条审核，绝不自作主张替你合。

**数据都在你自己电脑上。** 上面这些全都存在扩展自己的数据库里，不注册、不起服务、不上云，每天还会自动往磁盘写一份 JSON 备份。LLM 功能是可选的——不填 key，收藏、标签、主题包、本地搜索、备份照样全能用。

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

## 附带的功能

| | |
|---|---|
| ✂️ **网页剪藏** | 一篇论文往往还配着解读——公众号文章、博客、知乎回答。这些页面点一下就能整篇存进来，转成 Markdown，标题层级、列表、表格、代码块都保留。 |
| 🔗 **解读挂在论文底下** | 剪藏的文章会靠 arXiv 编号 / DOI / 标题跟库里已有的论文双向配对，一篇论文加三份解读还是**一条记录三份材料**，不是散成四条。 |
| 🖼️ **剪藏图片存磁盘** | 图片下载成下载目录里的真实文件，不留在浏览器里——公众号原文哪天被删了，你存的那份照样能看。 |
| 📈 **引用量** | 通过 arXiv 编号 / DOI / 标题从 Semantic Scholar 拉取。 |
| 💾 **每日备份** | 每天下午 4 点往下载目录写一份 JSON，管理页也随时可以手动导入/导出。 |
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

智能检索、相似论文推荐、标签说明生成和标签合并建议需要模型。去**管理页 → 模型设置**填一个：

- 通义千问 / DashScope
- 智谱 GLM

Key 只存在本地扩展存储里，只在你主动触发的请求里用。除这三个以外的功能不填 key 全都能用。

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


## 1.4 使用提示

- 管理页默认打开论文库；使用 `⌘ / Ctrl K` 聚焦搜索。空格分隔的关键词须全部匹配，双引号中的短语作为整体匹配。
- 点击右侧标签组合筛选，可选择“全部”或“任一”；所选标签可逐个移除，也可清除全部条件。列表每页 24 篇。
- “标签库 → 补全 / 更新标签说明”处理旧标签或失败项；标签详情可单独重新生成。系统“待归类”的说明为固定说明。
- 自动说明可在“模型设置 → 标签管理”关闭。生成时会向你配置的模型发送标签名称、别名，以及最多 6 篇关联论文的摘要、笔记和剪藏片段；不发送 API Key 到导出文件。说明只覆盖采样到的内容，不表示模型已阅读全文或 PDF。
- 同义标签由你审核后合并；大小写、全角拼写等确定性变体自动复用。论文集合相同不代表标签含义相同。
- 剪贴板现在需要点击“粘贴剪贴板”才会读取。

## 开发验证

```bash
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run package:extension
```

本机已有 Chrome 时可运行 `PW_CHANNEL=chrome npm run test:ui`。浏览器测试使用隔离数据库与模拟模型回复，不调用真实付费模型，不触碰现有扩展数据。测试覆盖说明生成与缓存、写入冲突、标签合并、搜索筛选、键盘操作及窄屏 / 深色布局。

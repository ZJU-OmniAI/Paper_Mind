# Paper_Mind · 功能全景 / Feature overview

| 中文配音 · Mandarin narration | English narration · 英文配音 |
| --- | --- |
| [![中文功能全景](paper-mind-intro-poster-zh.png)](paper-mind-intro-zh.mp4) | [![English feature overview](paper-mind-intro-poster-en.png)](paper-mind-intro-en.mp4) |
| [观看 / 下载 MP4](paper-mind-intro-zh.mp4) · [双语 SRT](paper-mind-intro-zh.srt) · [文字稿与章节](transcript.zh-CN.md) | [Watch / download MP4](paper-mind-intro-en.mp4) · [Bilingual SRT](paper-mind-intro-en.srt) · [Transcript and chapters](transcript.en.md) |

中文版 2:28，英文版 2:34，1920 × 1080。**两版均将完整的中英双语字幕直接显示在画面中**，无需另外开启字幕。主字幕对应配音语言，下一行为译文；SRT 也包含两种语言。英文版使用英文产品界面。

Both editions show complete Chinese and English subtitles together, burned into the video. The primary line follows the narration language; its translation appears beneath it. Both SRT files are bilingual. Each edition uses the matching interface language.

## 内容范围 / Coverage

视频介绍各组功能的用途，不逐个讲解按钮操作。时间标记见上方文字稿。

| 功能 | What the overview covers |
| --- | --- |
| 收藏与剪藏 | Automatic metadata, manual entry, sources, reading notes, web text and images |
| 材料归档 | Papers, commentary, external links, duplicate alerts and confirmed merges |
| 记忆与阅读进度 | One-line memories, ratings, notes and separate reading states |
| 概念到论文 | Remembered concepts → existing tags → papers; full-text search and combined filters |
| 有含义的标签 | AI descriptions, scope, aliases, redundancy review, merges and unlimited tag counts |
| 阅读与发现 | Abstract translation, citations, similar papers, tag maps and sorting |
| 研究主题包 | Dynamic collections using inclusion and exclusion tags |
| 模型接入 | Claude Code / Codex bridge, model and effort choices, compatible APIs and provider presets |
| 轻量与数据管理 | No-account basic workflows, bilingual UI, themes, shortcuts, import/export and daily backups |

## 配音与素材 / Voice and footage

- 中文：`zh-CN-YunyangNeural`，沉稳男声，语速 `-8%`，音高 `-5Hz`。
- English: `en-US-AndrewNeural`, warm male voice, rate `-8%`, pitch `-4Hz`.
- 两版均做轻微低频修饰、柔和压缩与两遍响度校准，并在重采样后限制峰值，为 AAC 编码保留余量；无背景音乐。
- 使用 [edge-tts](https://github.com/rany2/edge-tts) 调用在线语音服务，发送的内容仅为本仓库公开的介绍文案。语音合成需要联网，不是全离线制作；未发送个人论文库或凭据。两版均为合成配音。

画面使用实际扩展页面和隔离的示例库。收藏、IndexedDB 保存、概念匹配、筛选、阅读状态和导出均执行真实应用代码。脚本核对记忆句、标签、评分和阅读状态，验证收藏后共 9 篇论文、智能体标签匹配 3 篇、待重读筛选 1 篇，以及主题包中的 2 篇论文。

论文、标签说明、译文与剪藏材料均为预置演示内容，不代表真实研究结论或现场模型生成。模型接入部分只展示配置选项；录制不填写真实凭据、不连接用户账号、不调用论文处理模型。浏览器只允许访问本机演示服务器，未使用个人浏览器资料。外层标题、双语字幕、指针和高亮用于讲解；不修改产品界面或伪造成功响应。

The footage uses the actual extension with synthetic fixtures. AI descriptions and translations are prewritten examples, not live model results. No personal library, account or credentials are used. Only the public narration text is sent to the online speech service. Basic capture/search works without an LLM; enabling AI features may send relevant paper content to the configured backend.

## 本地重新制作 / Reproduce

依赖：Node.js、FFmpeg / ffprobe（支持 H.264 / AAC）、Python 与 `edge-tts`，以及项目的 Playwright 开发依赖。默认录制中英文两版；首次语音合成需要联网，后续按文案和声音参数复用缓存。

```bash
npm ci
python3 -m pip install edge-tts==7.2.8
npx playwright install ffmpeg
# 使用已安装的 Chrome / use an installed Chrome
PW_CHANNEL=chrome npm run demo:video

# 未安装 Chrome：安装 Chromium，并省略 PW_CHANNEL
# npx playwright install chromium
# npm run demo:video
```

可选环境变量：

```bash
# 仅验证界面、功能断言和双语字幕，不生成配音或视频
PW_CHANNEL=chrome DEMO_CHECK=1 npm run demo:video
# 只制作一种配音版本 / render one edition
PW_CHANNEL=chrome DEMO_LANG=en npm run demo:video
# 已录好画面，仅重新编码音视频 / reuse existing raw footage and timeline
PW_CHANNEL=chrome DEMO_ENCODE_ONLY=1 npm run demo:video
```

`DEMO_VOICE_ZH` / `DEMO_VOICE_EN` 可覆盖默认声线；`EDGE_TTS_BIN` 可指定语音命令路径。语速、音高和双语文案在分镜文件中维护。更改文案会生成新的音频缓存。

- 旁白与分镜：[story.mjs](../../scripts/demo/story.mjs)
- 神经网络配音、重试与缓存：[speech.mjs](../../scripts/demo/speech.mjs)
- 双语字幕与画面包装：[stage.html](../../scripts/demo/stage.html)
- 截图与视频共用的隔离数据：[fixture.mjs](../../scripts/demo/fixture.mjs)
- 录制、断言与编码：[make-demo.mjs](../../scripts/make-demo.mjs)
- 成片参数与章节起点：[中文 metadata](production-zh.json) · [English metadata](production-en.json)

成片、封面、SRT 与文字稿输出到本目录；音轨、逐场景检查截图、原始录屏和完整时间轴位于被 Git 忽略的 `dist/demo-v2/`。MP4 使用 H.264 / AAC、1080p 和 faststart；可在 GitHub 文件页预览或下载。

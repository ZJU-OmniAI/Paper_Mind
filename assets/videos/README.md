# Paper_Mind 功能介绍视频

[![观看中文功能介绍](paper-mind-intro-poster.png)](paper-mind-intro-zh.mp4)

[观看 / 下载 MP4](paper-mind-intro-zh.mp4) · [中文字幕 SRT](paper-mind-intro-zh.srt) · [带时间标记的旁白文字稿](transcript.zh-CN.md)

**时长约 2 分 9 秒，1920 × 1080，中文配音与字幕。**

通过同一篇示例论文，演示从收藏到找回的完整流程：

1. 检查论文信息，留下“一句话记住它”。
2. 用别名搜索已有标签，选择标签并保存。
3. 从脑海中的概念出发，匹配标签、筛选论文、回看详情。
4. 独立管理阅读状态，查看标签的含义与适用范围。
5. 选择 Claude Code / Codex 的模型与 effort，或使用兼容 API。

视频使用实际扩展页面与隔离的演示数据。表单提交、IndexedDB 保存、概念匹配、标签筛选和阅读状态变更均通过真实应用代码执行。录制脚本会验证记忆句、标签和阅读状态，以及 **8 → 9 篇收藏、9 → 3 → 1 篇筛选结果**。

论文、笔记及标签说明为预置示例，不代表真实研究结论或模型现场生成。模型设置仅演示选择方式；没有填入真实凭据，没有连接个人账号，也没有发起在线模型调用。视频包装中的标题、重点字幕、指针和高亮用于解释操作；没有修改产品界面或注入成功结果。

配音由 macOS 的 Tingting 中文语音在本机合成。无背景音乐。画面内显示重点字幕，SRT 与文字稿提供完整旁白。

## 本地重新制作

依赖：macOS（自带 `say`）、FFmpeg / ffprobe、Node.js，以及项目的 Playwright 开发依赖。

```bash
npm ci
npx playwright install ffmpeg
# 电脑未安装 Chrome 时，可运行 npx playwright install chromium，省略下面的 PW_CHANNEL。
PW_CHANNEL=chrome npm run demo:video
```

- 旁白与分镜：[story.mjs](../../scripts/demo/story.mjs)
- 画面包装：[stage.html](../../scripts/demo/stage.html)
- 截图和视频共用的隔离数据：[fixture.mjs](../../scripts/demo/fixture.mjs)
- 录制、配音合成和编码：[make-demo.mjs](../../scripts/make-demo.mjs)
- MP4、封面和字幕输出到本目录；中间素材、音轨、逐场景检查截图及时间轴保存在被 Git 忽略的 `dist/demo/`。

成片采用 H.264 / AAC、1080p、MP4 faststart，便于浏览器播放。打开仓库中的 MP4 文件可预览或下载；README 的封面图片链接到视频文件。

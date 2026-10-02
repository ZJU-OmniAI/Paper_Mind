# 可选宣传视频

商店视频字段使用 YouTube 视频 URL，不直接接受仓库 MP4 或 GitHub 附件播放地址。现有两支功能介绍视频已放入材料包，配音分别为中文 / 英文，画面已有中英双语字幕，无需重新制作。

| 商店语言 | 视频 | 字幕 |
| --- | --- | --- |
| 简体中文 | [paper-mind-intro-zh.mp4](../../assets/videos/paper-mind-intro-zh.mp4) | [paper-mind-intro-zh.srt](../../assets/videos/paper-mind-intro-zh.srt) |
| English | [paper-mind-intro-en.mp4](../../assets/videos/paper-mind-intro-en.mp4) | [paper-mind-intro-en.srt](../../assets/videos/paper-mind-intro-en.srt) |

每个语言页面只放对应配音的一个视频。上传到维护者的 YouTube 频道后，确认访客无需登录即可播放且允许嵌入，再将 URL 填入对应商店语言。尚未代为发布视频；没有视频也可提交包含截图的商店页面。

## 中文标题

Paper_Mind｜通过脑海中的标签，找回读过的论文

## 中文说明

读过的论文，只记得“好像关于智能体优化”“似乎用了某种算法”“可能来自某个团队”？Paper_Mind 让你从模糊概念匹配已有标签，再逐步缩小范围，找回收藏的论文。

一篇论文可以由多个标签描述；收藏时留下一句话记忆，搜索时就能认出当时的理解。支持阅读状态、文献信息补齐、标签说明，以及可选的 Claude Code、Codex 和兼容 API。

开源项目与安装说明：https://github.com/ZJU-OmniAI/Paper_Mind

基础功能无需模型；启用 AI 后相关文本发送给所选后端，本机 CLI 不等于离线推理。视频使用示例论文库。

## English title

Paper_Mind | Find papers through the concepts you remember

## English description

Remember the idea, but not the paper title? Start with a rough concept, match an existing tag, then add another clue to find a paper you saved.

Paper_Mind describes each paper with multiple tags and a one-line personal memory. It also supports reading progress, publication metadata, tag descriptions and optional Claude Code, Codex or compatible API connections.

Open-source project and installation: https://github.com/ZJU-OmniAI/Paper_Mind

Core features work without AI. When enabled, model features send relevant text to your selected backend; a local CLI connection does not guarantee offline inference. This video uses an example library.

参考：[商店页面字段](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)。

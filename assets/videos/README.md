# Paper_Mind · 多个标签，一篇论文 / Several tags, one paper

**中文配音 · 2:37**

https://github.com/user-attachments/assets/3b7d2957-d1b1-41b9-b210-005e53877e07

[下载 MP4](paper-mind-intro-zh.mp4) · [双语 SRT](paper-mind-intro-zh.srt) · [文字稿与章节](transcript.zh-CN.md)

**English narration · 2:34**

https://github.com/user-attachments/assets/046375e1-bd08-4663-93ac-0858b0aeb835

[Download MP4](paper-mind-intro-en.mp4) · [Bilingual SRT](paper-mind-intro-en.srt) · [Transcript and chapters](transcript.en.md)

中文版 2:37，英文版 2:34，1920 × 1080。**两版均将完整的中英双语字幕直接显示在画面中**，无需另外开启字幕。主字幕对应配音语言，下一行为译文；SRT 也包含两种语言。英文版使用英文产品界面。

Both editions show complete Chinese and English subtitles together, burned into the video. The primary line follows the narration language; its translation appears beneath it. Both SRT files are bilingual. Each edition uses the matching interface language.

## 内容范围 / Coverage

开场保留阅读后的真实困境：标题和实现细节模糊了，只留下“好像是智能体的优化”“似乎关于 OPD 算法”“可能是 XXX 某个团队出品”这些线索。接着用三个标签汇向同一张论文卡片，说明 **一篇论文由多个标签共同描述**：方向、方法、团队都是同一篇论文的不同描述角度。再用“所以，收藏时把线索一起留下”衔接实际界面。时间标记见上方文字稿。

The opening uses three memory clues: agent optimization, OPD and team XXX. Three tags converge on **one paper**, showing that a paper can have several tags describing different aspects. The capture form then shows two tags on the same actual demo record. XXX is a placeholder; the opening is an illustration, not an attribution to a real team.

新版以一次成功找回为主线。收藏时保留作者、年份、出处和多个标签；查找时，**单个标签找到 3 篇 → 同时包含两个标签的剩 2 篇 → 记忆片段找到 1 篇**。每一步单独展示对应结果，再讲记忆句、标签说明、阅读状态、摘要翻译、相似论文、映射、主题包和模型接入。每段旁白对应一个已就绪的画面，避免一段话讲多个功能时画面提前切走。

The 1.6.0 tour centers on one successful rediscovery: **capture publication details → follow tag suggestions from 3 papers to 2 → use a remembered phrase to find 1, with your original one-line memory highlighted**. Organization, reading, topic packs and model choices follow as a short overview, without a detailed settings tutorial.

| 功能 | What the overview covers |
| --- | --- |
| 收藏与论文信息 | Authors, year and venue, missing-detail lookup, several tags on one paper and a one-line memory |
| 材料归档 | Commentary, clipped text and notes kept with the same paper |
| 记忆与阅读进度 | Original memory sentences in results, highlighted evidence and separate reading states |
| 概念到论文 | Remembered concepts → existing tags → narrowing suggestions with exact counts → the right paper |
| 有含义的标签 | Several tags per paper; AI descriptions based on the chosen tags and linked papers |
| 阅读与发现 | Separate views for abstract translation, related papers and the tag–paper map |
| 研究主题包 | Dynamic collections using inclusion and exclusion tags |
| 模型接入 | Claude Code / Codex bridge, model and effort choices, compatible APIs |
| 轻量与数据管理 | No-account basic workflows, bilingual UI, themes, import/export and automatic backups |

## 配音与素材 / Voice and footage

- 中文：`zh-CN-YunyangNeural`，沉稳男声，语速 `-8%`，音高 `-5Hz`。
- English: `en-US-AndrewNeural`, warm male voice, rate `-8%`, pitch `-4Hz`.
- 两版均做轻微低频修饰、柔和压缩与两遍响度校准，并在重采样后限制峰值，为 AAC 编码保留余量；无背景音乐。
- 使用 [edge-tts](https://github.com/rany2/edge-tts) 调用在线语音服务，发送的内容仅为本仓库公开的介绍文案。语音合成需要联网，不是全离线制作；未发送个人论文库或凭据。两版均为合成配音。

开头的记忆、标签映射和阅读过程画面为示意图；随后使用实际扩展页面和隔离的示例库。收藏、IndexedDB 保存、概念匹配、筛选、阅读状态和导出均执行真实应用代码。输入“智能体优化 / agent optimization”匹配已有标签，9 篇收藏中得到 3 篇；新增“评估”标签后剩 2 篇，再搜索 `验证工具` / `"verify tool"` 得到 1 篇，并高亮记忆句与真实笔记片段。脚本核对每一步计数、作者 / 年份 / 出处、记忆句、评分、阅读状态、主题包的 2 篇论文及导出结果。

每个镜头先完成导航、滚动和界面断言，再设置独立的帧标记。编码时按标记裁出已就绪的画面，去掉操作等待，并用同一条 25 fps 时间轴放置旁白与 SRT；画面先出现 160 毫秒，再开始该段旁白。标记在成片中移除。录制等待时间不会挤占下一段介绍，音频也不会跨入下一功能画面。

Each shot is prepared and checked before recording its ready-frame marker. The encoder cuts out navigation waits, then places narration and SRT on the same 25 fps edit timeline. The view appears 160 ms before its narration. Frame markers are removed from the finished video.

论文、作者、年份、出处、标签说明、译文与剪藏材料均为合成演示内容，不代表真实研究结论或现场模型生成。补查信息只展示入口，没有伪造在线查询成功；模型接入部分只展示配置选项。录制不填写真实凭据、不连接用户账号、不调用论文处理模型。浏览器只允许访问本机演示服务器，未使用个人浏览器资料。外层标题、双语字幕、指针和高亮用于讲解；不修改产品界面或伪造成功响应。

The opening memory and multi-tag visuals are explanatory illustrations. Subsequent footage uses the actual extension with synthetic fixtures, including a real search for “agent optimization” that matches an existing tag. AI descriptions and translations are prewritten examples, not live model results. No personal library, account or credentials are used. Only the public narration text is sent to the online speech service. Basic capture/search works without an LLM; enabling AI features may send relevant paper content to the configured backend.

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
- 逐镜头帧定位与时间轴：[timing.mjs](../../scripts/demo/timing.mjs)
- 成片参数与章节起点：[中文 metadata](production-zh.json) · [English metadata](production-en.json)

成片、封面、SRT 与文字稿输出到本目录；README 使用的中英流程图由同一录制脚本生成到 `assets/screenshots/concept-recall-{zh,en}.png`。音轨、逐镜头检查截图、原始录屏和完整时间轴位于被 Git 忽略的 `dist/demo-v3/`。MP4 使用 H.264 / AAC、1080p 和 faststart；主页通过 GitHub 视频附件直接内嵌播放，仓库中的 MP4 保留用于下载。重新生成成片后，需要重新上传视频附件，并同步更新两份主页 README 与本页中的附件地址；仅替换仓库 MP4 不会更新已上传的附件。production JSON 包含每个镜头的画面、旁白起止时间及原始录像帧位置。

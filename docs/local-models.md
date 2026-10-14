# 本机模型与兼容 API / Local models and compatible APIs

Paper_Mind 提供三种调用方式：已登录的 Claude Code、已登录的 Codex，以及 Chat Completions 兼容 API。它们共用概念匹配、标签说明、专题分析、论文语义检索、摘要翻译、库内推荐、标签合并建议、深度探索和模型测试入口。

## 标签内专题分析的模型调用

在**标签库 → 某个标签 → 专题分析**点击生成，且至少两篇论文有已保存材料后开始，先逐篇理解论文，再综合为专题概览、共同点、方法差异与取舍、设计轴（每篇论文的相对位置）、每篇的一句话设计立场、研究启发、阅读路径和开放问题。对照表、相似度热力图和论文排序在本机根据综合结果计算，不额外调用模型。逐篇画像读取完整保存的摘要、个人笔记、记忆句和全部剪藏 Markdown；原摘要优先，缺少时使用已保存译文。尤其关注笔记带来的理解，但会把用户观点与论文结论分开，把启发标为待验证的假设。

模型调用分为两个阶段：手动启动后，每次后台任务处理一小批画像或一次综合，保存成功步骤；综合阶段使用全部已完成画像及其证据。新增或修改论文、删除论文或移出标签，只提示报告尚未覆盖变化，不自动发起调用。点击更新后，才刷新新增或变化的画像，再按当前论文范围重新综合。不使用深度探索的 8 篇取样上限，不按字符数裁剪逐篇来源。大篇幅材料或大量画像仍可能超出后端上下文容量，届时明确报错。

专题分析默认沿用该标签上次成功使用的后端、模型和 effort；首次优先继承该标签已有的成功模型选择，否则使用当前设置。全局选择变化不会自动替换标签的模型；连接地址和凭据仍使用相应服务商当前保存配置。模型不可用时明确报错，不静默回退其他服务商。可以**更新分析 / 重试**，也可展开**重新分析与模型**，选择**沿用模型重新分析**或**使用当前设置模型重新分析**。

专题分析没有自动触发开关，只在点击生成、更新、重试或重新分析后调用模型；打开标签、保存论文和启动浏览器不会开始新的分析。手动启动的任务按点击时的当前资料后台续跑；期间再修改材料，需要再次点击更新以纳入变化。失败保留已完成画像及上一版综合结果，等待点击重试并复用进度。分析、画像、证据和进度保存在本机并进入 JSON 备份，API Key 和桥接连接码不进入备份。

专题任务逐篇解读的执行时限为 10 分钟，综合为 15 分钟；本机桥接另外允许最多 2 分钟排队，客户端等待包含这两部分。其他本机模型任务仍使用原有 5 分钟执行时限。超时不会自动降低模型或 effort，也不会截断资料。旧报告可点击 **生成设计图表**，仅用已有画像重新综合并补上设计轴、立场和方法框图；没有材料变化时不必逐篇重读。更新托管桥接代码需运行 `npm run bridge:install`，单独 restart 不会替换其运行副本。

专题分析不会自动打开链接、搜索网页、发送图片文件或运行实验；新颖性和可行性需要后续验证。

专题分析里的**选篇对比**单独调用一次模型：发送所选 2–8 篇（都属于该标签）论文完整保存的文字，返回逐个设计问题的对照、每篇的设计立场和设计轴；创建时限为 10 分钟，追问沿用普通时限。它和下文的深度探索使用同一套报告、追问与备份规则，只是对比记录显示在该标签下。

## 深度探索的模型调用

在模型设置保存并测试后，可以在**深度探索**选择 2–4 个标签做跨标签融合：从它们的平衡样本中提炼各标签的设计理念并交叉组合成新想法，再围绕结果继续追问。每份报告最多 20 次追问；选中的 idea 还可以开展最多 3 轮自动研究，两项预算独立。它们沿用当前模型与 effort 设置，不需要额外服务。

这些研究操作都由用户提交问题或点击研究按钮触发。界面展示所选论文及会发送的文字范围：最多 8 篇去重论文的标题、来源链接、已保存的论文信息、标签详情和链接预览，以及完整保存的记忆句、摘要及译文、个人笔记和全部剪藏 Markdown（附各剪藏来源），连同研究问题；所选标签已保存的专题分析概要也会作为背景发送（只作参考，不作证据）；对话追问还使用相关已有分析和对话上下文，自动研究会使用选中的 idea 和相关前序分析。每次追问或自动研究轮次会调用一次模型，次数越多，耗时和额度使用通常越多。新建探索不按字符数截取来源文字；后续追问使用保存时的完整来源快照。不发送图片文件，也不自动打开来源链接。打开历史报告不重新调用模型。旧会话中曾截取的来源材料保持原样，要使用当前完整资料需新建探索。材料仍受所选模型的真实上下文容量约束，超出时请求明确失败，应用不会静默裁剪；可改用上下文容量更大的模型。

创建一份对比或融合报告的执行时限为 10 分钟；回复格式或引用校验不通过时会自动让模型更正一次（连接、额度、上下文超限等错误不会自动重试）。深度探索只分析库内已保存文字，不自行搜索外部文献、不执行实验。报告本地保存对话历史、来源摘录和模型来源信息，可下载 Markdown，并随 JSON 备份导出、导入。请核对来源和模型推断，尤其是材料中缺少的实验细节或新颖性结论。模型请求失败时先检查连接、模型权限和额度，再重试；已成功保存的问答和研究轮次保留。

## 本机 CLI

模型设置页先选择后端，下方只显示该后端的模型与 effort；两项在桌面并排，在窄屏上下排列。切换 Claude Code / Codex 会保留各自的选择。“保存设置”旁会实时显示本次模型与 effort，保存后生效；“测试模型”使用当前表单选择。已有连接码时，本机连接配置默认收起，可展开修改。

“检测本机连接”确认桥接、CLI 安装与登录状态；模型额度、网络请求和实际生成是否可用，需通过“测试模型”验证。周/月/日额度耗尽时会显示对应原因及后端提供的重置时间；可等待恢复或切换后端并保存设置。只改变表单选择而未保存，不会切换深度探索使用的后端。

浏览器不能直接启动进程，因此需要在项目根目录运行一个可选桥接：

```bash
# 先完成所用 CLI 的安装与登录
claude auth login
# 或
codex login

# 项目根目录；不需要 npm ci
npm run bridge
```

终端会显示 `http://127.0.0.1:39321` 和随机连接码。在插件 **模型设置** 选择 **Claude Code** 或 **Codex**，填入两项信息，点击 **检测本机连接**读取模型目录，分别选择模型与 **effort（思考强度）**，**保存设置**，再用 **测试模型**发送一条简单问题。保持终端开启；`Ctrl+C` 停止服务。只安装其中一个 CLI 也能使用。

### macOS：自动启动，免开终端

在项目根目录执行一次：

```bash
npm run bridge:install
```

如已有手动启动的 `npm run bridge`，先在它的终端按 `Ctrl+C`，再安装。安装命令不会擅自停止占用该端口的其他进程。

安装后由 macOS `launchd` 管理当前用户的后台服务：登录后自动启动，进程退出后自动恢复；无需一直开着终端，也无需管理员权限。地址、原连接码和 CLI 登录状态保持不变。首次配置时运行 `npm run bridge:token` 查看连接码，复制到插件并保存。连接码属于本机私密配置，不应提交到仓库。

```bash
npm run bridge:status      # 查看后台服务及 CLI 登录状态
npm run bridge:restart     # 重启已安装副本，不会更新代码
npm run bridge:install     # 更新代码后，再运行一次以更新后台副本
npm run bridge:uninstall   # 停止服务并关闭自启动；保留连接码和设置
```

更新桥接代码后，手动模式需停止原进程并重新运行 `npm run bridge`；macOS 自动模式需运行 `npm run bridge:install` 刷新独立运行副本，`bridge:restart` 只会重启已有副本。

如果 CLI 依赖终端代理，安装器会保存 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`（以及小写形式），供后台服务使用；重新安装时，当前环境中的设置优先，未提供的设置沿用已保存值。更换代理后，在配置好代理的终端重新运行 `npm run bridge:install`。要清除某类已保存代理，将对应大小写变量都设为空字符串后重新安装，例如 `HTTP_PROXY= http_proxy= npm run bridge:install`。安装器只复制这些网络变量，不复制 API Key 或整个终端环境。

服务配置为 `~/Library/LaunchAgents/org.paper-mind.bridge.plist`。运行副本、配置和日志位于 `~/.paper-mind/service/`，不依赖原项目目录一直存在；日志不打印连接码。运行使用安装时的 Node 可执行文件，删除该 Node 版本后需在新 Node 环境重新安装服务。只复制桥接必需的代码，不复制论文库或模型凭据。自启动配置只作用于当前用户登录期间，退出登录时服务停止。Windows / Linux 暂用手动模式。

### 模型与调用设置

- **模型**：下拉框可用 CLI 默认项、当前目录中的模型，或自定义模型 ID。Claude 未读取目录时提供 `sonnet`、`opus`、`haiku` 别名。Codex 列表通过本机 app-server 的 `model/list` 获取；目录不是账号权限保证，用“测试模型”验证实际可用性。
- **effort**：Claude 与 Codex 分别保存。目录提供能力信息时只列出该模型支持的档位；自定义模型或未知能力时显示 CLI 档位供选择，以实际模型支持为准。较高 effort 通常更慢。切换模型时，若原档位不受支持则恢复默认并提示；刷新目录不擅自改动选择。
- 默认 effort 不传对应参数；显式选择分别通过 Claude `--effort` 和 Codex `-c model_reasoning_effort="..."` 传递。标签说明、深度探索、搜索和测试使用当前设置；专题分析默认沿用该标签上次成功使用的模型与 effort，首次继承该标签已有成功选择或当前设置，直到显式改用当前设置。
- **刷新模型列表**只读取 CLI 元数据，不发送论文或生成问题。探测有 12 秒超时、输出上限和请求合并；失败保留当前选择。升级到 1.5.1 后须重启已有桥接进程，再重新加载扩展，连接码仍可复用。
- 每次调用都是独立文字任务。Claude 禁用工具、MCP、技能和 hooks；Codex 使用临时目录、只读沙箱、禁止审批，关闭 shell、应用、网页搜索与子代理。Codex 忽略用户 `config.toml`，避免引入额外工具，但沿用 CLI 登录凭据。因此自定义 Codex provider / profile 不会自动继承；此类服务可用插件的“兼容 API”入口。
- 使用较新 CLI 版本，须支持这里使用的参数（尤其 Codex 的 `--ignore-user-config` / `--ephemeral` 和 Claude 的 `--no-session-persistence`）。不支持时界面会提示升级；不会退回取消沙箱或跳过权限的调用方式。
- 连接检测只检查安装与登录；不会试用模型或消耗一次生成。真正生成仍由 CLI 连接模型服务，可能使用你的订阅或 API 额度，**不是离线推理**。
- 最多两个生成同时运行，最多八个请求占用处理与排队名额；超过容量会提示稍后重试。单次模型运行最多五分钟，关闭请求会取消其子进程。
- 默认连接码保存在 `~/.paper-mind/bridge-token`，权限为当前用户读写，重启不变。插件只在自己的本地设置里保存副本；备份不包含它。重置时先停服务、移走该文件，再启动并更新插件设置。

可选环境变量（只在启动桥接时使用，不接受网页传入任意可执行路径）：

| 变量 | 用途 |
| --- | --- |
| `PAPER_MIND_BRIDGE_PORT` | 改监听端口，默认 `39321`；同时修改插件里的桥接地址 |
| `PAPER_MIND_BRIDGE_DIR` | 改连接码目录，默认 `~/.paper-mind` |
| `PAPER_MIND_BRIDGE_MAX_REQUEST_MB` | 已认证请求的本机 HTTP 传输保护，默认 `32` MiB；可增大，超限明确报错且不截断材料。手动模式设置后重启，macOS 自动模式设置后重新运行 `npm run bridge:install` |
| `PAPER_MIND_CLAUDE_BIN` | Claude 可执行文件的绝对路径 |
| `PAPER_MIND_CODEX_BIN` | Codex 可执行文件的绝对路径 |

桥接会搜索当前 PATH、Node 所在目录、常见 nvm / Homebrew 目录和 macOS Codex 应用的 CLI 目录。Windows 可指定原生 `.exe` 或 npm 包的 `.js` 入口；启动过程不经过 shell 拼接。当前实际调用验证环境为 macOS；其他系统应在本机执行连接检测与模型测试。

## 兼容 API

在 **模型设置 → 兼容 API** 填写：

1. **Base URL**：服务商提供的 API 根地址，程序会追加 `/chat/completions`。例如本机 Ollama 常用 `http://127.0.0.1:11434/v1`，LM Studio 常用 `http://127.0.0.1:1234/v1`；以你实际运行的端口为准。
2. **模型名称**：服务实际支持的模型 ID。本地模型须先在相应服务中加载。
3. **API Key**：远程服务按其要求填写；未启用认证的本地服务可留空。远程 URL 必须使用 HTTPS。
4. **JSON mode**：默认关闭。即使关闭，Paper_Mind 仍会在提示词中要求 JSON 并验证回复；只有确认服务支持 `response_format: { type: "json_object" }` 时再开启。

Qwen、智谱、Kimi、DeepSeek 的预设入口和模型列表保持可用。原生 Anthropic Messages、OpenAI Responses 等非 Chat Completions 协议需要兼容网关，不能直接填写其原生地址。

## 常见情况

| 提示 | 处理 |
| --- | --- |
| 无法连接本机服务 | macOS 运行 `npm run bridge:status` 检查，必要时 `npm run bridge:install` 恢复；手动模式确认终端仍运行。地址和端口一致，必须用 `127.0.0.1` |
| 终端可调用，后台模型超时 | 若使用代理，在配置好代理的终端重新运行 `npm run bridge:install`，让后台服务继承代理；确认代理程序仍在运行 |
| 连接码不正确 | 从正在运行的桥接终端复制连接码，保存插件设置 |
| 未检测到 CLI | 确认终端能运行 `claude --version` / `codex --version`；必要时指定绝对路径 |
| 提示重启桥接 / 模型目录不可用 | 自动模式更新代码后运行 `npm run bridge:install`；手动模式重启 `npm run bridge`。确认 CLI 已登录且版本较新。单个后端目录失败不影响另一个，也可手填模型 ID |
| 研究材料超出模型上下文容量 | 选择上下文容量更大的模型；深度探索和专题分析不会按字符数裁剪逐篇来源资料 |
| 桥接请求超过传输保护（413） | 默认允许 32 MiB 已认证请求；按需调高 `PAPER_MIND_BRIDGE_MAX_REQUEST_MB`，再重启手动桥接或重新安装自动服务。此设置不扩大模型本身的上下文容量 |
| effort 不支持 | 刷新目录后重新选择模型支持的档位，或恢复 CLI 默认；升级 CLI 后再测试 |
| 需要登录 | 在本机终端运行相应 login 命令，再检测 |
| 额度或频率受限 | 等待账户恢复，或手动切换另一个已配置后端 |
| 请求返回格式错误 | 用“测试模型”检查模型和 API 协议；不支持 JSON mode 时关闭该开关 |
| 概念没匹配到标签 | 改用关键词或别名；确认库里已有相关标签。搜索不会自动增加标签 |

## English quick start

Install a recent Claude Code or Codex CLI and sign in, then run `npm run bridge` from the repository root. No development dependencies are needed. Paste the printed loopback URL and token into **Model settings**, choose the CLI, check the connection to load its catalog, then select a model and reasoning effort. Save and test the model. Keep the terminal running.

On **macOS**, stop any manually started bridge, then run `npm run bridge:install` once to install a per-user launch agent. It starts at login, restarts after exit, and needs no open terminal or administrator privileges. Existing tokens and CLI sign-ins are reused; use `npm run bridge:token` for first-time pairing. Use `bridge:status`, `bridge:restart`, or `bridge:uninstall` to manage it. Run `bridge:install` again after updating bridge code (`bridge:restart` only restarts the installed copy): installation refreshes a private runtime copy in `~/.paper-mind/service/`, so moving the repository does not break the service. Keep the Node executable used at installation, or reinstall with the new Node version. The service stops at logout; Windows and Linux currently use manual mode.

Model and effort choices are saved independently for each CLI. Refresh reads metadata without generation and preserves selections on failure. Model capability metadata narrows effort choices; custom IDs remain available. Default omits the corresponding CLI flag. Restart an older bridge after updating to 1.5.1, then reload the extension. The bridge reuses CLI authentication. It does not imply offline inference. Codex runs with user configuration ignored to avoid inheriting additional tools; custom Codex provider/profile configuration is not inherited. Use an explicit model ID or the Compatible API option when needed. Tokens are private local configuration and are excluded from backups. The environment variables above allow port, token directory and executable-path overrides. Authenticated local HTTP requests have a default 32 MiB transport limit, with explicit errors and no source truncation. Increase `PAPER_MIND_BRIDGE_MAX_REQUEST_MB` if needed, then restart the manual bridge or reinstall the macOS service with that setting. This does not increase the model’s own context capacity.

The macOS installer preserves `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, and their lowercase variants for the background service. Current proxy settings override saved settings; omitted settings retain their saved values. After changing proxies, run `npm run bridge:install` from the configured terminal. Set both spellings to empty strings when reinstalling to clear a saved proxy family, for example `HTTP_PROXY= http_proxy= npm run bridge:install`. API keys and unrelated shell environment variables are not copied.

For a compatible API, supply its base URL and model ID, plus a key if required. Only Chat Completions is supported. Leave JSON mode off unless your service supports it. Connection checks verify installation/login; generation also depends on model permissions, network and account limits.

Click to generate **Topic analysis**; at least two papers need saved material. It first builds a method profile for each paper, then synthesizes the profiles into an overview, shared ideas, differences and tradeoffs, design axes with each paper’s relative position, a one-line design stance per paper, research inspirations, a reading path and open questions. The design matrix, similarity heatmap and paper order are computed locally from that synthesis without another model request. Profile requests include complete saved abstracts, personal notes, memory sentences and every clip’s Markdown. The original abstract is preferred, with the saved translation used only when it is empty. Personal notes are important evidence of the user’s understanding, not automatically verified paper claims. Inspirations are hypotheses with proposed validation steps.

Adding, editing or removing papers marks the report as not covering the latest changes; it does not start a model request. Click **Update analysis** to refresh affected profiles and synthesize the current paper set, reusing unchanged profiles. Once manually started, the task processes the current material in the background and saves each completed step; later source changes require another click to include them. Failures preserve progress and prior results for a manual retry. Opening a tag, saving papers or starting the browser does not begin a new analysis, and there is no automatic topic-analysis switch. There is no eight-paper sample limit or character-based source truncation; model context limits still apply.

Each tag retains its last successful provider, model and effort. First use inherits an existing successful choice for that tag or current model settings. Connection addresses and credentials use that provider’s current saved configuration; unavailable models fail explicitly. Users can reanalyze fully with the retained model or explicitly adopt current settings. Analysis, profiles, source excerpts and progress are saved locally and included in JSON backups; API keys and bridge tokens are excluded. The feature does not open links, search the web, send image files or execute experiments.

**Compare papers** inside a topic analysis makes one separate request with the complete saved text of the chosen 2–8 papers of that tag and returns a per-question comparison, a design stance per paper and design axes. Creation allows ten minutes; follow-ups keep the ordinary limit. It shares the report, follow-up and backup rules of Deep exploration below, and its comparisons are listed with the tag.

The **Deep exploration** chat uses the same backend and model settings. Choose 2–4 tags: their design principles are distilled from at most eight balanced sample papers and fused into new ideas; saved topic-analysis summaries of those tags are sent as background, never as evidence. Then ask follow-up questions in the same conversation. Creating a comparison or fusion report allows ten minutes, and a reply that fails format or quote validation gets one automatic correction; connection, quota and context errors are not retried. Each report supports up to 20 follow-up exchanges and a separate budget of three automatic idea-research rounds. Requests start only when you submit a question or start research, with the source selection and text-processing scope shown first. New explorations send complete saved source text, including abstracts and translations, personal notes and all clip Markdown, alongside saved paper information, tags and link previews, without character-based truncation. Follow-ups reuse the saved source snapshot alongside earlier analysis and relevant conversation context. Older excerpted snapshots stay unchanged; start a new exploration to include complete current material. Requests may fail if the sources exceed the chosen model’s actual context capacity, without silently cutting source text. They do not send image files, automatically open source links, search the web or execute experiments. Reports, chat history and source excerpts stay in the local library, travel with JSON backups and can be downloaded as Markdown. Failed requests can be retried without losing completed exchanges.

Implementation references: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). CLI flags are also checked against installed `codex exec --help` and `claude --help`.

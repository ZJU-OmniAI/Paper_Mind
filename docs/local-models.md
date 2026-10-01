# 本机模型与兼容 API / Local models and compatible APIs

Paper_Mind 1.5 提供三种调用方式：已登录的 Claude Code、已登录的 Codex，以及 Chat Completions 兼容 API。它们共用概念匹配、标签说明、论文语义检索、摘要翻译、库内推荐、标签合并建议和模型测试入口。

## 本机 CLI

浏览器不能直接启动进程，因此需要在项目根目录运行一个可选桥接：

```bash
# 先完成所用 CLI 的安装与登录
claude auth login
# 或
codex login

# 项目根目录；不需要 npm ci
npm run bridge
```

终端会显示 `http://127.0.0.1:39321` 和随机连接码。在插件 **模型设置** 选择 **Claude Code** 或 **Codex**，填入两项信息，点击 **检测本机连接**、**保存设置**，再用 **测试模型**发送一条简单问题。保持终端开启；`Ctrl+C` 停止服务。只安装其中一个 CLI 也能使用。

- `default` 使用 CLI 默认选择。Claude 也可用 `sonnet`、`opus`、`haiku` 或明确的模型 ID。Codex 可填写账号可用的模型 ID；不会硬编码一个未必可用的型号。
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
| 无法连接本机服务 | 确认终端仍运行 `npm run bridge`，地址和端口一致；必须用 `127.0.0.1` |
| 连接码不正确 | 从正在运行的桥接终端复制连接码，保存插件设置 |
| 未检测到 CLI | 确认终端能运行 `claude --version` / `codex --version`；必要时指定绝对路径 |
| 需要登录 | 在本机终端运行相应 login 命令，再检测 |
| 额度或频率受限 | 等待账户恢复，或手动切换另一个已配置后端 |
| 请求返回格式错误 | 用“测试模型”检查模型和 API 协议；不支持 JSON mode 时关闭该开关 |
| 概念没匹配到标签 | 改用关键词或别名；确认库里已有相关标签。搜索不会自动增加标签 |

## English quick start

Install a recent Claude Code or Codex CLI and sign in, then run `npm run bridge` from the repository root. No development dependencies are needed. Paste the printed loopback URL and token into **Model settings**, choose the CLI, check the connection, save, and test the model. Keep the terminal running.

The bridge reuses CLI authentication. It does not imply offline inference. Codex runs with user configuration ignored to avoid inheriting additional tools; custom Codex provider/profile configuration is not inherited. Use an explicit model ID or the Compatible API option when needed. Tokens are private local configuration and are excluded from backups. The environment variables above allow port, token directory and executable-path overrides.

For a compatible API, supply its base URL and model ID, plus a key if required. Only Chat Completions is supported. Leave JSON mode off unless your service supports it. Connection checks verify installation/login; generation also depends on model permissions, network and account limits.

Implementation references: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). CLI flags are also checked against installed `codex exec --help` and `claude --help`.

# 隐私表单与权限填写说明

适用包：Paper_Mind 1.6.0。以下依据当前代码准备；提交者仍需在后台核对最终问题并亲自作出认证。**“存储在本机”不等于“不处理用户数据”**，不要全部勾选“不收集”。

## 可直接填写的内容

| 后台字段 | 内容来源 |
| --- | --- |
| Single purpose | [`fields.json`](fields.json) 的 `singlePurpose` |
| 每项权限理由 | [`permissions.json`](permissions.json)，键名与 manifest 完全对应 |
| 远程代码 | [`fields.json`](fields.json) 的 `remoteCode`；选择 No，模型返回的是文本 / JSON 数据 |
| 隐私政策 URL | `https://github.com/ZJU-OmniAI/Paper_Mind/blob/main/PRIVACY.md` |

本机桥接是用户单独安装、运行的程序；扩展不会从网络下载并执行 JavaScript。不要将“调用模型 API”误填成“执行远程代码”。

## 数据类型建议

按当前功能保守披露以下类型。这里的“处理”包括本地读写，不代表项目运营云端收集服务。

| 常见后台类别 | 建议 | 实际用途 / 边界 |
| --- | --- | --- |
| Personally identifiable information | 披露 | 学术元数据中的作者姓名，以及用户保存内容中包含的姓名等个人信息；不要求创建 Paper_Mind 账号 |
| Authentication information | 披露 | 用户提供的模型 API Key 和桥接连接码，保存在本机；Key 用于所选服务认证，连接码仅用于本机桥接；不读取 CLI 账号凭据 |
| Personal communications | 披露 | 产品明确支持用户粘贴和保存论文相关的对话记录；模型检索 / 推荐可能使用其中的片段 |
| Web history | 披露 | 仅用户收藏的当前页面 URL、标题等来源信息；不持续记录整个浏览历史 |
| Website content | 披露 | 当前页面正文、选中文本、摘要、图片、笔记、标签和查询，用于收藏与找回论文 |
| Health information | 不主动收集为独立字段 | 没有健康记录功能；用户自行保存的研究文章仍属于页面内容，若将来新增健康业务需重新评估 |
| Financial and payment information | 不收集 | 插件没有支付卡、账单或交易处理功能；服务商收费由其账号自行处理 |
| Location | 不主动收集 | 不调用定位功能、不建立位置画像；目标服务仍可看到外部请求的 IP，政策已说明 |
| User activity | 不进行行为追踪 | 没有分析埋点、后台按键记录或持续点击 / 鼠标追踪；用户主动选中的文本按页面内容披露 |

如果后台类别或定义发生变化，按实际定义调整；不要为了减少商店提示而省略已处理的数据。

## 数据流核对

| 操作 | 发往哪里 | 发送内容 |
| --- | --- | --- |
| 普通收藏、标签筛选、文本检索 | 扩展本地 IndexedDB | 论文、记忆句、标签与阅读状态 |
| 补全作者 / 年份 / 出处 | Semantic Scholar；必要时 Crossref | DOI、arXiv 标识或标题；完整备注不发送 |
| arXiv 摘要 / 引用量 | 相应学术服务 | 论文标识或查询条件 |
| 链接预览 / 图片剪藏 | 来源网站 | 被请求的链接或图片 URL；图片下载不携带 Cookie / Referrer |
| AI 概念匹配、检索、推荐等 | 用户选择的 API 或 CLI 后端 | 对应查询、标签目录和所需论文文字；具体范围见隐私政策 |
| 保存后自动模型操作 | 同上，需已配置模型 | 可能翻译摘要、推荐论文；自动标签说明默认开启、可单独关闭 |
| CLI 连接 | `127.0.0.1` 桥接 → 安装好的 CLI → 所选模型服务 | 连接码发给本机桥接；提示词通过 stdin 交给 CLI；不代表离线推理 |
| JSON 备份 | 用户 Chrome 下载目录 | 论文库与图片路径，不含 Key / 连接码，不包含图片文件本身 |

## 提交前认证与审核风险

- 可按实际实现确认：不出售数据；不将数据用于与单一用途无关的目的；不用数据决定信用或贷款资格。后台认证需由账号持有人完成。
- 当前版本的通配 HTTPS / HTTP 主机权限覆盖自定义 API 和任意来源剪藏。已准备逐项理由，但宽权限可能增加审核时间，材料无法保证过审。
- `tabs` 用于当前页标题 / URL，但与用户打开弹窗后获得的 `activeTab` 能力有重叠。正式提交前建议做一次真实安装验证，确认能否删除 `tabs`；此材料包没有擅自改动功能权限。若删除，必须同时更新 manifest、权限材料并重新打包。
- 模型设置中已在配置和保存操作前增加数据处理提示，说明查询、标签与论文文字的去向，以及保存后的翻译 / 推荐。自动标签说明开关不会控制其他模型操作；正式提交时仍应核对商店当前的告知与同意要求。
- 不把“本地存储”“本机 CLI”宣传为端到端加密或完全离线。不要在截图、审核说明和公开仓库中放真实 Key / 连接码。

参考：[隐私设置](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[用户数据 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)、[审核流程](https://developer.chrome.com/docs/webstore/review-process)。

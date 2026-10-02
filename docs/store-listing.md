# Chrome Web Store 提交材料

Paper_Mind **1.6.0** 的中英文材料入口。主张统一为：**通过脑海中的概念与标签，找回收藏过的论文。**

## 1. 选对文件

| 要做什么 | 使用文件 |
| --- | --- |
| 在商店上传扩展 | `dist/Paper_Mind-extension.zip`，只包含扩展运行文件 |
| 保存 / 交接全部上架材料 | `dist/Paper_Mind-Chrome-Web-Store-kit-1.6.0.zip`，不要把它作为扩展上传 |
| 查看逐步发布流程 | [publishing.md](publishing.md) |

运行 `npm run package:store` 可重新产生两个包及 SHA-256 清单；不会发布、登录或提交审核。

## 2. 填写商店页面

| 字段 | 材料 |
| --- | --- |
| 名称 / 简短介绍 | [fields.json](store/fields.json)；与扩展的 `_locales` 一致，上传 ZIP 后由 manifest 提供 |
| 默认语言 | 简体中文；添加 English 本地化 |
| 中文详细介绍 | [listing-zh-CN.txt](store/listing-zh-CN.txt)，复制全文 |
| 英文详细介绍 | [listing-en.txt](store/listing-en.txt)，复制全文 |
| 类别 | 选择后台最接近生产力 / 工具的类别，以当前选项为准 |
| 主页 | `https://github.com/ZJU-OmniAI/Paper_Mind` |
| 支持 | `https://github.com/ZJU-OmniAI/Paper_Mind/issues` |
| 隐私政策 | `https://github.com/ZJU-OmniAI/Paper_Mind/blob/main/PRIVACY.md`，页面内含中文链接 |

文案包含多标签、一句话记忆、逐步筛选、标签说明、独立阅读状态、作者 / 年份 / 出处、主题包、剪藏、备份和可选模型。没有把本地 CLI 宣传为离线模型，也没有把模型服务宣传为免费。

## 3. 上传图片和可选视频

[图片目录与预览](../assets/store/README.md) 包含中英文各 5 张 1280 × 800 截图、128 × 128 图标、440 × 280 小宣传图和 1400 × 560 可选大宣传图。中文页面使用 `-zh.png`，英文页面使用 `-en.png`；小 / 大宣传图共用。

[视频上传文案](store/video-upload.md) 对应现有两支视频。商店需要 YouTube URL；中文页面用中文配音，英文页面用英文配音。此材料包包含 MP4 和 SRT，但尚未发布到 YouTube。

## 4. 填写隐私与审核字段

- [单一用途与远程代码说明](store/fields.json)
- [每项权限的英文理由](store/permissions.json)
- [数据类型、处理范围和提交前核对](store/privacy-disclosures.md)
- [英文审核测试说明](store/reviewer-instructions.txt)，可复制到后台测试说明字段
- 审核示例库：[中文](store/reviewer-library-zh.json) / [English](store/reviewer-library-en.json)
- 隐私政策：[English](../PRIVACY.md) / [简体中文](../PRIVACY_zh.md)

审核示例库包含 9 篇虚构论文。导入会替换论文库，只在新 Chrome 配置中使用。无需账号或模型即可验证 9 → 3 → 2 篇的标签筛选和记忆句展示；AI 的独立测试需有可用后端，必要时通过后台私密提供临时测试凭据。

## 5. 账号持有人最后填写

这些内容不能从仓库推定，因此没有填入虚构信息：

1. 开发者身份、经过验证的联系邮箱，以及后台要求的经营者声明。
2. 发布国家 / 地区、公开或不公开列出；建议先完成小范围试用，再公开推广。
3. 可选的两种语言 YouTube 视频地址。
4. 最终隐私认证、提交审核和发布选择。

当前包保留了原有权限；宽主机权限与 `tabs` / `activeTab` 的重叠已记录在隐私核对文档中。提交材料齐全不等于商店已批准，也不替代正式提交前的真实安装检查。

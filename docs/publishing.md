# 发布指南 / Publishing guide

当前材料针对 Paper_Mind **1.6.0**。本页说明如何使用已准备好的材料；构建命令不会自动提交审核或发布。

## 构建与验证

```bash
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run package:store
```

本机已安装 Chrome 时可用 `PW_CHANNEL=chrome npm run test:ui`。仅打包扩展可运行 `npm run package:extension`，不需要桥接服务。需要更新截图时先运行 `npm run store:assets`。

输出：

- `dist/Paper_Mind-extension.zip`：上传商店的独立扩展包，根目录为 `manifest.json`。
- `dist/Paper_Mind-Chrome-Web-Store-kit-1.6.0.zip`：所有提交材料、截图、视频和扩展包。
- `dist/store-kit-1.6.0/`：解压后的同内容目录，包含 `SHA256SUMS.txt`、`package-report.json` 和 `START-HERE.md`。

打包时核对 manifest / package / 文案版本、短描述、所有权限理由、截图尺寸与文件存在性；不打包 `node_modules`、本地论文库或连接凭据。

## Chrome Web Store

1. 在 [开发者后台](https://chrome.google.com/webstore/devconsole) 登录发布账号，完成身份、联系信息和注册要求。注册为一次性费用，金额以当前后台显示为准。
2. 创建新条目，上传 **Paper_Mind-extension.zip**。已有商店条目则上传到同一条目；更新包的版本号必须高于已发布版本。
3. 按 [提交材料索引](store-listing.md) 填写默认简体中文页面，并添加英文页面。名字与短描述来自 manifest 的本地化内容。
4. 上传对应语言的 5 张截图、商店图标和小宣传图。大宣传图与视频可选；视频字段使用可访问的 YouTube URL。
5. 填写单一用途、权限理由、数据类型与公开隐私政策链接。逐项核对并完成后台认证，不要把“本地保存”填成“不处理数据”。
6. 粘贴审核测试说明；如需覆盖 AI 独立测试，通过后台私密提供受限测试凭据，禁止放入仓库或扩展包。
7. 确定分发范围和可见性，检查商店预览，在全新 Chrome 配置中安装包验证收藏、检索、导入导出和模型告知文案。
8. 提交审核。可选择审核通过后手动发布，先检查最终页面再上线。审核时间不固定，宽权限可能延长；以后台反馈为准。

需要账号本人决定的内容：开发者身份 / 邮箱 / 声明、分发范围、隐私认证、可选视频发布、最终提交。此仓库不包含这些账号操作的完成声明。

## GitHub Release

商店条目与 GitHub Release 是两个独立发布渠道。更新正式版本时：

1. 同步提升 `extension/manifest.json`、`package.json`、锁文件与材料中的版本，更新 `CHANGELOG.md`。
2. 验证并重新构建，检查 ZIP 和 SHA-256 清单。
3. 在对应提交创建版本标签，创建 GitHub Release，附加扩展包；材料总包可作为维护者辅助资产。
4. 发布说明明确：基础功能不需要模型；CLI 方式另需已登录的客户端和运行中的桥接；API 方式不需要桥接。

不要重复使用已发布标签或覆盖现有 Release 包来掩盖版本变化。普通文档同步不自动创建标签或 Release。

## Official references

- [Developer registration](https://developer.chrome.com/docs/webstore/register)
- [Publish an extension](https://developer.chrome.com/docs/webstore/publish)
- [Listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Privacy practices](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Reviewer test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions)

规格核对日期：2026-10-03。后台字段改变时以官方页面和实际后台为准。

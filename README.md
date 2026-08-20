# DSH Plugin Hub

DSH-DeskTop 的社区插件导航与可信镜像目录。

Repository: <https://github.com/run-bigpig/dsh-plugin-hub>

本仓库不再保存或构建 Desktop 内置的 `plugin-host`、`plugin-client`、`plugin-bundle`。这些组件由 Desktop 项目直接维护。本仓库只负责：

- 记录社区插件的上游 GitHub 项目地址、npm 包名、权限与当前版本；
- 将 npm 已发布包镜像为本仓库不可变的 GitHub Release `.tgz`；
- 发布带 Ed25519 签名的聚合目录，供 Desktop 展示、下载与校验；
- 通过 GitHub Actions 定期检测上游版本并同步镜像。

## Layout

```text
catalog/plugins/              每个插件一份经过审核的导航与镜像元数据
catalog/catalog.json          自动生成的聚合目录
catalog/catalog.sig           Ed25519 分离签名
catalog/public-key.txt        Desktop 内置的验证公钥
schemas/plugin.schema.json    插件条目契约
scripts/sync-plugins.mjs      上游扫描与 GitHub Release 镜像
```

## 添加插件

在 `catalog/plugins/` 新增 JSON。`repository.url` 是用户访问的上游项目地址；`packageName` 与 `updates` 决定自动任务扫描的 npm 包和 dist-tag：

```json
{
  "schemaVersion": 1,
  "id": "publisher.plugin-name",
  "name": "Plugin Name",
  "description": "插件简介",
  "publisher": "publisher",
  "packageName": "plugin-name",
  "repository": {
    "id": 123456789,
    "url": "https://github.com/publisher/plugin-name"
  },
  "updates": {
    "source": "npm",
    "distTag": "latest"
  },
  "release": {
    "version": "1.0.0",
    "assetUrl": "https://github.com/run-bigpig/dsh-plugin-hub/releases/download/.../plugin-name-1.0.0.tgz",
    "sha256": "..."
  },
  "compatibility": {
    "harnessCommits": ["..."]
  },
  "permissions": [],
  "license": "MIT",
  "verified": false
}
```

首次收录需要人工审核权限并建立第一个镜像。后续版本由定时任务自动处理。同步器会校验：

- GitHub repository ID 未发生替换；
- npm 包声明的 repository 与目录目标一致；
- dist-tag 不会导致版本降级；
- npm SHA-512 integrity、包内 `name`/`version` 与镜像 SHA-256 均一致；
- 已存在的镜像资产与 npm 原始包逐字节哈希一致。

## 自动同步

`.github/workflows/sync-plugins.yml` 每 6 小时运行，也支持手动触发。发现新版本时，它会：

1. 下载并校验 npm 包；
2. 创建版本专属 GitHub Release 并上传不可变镜像；
3. 更新插件条目和聚合目录；
4. 使用 Ed25519 私钥重新签名；
5. 验证后由 `github-actions[bot]` 提交到 `main`。

仓库需配置 Actions secret `DSH_MARKETPLACE_SIGNING_KEY_PEM`，内容为与 `catalog/public-key.txt` 配对的 Ed25519 私钥 PEM。

本地预览更新：

```bash
pnpm sync:plugins
```

实际创建镜像并更新条目：

```bash
GH_TOKEN=... pnpm sync:plugins -- --apply
pnpm catalog
DSH_MARKETPLACE_SIGNING_KEY=.secrets/catalog-ed25519-private.pem pnpm catalog:sign
pnpm validate
```

## 安全边界

目录签名证明镜像由本仓库审核和发布，不代表上游作者签名，也不构成沙箱。插件以当前用户权限运行。Desktop 默认仅从目录指定的 GitHub Release 下载，并在安装前验证 SHA-256。

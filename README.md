# DSH Plugin Hub

DSH-DeskTop 的社区插件导航、可信镜像与版本索引。

[![validate](https://github.com/run-bigpig/dsh-plugin-hub/actions/workflows/validate.yml/badge.svg)](https://github.com/run-bigpig/dsh-plugin-hub/actions/workflows/validate.yml)
[![sync plugin mirrors](https://github.com/run-bigpig/dsh-plugin-hub/actions/workflows/sync-plugins.yml/badge.svg)](https://github.com/run-bigpig/dsh-plugin-hub/actions/workflows/sync-plugins.yml)

本仓库记录插件的上游项目地址，并把 npm 已发布包同步为不可变的 GitHub Release 镜像。DSH-DeskTop 通过带 Ed25519 签名的目录发现插件，在安装前验证镜像的 SHA-256。

> 本仓库不是插件源码集合，也不再保存 Desktop 内置的 `plugin-host`、`plugin-client` 或 `plugin-bundle`。Desktop 集成代码由 [DSH-DeskTop](https://github.com/run-bigpig/dsh-desktop) 项目直接维护。

## 工作方式

```text
上游 GitHub 项目 + npm 包
           │
           │ 每 6 小时扫描版本
           ▼
GitHub Actions 完整性校验
           │
           ├── 创建版本专属 GitHub Release 镜像
           ├── 更新插件版本、下载地址与 SHA-256
           └── 重新生成并签名 catalog
                         │
                         ▼
                    DSH-DeskTop
              展示项目地址并安装镜像包
```

自动同步只接受 npm registry 提供的正式分发包，不从上游分支现场构建插件。

## 当前收录

当前暂无收录插件。

实际版本以 [catalog/catalog.json](catalog/catalog.json) 为准。

## 仓库结构

```text
catalog/
├── plugins/                 每个插件一份导航和镜像元数据
├── catalog.json             面向 Desktop 的聚合目录
├── catalog.sig              catalog.json 的 Ed25519 分离签名
└── public-key.txt           签名验证公钥

schemas/plugin.schema.json   单个插件条目的 JSON Schema
scripts/build-catalog.mjs    从 catalog/plugins 生成聚合目录
scripts/sync-plugins.mjs     扫描 npm 版本并创建 GitHub Release 镜像
scripts/sign-catalog.mjs     签署聚合目录
scripts/validate-catalog.mjs 校验条目、聚合内容和签名
```

## 插件条目

每个插件在 `catalog/plugins/` 下对应一个 JSON 文件。核心字段如下：

| 字段 | 用途 |
| --- | --- |
| `id` | 稳定且唯一的插件标识 |
| `repository` | Desktop 展示和用户访问的上游 GitHub 项目 |
| `packageName` | 安装包名，同时用于查询 npm registry |
| `updates` | 自动更新来源和 npm dist-tag |
| `release` | 当前镜像版本、GitHub Release 地址和 SHA-256 |
| `compatibility` | 已审核的 Harness commit |
| `permissions` | 插件所需权限声明 |
| `verified` | 是否完成额外人工审核，不代表沙箱或上游签名 |

示例：

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
    "sha256": "64-character-lowercase-sha256"
  },
  "compatibility": {
    "harnessCommits": [
      "40-character-harness-commit"
    ]
  },
  "permissions": [
    "network"
  ],
  "license": "MIT",
  "verified": false
}
```

完整约束见 [schemas/plugin.schema.json](schemas/plugin.schema.json)。

## 收录新插件

新插件应满足以下条件：

- 上游项目是公开 GitHub 仓库；
- 插件已发布到 npm，包内 `repository` 指向同一个上游项目；
- npm 包含可直接安装的构建产物，不依赖本仓库现场编译；
- 许可证、权限和兼容范围已经人工检查；
- 首个版本已建立不可变镜像并填写真实 SHA-256。

收录流程：

1. 在 `catalog/plugins/` 新增插件条目。
2. 建立首个 GitHub Release 镜像并填写 `release`。
3. 生成并签署聚合目录。
4. 执行完整验证后提交 Pull Request。

后续版本由定时任务自动扫描和镜像，无需逐版本手工修改条目。

## 自动同步

[sync plugin mirrors](.github/workflows/sync-plugins.yml) 每 6 小时运行一次，也可以从 GitHub Actions 手动触发。

发现 npm dist-tag 指向新版本后，同步器会依次校验：

- GitHub repository ID 与已收录项目一致，防止仓库地址被替换；
- npm 包声明的 `repository` 与目录中的上游地址一致；
- 新版本不会造成版本降级；
- npm SHA-512 integrity 正确；
- 压缩包内的包名和版本与 registry 元数据一致；
- 已存在的镜像资产与 npm 原始包 SHA-256 一致。

校验通过后，工作流创建版本专属 Release、更新目录、重新签名，并以 `github-actions[bot]` 身份提交到 `main`。没有新版本时不会产生提交。

自动签名依赖仓库 Actions secret：

```text
DSH_MARKETPLACE_SIGNING_KEY_PEM
```

其内容必须是与 `catalog/public-key.txt` 配对的 Ed25519 私钥 PEM。私钥不得提交到 Git。

## 本地维护

安装依赖：

```bash
pnpm install
```

只检查上游是否存在新版本，不写文件或创建 Release：

```bash
pnpm sync:plugins
```

同步并创建镜像：

```bash
GH_TOKEN=... pnpm sync:plugins -- --apply
```

重新生成、签名并验证目录：

```bash
pnpm catalog
DSH_MARKETPLACE_SIGNING_KEY=.secrets/catalog-ed25519-private.pem pnpm catalog:sign
pnpm validate
```

`pnpm validate` 会同时检查：

- 所有插件条目符合 JSON Schema；
- `catalog/catalog.json` 与 `catalog/plugins/` 完全一致；
- `catalog/catalog.sig` 能通过公开密钥验证。

## 安全边界

- 镜像保持 npm 发布包的原始字节，不修改或重新构建上游代码。
- 目录签名证明该镜像由本仓库收录和发布，不代表上游作者进行了签名。
- SHA-256 防止下载内容与目录记录不一致，但不证明插件本身安全。
- Harness 插件以当前用户权限运行；目录验证不是运行时沙箱。
- 上游项目、许可证、权限或所有权发生变化时，必须重新人工审核。

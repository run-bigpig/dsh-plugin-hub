# DSH Plugin Hub

Plugin collection and Marketplace Bundle source for DeepSeek Harness Desktop.

Repository: <https://github.com/run-bigpig/dsh-plugin-hub>

The repository has two independently released surfaces:

- `packages/marketplace-*`: trusted Host, Client, and profile Bundle code shipped with the desktop application.
- `catalog/`: signed metadata pointing at immutable, prebuilt GitHub Release assets.

Marketplace code is built against the exact Harness commit embedded by the desktop application. Catalog updates never replace the trusted Marketplace Bundle.

## Layout

```text
packages/marketplace-host/    Host Remote gateway to the desktop control bridge
packages/marketplace-client/  Harness Settings `settings.plugins.tab` contribution
packages/marketplace-bundle/  Profile patch mounting both packages
catalog/plugins/              One reviewed JSON document per plugin
schemas/plugin.schema.json    Catalog entry contract
scripts/                      Validation, catalog generation, and Harness overlay build
```

## Build against a Harness checkout

```bash
pnpm build:harness --harness ../deepseek-harness --out ./dist
```

The build script overlays the three packages into the supplied disposable Harness checkout, adds temporary TypeScript project references, runs the official Host and Client build faces, and packs immutable `.tgz` artifacts.

DeepSeek Harness Desktop stages these artifacts on Windows with:

```powershell
.\scripts\prepare-windows-seed.ps1 -MarketplaceSource E:\path\to\deepseek-harness-plugins
```

`-MarketplaceSource` may also be supplied through `DSH_DESKTOP_MARKETPLACE_SOURCE`. The desktop build never copies this repository or its `node_modules`; only the packed Bundle artifacts, generated catalog, and optional detached signature are staged.

## Catalog publication

Each file in `catalog/plugins/` describes one immutable GitHub Release `.tgz`. Generate and validate the aggregate catalog with:

```bash
pnpm catalog
pnpm validate
```

Production catalogs must publish `catalog/catalog.json` together with an Ed25519 detached signature at `catalog/catalog.sig`, and the matching public key must be compiled into DeepSeek Harness Desktop. Bundle releases and catalog releases are independent: changing catalog metadata never replaces the trusted Host or Client code embedded by the desktop build.

Sign the generated catalog with the uncommitted Ed25519 private key:

```bash
DSH_MARKETPLACE_SIGNING_KEY=.secrets/catalog-ed25519-private.pem pnpm catalog:sign
```

The desktop application reads the signed catalog from the `main` branch through GitHub's public repository content endpoint and retains its last verified copy for offline use.

The checked-in example entry is a schema fixture with an all-zero SHA-256 and is intentionally excluded by the desktop client. Unsigned catalogs can only be used for local development by explicitly setting `DSH_DESKTOP_MARKETPLACE_ALLOW_UNSIGNED=1`; they must not be distributed as trusted production catalogs.

## Security boundary

Harness plugins execute with the current user's authority. Catalog verification is a provenance control, not a sandbox. Marketplace installs only prebuilt release tarballs by default and requests `--ignore-scripts` from pnpm.

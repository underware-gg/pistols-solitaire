# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

**Git: never commit.** Only the user commits. Read-only git commands (`status`, `diff`, `log`, `show`, `blame`, …) are always fine. Never run anything that rewrites history (`rebase`, `reset --hard`, `commit --amend`, `push --force`, `filter-branch`) unless the user explicitly asks for that specific operation. Leave changes staged/unstaged in the working tree and say what you changed.

**READMEs are for humans.** The root `README.md` and each package's `README.md` hold operational instructions for people — how to install, run, deploy, add a token, etc. Keep them current as you change things, and keep them **very brief and direct**: commands and steps, no prose, no background essays. Architectural context and agent-facing guidance belongs here in `CLAUDE.md`, not in the READMEs.

## Repository state

This repo (`underware-gg/pistols-solitaire`) is a **fresh scaffold**. As of the initial commit it contains only `README.md`, `.gitignore` (Node/JS template), and `.vscode/` config — no application code, no `package.json`, no `Scarb.toml`, and therefore **no build, lint, or test commands yet**. Do not assume any exist; check for a manifest before suggesting a command.

The one implemented area is the **Torii indexer deployment** (`contracts.json`, `railway.toml`, `torii/`) — see below. There is still no Cairo/Dojo code, no client, no root `package.json`; `torii/package.json` is the only manifest, and it has no dependencies.

When adding tooling, verify the actual scripts in `package.json` / `Scarb.toml` rather than relying on this file, and update this section once they exist.

## Intended stack (inferred from `.vscode/`, not yet present)

`.vscode/settings.json` and `launch.json` were carried over from the sibling Pistols projects and reveal the expected shape:

- **Dojo / Cairo on Starknet** — `cairo1.enableLanguageServer` + `cairo1.enableScarb`; a `dojo/bindings/**` path is excluded from search, implying generated TypeScript bindings from a Dojo world.
- **Vite client** at `http://localhost:5173/`, web root `${workspaceRoot}/client` (see `.vscode/launch.json`).
- **Biome** for format/lint (`.vscode/extensions.json` recommends `biomejs.biome`), not ESLint/Prettier.
- Indentation: 2 spaces for TS/JS, **4 spaces for Cairo and Python**.

## Torii indexer (`torii/`)

`torii/SPECS.md` is the original hand-off spec. **The implementation deviates from it deliberately** — trust the code and `torii/README.md` over SPECS.md where they disagree:

- the token list lives in **`contracts.json` at the repo root**, keyed by chain id (`SN_MAIN`, `SN_SEPOLIA`), not in `torii/config/tokens.json`; it is committed, not gitignored
- `worlds` is an **array** (SPECS.md had a single `world` object): Torii 1.8.16 indexes any number of worlds in one instance — verified — with a sync head per `WORLD:` entry and `models`/`entities` keyed by `world_address`. Disabled entries stay in the file as history. `indexing.namespaces`/`models` filters are global, not per-world.
- the top-level `world_address` TOML key is **not** emitted; the `WORLD:` entries in `indexing.contracts` are sufficient since Torii 1.6.1
- every entry (worlds and contracts) carries `game` (grouping key), `block` (deployment block) and `enabled`; the generator emits Torii's `TYPE:address:start_block` form so each entry backfills from its own block
- **`torii/scripts/find-deploy-block.mjs`** resolves a deployment block by binary searching `starknet_getClassHashAt` over block history (~24 RPC calls). Use it instead of guessing a block — `pnpm blocks` fills in any entry whose `block` is 0.
- the generator is **`torii/scripts/generate-torii-config.mjs`** (Node, no deps), not a bash script
- the image is `node:22-trixie-slim` + the pinned `torii` release binary pulled from GitHub releases — no asdf in the image. **The base must stay trixie or newer:** the amd64 torii release requires glibc ≥ 2.39 and bookworm ships 2.36. The arm64 release is linked against an older glibc, so this only breaks on amd64 (i.e. Railway) — reproduce locally with `docker build --platform linux/amd64`.
- one image serves every network; `NETWORK` selects the `contracts.json` section, which is the only difference between the mainnet and sepolia Railway services

Key design points worth knowing before touching that area:

- **Single JSON source of truth.** `contracts.json` lists the ERC-20/ERC-721 contracts and Dojo worlds to index. `generate-torii-config.mjs` converts it to a Torii TOML at container start. Adding a token should never require editing the Dockerfile, entrypoint, or TOML by hand.
- **Persistent storage is enforced.** `entrypoint.sh` refuses to boot if the parent of `TORII_DB_DIR` isn't a mount (`REQUIRE_PERSISTENT_DB=false` to bypass locally).
- **The oldest enabled `block` becomes `indexing.world_block`** — enabling a contract older than anything indexed forces a re-sync of that gap.
- **Two modes, one config path.** `world.enabled: true` prepends a `WORLD:0x…` entry to the same `indexing.contracts` array the tokens use; `false` (or omitted) gives pure token-indexer mode. Torii ≥1.6.1 no longer requires a world address.
- **Torii config precedence:** CLI args > `--config` TOML > env vars > defaults.
- **Railway deployment.** Railway injects `PORT` — never set it manually. A Volume must be mounted at `/data` with `TORII_DB_DIR=/data/torii-db`, or every redeploy re-indexes from scratch. GraphQL/SQL/MCP/gRPC all share the one HTTP port; metrics (`9200`) must stay off the public domain.
- **Torii's TOML schema changes between minor versions.** `TORII_VERSION` is pinned as a Docker build arg; validate generated config against `torii --help` for the pinned version before trusting any flag, and check the release notes on a bump.

## Reference repos on this machine

- `/Users/roger/Dev/Realms/pistols` — the main "Pistols at Dawn" monorepo by the same org. Prior art for the intended layout: pnpm + Turbo workspace with `client/`, `dojo/` (Cairo world), `sdk/`, per-network `dojo_{dev,sepolia,mainnet}.toml` and `manifest_*.json`. Mirror its conventions unless there's a reason not to.
- `/Users/roger/Dev/Dojo` — an additional working directory containing local checkouts of `dojo`, `torii`, `dojo.js`, `dojo.c`, `controller`, `origami`, etc. Read these for authoritative Dojo/Torii behavior instead of guessing or relying on possibly-stale docs.

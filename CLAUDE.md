# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

**Git: never commit.** Only the user commits. Read-only git commands (`status`, `diff`, `log`, `show`, `blame`, …) are always fine. Never run anything that rewrites history (`rebase`, `reset --hard`, `commit --amend`, `push --force`, `filter-branch`) unless the user explicitly asks for that specific operation. Leave changes staged/unstaged in the working tree and say what you changed.

**READMEs are for humans.** The root `README.md` and each package's `README.md` hold operational instructions for people — how to install, run, deploy, add a token, etc. Keep them current as you change things, and keep them **very brief and direct**: commands and steps, no prose, no background essays. Architectural context and agent-facing guidance belongs here in `CLAUDE.md`, not in the READMEs.

## Repository state

This repo (`underware-gg/pistols-solitaire`) is a **fresh scaffold**. As of the initial commit it contains only `README.md`, `.gitignore` (Node/JS template), and `.vscode/` config — no application code, no `package.json`, no `Scarb.toml`, and therefore **no build, lint, or test commands yet**. Do not assume any exist; check for a manifest before suggesting a command.

The only substantive content is `torii/SPECS.md` (untracked), an implementation spec for the project's Torii indexer deployment. That spec is the current work item — see below.

When adding tooling, verify the actual scripts in `package.json` / `Scarb.toml` rather than relying on this file, and update this section once they exist.

## Intended stack (inferred from `.vscode/`, not yet present)

`.vscode/settings.json` and `launch.json` were carried over from the sibling Pistols projects and reveal the expected shape:

- **Dojo / Cairo on Starknet** — `cairo1.enableLanguageServer` + `cairo1.enableScarb`; a `dojo/bindings/**` path is excluded from search, implying generated TypeScript bindings from a Dojo world.
- **Vite client** at `http://localhost:5173/`, web root `${workspaceRoot}/client` (see `.vscode/launch.json`).
- **Biome** for format/lint (`.vscode/extensions.json` recommends `biomejs.biome`), not ESLint/Prettier.
- Indentation: 2 spaces for TS/JS, **4 spaces for Cairo and Python**.

## Torii indexer (`torii/SPECS.md`)

`torii/SPECS.md` is a hand-off spec, not documentation of existing code — the files it describes (`torii/Dockerfile`, `entrypoint.sh`, `scripts/generate-torii-config.sh`, `config/tokens.json`) do not exist yet. §14 is the implementation checklist.

Key design points worth knowing before touching that area:

- **Single JSON source of truth.** `torii/config/tokens.json` lists the ERC-20/ERC-721 contracts (and optionally a Dojo World address) to index. `generate-torii-config.sh` converts it to a Torii TOML at container start. Adding a token should never require editing the Dockerfile, entrypoint, or TOML by hand.
- **Two modes, one config path.** `world.enabled: true` prepends a `WORLD:0x…` entry to the same `indexing.contracts` array the tokens use; `false` (or omitted) gives pure token-indexer mode. Torii ≥1.6.1 no longer requires a world address.
- **Torii config precedence:** CLI args > `--config` TOML > env vars > defaults.
- **Railway deployment.** Railway injects `PORT` — never set it manually. A Volume must be mounted at `/data` with `TORII_DB_DIR=/data/torii-db`, or every redeploy re-indexes from scratch. GraphQL/SQL/MCP/gRPC all share the one HTTP port; metrics (`9200`) must stay off the public domain.
- **Torii's TOML schema changes between minor versions.** `TORII_VERSION` is pinned as a Docker build arg; validate generated config against `torii --help` for the pinned version before trusting any flag, and check the release notes on a bump.

## Reference repos on this machine

- `/Users/roger/Dev/Realms/pistols` — the main "Pistols at Dawn" monorepo by the same org. Prior art for the intended layout: pnpm + Turbo workspace with `client/`, `dojo/` (Cairo world), `sdk/`, per-network `dojo_{dev,sepolia,mainnet}.toml` and `manifest_*.json`. Mirror its conventions unless there's a reason not to.
- `/Users/roger/Dev/Dojo` — an additional working directory containing local checkouts of `dojo`, `torii`, `dojo.js`, `dojo.c`, `controller`, `origami`, etc. Read these for authoritative Dojo/Torii behavior instead of guessing or relying on possibly-stale docs.

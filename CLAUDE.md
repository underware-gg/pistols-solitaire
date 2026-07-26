# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

**Git: never commit.** Only the user commits. Read-only git commands (`status`, `diff`, `log`, `show`, `blame`, …) are always fine. Never run anything that rewrites history (`rebase`, `reset --hard`, `commit --amend`, `push --force`, `filter-branch`) unless the user explicitly asks for that specific operation. Leave changes staged/unstaged in the working tree and say what you changed.

**READMEs are for humans.** The root `README.md` and each package's `README.md` hold operational instructions for people — how to install, run, deploy, add a token, etc. Keep them current as you change things, and keep them **very brief and direct**: commands and steps, no prose, no background essays. Architectural context and agent-facing guidance belongs here in `CLAUDE.md`, not in the READMEs.

**Follow `specs/` for all client code.** [`specs/CODING_STYLE.md`](./specs/CODING_STYLE.md) and [`specs/NEXTJS_DATA_FLOW.md`](./specs/NEXTJS_DATA_FLOW.md) are binding, not advisory — read them before writing anything under `client/`. They were ported from `/Users/roger/Dev/CC/ec-dapp/specs/` (the upstream reference implementation); read the originals when a rule needs context, and keep the ports in sync when upstream changes. Deliberate differences are marked **[diverges]** in our copies — don't "fix" those back.

**Starknet only — ec-dapp gives us style, not its chain.** ec-dapp is an Ethereum/EVM app; we import its coding style and data-flow conventions and nothing else. This project's chain is **Starknet** (Cairo/Dojo, `@starknet-react/core`, Cartridge Controller, Torii). Never bring an EVM library, address type or ABI convention across from it.

## Repository state

This repo (`underware-gg/pistols-solitaire`) is an early scaffold. Two areas exist:

- the **Torii indexer deployment** (`contracts.json`, `railway.toml`, `torii/`) — see below
- the **pnpm/Turbo workspace** with a Next.js `client/` — see below

There is still **no Cairo/Dojo code** (no `Scarb.toml`, no `dojo/`, no SDK package) and **no tests anywhere** — do not assume a test command exists. Verify the actual scripts in `package.json` before suggesting a command, and update this section as areas land.

## Workspace (`pnpm-workspace.yaml`, `turbo.json`)

pnpm workspace + Turborepo, mirroring `/Users/roger/Dev/Realms/pistols`. The only member is `client` (`torii` is commented out — it has no dependencies and its scripts are run from inside `torii/`).

- **Shared dep versions live in the `catalog:` block of `pnpm-workspace.yaml`.** Packages reference them as `"next": "catalog:"` — bump the catalog, not the package manifests. Same convention as the reference monorepo.
- Root scripts delegate to Turbo (`dev`, `build`, `check-types`, `lint`); `format` runs Biome directly over `client`.
- Turbo currently buys little with a single package — it's there for the `dojo`/`sdk` packages to come, where `dependsOn: ["^build"]` ordering and build caching start to matter. Dropping it means pointing the root scripts at `pnpm -C client …`.
- `onlyBuiltDependencies: [sharp]` in `pnpm-workspace.yaml` — pnpm 10 blocks postinstall scripts by default and Next.js image optimization needs sharp built.

## Client (`client/`)

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind 4, at `http://localhost:3000/`. **`specs/CODING_STYLE.md` and `specs/NEXTJS_DATA_FLOW.md` govern everything here.** Layout:

```
client/src/
  app/            ONLY what Next.js requires: layout.tsx, page.tsx, api/, actions/
  components/     everything else — page components, providers/, ui/ (cva primitives)
  hooks/          use-controller.ts (chain), plus:
  hooks/queries/  one react-query hook per API query route
  hooks/mutations/ one hook per server action, over useActionMutation
  lib/            cn(), client-utils (handleApiError)
  styles/main.css the ONE stylesheet: Tailwind import + @theme tokens + base elements
```

- **`app/` is routing only** (`specs/CODING_STYLE.md` § File layout). `app/page.tsx` is a mount point — `return <HomePage />` — and every route's markup, state and providers live in `components/`. `Providers` is `components/providers/providers.tsx`, not `app/providers.tsx`. Applies to all new UI: component first, route grows an import.
- **Tailwind 4, no other CSS.** Tokens are the `--color-ps-*` set in `main.css`'s `@theme` (→ `bg-ps-bg`, `text-ps-bold`, `text-ps-accent`, `border-ps-line`). Compose classes with `cn()`. Tailwind is wired through `postcss.config.mjs` (`@tailwindcss/postcss`) — there is no `tailwind.config.*`, v4 configures in CSS.
- **Icons: `lucide-react` only**, sized/colored with Tailwind utilities. Game art is not an icon — that goes in `public/assets/`.
- **Data flow**: API query routes + react-query hooks for reads, server actions + `useActionMutation` for writes. No `useEffect` fetching. The chain layer is used bare — never wrapped in another query layer.
- **Testing the app: `pnpm dev:claude` (port 3009), never `pnpm dev` (port 3000)** — 3000 is the user's own server, which runs all session. Don't `pkill` `next dev`; stop only what you started, matched by port (`lsof -ti:3009 | xargs kill`).
  - Next.js locks one dev server per build dir, so `dev:claude` sets `NEXT_DIST_DIR=.next-claude` (honored in `next.config.ts`) — that's what allows two instances. Side effect: Next appends `.next-claude/**` globs to `client/tsconfig.json` include; that's expected, leave it.
- **Dev runs over HTTPS** — `next dev --experimental-https` in both `dev` and `dev:claude`, so the URL is `https://localhost:3000`. Don't "simplify" it back to http:
  - The Cartridge keychain iframe sends `frame-ancestors 'self' https: http://localhost:* http://127.0.0.1:* capacitor:`. Over plain http only `localhost`/`127.0.0.1` can frame `https://x.cartridge.gg/` — from any other host the browser blocks it and Connect silently does nothing, with no error from our code. The `https:` token is what makes LAN/device testing work.
  - Certs are self-signed, generated into `client/certificates/` (gitignored) on first run, which also installs an mkcert CA and may prompt for a password. Other devices need that CA to avoid a warning.
  - Separately, Next blocks `/_next/*` from non-localhost Origins, which 403s the HMR socket upgrade when reached at the LAN IP (hot reload dies; the client force-reloads after 25 retries). Handled by `allowedDevOrigins: ['192.168.*.*', '10.*.*.*']` in `next.config.ts`.
- **Biome** config is `biome.jsonc` at the root, **ported from ec-dapp's** with the same rules; `client/biome.jsonc` is an `extends: "//"` stub. Single quotes, semicolons, 2-space, 100 columns, `arrowParentheses: asNeeded`, organize-imports off.
- Biome is **scoped to `client/`** by deliberate choice — `torii/` and `contracts.json` predate the standard and would produce a large reformat diff. Don't widen the scope without saying so.
- Several linter rules are downgraded to `warn`/`off` in `biome.jsonc` because they were **ec-dapp's tracked debt** (`noExplicitAny`, the a11y set, `useJsxKeyInIterable`, …). We have no such legacy code, so treat them as errors in practice; they can be tightened whenever.
- **Next.js owns `client/tsconfig.json`** — it rewrites the file on `next build`. It's excluded from Biome; don't hand-format it or fight the rewrite.
- `next-env.d.ts` is generated and gitignored.

## Chain layer (`client/src/components/providers/`)

Starknet **mainnet only**, connected through the **Cartridge Controller** — ported from `/Users/roger/Dev/Dojo/controller/examples/minimal`. Version policy: match that example's majors (`starknet` 8, `@starknet-react/*` 5) and track the latest `0.13.x` Controller. All versions in the root `catalog:`.

- `providers/StarknetProvider.tsx` — the `ControllerConnector` is built **once at module scope** (it reuses `window.starknet_controller` and warns if constructed twice) and `StarknetConfig` is mainnet-only. Every `window` access inside the controller is guarded, so this module SSRs fine — no `dynamic(…, { ssr: false })` needed, and `/` still prerenders static.
- `providers/providers.tsx` — `Providers`: creates the one `QueryClient` and hands it to `StarknetConfig`, which mounts the `QueryClientProvider` itself. One provider, one cache, shared with the app's own queries (`specs/NEXTJS_DATA_FLOW.md` §0).
- `hooks/use-controller.ts` — the only thing components use: `connect` / `disconnect` / `openController(tab)` / `username` / `address` / `isConnected`. Composes bare `@starknet-react/core` hooks; never wraps them in another cache.
- Config via optional env vars, with mainnet defaults baked in: `NEXT_PUBLIC_RPC_MAINNET`, `NEXT_PUBLIC_TORII_URL` (defaults to the Railway Torii, `https://pistols-solitaire-mainnet.up.railway.app`). Every var and its default is in `client/.env.example`; `torii/.env.example` covers the indexer.
- `preset: 'pistols'` gives the Controller the Pistols theme. No `policies`/`namespace` yet — those need the deployed Dojo world. Add them when the contracts land.
- `@cartridge/controller/react`'s `ControllerToaster` (and its stylesheet) is deliberately **not** mounted: it's optional, and the one-stylesheet rule means importing package CSS needs a reason. Add it when transaction toasts are wanted.

## Intended stack (not yet present)

`.vscode/settings.json` was carried over from the sibling Pistols projects and reveals what is still expected:

- **Dojo / Cairo** — `cairo1.enableLanguageServer` + `cairo1.enableScarb`; a `dojo/bindings/**` path is excluded from search, implying generated TypeScript bindings from a Dojo world. The Dojo SDK is not wired into the client yet — only the Starknet/Controller layer above is.
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

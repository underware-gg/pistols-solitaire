# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Working rules

**Git: never commit.** Only the user commits. Read-only git (`status`, `diff`, `log`, `show`, `blame`) is always fine. Never rewrite history (`rebase`, `reset --hard`, `commit --amend`, `push --force`, `filter-branch`) unless asked for that specific operation. Leave changes in the working tree and say what you changed.

**This file stays high-level; the detail lives in `specs/`.** It holds orientation, the working rules, and the pointers below — enough to know *which* spec a task belongs to. Rules, invariants and traps go in the spec that owns them. It is not a changelog, not a record of fixes, and not a place to justify decisions at length: if a fact wouldn't stop a future mistake, leave it out; if the code already says it, leave it out. Don't add an entry per edit. The same applies to `specs/`. **READMEs are for humans**: commands and steps, no prose.

**`specs/` is binding, not advisory.** Read the relevant one before writing anything under `client/`:

| Spec | Read before | Covers |
|---|---|---|
| [`CODING_STYLE.md`](./specs/CODING_STYLE.md) | any client code | file layout, Tailwind and the table surface, `ui/` primitives, stores, Storybook |
| [`NEXTJS_DATA_FLOW.md`](./specs/NEXTJS_DATA_FLOW.md) | any read or write | query routes + react-query, server actions, the chain-layer carve-out |
| [`CHAIN.md`](./specs/CHAIN.md) | anything touching Starknet, Torii or an address | profiles, `contracts.json`, providers, contract calls, the SDK, `/test` + `/contracts` |
| [`ENGINE.md`](./specs/ENGINE.md) | anything that renders a card | the 3D card engine (`src/engine/`), recipe for a new table |
| [`SOLITAIRE.md`](./specs/SOLITAIRE.md) | anything about a card *game* | the rules engine (`src/solitaire/`), recipe for a new variant |
| [`DECKS.md`](./specs/DECKS.md) | anything on `/decks` or `/deck/<slug>` | the token browser: the layout-mounted canvas, paging, zoom, the starter pack |

`CODING_STYLE.md` and `NEXTJS_DATA_FLOW.md` are ported from `/Users/roger/Dev/CC/ec-dapp/specs/` — read the originals when a rule needs context, keep the ports in sync, and never "fix" a difference marked **[diverges]**. The rest are ours alone.

**Starknet only — ec-dapp gives us style, not its chain.** It is an EVM app; we take its coding style and data-flow conventions and nothing else. This project is Starknet (Cairo/Dojo, `@starknet-react/core`, Cartridge Controller, Torii). Never bring an EVM library, address type or ABI convention across.

## Repository state

An early scaffold (`underware-gg/pistols-solitaire`): a **pnpm/Turbo workspace** with a Next.js `client/`. The Torii indexer it reads from lives in its own repo, `underware-gg/torii-deployment` — see § `contracts.json` below.

There is **no Cairo/Dojo code of our own** and **no tests anywhere** — do not assume a test command exists. The client reads the *existing* Pistols world through `@underware/pistols-sdk` and our Torii; it deploys nothing. Check `package.json` before suggesting a command.

`.vscode/settings.json` expects a Dojo/Cairo stack that isn't here yet (Scarb + language server, generated `dojo/bindings/**`). Indentation: 2 spaces for TS/JS, **4 for Cairo and Python**.

## Workspace (`pnpm-workspace.yaml`, `turbo.json`)

pnpm workspace + Turborepo, mirroring `/Users/roger/Dev/Realms/pistols`. The only member is `client`.

- **Shared dep versions live in the `catalog:` block** — packages say `"next": "catalog:"`, so bump the catalog, not the manifests.
- Root scripts delegate to Turbo; `format` runs Biome over `client`. `dev:all` is `turbo dev storybook`.
- Turbo buys little with one package; it is there for the `dojo`/`sdk` packages to come.
- **`allowBuilds` answers every dependency that has an install script** — pnpm 11 replaced `onlyBuiltDependencies` with that map, and a package missing from it **fails the install** (`ERR_PNPM_IGNORED_BUILDS`) instead of being skipped quietly, appending itself to this file with a placeholder. So a new one is answered, `true` or `false`, with the reason; only `sharp` is `true`, and only so image optimization can be switched back on without a reinstall.

## Client (`client/`)

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind 4. **`specs/CODING_STYLE.md` and `specs/NEXTJS_DATA_FLOW.md` govern everything here.**

```
client/
  .storybook/     main.ts + preview.tsx — the ui/ preview surface
client/src/
  app/            ONLY what Next.js requires: layout.tsx, page.tsx, api/, actions/
  components/     everything else — generic components, providers/, ui/ (cva primitives
                  + a *.stories.tsx next to each)
  components/pages/<page>/  one folder per page: its page component + its own parts
  dojo/           chain layer: profiles.ts (the table), config.ts (PROFILE), torii.ts,
                  contracts.ts (address + ABI), calls.ts (approve / VRF call fragments),
                  explorer.ts (Voyager URLs)          → specs/CHAIN.md
  engine/         the 3D card engine                   → specs/ENGINE.md
  solitaire/      the solitaire rules engine           → specs/SOLITAIRE.md
  hooks/          use-controller.ts (chain), plus:
  hooks/contracts/ one file per world contract, one hook per entrypoint  → specs/CHAIN.md
  hooks/queries/  one react-query hook per API query route
  hooks/mutations/ one hook per server action, over useActionMutation
  lib/            cn(), client-utils (handleApiError)
  stores/         settings-store.ts + solitaire-store.ts — zustand, persisted
  styles/main.css the ONE stylesheet: Tailwind import + @theme tokens + base elements
```

The pages: `/` home, `/solitaire` (→ `SOLITAIRE.md`), `/decks` + `/deck/<slug>` (→ `DECKS.md`), `/contracts` and the unlinked `/test` bench (→ `CHAIN.md`).

### Running it

- **`pnpm dev:claude` (port 3009), never `pnpm dev` (3000)** — 3000 is the user's own server. Stop only what you started (`lsof -ti:3009 | xargs kill`); never `pkill next dev`. `dev:claude` sets `NEXT_DIST_DIR=.next-claude` because Next locks one dev server per build dir; it appends `.next-claude/**` to `client/tsconfig.json` include — leave that. **`client/next-env.d.ts` is the one thing the two servers cannot share**: its route-types import names a single dist dir, so whichever server started last owns it and the other's editor types go stale. It is gitignored and rewritten on every dev start, so the fix is to restart the server you want to keep — never to hand-edit it.
- **Storybook: `pnpm storybook:claude` (6009), never `pnpm storybook` (6006).** Same rule about stopping it.
- **A 3D page needs a real foreground browser to verify** — a backgrounded tab and headless Chrome both starve `requestAnimationFrame`, which looks exactly like a layout bug. See `ENGINE.md` §7 before concluding a scene is broken.
- **Dev runs over HTTPS** (`--experimental-https`); don't "simplify" it back to http. The Cartridge keychain's `frame-ancestors` allows plain http only for `localhost`/`127.0.0.1`, so from any other host Connect silently does nothing with no error of ours. Certs self-sign into `client/certificates/` (gitignored; installs an mkcert CA, may prompt for a password). `allowedDevOrigins` in `next.config.ts` keeps HMR alive at a LAN IP.
- **Biome**: `biome.jsonc` at the root, `client/biome.jsonc` extends it. **Scoped to `client/`** deliberately — don't widen it without saying so. Details in `CODING_STYLE.md` § Formatting.

## `contracts.json` — one file, two consumers, one repo

**The single source of truth** for what Torii indexes *and* what the client sees, and it lives in the indexer's repo, `underware-gg/torii-deployment` — never here. The client installs that repo as the git dependency `torii-deployment`, **pinned to a commit hash in the root `catalog:`** (`github:underware-gg/torii-deployment#<hash>`), and imports `torii-deployment/contracts.json`. The client side is `CHAIN.md` §2.

- **Editing the file is done in that repo**, followed by an indexer deploy; the client picks it up by bumping the hash and running `pnpm install`. The pin is deliberate: the client changes what it lists only on purpose, and never before the indexer indexes it. Never point the catalog at a branch.
- **Do not copy the file back into this repo** (a local copy would drift from what Torii indexes) and never edit it under `node_modules/`.

## Reference repos on this machine

- **`/Users/roger/Dev/Realms/pistols`** — the main "Pistols at Dawn" monorepo, same org: prior art for the intended layout (`client/`, `dojo/`, `sdk/`, per-network manifests), and the source of `@underware/pistols-sdk`. Mirror its conventions unless there's a reason not to.
- **`/Users/roger/Dev/Dojo`** — local checkouts of `dojo`, `torii`, `dojo.js`, `dojo.c`, `controller`, `origami`. Read these for authoritative Dojo/Torii behaviour instead of guessing or trusting stale docs.
- **`/Users/roger/Dev/CC/ec-dapp`** — where `CODING_STYLE.md` and `NEXTJS_DATA_FLOW.md` come from. Style and data flow only; it is an EVM app.

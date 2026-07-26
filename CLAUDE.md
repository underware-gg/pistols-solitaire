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

There is still **no Cairo/Dojo code of our own** (no `Scarb.toml`, no `dojo/`, no SDK package) and **no tests anywhere** — do not assume a test command exists. The client reads the *existing* Pistols world through `@underware/pistols-sdk` and our Torii; it deploys nothing. Verify the actual scripts in `package.json` before suggesting a command, and update this section as areas land.

## Workspace (`pnpm-workspace.yaml`, `turbo.json`)

pnpm workspace + Turborepo, mirroring `/Users/roger/Dev/Realms/pistols`. The only member is `client` (`torii` is commented out — it has no dependencies and its scripts are run from inside `torii/`).

- **Shared dep versions live in the `catalog:` block of `pnpm-workspace.yaml`.** Packages reference them as `"next": "catalog:"` — bump the catalog, not the package manifests. Same convention as the reference monorepo.
- Root scripts delegate to Turbo (`dev`, `build`, `check-types`, `lint`, `storybook`, `build-storybook`); `format` runs Biome directly over `client`. `dev:all` is `turbo dev storybook` — two persistent tasks in one run, which is why there's no `concurrently` dependency (ec-dapp uses one; Turbo makes it redundant here).
- Turbo currently buys little with a single package — it's there for the `dojo`/`sdk` packages to come, where `dependsOn: ["^build"]` ordering and build caching start to matter. Dropping it means pointing the root scripts at `pnpm -C client …`.
- `onlyBuiltDependencies: [sharp]` in `pnpm-workspace.yaml` — pnpm 10 blocks postinstall scripts by default and Next.js image optimization needs sharp built.

## Client (`client/`)

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind 4, at `http://localhost:3000/`. **`specs/CODING_STYLE.md` and `specs/NEXTJS_DATA_FLOW.md` govern everything here.** Layout:

```
client/
  .storybook/     main.ts + preview.tsx — the ui/ preview surface
client/src/
  app/            ONLY what Next.js requires: layout.tsx, page.tsx, api/, actions/
  components/     everything else — generic components, providers/, ui/ (cva primitives
                  + a *.stories.tsx next to each)
  components/pages/<page>/  one folder per page: its page component + its own parts
  dojo/           chain profiles: profiles.ts (the table), config.ts (PROFILE), torii.ts
  hooks/          use-controller.ts (chain), plus:
  hooks/queries/  one react-query hook per API query route
  hooks/mutations/ one hook per server action, over useActionMutation
  lib/            cn(), client-utils (handleApiError)
  stores/         settings-store.ts — zustand, the persisted player settings
  styles/main.css the ONE stylesheet: Tailwind import + @theme tokens + base elements
```

- **`app/` is routing only** (`specs/CODING_STYLE.md` § File layout). `app/page.tsx` is a mount point — `return <HomePage />` — and every route's markup, state and providers live in `components/`. `Providers` is `components/providers/providers.tsx`, not `app/providers.tsx`. Applies to all new UI: component first, route grows an import.
- **A page is a folder: `components/pages/<page>/`.** The `/` route is `components/pages/home/HomePage.tsx`, `/collection` is `pages/collection/CollectionPage.tsx`, and anything written *for one page only* lives beside it. Only genuinely generic pieces — `Header`, `ControllerButton`, `NavigationCard`, `TokensPanel`, `ElapsedTimeBadge`, `ui/` primitives — sit at the top of `components/`; a page-local component graduates there the day a second page needs it, not before.
- **`Header` is mounted once, in `app/layout.tsx`** — logo home-link left, `ControllerButton` right. The layout wraps it and `children` in a `flex min-h-screen flex-col` div, so **every page's `<main>` uses `flex-1`, never `min-h-screen`** (that would add the header's height to the viewport and produce a scrollbar on every page).
- **Tailwind 4, no other CSS.** Tokens are the `--color-ps-*` set in `main.css`'s `@theme` (→ `bg-ps-bg`, `text-ps-bold`, `text-ps-accent`, `border-ps-line`). Compose classes with `cn()`. Tailwind is wired through `postcss.config.mjs` (`@tailwindcss/postcss`) — there is no `tailwind.config.*`, v4 configures in CSS.
  - Shadows are tokens too — `--shadow-vignette` (the viewport rail) and `--shadow-card` / `--shadow-card-hover` (panels lifted off the felt, used by `NavigationCard`). Reach for `shadow-card`, don't hand-roll a `shadow-[…]`.
  - The palette has **three knobs** — `--color-ps-bg` (the felt), `--color-ps-text` (white), `--color-ps-accent` (yellow); `panel`/`line`/`bold` are `color-mix()`-derived from them, so re-tinting the table is a one-line edit. Never write a literal colour in a component.
  - **The felt is switchable, and that is the whole mechanism for a themed surface.** `--ps-table-green` / `-red` / `-blue` are the casino-carpet tones in `@theme`; `--color-ps-bg` defaults to green and `html[data-table='red' | 'blue']` in `@layer base` re-points it. Because `panel`/`line` are `color-mix()`es of `--color-ps-bg` *declared on the same element*, they resolve against the override and every panel, border, shadow and stamp moves with the felt — nothing else in the app knows a table colour exists. `SettingsProvider` sets the attribute from `tableColor` in the settings store; a fourth table is a tone plus a two-line block. Verified in a production build: Tailwind keeps both the tones and the attribute blocks.
  - **Base element styles live inside `@layer base`.** Outside a layer they beat every utility by source order, so `<h3 className="text-ps-accent">` would silently do nothing.
  - **The table surface is three fixed pseudo-elements**, all `pointer-events-none`, all tuned by `--ps-stamp-*` / `--shadow-vignette` tokens: `html::before` (bevel highlight) and `body::before` (the logo stamp) at `-z-10`, `body::after` (viewport vignette) at `z-50`. Two non-obvious constraints hold this together — **the felt colour is on `html` only**, because a background on `body` paints *above* body's negative-z children and would bury the stamp; and the bevel is a masked second element rather than a `drop-shadow`, because filters are applied *before* masking, i.e. to the flat rectangle.
  - **The bevel is only the lip**, not a full offset copy of the stamp — an offset lattice with the stamp subtracted out (`mask-composite: intersect, subtract, add`), leaving a crescent. A whole copy underneath cancels light against dark across the entire silhouette, so the stamp stops darkening the felt and the texture reads *brighter* — the opposite of a stamp. The offset lattice layer is shifted along with the copy so the crescent is never clipped at a cell boundary.
  - **The stamp lattice is masks, not a tile asset.** CSS tiling has no spacing — the drawn size *is* the repeat period — so `body::before` tiles `logo_mask_b.png` edge to edge as a mask and intersects it (`mask-composite: intersect`) with a `conic-gradient` checkerboard of twice the period. What survives is the brick lattice: rows one logo apart, every other row shifted 50%. The logo is a solid silhouette, so masking a flat colour reproduces it and leaves the stamp re-colourable.
- **Fonts are self-hosted from `client/public/fonts/`**, declared in `client/src/styles/fonts.css` — `@font-face` and nothing else, `@import`ed at the top of `main.css`. It is the *one* sanctioned exception to the one-stylesheet rule (marked **[diverges]** in `specs/CODING_STYLE.md`), justified only by being generated boilerplate that decides nothing; family names and sizes stay in `@theme`. **Two type roles, named for the role rather than the face** — `--font-title` (headings and buttons, always paired with the `small-caps` utility, which exists because Tailwind has no `font-variant-caps`) and `--font-mono` (body copy; it's the `<body>` default, so nothing asks for it). No component ever names a family, so re-facing the game is a one-line `@theme` edit; `--font-title`, not `--title-font`, because Tailwind's `--font-*` namespace is what generates `font-title`. The files are copied from `/Users/roger/Dev/Realms/pistols/client/public/fonts/` (whose `styles/fonts.scss` is the reference for the `@font-face` blocks): **EB Garamond** (variable TTF, roman + italic) → `--font-title`; **Courier Prime** (8 woff2 subsets) → `--font-mono`. `font-display: block` on all of them — these are display faces, a swap flash is worse than a beat of invisible text. Pistols also ships Xanh Mono and Pinyon Script; both are unreferenced there, so they were not copied.
- **Every component accepts an optional `className`**, merged last through `cn()` onto its root element (`specs/CODING_STYLE.md` § Styling). Applies to page-level and feature components too, not just `ui/` primitives.
- **Icons: `lucide-react` only**, sized/colored with Tailwind utilities. Game art is not an icon — that goes in `public/assets/`.
- **`ui/` primitives use cva, and the variant axes are named the same everywhere**: `variant` = `primary` (default) / `secondary` / `ghost` / `text`, `size` = `sm` / `md` (default) / `lg`. `Button` is the reference — `primary` is the header's Connect button, `secondary` the quieter panel-coloured sibling, `ghost` an icon-only control whose whole hover state is the accent, `text` the header's account name (no box at all). Never invent `type`/`kind`/`color` for the same axes on another primitive (`specs/CODING_STYLE.md` § Component styling API).
  - **Feedback is motion, not fading**: `not-disabled:hover:scale-105` + `not-disabled:active:scale-95` at half the duration. **`opacity` means disabled** — no variant dims on hover. `text` opts out of both (it has no box to swell) and rides 90% → 100% instead.
  - **Every interactive state is gated behind `not-disabled:`.** An un-gated `hover:border-ps-accent` still lights up on a disabled button and cancels the `disabled:opacity-50` signal — this was a real bug, don't reintroduce it.
- **Storybook** (`@storybook/nextjs-vite`, config in `client/.storybook/`) is the wallet-free preview surface for `components/ui/`. `pnpm storybook` (:6006), `pnpm dev:all` (dev + Storybook), `pnpm build-storybook` (→ `client/storybook-static/`, gitignored). Rules are in `specs/CODING_STYLE.md` § Storybook; the two that get broken most:
  - **One story shows all variants together.** Each primitive gets `All` (the whole matrix on one page, grouped by axis) plus a controls-driven `Playground` — not `Primary`/`Secondary`/`Large`/`Disabled` as separate stories. Adding a variant means extending `All` in the same change.
  - **`variant`/`size` need explicit `argTypes`** (`control: 'select'`). cva's `VariantProps` is type-level only, so react-docgen can't see it and the Playground silently loses those controls.
  - `preview.tsx` imports `main.css` and nothing else — the felt, stamp and vignette are on `<html>`/`<body>`, so the preview iframe gets the real surface for free. No background decorator. `staticDirs: ['../public']` is required (unlike `next dev`, the builder doesn't serve `public/`, and `main.css` reaches into it for the fonts and the stamp).
- **Data flow**: API query routes + react-query hooks for reads, server actions + `useActionMutation` for writes. No `useEffect` fetching. The chain layer is used bare — never wrapped in another query layer.
- **Client state is zustand, in `src/stores/`** — `settings-store.ts` (`useSettingsStore`) is the first one, ported from ec-dapp's `src/stores/settings-store.ts`. Rules in `specs/CODING_STYLE.md` § Client state; the load-bearing ones:
  - **Every field in the settings store is persisted** — it holds durable player preferences only, so `persist` runs with no `partialize` and a new setting costs a field plus a setter. Session UI state (open panels, in-flight flags) gets its own unpersisted store; server data is react-query's, never a store.
  - **`skipHydration` + rehydrate on mount.** Reading a persisted value during the first client render mismatches the prerendered HTML, so the store starts at its defaults and `components/providers/SettingsProvider.tsx` calls `useSettingsStore.persist.rehydrate()` in a mount effect. That is also where every future persisted store rehydrates. Cost: the table paints green for one frame before flipping to a stored colour — a blocking inline script in `<head>` is the fix if that ever grates.
  - **Read one field at a time** (`useSettingsStore(s => s.tableColor)`); a whole-store selector re-renders on every unrelated change. No `useXActions` wrappers — "actions" means server actions here — and no passthrough read hooks.
  - The felt cycle lives in the store as `cycleTableColor()` over the `TABLE_COLORS` tuple (which is also the cycle order), so the menu item is one `onClick`. **"Switch table" deliberately leaves the burger menu open** — it is the one item whose effect is visible behind the panel, so cycling costs one click per step.
- **Testing the app: `pnpm dev:claude` (port 3009), never `pnpm dev` (port 3000)** — 3000 is the user's own server, which runs all session. Don't `pkill` `next dev`; stop only what you started, matched by port (`lsof -ti:3009 | xargs kill`).
  - Next.js locks one dev server per build dir, so `dev:claude` sets `NEXT_DIST_DIR=.next-claude` (honored in `next.config.ts`) — that's what allows two instances. Side effect: Next appends `.next-claude/**` globs to `client/tsconfig.json` include; that's expected, leave it.
  - **Same for Storybook: `pnpm storybook:claude` (port 6009), never `pnpm storybook` (6006).** Stop only what you started (`lsof -ti:6009 | xargs kill`).
- **Dev runs over HTTPS** — `next dev --experimental-https` in both `dev` and `dev:claude`, so the URL is `https://localhost:3000`. Don't "simplify" it back to http:
  - The Cartridge keychain iframe sends `frame-ancestors 'self' https: http://localhost:* http://127.0.0.1:* capacitor:`. Over plain http only `localhost`/`127.0.0.1` can frame `https://x.cartridge.gg/` — from any other host the browser blocks it and Connect silently does nothing, with no error from our code. The `https:` token is what makes LAN/device testing work.
  - Certs are self-signed, generated into `client/certificates/` (gitignored) on first run, which also installs an mkcert CA and may prompt for a password. Other devices need that CA to avoid a warning.
  - Separately, Next blocks `/_next/*` from non-localhost Origins, which 403s the HMR socket upgrade when reached at the LAN IP (hot reload dies; the client force-reloads after 25 retries). Handled by `allowedDevOrigins: ['192.168.*.*', '10.*.*.*']` in `next.config.ts`.
- **Biome** config is `biome.jsonc` at the root, **ported from ec-dapp's** with the same rules; `client/biome.jsonc` is an `extends: "//"` stub. Single quotes, semicolons, 2-space, 100 columns, `arrowParentheses: asNeeded`, organize-imports off.
- Biome is **scoped to `client/`** by deliberate choice — `torii/` and `contracts.json` predate the standard and would produce a large reformat diff. Don't widen the scope without saying so.
- Several linter rules are downgraded to `warn`/`off` in `biome.jsonc` because they were **ec-dapp's tracked debt** (`noExplicitAny`, the a11y set, `useJsxKeyInIterable`, …). We have no such legacy code, so treat them as errors in practice; they can be tightened whenever.
- **Next.js owns `client/tsconfig.json`** — it rewrites the file on `next build`. It's excluded from Biome; don't hand-format it or fight the rewrite.
- `next-env.d.ts` is generated and gitignored.

## Chain profiles (`client/src/dojo/`)

One network at a time, selected by profile — **ported from `/Users/roger/Dev/Realms/LORE/packages/client-sn/src/dojo/`**, which is the reference for this layer. Read those files when a rule here needs context.

- **`profiles.ts`** — the profile table. Only `mainnet` and `sepolia` exist (LORE also has a local Katana; we don't). Each profile carries `chain` / `chainName` / `rpcUrl` / `toriiUrl` / `manifest` / `namespace`, and `getProfileConfig()` derives `chainId`, `contractAddresses` and `tokens` from it. **A profile holds a single `manifest`** — LORE splits every field into `{ starknet, appchain }` because it bridges to an appchain; there is no appchain here, so never reintroduce that shape.
- **`config.ts`** — `PROFILE`, the active profile, plus `PROFILE_NAME`. **Everything chain-dependent imports `PROFILE`; nothing else reads `process.env` for chain config.** `NEXT_PUBLIC_PROFILE` picks the network (default `mainnet`), `NEXT_PUBLIC_RPC_URL` / `NEXT_PUBLIC_TORII_URL` override one URL each. Every var and its default is in `client/.env.example`; `torii/.env.example` covers the indexer.
- **`torii.ts`** — `getToriiClient()`, one lazily-created `ToriiClient`. The **dynamic `import()` is load-bearing, keep it inside the factory** (and the `ToriiClient` type import `type`-only): `@dojoengine/torii-client` re-exports `@dojoengine/torii-wasm`, whose module body instantiates a **2.7MB WASM binary at import time**. A static import puts it in the initial page chunk and every visitor downloads it before connecting — measured both ways, `…dojo_wasm_bg….wasm` is requested on first paint with a static import and not at all with the dynamic one. (It is *not* about SSR: a static import still builds and `/` still prerenders static.)

### Contract addresses — two sources, never hand-typed

`PROFILE.contractAddresses` is keyed by **game**, and `PROFILE.tokens` is the flat list of every ERC-20/ERC-721 across games. Neither is ever hand-typed, and there is **no hardcoded list of token names** — that drifts.

- **Which contracts are tokens, of which type, for which game** — all from **`contracts.json` at the repo root** (imported via the `@root/*` tsconfig alias), filtered to `enabled: true`. That is the same file the Torii indexer reads, so `PROFILE.tokens` is exactly what Torii has balances for. Adding a game's tokens = edit `contracts.json`, redeploy the indexer. Anything `enabled: false` (`realms/lords`, the `world` entries) never reaches the client.
- **Addresses** — for the `pistols` game from the Dojo manifests in **`@underware/pistols-sdk`** (`/pistols/config` getters), which stay authoritative for the world's own deployments; for every other game from `contracts.json`, which is the only place they exist.
- `contractAddresses.pistols` additionally holds the **game contracts** (world, game, game_loop, bank, admin, vrf, …) from the manifest — they are an address registry, not tokens, so they are never queried for balances. Addresses a network never deployed resolve to `0x0` and are dropped.
- `pistols/lords` is a deliberate loose end: the manifest resolves it (so it is in `contractAddresses.pistols`) but `contracts.json` lists LORDS under the disabled `realms` game, so it is **not** in `PROFILE.tokens` and no balance is shown. Left for later on purpose — don't "fix" it by hardcoding it back in.

### Providers (`client/src/components/providers/`)

Connected through the **Cartridge Controller**; connector versions match `/Users/roger/Dev/Dojo/controller/examples/minimal` (`starknet` 8, `@starknet-react/*` 5, latest `0.13.x` Controller). All versions in the root `catalog:`.

- `StarknetProvider.tsx` — the `ControllerConnector` is built **once at module scope** (it reuses `window.starknet_controller` and warns if constructed twice), from `PROFILE`: `chains`, `defaultChainId`, `namespace`, `toriiUrl`. Every `window` access inside the controller is guarded, so this module SSRs fine — no `dynamic(…, { ssr: false })` needed, and `/` still prerenders static.
- `providers.tsx` — `Providers`: creates the one `QueryClient` and hands it to `StarknetConfig`, which mounts the `QueryClientProvider` itself. One provider, one cache, shared with the app's own queries (`specs/NEXTJS_DATA_FLOW.md` §0). Wraps children in `TokensProvider`.
- `TokensProvider.tsx` — cloned from LORE's `tokens-provider.tsx`, widened from its single ERC-721 to every contract in `PROFILE.tokens`. **The app's one Torii subscription**: it pages `getTokenBalances` for the connected account, then streams `onTokenBalanceUpdated`. Components read it through `useTokenBalances()` / `useCoinBalance(game, name)` / `useTokenIds(game, name)` — never a second query layer over it. Torii leaves `token_id` unset for ERC-20s; that is what splits `balances.erc20` from `balances.erc721`.
- `hooks/use-controller.ts` — the only thing components use for connection: `connect` / `disconnect` / `openController(tab)` / `username` / `address` / `isConnected`. Composes bare `@starknet-react/core` hooks; never wraps them in another cache.
- `preset: 'pistols'` gives the Controller the Pistols theme and its published policies. No `policies` of our own yet — those need a deployed world for *this* game.
- `@cartridge/controller/react`'s `ControllerToaster` (and its stylesheet) is deliberately **not** mounted: it's optional, and the one-stylesheet rule means importing package CSS needs a reason. Add it when transaction toasts are wanted.
- `ControllerOptions.tokens` is **not** set: in `0.13.x` its `Token` type is a fixed union (`eth`/`strk`/`lords`/`usdc`/`usdt`), not arbitrary addresses, so the game's tokens can't be listed in the Controller inventory that way. `toriiUrl` is what surfaces them.

## `@underware/pistols-sdk`

Published on npm (root `catalog:`), sourced from `/Users/roger/Dev/Realms/pistols/sdk`. **It is the resource library for composing Pistols games — reach for it before hand-rolling anything Pistols- or Starknet-shaped.** What we use today:

- `@underware/pistols-sdk/pistols/config` — `NetworkId` / `ChainId` / `NAMESPACE`, `getManifest()`, and the per-contract address getters (`getWorldAddress`, `getFameAddress`, `getDuelTokenAddress`, …). Bundles the mainnet/sepolia/dev manifests, so we don't vendor them.
- `@underware/pistols-sdk/utils` — `bigintToAddress` (padded lowercase, the form Torii wants), `bigintToHex`, `isPositiveBigint`.
- `@underware/pistols-sdk/starknet` — `stringToFelt` (chain name → chain id felt), `weiToEthString`.

Notes for working with it:

- **The npm release lags the local checkout** (1.3.2 vs 1.3.10 as of this writing). Getters added locally may not exist in the published build — `getCommunityAddress` is one. Check `node_modules/@underware/pistols-sdk/dist/pistols_config.d.ts` before importing a new symbol.
- **Don't `link:` the local checkout.** Turbopack refuses to resolve a module whose real path escapes the project root, and every SDK import fails with "Module not found". Use the registry version; bump the catalog when a release lands.
- Its `/hooks` and `/pistols/dojo` entry points (`useSdkTokenBalances`, `useController`, …) assume the full `@dojoengine/sdk` Dojo context, which we don't mount — we talk to Torii through `torii.ts` instead. Only pull those in if the Dojo context comes with them.

## Intended stack (not yet present)

`.vscode/settings.json` was carried over from the sibling Pistols projects and reveals what is still expected:

- **Dojo / Cairo** — `cairo1.enableLanguageServer` + `cairo1.enableScarb`; a `dojo/bindings/**` path is excluded from search, implying generated TypeScript bindings from a Dojo world. We read the existing Pistols world; there is no world of our own, so no `@dojoengine/sdk` entity layer yet — only Torii tokens.
- Indentation: 2 spaces for TS/JS, **4 spaces for Cairo and Python**.

## Torii indexer (`torii/`)

**Everything about the indexer lives in [`torii/CLAUDE.md`](./torii/CLAUDE.md)** — read it before
touching `torii/`, the generated TOML, or the indexing side of `contracts.json`. Operational steps are
in `torii/README.md`; `torii/SPECS.md` is frozen history the implementation deliberately deviates from.

Two things that reach outside `torii/` and so belong here:

- **`contracts.json` at the repo root is the single source of truth** for which contracts Torii indexes *and* which tokens the client sees (`PROFILE.tokens`). One file, two consumers — a change to it is a change to both.
- **Torii never indexes backwards.** `indexing.world_block` (the oldest enabled `block`) is only a fallback for contracts with **no row in the db yet**; an already-indexed contract resumes from its stored `head`. So adding an *older* contract costs the existing index nothing and backfills itself fine — but **re-indexing an existing contract from an earlier block, or dropping one, requires wiping data**, and `enabled: false` alone does not stop indexing it. Warn about that *before* editing `contracts.json`, offer both wipe options, never wipe unasked. Full mechanism, source citations and the live-db check: `torii/CLAUDE.md`.

## Reference repos on this machine

- `/Users/roger/Dev/Realms/pistols` — the main "Pistols at Dawn" monorepo by the same org. Prior art for the intended layout: pnpm + Turbo workspace with `client/`, `dojo/` (Cairo world), `sdk/`, per-network `dojo_{dev,sepolia,mainnet}.toml` and `manifest_*.json`. Mirror its conventions unless there's a reason not to.
- `/Users/roger/Dev/Dojo` — an additional working directory containing local checkouts of `dojo`, `torii`, `dojo.js`, `dojo.c`, `controller`, `origami`, etc. Read these for authoritative Dojo/Torii behavior instead of guessing or relying on possibly-stale docs.

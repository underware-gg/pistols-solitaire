# Coding Style

Binding rules for all code in this repo. Referenced from `CLAUDE.md`.

Ported from `ec-dapp` (`/Users/roger/Dev/CC/ec-dapp/specs/CODING_STYLE.md`), the upstream reference. Keep in sync; **[diverges]** marks a deliberate difference — don't "fix" those back.

**Only the style comes from ec-dapp.** It is an EVM app; **this project is Starknet only** (Cairo, `@starknet-react/core`, Cartridge Controller, Torii). Never carry an EVM dependency, address type, ABI convention or wallet library across. Where an upstream rule names an EVM tool, the Starknet analogue applies.

## Formatting

- **Biome** is formatter and linter, configured by one root `biome.jsonc`; `client/biome.jsonc` is an `"extends": "//"` stub.
- 2-space indentation, single quotes, semicolons, 100 columns.
- **[diverges] Biome runs on `client/` only** — `torii/` and `contracts.json` predate the standard.
- **[diverges] Tailwind directives are parsed, not excluded**, so `main.css` is linted and formatted.
- **Rules ec-dapp downgraded to `warn`/`off` are its tracked debt, not permission** — we have no such legacy, so treat them as errors.
- Match the surrounding code's idiom: comment density, naming, structure.

## File layout: `app/` is routing only

**[diverges]** `client/src/app/` holds only what Next.js requires — `layout.tsx`, `page.tsx`, `api/`, `actions/`, metadata files. Everything else lives in `components/`. (Full directory map: `CLAUDE.md` § Client.)

- **A route file is a mount point**: `app/page.tsx` renders `<HomePage />` and nothing more. Markup, state and layout belong to the component.
- **[diverges] A page is a folder under `components/pages/<page>/`** — the page component plus every component built for that page alone, including the component a `layout.tsx` mounts (`DecksScene`) and the page's own `*-layout.ts` (numbers tuned by eye for one board; the shared *mechanism* belongs to `engine/`). A component leaves the folder only when it is genuinely generic, or when a second page uses it — a page-local component graduates the day a second page needs it, not in anticipation.
- **[diverges] `engine/` and `solitaire/` are deliberate extra top-level modules**, beside the `lib/` + `hooks/` + `components/` split this section otherwise mandates: each is a cohesive *subsystem*, not a collection of one kind of file, and every page that deals cards wants all of it at once. **A third one needs the same bar** — its own vocabulary, consumed by more than one page — not merely "several related files".
- **`Header` is mounted once, in `app/layout.tsx`**, inside a `flex min-h-screen flex-col` wrapper — so **every page's `<main>` uses `flex-1`, never `min-h-screen`** (that adds the header's height, and a scrollbar, to every page).
- **Providers are components**, in `components/providers/`, one per file.
- **New UI is a component first**; a route only ever grows an import.
- Hooks live in `client/src/hooks/` — `queries/` and `mutations/` for the data-flow layer, `contracts/` for on-chain calls, the root for chain and UI hooks.
- **`hooks/contracts/` is one file per *contract*, not per hook** — every entrypoint of `pack_token` is a hook in `use-pack-token.ts`, each named for its entrypoint. Rules: `NEXTJS_DATA_FLOW.md` §0 and `CHAIN.md` §4.

## Client state (zustand stores)

Client state outliving a component goes in `client/src/stores/`, one file per concern (`<concern>-store.ts` exporting `use<Concern>Store`). Component-local state stays `useState`; **server data is react-query's job, never a store**.

- **Read and write the store directly**, one field at a time — a whole-store selector re-renders on every unrelated change. No `useXActions` wrappers ("actions" means server actions here), no passthrough read hooks.
- **Setters live in the store** beside their state. A transition with logic (cycling a list, clearing a group of flags) is a named method, not an expression re-derived at each call site.
- **Durable player preferences are all persisted** — `settings-store` uses `persist` with no `partialize`. Per-session UI state gets its own unpersisted store.
- **`partialize` is for state that would contradict itself, not for trimming.** `solitaire-store` uses it because the board is *derived* from the seed and move list it persists, so storing the board too would let a saved game disagree with its own history.
- **Persisted stores use `skipHydration` and rehydrate on mount** — reading a persisted value during the first client render is a hydration mismatch. `SettingsProvider` is where every persisted store rehydrates. The cost is one frame of defaults (for `settings-store`, one frame of the default felt); pay it rather than reading during render.
- **A setting CSS consumes is an attribute on `<html>`**, not a class or inline styles: the provider mirrors it to `data-*`, `main.css` re-points one token per value, and the derived palette follows. Components never read a setting to pick a colour.

## TypeScript

- Path aliases only, never long relative paths: `@/*` → `client/src/*`, `@/assets/*` → `client/public/assets/*`, `@root/*` → repo root.
- `strict: true`. Domain types are hand-written; don't reach for `any` where a real type is cheap.
- **Next.js owns `client/tsconfig.json`** — it rewrites it on build, and Biome excludes it. Don't hand-format it.

## Icons

- **`lucide-react` only** — no inline SVG, no icon fonts, no second package.
- Size and colour with Tailwind utilities, not the `size`/`color` props.
- Game art (cards, pistols, characters) is **not** an icon — that lives in `client/public/assets/`.

## Styling (Tailwind)

- **Tailwind 4, configured in CSS** (`postcss.config.mjs`, and deliberately **no `tailwind.config.*`**).
- **One stylesheet**, `client/src/styles/main.css`: the Tailwind import, `@theme` tokens, base element styles, and the few irreducible globals. No SCSS, no CSS Modules, no per-component CSS.
  - **[diverges] One exception: `styles/fonts.css`**, `@font-face` and nothing else — generated boilerplate that decides nothing. A second exception needs the same justification.
- **Style elements directly instead of inventing classes.** Shared defaults go on element selectors in `main.css`; one-offs go on the component as utilities. An element earns a class only when it needs more than styling (behaviour targeting, or a layout class reused on plain elements).
- **`style` prop only for dynamic runtime values** — never for static styling.
- **`cn()` (`@/lib/cn`) composes conditional classes.** No string concatenation, no template literals for class names.
- **[diverges] Every component takes an optional `className`**, not just `ui/` primitives, merged **last** through `cn()` onto the root element so the call site wins. Without it, callers are forced into wrapper divs.
- **Tokens decide everything, components decide nothing.** The `--color-ps-*` / `--shadow-*` / `--font-*` sets in `@theme` generate the utilities; reach for `shadow-card`, never a hand-rolled `shadow-[…]`, and **never a literal colour or font family in a component**. The palette has three knobs — `bg` (the felt), `text` and `accent` — with `panel`/`line`/`bold` `color-mix()`ed from them, so re-pointing one knob moves everything derived from it.
- **Two type roles, named for the role and not the face**: `--font-title` (headings and buttons, always with the `small-caps` utility, which exists because Tailwind ships no `font-variant-caps`) and `--font-mono` (body copy, the `<body>` default). EB Garamond + Courier Prime, self-hosted from `public/fonts/` at `font-display: block`. **No component ever names a font family.**
- **Property animations are `--animate-*` + `@keyframes` in `@theme`**, not a class.
- **Base element styles go inside `@layer base`.** Outside a layer they beat every utility by source order, so a `<h3 className="text-ps-accent">` would silently do nothing.
- **Image optimization is off** (`images: { unoptimized: true }`): this client ships art at the size it is shown and the engine rasterizes cards itself, so keep anything in `public/` near its render size. It does **not** turn off lazy loading, so **nothing drawn over a canvas uses `next/image`** — inside a drei `<Html>` portal the IntersectionObserver can fail to ever fire and the image silently never loads.
- **An `<img>` positioned over a canvas needs `max-w-none`.** Tailwind's preflight ships `img { max-width: 100% }`, and 100% resolves against the containing block — over a canvas that is an *anchor point*, 0–1px wide. The image loads and paints as an invisible sliver while `size-*` appears to do nothing, so this reads as a positioning bug. Divs are immune.

```tsx
// ✅ element styled directly; cn() for conditions; style only for dynamic values
<button className={cn('px-4 py-2', isActive && 'bg-ps-accent')} style={{ left: `${x}px` }}>

// ❌ needless custom class, string-built classNames, static style prop
<button className={'button-class ' + (isActive ? 'active' : '')} style={{ padding: 8 }}>
```

### The table surface

The felt every page sits on, and **the mechanism for any themed surface**.

- **The felt is switchable through one token.** `--ps-table-*` are the tones; `html[data-table='…']` in `@layer base` re-points `--color-ps-bg`, and because `panel`/`line` are `color-mix()`es declared on the same element they resolve against the override — every panel, border, shadow and stamp moves with the felt, and **nothing else knows a table colour exists**. `SettingsProvider` sets the attribute. A fourth table is a tone plus a two-line block, and an entry in `TABLE_COLORS` (which leads with the default).
- **The surface is three `pointer-events-none` fixed pseudo-elements**: `html::before` (the stamp bevel) and `body::before` (the logo stamp) at `-z-10`, `body::after` (the vignette) at `z-50`, tuned by `--ps-stamp-*`. Two constraints hold it together — **the felt colour is on `html` only** (a background on `body` paints above body's negative-z children and buries the stamp), and the bevel is a masked element rather than a `drop-shadow` (filters apply *before* masking, i.e. to the flat rectangle).
- **The stamp is masks, not a tile asset** — CSS tiling has no spacing, so the logo mask is intersected with a `conic-gradient` checkerboard of twice the period to get the brick lattice. The bevel is only the *lip* (the offset lattice with the stamp subtracted); a full offset copy cancels light against dark and reads *brighter* than the felt.

### Component styling API: props & variants

When a styling class keeps getting passed to a shared primitive (`components/ui/`), pull it into the component's typed API instead of repeating it at every call site.

- **Atomic, single-purpose class → boolean/enum prop.** `<Image pixelated centered fluid />`.
- **Reusable multi-property bundle → `variant`**, defined with **cva** inside the component, its output merged with the incoming `className` through `cn()` so call sites can still override.
- **`variant` is the *look*, `size` is the *scale*, and every primitive names them the same way.** `variant` is an emphasis ladder; `size` is small/medium/large with the middle rung as the default. Never invent `type`/`kind`/`color` or `small`/`big` for the same axes, and never give two primitives different names for the same rung. The rungs are fixed: `variant` = `primary` (default) / `accent` / `secondary` / `ghost` / `text`, `size` = `sm` / `md` (default) / `lg`.
- **Always give an axis a `defaultVariants` entry**, so the bare component is the common case.
- **A variant earns its name from a real call site**, not from a design system in the abstract.
- **Interactive feedback is motion, not fading** — `not-disabled:hover:scale-105` swells, `not-disabled:active:scale-95` snaps down at half the duration. **`opacity` means disabled**, so no variant dims on hover.
- **Gate every interactive state behind `not-disabled:`.** An un-gated `hover:` still fires on a disabled control and undoes `disabled:opacity-50`. Real bug; don't reintroduce it.
- **Delete a class from `main.css`** once nothing outside the primitive references it.

The primitives as they stand:

- **`Button` is the reference** for both axes. `accent` is the one thing on a page the player came to do — **never two on a page**. `secondary` brightens its border to the ink on hover, not to yellow, so the quiet button doesn't shout. `text` has no box.
- **`Spinner` — `size` only**, at the *icon* sizes the buttons use, because it stands in for a control.
- **`NotificationBadge` — `size` only**, in badge sizes. It draws finished art as authored and pulses its **saturation** (`--animate-notify`); the pulse is a `filter`, so a `drop-shadow-*` on it silently loses.

## Storybook

The **wallet-free preview surface for `components/ui/`** — a primitive's whole variant matrix with no chain, Controller or route in the way. `@storybook/nextjs-vite`, config in `client/.storybook/`.

- **Every `ui/` primitive has a story beside it.** Adding a variant means extending that story in the same change.
- **One story shows all variants**: `All` — every variant, size and state on one page, grouped by axis. **Don't** split into `Primary`/`Secondary`/`Large`/`Disabled`; that hides the comparison the story exists to make.
- **`Playground` is the second story**, a controls-driven single instance. Those two are the whole convention; more needs a distinct composition, not a distinct prop value.
- **`title` is `'UI/<Component>'`** — the sidebar mirrors the folder.
- **Declare `variant`/`size` in `argTypes`** (`control: 'select'`) — cva's `VariantProps` is type-level, so react-docgen can't see it and the Playground silently loses the controls.
- **Stories decide nothing about styling**: they render on the app's real surface via `main.css`. A story that hand-rolls a background is testing the story. `preview.tsx` imports `main.css` and nothing else (the surface lives on `<html>`/`<body>`), and `staticDirs: ['../public']` is required for the fonts and art to resolve.
- **A story is not a test and not a route.** Anything needing the Controller, Torii or an account is exercised in the app.

## Conventions

- **Prefer native platform resources over wrapper libraries** — `<audio>` over player libs, `matchMedia` over device-detect libs, `JSON.stringify` over prettifiers, `document.cookie`/`cookies()` over cookie libs.
- **Data flow follows `NEXTJS_DATA_FLOW.md`**: non-chain reads are API query routes + one react-query hook each; mutations are server actions + per-action hooks over `useActionMutation`. No `useEffect` fetching.
- **[diverges] The chain layer is Starknet and is used bare** — `@starknet-react/core` hooks directly, never wrapped in another `useQuery`/`useMutation` (`NEXTJS_DATA_FLOW.md` §0). Chain config stays in `StarknetProvider`, addresses in one registry, and every chain-scale integer is a native `bigint` (never `bn.js`/`BigNumber`).
- **Wallet connection is the Cartridge Controller only.** One `ControllerConnector`, built once at module scope in `StarknetProvider`; components go through `useController()` and never touch the connector.
- **Shared dependency versions live in `catalog:`** in `pnpm-workspace.yaml`. Bump the catalog, never a package manifest.

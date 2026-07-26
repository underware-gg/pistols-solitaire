# Coding Style

Rules for all code written in this repo. Referenced from `CLAUDE.md`; followed for all new code.

Ported from `ec-dapp` (`/Users/roger/Dev/CC/ec-dapp/specs/CODING_STYLE.md`) — that repo is the upstream reference implementation. Divergences from it are marked **[diverges]** and are deliberate; everything else should be kept in sync.

**Only the code style comes from ec-dapp.** ec-dapp is an Ethereum/EVM app; **this project is Starknet only** — Cairo contracts, `@starknet-react/core`, the Cartridge Controller, Torii. Never carry an EVM dependency, address type, ABI convention or wallet library across from it. Where its rules name an EVM tool, the Starknet analogue applies (see the chain-layer bullets under **Conventions**).

## Formatting

- **Biome** is the formatter and linter.
- **One root `biome.json` for the whole workspace** — no per-package rule overrides. `client/biome.json` exists only as an `"extends": "//"` stub so Biome resolves the root config when run from the package.
- **[diverges] Biome is active on `client/` only.** `torii/` and `contracts.json` predate the standard and are not linted; widening the scope means a large reformat diff, so it's a deliberate call, not an oversight.
- **2-space indentation**, single quotes, semicolons, 120-column lines.
- **[diverges] Tailwind directives are parsed, not excluded.** `css.parser.tailwindDirectives: true` lets Biome lint and format `main.css` instead of ignoring it (ec-dapp excludes the file; Biome 2.5+ no longer requires that).
- Match the surrounding code's idiom: comment density, naming, structure.

## File layout: `app/` is routing only

**[diverges]** `client/src/app/` holds only what Next.js itself requires — `layout.tsx`, `page.tsx`, route handlers (`api/`), server actions (`actions/`), `favicon`/metadata files. Everything else lives in `client/src/components/`.

- **A route file is a mount point, nothing more.** `app/page.tsx` imports one component and renders it: `<HomePage />`. Route markup, state and layout belong in `components/HomePage.tsx`, not in `page.tsx`.
- **Providers are components**, not route files: `components/providers/` (`providers.tsx` exports `Providers`; one file per provider next to it). `app/layout.tsx` imports `Providers` from there.
- **Everything composable, everything in `components/`** — shared primitives in `components/ui/`, feature components at the top level of `components/`. New UI is a component in `components/` first; a route only ever grows an import.
- Hooks go in `client/src/hooks/` — `queries/` and `mutations/` for the data-flow layer (`NEXTJS_DATA_FLOW.md`), the root of `hooks/` for chain and UI hooks.

```
client/src/
  app/            layout.tsx, page.tsx, api/, actions/ — nothing else
  components/     HomePage.tsx, ControllerButton.tsx, providers/, ui/
  hooks/          use-controller.ts, queries/, mutations/
```

## TypeScript

- Path aliases: `@/*` → `client/src/*`, `@/assets/*` → `client/public/assets/*`. Always import via aliases, never long relative paths.
- `strict: true`. Don't add `any` where a real type is cheap.
- Domain types are hand-written, never `any`: card/deck shapes, duel state, chain addresses.
- **Next.js owns `client/tsconfig.json`** — it rewrites the file during `next build`. Don't hand-format it; it's excluded from Biome.

## Icons

- **`lucide-react` is the icon library.** Whenever a UI element needs an icon, import it from `lucide-react` — no inline SVG paste, no icon fonts, no second icon package.
- Size and color with Tailwind utilities on the component (`<Swords className="size-5 text-ps-accent" />`), not with the `size`/`color` props — this keeps icons consistent with the rest of the styling rules below.
- Game-specific art (cards, pistols, characters) is **not** an icon — those are assets under `client/public/assets/`.

## Styling (Tailwind)

- **One main CSS file**: `client/src/styles/main.css`, imported by the root layout. It holds the Tailwind import, the `@theme` design tokens, base element styles, and the few necessary custom classes. No other stylesheets — no SCSS, no CSS Modules, no per-component CSS files.
  - **[diverges] One exception: `client/src/styles/fonts.css`**, `@import`ed at the top of `main.css`. It holds the `@font-face` declarations and nothing else — a hundred lines of generated boilerplate that only changes when a font is added, and that would otherwise bury the tokens. It decides nothing: family names, sizes and colours stay in `@theme`. Do not add a second exception without the same justification.
- **Style elements directly instead of inventing classes.** Shared element defaults go on element selectors in the main CSS file (`button { … }`, not `.button-class`); one-off styling goes on the component as Tailwind utilities in JSX.
- **A UI element gets its own class only when it needs more than styling** — behavior targeting, or a layout class reused on plain elements.
- **`style` prop only when necessary** — dynamic runtime values (computed positions, colors, sizes). Never for static styling.
- **`cn()` (`@/lib/cn`) for composing conditional styles** (clsx + tailwind-merge). No string concatenation or template literals for class names.
- Palette tokens are the `--color-ps-*` set in `@theme`, which generate utilities (`bg-ps-bg`, `text-ps-bold`, `border-ps-line`, `text-ps-accent`). Use the tokens, not raw hex or stock Tailwind colors.

```tsx
// ✅ element styled directly; cn() for conditions; style only for dynamic values
<button className={cn('px-4 py-2', isActive && 'bg-ps-accent')} style={{ left: `${x}px` }}>

// ❌ needless custom class, string-built classNames, static style prop
<button className={'button-class ' + (isActive ? 'active' : '')} style={{ padding: 8 }}>
```

### Component styling API: props & variants

When the same styling class keeps getting passed to a shared primitive (`client/src/components/ui/`), pull it into the component's **typed API** instead of repeating a class string at every call site. This makes the styling discoverable and type-checked.

- **Atomic, single-purpose class → boolean/enum prop.** One CSS concern (`image-rendering: pixelated`, `margin: auto`, `width/height: 100%`) becomes a prop mapping to the equivalent utilities. `<Image pixelated centered fluid />`, not `<Image className="PixelArt Centered FillParent" />`.
- **Reusable, multi-property layout bundle → `variant`**, defined with **`class-variance-authority` (cva)** inside the component. `<Image variant="card" />`.
- **cva is the variant mechanism for primitives** — typed variants (`VariantProps<typeof x>`), `defaultVariants`, and compound variants. Always merge its output with the incoming `className` through `cn()` so call sites can still override.
- **Delete the class** from `main.css` once nothing references it. Keep it only when plain elements outside the primitive still use it.
- Net effect: styling migrates into components' typed APIs, and `main.css` shrinks toward only tokens, base element styles, and irreducible globals.

```tsx
// A primitive's variants + prop-driven styling, defined with cva and merged via cn().
const imageVariants = cva('max-w-full', {
  variants: {
    variant: { card: 'mx-auto w-full h-auto max-w-[250px] min-w-[180px]' },
    pixelated: { true: '[image-rendering:pixelated]' }, // atomic → prop
    centered: { true: 'mx-auto block' },                // atomic → prop
  },
});
type Props = VariantProps<typeof imageVariants> & { className?: string /* … */ };
// <img className={cn(imageVariants({ variant, pixelated, centered }), className)} />
```

## Conventions

- **Prefer native platform resources over wrapper libraries** — `<audio>` over player libs, `matchMedia` over device-detect libs, `JSON.stringify` over prettifier libs, `document.cookie`/`cookies()` over cookie libs.
- Data fetching & mutations follow **`specs/NEXTJS_DATA_FLOW.md`**: non-chain reads = API query routes (`/api/query/*`) + one react-query hook per query (`client/src/hooks/queries/`); mutations = server actions (`client/src/app/actions/`) + per-action hooks over `useActionMutation` (`client/src/hooks/mutations/`, centralized sonner toasts). No `useEffect` fetching. **Chain hooks (Starknet/Dojo) are used directly** — never wrapped in another `useQuery`/`useMutation` layer.
- **[diverges] The chain layer is Starknet, not EVM.** ec-dapp's EVM rules (WebThreeContext, wagmi, `bn.js` ban, `EC.log` gating) map onto: read chain state through `@starknet-react/core` hooks (and the Dojo SDK once it lands), used bare — see `NEXTJS_DATA_FLOW.md` §0; keep chain config in `components/providers/StarknetProvider.tsx` and contract addresses in one registry; use native `bigint` for all chain-scale integers (never `bn.js`/`BigNumber`).
- **Wallet connection is the Cartridge Controller only.** `@cartridge/connector`'s `ControllerConnector` is the single connector, built once at module scope in `components/providers/StarknetProvider.tsx` (it reuses `window.starknet_controller` and warns if constructed twice). Components never touch the connector directly — they go through `useController()` (`hooks/use-controller.ts`).
- **[diverges] No Storybook** — component previews aren't set up; don't reference them in code comments.

## Shared dependency versions

Every dependency version lives in the `catalog:` block of `pnpm-workspace.yaml`; packages reference it as `"next": "catalog:"`. Bump the catalog, never a package manifest.

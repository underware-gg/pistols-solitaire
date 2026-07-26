# Pistols Solitaire client

Next.js 16 (App Router) + React 19 + TypeScript.

```bash
pnpm install        # from the repo root
pnpm dev            # https://localhost:3000
pnpm dev:claude     # https://localhost:3009 — second instance (builds to .next-claude)
pnpm build          # production build
pnpm start          # serve the build
pnpm check-types    # tsc --noEmit
pnpm lint           # biome check
pnpm format         # biome check --write
```

## Layout

`src/app/` = only what Next.js requires (`layout.tsx`, `page.tsx`, later `api/`, `actions/`); routes just mount a component (`page.tsx` → `<HomePage />`). Everything else lives in `src/components/`; chain config in `src/dojo/`. `@/*` → `src/*`, `@/assets/*` → `public/assets/*`, `@root/*` → repo root.

## Starknet

One network at a time, via the Cartridge Controller. Mainnet by default; `NEXT_PUBLIC_PROFILE=sepolia` switches.

| file | what |
| --- | --- |
| `src/dojo/profiles.ts` | the mainnet/sepolia profiles: chain, RPC, Torii, manifest, contract addresses per game |
| `src/dojo/config.ts` | `PROFILE` — the active profile. Read chain config from here, never from `process.env` |
| `src/dojo/torii.ts` | `getToriiClient()` — the one Torii client (lazy: it loads ~3MB of WASM) |
| `src/hooks/use-controller.ts` | `useController()` — connect / disconnect / open the Controller |
| `src/components/providers/StarknetProvider.tsx` | `StarknetConfig` + the single `ControllerConnector` |
| `src/components/providers/TokensProvider.tsx` | live token balances of the connected account; read via `useTokenBalances()`, `useCoinBalance()`, `useTokenIds()` |

Addresses come from two places and are never typed by hand: **pistols** from the Dojo manifests in
`@underware/pistols-sdk`, **every other game** from [`../contracts.json`](../contracts.json) — the same
file the Torii indexer reads. To add a game's tokens, edit `contracts.json` and redeploy the indexer.

**Dev runs over HTTPS** (`next dev --experimental-https`, self-signed certs in `certificates/`). Required: the keychain iframe sets `frame-ancestors 'self' https: http://localhost:* http://127.0.0.1:*`, so over plain http Connect silently does nothing on any host but `localhost`. First run generates an mkcert CA and may ask for your password; other devices need that CA installed to avoid a cert warning.

## Env

Copy [`.env.example`](./.env.example) to `.env.local`; restart the dev server after editing.

Required: none — the defaults work.

| optional var | default |
| --- | --- |
| `NEXT_PUBLIC_PROFILE` | `mainnet` (or `sepolia`) |
| `NEXT_PUBLIC_RPC_URL` | the profile's RPC — `https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_9` |
| `NEXT_PUBLIC_TORII_URL` | the profile's Torii — `https://pistols-solitaire-mainnet.up.railway.app` |
| `NEXT_DIST_DIR` | `.next` (`dev:claude` sets `.next-claude`) |

Styling is Tailwind 4 — all of it in `src/styles/main.css` (tokens in `@theme`, no `tailwind.config.*`). Icons come from `lucide-react`.

Read [`../specs/CODING_STYLE.md`](../specs/CODING_STYLE.md) and [`../specs/NEXTJS_DATA_FLOW.md`](../specs/NEXTJS_DATA_FLOW.md) before writing code here.

Shared dependency versions come from the `catalog:` block in the root `pnpm-workspace.yaml` — bump them there.

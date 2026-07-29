# The chain layer (`client/src/dojo/`, `providers/`, `hooks/contracts/`)

Everything that talks to Starknet, Torii or the Pistols world. Read this before any read, write or address.

**The chain layer is used bare** — `@starknet-react/core` hooks directly, never wrapped in another `useQuery`/`useMutation` (`NEXTJS_DATA_FLOW.md` §0). Composing several bare hooks into one is fine; adding a cache over them is not.

Ported from `/Users/roger/Dev/Realms/LORE/packages/client-sn/src/dojo/`, the reference for this layer.

## 1. Profiles (`dojo/`)

One network at a time, selected by profile.

- **`profiles.ts`** — the profile table; only `mainnet` and `sepolia`. `getProfileConfig()` derives `chainId`, `contractAddresses` and `tokens`. **Every field is a single value** — LORE splits each into `{ starknet, appchain }` because it bridges to an appchain; never reintroduce that shape.
- **A profile carries no `manifest`.** It carries `networkId`, the key the SDK's `getManifest({ networkId })` takes, so whatever needs a manifest or an ABI asks the SDK. Don't add the field back.
- **`config.ts`** — `PROFILE`. Everything chain-dependent imports it, and **nothing else reads `process.env` for chain config**. Vars and defaults are in `client/.env.example`.
- **`explorer.ts`** — block-explorer URLs, from `@starknet-react/core`'s own `VoyagerExplorer` (it reads `chain.explorers.voyager`, so the profile's chain is the whole config). **Never hand-write a `voyager.online` URL**, and don't reach for the `useExplorer` hook — it ties every link to the *connected* chain, and this has to link to a network the app isn't running on. **Anything importing it is a client component**: `@starknet-react/core` ships as one module that calls `createContext` at import time, so a server component that touches it 500s.
- **`torii.ts`** — one lazily-created `ToriiClient`. **Keep the `import()` dynamic inside the factory** (and the type import `type`-only): `@dojoengine/torii-client` re-exports `torii-wasm`, which instantiates a 2.7MB WASM binary at import time, so a static import ships it in the first page chunk.

## 2. Contract addresses — two sources, never hand-typed

- **`contracts.json` at the repo root** (via the `@root/*` alias), filtered to `enabled: true`, is what says which contracts are tokens, of which type, for which game. It is the same file Torii reads, so `PROFILE.tokens` is exactly what Torii has balances for. Adding a game's tokens = edit it and redeploy the indexer.
  - **`slug` is a URL-facing id** — the collection's name in `/deck/<slug>`, so **renaming one breaks every link to that deck**. `name` is the label on the felt.
  - **`contractEntries(chainName)` in `profiles.ts` is the one reader of that file's shape** — `profileTokens` filters it to the enabled ones, `/contracts` lists all of them. A third consumer goes through it too.
  - **`MAIN_GAME` (`pistols`) leads every list, always**, and `contractEntries` is where that happens — a stable partition, so each game keeps its file order. `PROFILE.tokens` inherits it, and so does anything derived from either: the decks on the felt, `TokensPanel`'s sections, `/contracts`' groups. **Nothing downstream sorts by game again**, and a guest game never comes first because it happens to be first in the file.
- **Addresses**: the `pistols` game's come from the SDK's Dojo manifests; every other game's exist only in `contracts.json`.
- `contractAddresses.pistols` also holds the **game contracts** (world, game, bank, vrf, …) — an address registry, never queried for balances. Addresses a network never deployed resolve to `0x0` and are dropped.
- `pistols/lords` is a deliberate loose end: the manifest resolves it, but `contracts.json` lists LORDS under the disabled `realms` game, so no balance is shown. Don't "fix" it by hardcoding it.
- **There is no hardcoded list of token names anywhere** — that drifts.

`contracts.json` is also what Torii indexes: **one file, two consumers**. The indexing side is `torii/CLAUDE.md`, and editing the file has consequences there — read it first.

## 3. Providers (`client/src/components/providers/`)

Cartridge Controller; connector versions match `/Users/roger/Dev/Dojo/controller/examples/minimal` (`starknet` 8, `@starknet-react/*` 5, Controller `0.13.x`), all in the root `catalog:`.

- **`StarknetProvider.tsx`** — the `ControllerConnector` is built **once at module scope**: it reuses `window.starknet_controller` and warns if constructed twice. Every `window` access inside it is guarded, so this SSRs fine and needs no `ssr: false` wrapper.
- **`providers.tsx`** — creates the one `QueryClient` and hands it to `StarknetConfig`, which mounts the provider itself. One cache, shared with the app's own queries.
- `preset: 'pistols'` supplies the theme and published policies; no policies of our own until this game has a world.
- **`ControllerToaster` is deliberately not mounted** (optional, and importing package CSS needs a reason). **`ControllerOptions.tokens` is not set** — in `0.13.x` its `Token` type is a fixed union, not arbitrary addresses; `toriiUrl` is what surfaces them.

### `TokensProvider.tsx` — the app's one Torii subscription

Pages `getTokenBalances` for the connected account, then streams `onTokenBalanceUpdated`. Read it through `useTokenBalances()` / `useCoinBalance()` / `useTokenIds()`, never a second query layer. Torii leaves `token_id` unset for ERC-20s, which is what splits `balances.erc20` from `erc721`.

- **`isLoading` means "the hand is not known"** and covers the reconnect as well as the fetch, so empty balances are *not* "owns nothing" until it is false. It reads the address from `useController`, not `useAccount`, for the same reason.
- **What follows from it is a caption, not a layout.** `/decks` lays every deck out from the first frame — an empty slot is what a collection looks like before *and* after the answer — and passes `TableDeck.loading`, which shows a `Spinner` where the count goes and keeps the deck inert. `empty` is the answer "none", so it cannot also mean "nobody has said yet".

### `ContractsProvider.tsx` — collection metadata

Each token contract's **collection** metadata (Torii's `token_id IS NULL` row), served by `useContractMeta(address)`. Not per-token traits.

- **A provider, not a store, and not react-query**: it is server data (stores are for client state) and the chain layer is used bare; the one thing it wants — surviving a reload — is a dozen lines of `localStorage`.
- **Mounted outside `TokensProvider`**: this data is account-independent and that provider's effect is keyed on `address`, so folding it in would re-fetch every collection on each connect. There is also nothing to subscribe to — collection metadata is written at deploy.
- Cached in `localStorage` under `ps.contracts.<profile>.v1`, keyed by profile and by the sorted address set, so adding a contract invalidates it; a 24h TTL is the only other escape hatch. Read in a mount effect, not a `useState` initializer — the same hydration reason as `skipHydration` (`CODING_STYLE.md` § Client state).
- **Data-URI images are stripped before caching** (several collections inline 20–50KB logos); `banner_image`/`featured_image` are dropped entirely.
- **`background_color` is declared inconsistently and usually absent** — `#e9672b` on one, a bare `010813` on the next, none on any Pistols contract, and some contracts have no metadata row at all. `normalizeColor()` accepts both forms and drops the rest; **never assume a colour is there**. That is why `contracts.json` carries `bgColor` as the fallback, applied **on the way out of the provider, not into the cached payload** — the cache is keyed on the address set, so editing a colour in place would invalidate nothing.
- Torii returns both `metadata` and `token_metadata`; `parseMeta` takes the first that parses to a non-empty object.

### `hooks/use-controller.ts` — the only connection API

Composes bare `@starknet-react/core` hooks and never wraps them in another cache.

- **`isConnecting` is ours to detect — starknet-react does not report it.** In the installed version `useAccount().status` is only `connected` | `disconnected` and `isConnecting`/`isReconnecting` are assigned `false` at every site, so a page load reads as *logged out* until the keychain answers and the app would flash Connect at a returning player. The hook asks what `autoConnect`'s own effect asks: is `localStorage.lastUsedConnector` ours, and is the connector `ready()`. The in-flight `undefined` counts as connecting. Consequence: if `ready()` says yes and the connect never lands, it stays connecting.
- Everything that shows connection state hangs off that flag — `ControllerButton`'s `Spinner` sits in the account's own spot, at the size of the type it replaces so the header doesn't reflow.

## 4. Contract calls (`client/src/hooks/contracts/`)

**The SDK's *call* layer is deliberately not used** — no `createSystemCalls`, no `useDojoContractCalls`, no `@dojoengine/sdk` context. We take its **ABIs** and pure helpers and drive the calls with `@starknet-react/core` + starknet.js (`NEXTJS_DATA_FLOW.md` §0).

```
dojo/contracts.ts          getPistolsContract(name) → { address, abi }; callPistolsContract() (one-shot)
dojo/calls.ts              approveLordsCall(), vrfRequestCall() — the calls that ride in front
hooks/contracts/
  use-contract-read.ts     useContractRead<T>, useInvalidateContractReads
  use-contract-mutation.tsx  useContractMutation — send, await the receipt, toast
  use-game.ts              useGetDuelDeck, useGetDuelProgress
  use-pack-token.ts        useCanClaimStarterPack, useClaimStarterPack, useCanPurchase,
                           useCalcMintFee, usePurchase, usePurchaseRandom, useOpenPack
  use-ring-token.ts        useCanClaimRing, useClaimRing
```

- **One file per contract, one hook per entrypoint**, and only the entrypoints we need. A hook is named for its entrypoint and returns the result spread plus one **named** field (`canPurchase`, `fee`, `decks`) — never bare `data`. A new contract is a file plus a name in `PistolsContractName`.
- **ABIs come from the SDK manifest at runtime, never vendored** — `getContractByName(getManifest({ networkId }), NAMESPACE, name)`, so address and ABI can't describe different contracts. **Cache the result for reference identity**: `useReadContract` memoizes its starknet.js `Contract` on `[abi, address]`, so a fresh object per render rebuilds it every render.
  - The price is no type inference (abi-wan-kanabi only infers from an `as const` literal). `useContractRead<T>` carries the return type and holds the app's one `as any`. **Don't hand-copy ABI slices to get inference back** — a second copy of the truth that drifts on the next redeploy.
- **Reads are `useReadContract`, used bare.** `parseResponse: true`, so a struct arrives as an object, an enum as a `CairoCustomEnum` (what the SDK's `convert_*` helpers expect) and an `Option` as a `CairoOption` (`.isSome()`, so "none" is not a zero). **No wallet needed.** `watch` is off.
- **Writes are NOT `useSendTransaction`** — it resolves when the wallet *accepts*, not when the chain *executes*, so a toast on it can report success on a transaction that reverts. `useContractMutation` does `account.execute` then `waitForTransaction` (`PRE_CONFIRMED` counts, seconds ahead of `ACCEPTED_ON_L2`) and throws the revert reason.
- **One entrypoint is not always one call**: an ERC-20 approval or a VRF request rides in front via `before`, in the **same transaction**, so the toast, receipt and revert stay one thing. `before` is async because a fee has to be asked for first — through `callPistolsContract`, deliberately **not** the cached read hook, since a stale fee is an approval for the wrong amount. `undefined` entries are dropped.
- **Calldata is compiled from the ABI, never hand-assembled** — `new CallData(abi).compile(...)` knows every Cairo type, so a struct or enum argument costs an `args` mapper and nothing else (enums via the SDK's `makeCustomEnum`). **`args` is optional, and omitting it skips the ABI lookup** — the only reason `purchase_random` is callable at all.
- **Toasts: one per call, `loading` → `success`/`error` at the same id**, labelled `contract::entrypoint()` with a live `ElapsedTimeBadge` and the tx hash. Two divergences from `useActionMutation`: the lifecycle lives **inside `mutationFn`** (the hash only exists halfway through, and the toast must survive the callbacks react-query skips on unmount), and it **morphs in place** rather than dismiss-then-open (hence `handleApiError`'s optional `toastId`). Success *is* shown here — a transaction with no visible UI change still has to say it landed. Full rules: `NEXTJS_DATA_FLOW.md` §6.
- **Invalidation is the entrypoint hook's job**, not the component's: only it knows which views its write moved (`onSuccess: () => invalidateContractReads(CONTRACT)`). **`useQueryInvalidate` cannot reach these** — starknet-react keys a read as a single object, so matching a key segment never hits one.
- **Token balances come from Torii**, not from here. A write mints; `TokensProvider`'s subscription notices. Never poll a balance through a contract hook.

## 5. `@underware/pistols-sdk`

Published on npm (root `catalog:`), sourced from `/Users/roger/Dev/Realms/pistols/sdk`. **It is the resource library for anything Pistols- or Starknet-shaped — reach for it before hand-rolling.** In use: `/pistols/config` (`NetworkId`, `NAMESPACE`, `getManifest`, the address getters — and the manifests carry each contract's ABI), `/utils` (`bigintToAddress`, padded lowercase, the form Torii wants), `/starknet` (`stringToFelt`, `weiToEthString`, `bigintToU256`, `makeCustomEnum`, `parseEnumVariant`), `/abis` (`erc20`/`erc721`/`vrf` — the ABIs with no manifest row), `/pistols` (`convert_duel_progress`), `/pistols/gen` (`constants`).

- **The npm release lags the local checkout**, and the gap reaches real code:
  - **The bundled manifests are older than the deployed world.** `purchase_random` is missing from the published `pack_token` ABI and is callable only because it takes no arguments. An entrypoint added later *with* arguments would simply be uncallable.
  - **`constants` is ahead of the ABI it describes** — `PackType` has nine variants in TS, seven in the manifest, and `makeCustomEnum` fails to compile on the extras. **Treat the manifest's list as the real one** and re-check both after a bump.
  - Getters added locally may be absent from the published build (`getCommunityAddress`). Check `dist/pistols_config.d.ts` before importing a new symbol.
- **Publishing bug worth fixing before the next release: `catalog:` leaks into the published manifest.** Every dependency reads literally `"catalog:"`, which only resolves inside the source workspace, so consumers resolve none of them — the cause is publishing with `npm publish`, since **`pnpm publish` resolves catalogs and npm does not**. Fallout here: `universal-cookie` had to be installed by hand.
- **Don't `link:` the local checkout** — Turbopack refuses to resolve a module whose real path escapes the project root, and every SDK import fails. Bump the catalog when a release lands.
- Its `/hooks` and `/pistols/dojo` entry points assume the full `@dojoengine/sdk` context, which we don't mount — we talk to Torii through `torii.ts`. Same for its call layer.

## 6. The pages that read this layer

### `/test` — the contract bench (`components/pages/test/`)

One section per contract: each view's live value and a button per write, with the inputs they need. **A bench, not product UI** — it exists so an entrypoint can be exercised and its toast watched without a game around it, and is deliberately **not linked from anywhere**. It is the natural first consumer of a new contract hook; delete the sections a real page takes over.

- **The writes are real** and spend real LORDS on mainnet (`purchase` is 50). `NEXT_PUBLIC_PROFILE=sepolia` is the cheap way to exercise them.
- The `pack_type` list is the **manifest's** seven variants, not the SDK enum's nine (§5).
- Reads need no wallet; every write is gated on `isConnected` and its matching `can_*` view.

### `/contracts` — the address directory (`components/pages/contracts/`)

`contracts.json` rendered: one section per network (**both**, not just the active profile — a Voyager URL is per chain), grouped by game. It lists the file as written, disabled entries dimmed, and reads no chain and no wallet. Reached from the `HeaderMenu` — unlike `/test`, which stays unlinked.

- **A row is not a link**: it highlights on hover to read as one unit, and its icons are the only clickable things (open the deck, copy the address, open it on Voyager).
- **The deck link is gated on the same three conditions `deck/[slug]`'s `SLUGS` is built from** — ERC721, indexed, and the **active** network. Slugs repeat across networks, so an unguarded link from the other section would silently open this network's deck of the same name. A row without one keeps the column (`invisible`, not `opacity`).

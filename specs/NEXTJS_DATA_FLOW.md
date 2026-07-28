# Next.js Data Flow Standards

How data is fetched, mutated, and shared between server and client in `client/`. All paths below are relative to `client/`.

Ported from `ec-dapp` (`/Users/roger/Dev/CC/ec-dapp/specs/NEXTJS_DATA_FLOW.md`), which adapted it from the popsy-top controller standard. Divergences are marked **[diverges]**; everything else should be kept in sync with upstream.

**Only the data-flow pattern comes from ec-dapp — not its chain.** ec-dapp is Ethereum/EVM; **this project is Starknet only**. Wherever upstream says wagmi/viem/EVM, read `@starknet-react/core` + Cartridge Controller (section 0).

**Scope:** every non-chain query and mutation follows this document — API proxies, metadata/IPFS fetches, Torii reads that go through our own routes, and anything added later. Adopt it every time data crosses the server/client boundary, even for one-off needs.

## 0. Chain-layer exception

**[diverges]** Upstream carves out wagmi; here the carve-out is the **Starknet/Dojo layer**. Starknet is wired up (`@starknet-react/core` + the Cartridge Controller); the Dojo SDK is not yet.

**Chain hooks are used directly, never wrapped.** `@starknet-react/core` runs on TanStack Query internally and the Dojo SDK keeps its own store — do not wrap `useAccount`/`useReadContract`/`useSendTransaction`/Dojo entity subscriptions in another `useQuery`/`useMutation` layer or in the hooks below. Composing several of them into one hook is fine (`hooks/use-controller.ts` does exactly that); adding a cache on top of them is not.

**One shared `QueryClient`** backs both the chain layer and the app's own queries. It is created in `src/components/providers/providers.tsx` and handed to `StarknetConfig`, which mounts the `QueryClientProvider` itself — so there is exactly one provider and one cache.

| file | role |
| --- | --- |
| `src/components/providers/providers.tsx` | `Providers`: the shared `QueryClient` + `<Toaster />` |
| `src/components/providers/StarknetProvider.tsx` | mainnet-only `StarknetConfig` + the module-scope `ControllerConnector` |
| `src/hooks/use-controller.ts` | `useController()`: connect / disconnect / open Controller / username |
| `src/dojo/contracts.ts` | `getPistolsContract(name)` → address + ABI, from the SDK manifest |
| `src/dojo/calls.ts` | the approval / VRF calls that ride in front of a system call |
| `src/hooks/contracts/` | **one file per world contract, one hook per entrypoint** |

The one thing react-query legitimately holds for the chain layer is a **one-shot SDK promise that has no hook** — e.g. `controllerConnector.username()`, keyed `['controller_username', address]`. That is not wrapping a hook, and it keeps `useEffect` out of it.

**Contract calls live in `src/hooks/contracts/<contract>.ts`** and follow the carve-out, not sections 1 and 2 — no API route, no server action. Rules, with the full rationale in `CLAUDE.md` § Contract calls:

- **Reads** are `useReadContract` used bare, through `useContractRead<T>` (which resolves the contract and carries the return type — it adds no cache of its own). ABIs come from the SDK manifest at runtime; never vendor an `as const` copy.
- **Writes** are `useContractMutation`, which is `account.execute` + `waitForTransaction`, *not* `useSendTransaction` — that hook resolves when the wallet accepts, so it cannot tell a landed transaction from one that reverted. This is a mutation over an SDK promise with no hook, which the carve-out allows; it is not a cache over a chain hook.
- **Calldata is compiled from the ABI** (`new CallData(abi).compile`), never assembled by hand.
- **Toasts** are the mutation's own, one per call, morphing `loading` → `success`/`error` at one id — see §6 for the two divergences from `useActionMutation`.
- **Invalidation** belongs to the entrypoint's hook (`useInvalidateContractReads`), not the component: `useQueryInvalidate` cannot match starknet-react's single-object query keys.

Everything that is not the chain goes through sections 1 and 2.

## 1. Data Fetching (Read Access)

**Primary Method**: **API Query Routes** (`src/app/api/query/`) coupled with `@tanstack/react-query`.

- **API Routes**: Create GET routes in `src/app/api/query/[resource]/route.ts`.
  - Return standard JSON (direct data, no `{ success: true }` wrapper): `NextResponse.json(data, { status: 200 })`.
  - Use HTTP status codes (200, 404, 500) for errors: `NextResponse.json({ error: error.message }, { status: 500 })`.
  - Route name must be in snake_case, like: `/api/query/gas_price/`, `/api/query/token_metadata/` (plural where the resource is a collection).
- **Client Hooks**: Create custom hooks in `src/hooks/queries/use-[resource].ts` (kebab-case file names).
  - Encapsulate `useQuery` logic and query keys. Exported hook names are camelCase, derived from the route name (e.g. `useGasPrice`, `useTokenMetadata`).
  - **Query Keys** start with the resource name, followed by filters or an id (e.g. `['token_metadata', tokenId]`, `['gas_price', blockNumber]`).
  - Key segments matter for invalidation: `useQueryInvalidate().invalidateKey(key)` (from `src/hooks/queries/use-query-invalidate.ts`) matches any query whose key *includes* that segment (e.g. `invalidateKey(duelId)` refreshes every query keyed on that duel).
- **Prohibited**: Do NOT use `useEffect` for data fetching.
- **Not query routes**: routes whose consumers are external (marketplace token URIs, images, iframes — `api/token/*`, `api/misc/*`) serve content, not app data; they keep their own paths and are not wrapped in hooks.

## 2. Data Mutation (Internal)

**Primary Method**: **Server Actions** (`src/app/actions/`) wrapped in **TanStack Mutation Hooks**. Server actions are blocking — every mutation goes through this pattern so the UI never awaits one bare.

- **Server Action Implementation**:
  - **Arguments**: MUST accept a single object argument, with an exported interface named `[Name]ActionArgs` (e.g. `DealHandActionArgs`).
  - **Return**: Standard `{ success: boolean, error?: string, ...data }` — spread result fields directly (e.g. `{ success: true, hand }`).
  - **Location**: `src/app/actions/[module]-actions.ts` (`'use server'` at top).
- **Mutation Hooks**:
  - **Location**: Create a corresponding hook file for each actions file:
    - Server Action: `src/app/actions/[module]-actions.ts`
    - Hook File: `src/hooks/mutations/[module]-action-hooks.ts`
  - **Implementation**:
    - Use the generic `useActionMutation` hook from `@/hooks/mutations/use-action-mutation`.
    - Export one `use[Name]Action` hook per server action:
      ```ts
      export function useDealHandAction() {
        return useActionMutation((args: DealHandActionArgs) => {
          return dealHandAction(args);
        });
      }
      ```
- **Component Usage**:
  - Components always call the action hooks — never `fetch` a mutation route.
  - Handle side effects in the `mutate` options — typically query invalidation in `onSuccess` via `useQueryInvalidate` (e.g. `invalidateKey(duelId)`).
- **Error Handling**:
  - `useActionMutation` throws when the action returns `success: false`, and automatically handles toasts and error reporting (see section 6). Components do NOT call `toast` for mutation lifecycle themselves.
- **Revalidation**: Do NOT use `revalidatePath`/`revalidateTag` in server actions. Data refresh is client-side:
  - Invalidate TanStack queries in the mutation's `onSuccess` (`useQueryInvalidate`).
  - On-chain freshness comes from the chain layer (block watching / its own cache), not from this layer.

## 3. Data Mutation (External)

**Secondary Method**: **API Mutation Routes**, only for consumers outside the app (webhooks, automation, other services).

- **Implementation**: Create routes under `src/app/api/external/[module]/[resource]/route.ts`, snake_case resource names.
- **Single source of truth**: an external route NEVER re-implements logic — it calls the same service function (section 4) the server action calls.
- **Error Handling**: Return standard HTTP status codes (400, 401, 500).
- Default is **no external mutation route** — add one only when an external consumer is identified.

## 4. Shared Logic Pattern (Service Layer)

To prevent logic duplication between internal (Server Actions) and external (API Routes) mutations, use the **Shared Logic Pattern**.

- **Service Layer**: Place complex business logic in pure TypeScript functions inside a module subfolder next to the actions file: `src/app/actions/[module]/`. Generic helpers live in `src/lib/`; server-only code holding secrets stays in `src/server/`.
- **Decoupling**: These functions should NOT depend on Next.js specifics (`NextRequest`, `FormData`) and must not transitively import React client hooks.
- **Exceptions**: Throw standard JavaScript `Error` objects on failure.

**Flow**:
1. **Server Action** calls `serviceFunction()`.
   - Catches error -> Returns `{ success: false, error: err.message }`.
2. **API Route** (if one exists) calls `serviceFunction()`.
   - Catches error -> Returns `NextResponse.json({ error: err.message }, { status: 500 })`.

## 5. Server Action Template

All exports should be compact. If logic is complex, move it to the Service Layer folder (`src/app/actions/[module]/`).

```ts
export async function dealHandAction(args: DealHandActionArgs) {
  try {
    const hand = await dealHand(args); // Shared Service Call
    // revalidatePath('/game'); // do NOT invalidate pages like this, we invalidate queries instead
    return { success: true, hand };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
```

## 6. Toasts (sonner)

Mutation feedback is centralized in `useActionMutation` (`src/hooks/mutations/use-action-mutation.tsx`) using **sonner**. Components never manage mutation toasts — and loading toasts replace blocking "waiting for server" modals.

- **Setup**: A single `<Toaster position="bottom-right" />` is mounted in `src/components/providers/providers.tsx`, styled with the `--color-ps-*` `@theme` tokens from `src/styles/main.css` so toasts match the app palette.
- **Lifecycle** (per mutation):
  - `onMutate`: shows `toast.loading(...)` labeled with the action name plus a unique incrementing action id (module-level counter — no store lib needed). The toast `id` (`` `${actionName}-${actionId}` ``) makes it addressable, and its description renders a live `<ElapsedTimeBadge />`.
  - `onSettled`: `toast.dismiss(toastKey)` removes the loading toast whether the action succeeded or failed.
  - `onError`: `handleApiError` (`src/lib/client-utils`) logs the action name, params, and error to the console, then shows a `toast.error` with a close button and 5s duration.
- **Success toasts**: not shown by default — success is communicated by the UI updating via query invalidation. Add ad-hoc `toast.success` in a component only when there is no visible data change.

**[diverges] The chain layer's toasts are its own** (`src/hooks/contracts/use-contract-mutation.tsx`, §0). Same look, same `ElapsedTimeBadge`, same incrementing id — three deliberate differences:

- **The lifecycle is inside `mutationFn`**, not `onMutate` / `onSettled`. The transaction hash only exists halfway through and the toast shows it while pending; and the toast must survive the observer callbacks react-query skips when a component unmounts mid-transaction.
- **It morphs at one id** (`loading` → `success` / `error`) instead of dismiss-then-open, so a call never leaves two toasts behind. `handleApiError` takes an optional `toastId` for exactly this.
- **Success is shown**, because a transaction often changes nothing on screen — the opposite of the server-action default above.

## What exists today

Scaffolded and ready to build on:

| file | role |
| --- | --- |
| `src/components/providers/` | the single shared `QueryClient`, `<Toaster />`, `StarknetConfig` (§0) |
| `src/hooks/use-controller.ts` | Controller connection state + actions (§0) |
| `src/hooks/queries/use-query-invalidate.ts` | `invalidateKey` / `invalidateKeys` |
| `src/hooks/mutations/use-action-mutation.tsx` | generic server-action mutation wrapper |
| `src/hooks/contracts/use-contract-read.ts` | `useContractRead<T>` + `useInvalidateContractReads` (§0) |
| `src/hooks/contracts/use-contract-mutation.tsx` | generic contract-write wrapper: send, await, toast (§0) |
| `src/hooks/contracts/use-{game,pack-token,ring-token}.ts` | one hook per entrypoint we call |
| `src/lib/client-utils.ts` | `handleApiError` |
| `src/components/ElapsedTimeBadge.tsx` | live timer for loading toasts |
| `src/components/ui/Button.tsx` | the cva button primitive |
| `src/components/pages/test/TestPage.tsx` | `/test`, the bench every contract hook is exercised from |

Not yet created — add on first use: `src/app/api/query/`, `src/app/actions/`, `src/hooks/queries/use-*.ts`, `src/server/`. **Nothing in sections 1 and 2 exists yet**: every read and write in the app today is a chain call under §0.

## Divergences from the ec-dapp original

- **Chain carve-out** (section 0) — Starknet + Cartridge Controller instead of wagmi; the Dojo SDK is not wired up yet. Contract calls are ours (`src/hooks/contracts/`) over the SDK's ABIs, not the SDK's own call layer.
- **The chain layer has its own toast lifecycle** (§6) — inside `mutationFn`, morphing at one id, and it shows success.
- **Providers live in `components/`**, not `app/` — `app/` is routing only (see `CODING_STYLE.md`).
- **No zustand in the mutation layer**: the action-id counter is a module-level variable (repo rule: prefer native resources over wrapper libs). Zustand is only for client state that outlives a component — see `CODING_STYLE.md` § Client state.
- **No SSE / app database**: external state is the chain, read through Torii and the Dojo layer.

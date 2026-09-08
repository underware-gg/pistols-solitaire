# Pistols Solitaire

| path                                 | what                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| [`client/`](./client/README.md)      | Next.js web client                                     |
| [`specs/`](./specs/)                 | coding style + data flow rules — read before coding    |

Torii indexer (Docker image, Railway deployment, `contracts.json`):
[`underware-gg/torii-deployment`](https://github.com/underware-gg/torii-deployment).

## Setup

Requires Node >= 22 and pnpm.

```bash
pnpm install
```

Env: [`client/.env.example`](./client/.env.example) → `client/.env.local` (nothing required).

## Client

```bash
pnpm dev            # https://localhost:3000
pnpm dev:claude     # https://localhost:3009 — second instance (builds to .next-claude)
pnpm dev:all        # dev server + Storybook (:3000 + :6006)
pnpm build          # build every package
pnpm check-types    # tsc --noEmit
pnpm lint           # biome check
pnpm format         # biome check --write
```

## Storybook

Component previews for `client/src/components/ui/`.

```bash
pnpm storybook       # http://localhost:6006
pnpm build-storybook # static build → client/storybook-static/
```

Details: [`client/README.md`](./client/README.md).

## Torii

Lives in [`underware-gg/torii-deployment`](https://github.com/underware-gg/torii-deployment). The client
installs it as a git dependency for `contracts.json`, pinned to a commit in `pnpm-workspace.yaml`:

```bash
# after pushing torii-deployment: bump the hash in the catalog, then
pnpm install
```

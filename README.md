# Pistols Solitaire

| path                                 | what                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| [`client/`](./client/README.md)      | Next.js web client                                     |
| [`contracts.json`](./contracts.json) | contracts indexed per network — single source of truth  |
| [`torii/`](./torii/README.md)        | Torii indexer: Docker image + Railway deployment       |

## Setup

Requires Node >= 22 and pnpm.

```bash
pnpm install
```

## Client

```bash
pnpm dev            # http://localhost:3000
pnpm build          # build every package
pnpm check-types    # tsc --noEmit
pnpm lint           # biome check
pnpm format         # biome check --write
```

Details: [`client/README.md`](./client/README.md).

## Torii

```bash
cd torii
pnpm check          # validate contracts.json
pnpm docker:build   # build the image
pnpm docker:run     # run it locally on :8080
pnpm deploy         # railway up
```

Deploy, update and debug instructions: [`torii/README.md`](./torii/README.md).

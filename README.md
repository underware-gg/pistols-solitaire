# Pistols Solitaire

| path                                 | what                                                  |
| ------------------------------------ | ----------------------------------------------------- |
| [`contracts.json`](./contracts.json)  | contracts indexed per network — single source of truth |
| [`torii/`](./torii/README.md)         | Torii indexer: Docker image + Railway deployment       |

## Torii

```bash
cd torii
pnpm check          # validate contracts.json
pnpm docker:build   # build the image
pnpm docker:run     # run it locally on :8080
pnpm deploy         # railway up
```

Deploy, update and debug instructions: [`torii/README.md`](./torii/README.md).

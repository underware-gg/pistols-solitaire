# Torii indexer

Indexes the contracts listed in [`../contracts.json`](../contracts.json). One Docker image, one
config file, one Railway project per network — the network is picked by the `NETWORK` env var
(`SN_MAIN` / `SN_SEPOLIA`). No Dojo world is indexed today (every `worlds` entry is
`enabled: false`); flipping one on is all it takes.

| network      | Railway project  | volume                |
| ------------ | ---------------- | --------------------- |
| `SN_MAIN`    | `torii-mainnet`  | `torii-mainnet-data`  |
| `SN_SEPOLIA` | `torii-sepolia`  | `torii-sepolia-data`  |

Design notes: [`SPECS.md`](./SPECS.md) · repo conventions: [`../CLAUDE.md`](../CLAUDE.md)

## Layout

```
contracts.json                          # ROOT — single source of truth, edit this
torii/
├── Dockerfile                          # build context is the REPO ROOT
├── entrypoint.sh                       # checks volume → generates config → exec torii
├── package.json                        # all the commands below (pnpm, no dependencies)
└── scripts/
    ├── generate-torii-config.mjs       # contracts.json → torii TOML
    └── find-deploy-block.mjs           # resolves a contract's deployment block over RPC
railway.toml                            # ROOT — Railway build + deploy settings
.tool-versions                          # ROOT — pins torii for local runs (asdf)
```

The torii version is pinned in two places, keep them in sync: `.tool-versions` (local) and
`ARG TORII_VERSION` in `Dockerfile` (deployed).

> **glibc:** the amd64 torii release needs **glibc ≥ 2.39**, so the runtime base must stay on
> `node:22-trixie-slim` (Debian 13, glibc 2.41) or newer. Debian 12 / bookworm has 2.36 and fails
> with `GLIBC_2.39 not found`. The arm64 release is built against an older glibc, so an
> Apple-Silicon build won't catch this — the `RUN torii --version` line in the Dockerfile does.
> To test the platform Railway actually builds for: `docker build --platform linux/amd64 …`

## contracts.json

```json
{
  "SN_MAIN": {
    "rpc_url": "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10",
    "worlds": [
      { "game": "pistols", "name": "world",
        "address": "0x…", "block": 1376383, "enabled": false }
    ],
    "indexing": { "namespaces": [], "models": [], "controllers": true,
                  "transactions": false, "preconfirmed": false, "raw_events": false },
    "contracts": [
      { "game": "pistols", "name": "duel_token", "type": "ERC721",
        "address": "0x…", "block": 1376394, "enabled": true }
    ]
  },
  "SN_SEPOLIA": { "…same shape…" }
}
```

`worlds` and `contracts` take the same fields (`worlds` has no `type` — it's always `WORLD`) and end
up in the same Torii `indexing.contracts` array, worlds first:

| field     | meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `game`    | grouping key: `pistols`, `collect-code`, `realms`, … — unique per `name`  |
| `name`    | label only — becomes a `game/name` comment in the generated TOML          |
| `type`    | `ERC20`, `ERC721` or `ERC1155` (`contracts` only)                        |
| `address` | contract address, `0x…`                                                  |
| `block`   | deployment block — Torii backfills that entry from here, not genesis      |
| `enabled` | `false` = ignored entirely, stays in the file for later                   |

`pnpm check` prints the live per-game breakdown.

### Multiple worlds

**Torii indexes any number of worlds in one instance** — verified against 1.8.16: each `WORLD:` entry
gets its own sync head, and `models` / `entities` are stored per `world_address` (there are indices
on it). So `worlds` is an array, and the entries you don't index stay in the file as history.

Caveats: `indexing.namespaces` / `indexing.models` filters are **global**, not per-world, so two
worlds sharing a namespace name would collide in queries. Torii's top-level `world_address` key is
not emitted at all — since 1.6.1 the `WORLD:` entries in `indexing.contracts` are the whole story.

The **oldest `block` among enabled contracts** becomes `indexing.world_block`, i.e. where the
indexer starts scanning. Enabling a contract older than anything already indexed forces a re-sync
of that gap — expect a long backfill.

## Commands

Run from `torii/`. All default to `SN_MAIN`; prefix with `NETWORK=SN_SEPOLIA` for sepolia.

| command              | does                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `pnpm check`         | validate `contracts.json`, list what's enabled per network             |
| `pnpm config`        | write `torii.generated.toml` (gitignored) so you can eyeball it        |
| `pnpm blocks`        | fill in any missing `block` (worlds + contracts) by searching the chain |
| `pnpm blocks:force`  | same, but re-checks every contract                                     |
| `pnpm dev`           | run torii natively (asdf binary), db in `./data/torii-db`              |
| `pnpm docker:build`  | build the image                                                       |
| `pnpm docker:run`    | run the image locally on :8080, db in a named docker volume            |
| `pnpm docker:shell`  | bash into the image (no torii running)                                |
| `pnpm deploy`        | `railway up --detach` into the linked project                          |
| `pnpm logs` / `ssh` / `status` / `vars` | railway CLI shortcuts                               |

Endpoints once running: `/graphql` · `/sql` · `/mcp` · `/health` · gRPC on the same port ·
Prometheus metrics on `:9200/metrics`.

## First deploy (per network)

1. `railway init --name torii-mainnet` (or `torii-sepolia`), then `railway link` this directory to it.
2. **Settings → Config as code** picks up `railway.toml` at the repo root automatically (Dockerfile
   path, `/health` healthcheck, restart policy). Nothing to set by hand.
3. **Variables**:
   | variable         | value                                                   |
   | ---------------- | ------------------------------------------------------- |
   | `NETWORK`        | `SN_MAIN` (or `SN_SEPOLIA`)                             |
   | `TORII_DB_DIR`   | `/data/torii-db`                                        |
   | `CORS_ORIGINS`   | your frontend origin(s), comma separated — not `*`       |
   | `RPC_URL`        | *(optional)* overrides `rpc_url` from contracts.json     |
   | `CONTRACTS_JSON` | *(optional)* whole JSON blob, overrides the baked file   |

   **Do not set `PORT`** — Railway injects it and the generated config binds to it.
4. **Volumes → Add volume**: name `torii-mainnet-data` (or `torii-sepolia-data`), mount path
   `/data`. Required — the container refuses to start without it, because otherwise every redeploy
   re-indexes from block 0.
5. **Settings → Networking → Generate Domain**, target the app port. Leave `9200` private — metrics
   must not be publicly reachable.
6. `pnpm deploy`, then `pnpm logs`: one `Registered token contract` line per contract.
7. `curl https://<domain>/health` → `{"service":"torii","success":true,…}`.

Sepolia is the same steps in a second Railway project; only `NETWORK` differs.

## Add / remove a token (or world)

1. Add the entry to the right network in `../contracts.json` — `game`, `name`, `type`, `address`,
   `"block": 0`, `"enabled": true`. Worlds go in `worlds`, tokens in `contracts`.
2. `pnpm blocks` — resolves the real deployment block and writes it back.
3. `pnpm check` — catches bad addresses, duplicates, nothing-enabled.
4. Commit, push. Railway redeploys; the new contract backfills alongside the existing index.

Removing a contract (or setting `enabled: false`) stops *future* indexing but does **not** delete
rows already indexed. To purge it, wipe the volume and re-sync, or delete from sqlite by hand
(`pnpm ssh`, then `sqlite3 /data/torii-db/torii.db`) — check table names via `/sql` first.

## Update the torii version

1. Bump `ARG TORII_VERSION` in `Dockerfile` **and** `torii` in `../.tool-versions`.
2. Read the [release notes](https://github.com/dojoengine/torii/releases) — TOML keys change
   between minor versions (`indexing.pending` → `indexing.preconfirmed`, for example).
3. Back up the Railway volume first if the release touches indexing or the db schema.
4. `pnpm docker:build && pnpm docker:run` locally, then push.

Roll back by redeploying the previous Railway deployment, or by re-pinning the old version.

## Debugging

```bash
pnpm ssh                                   # real shell in the running container
cat /app/torii.generated.toml              # what torii is actually running
ls -lh /data/torii-db                      # db size
sqlite3 /data/torii-db/torii.db "select name from sqlite_master limit 20;"
torii --version
```

- **"is not a mounted volume"** on boot → the volume isn't attached at `/data`.
- **Redeploys briefly 502** → expected; Railway won't run two deployments on one volume.
- **Indexing looks stuck** → check for RPC rate limits in the logs before scaling the instance.
- **Volume near full** → resize it; sqlite never shrinks on its own.

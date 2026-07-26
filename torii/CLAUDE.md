# CLAUDE.md — Torii indexer

Agent-facing context for `torii/`. The root `CLAUDE.md` still governs (never commit, READMEs stay
brief and operational); this file only adds what is specific to the indexer.

Three docs, three jobs — don't blur them:

- **`README.md`** — human operational instructions: run it, deploy it, add a token. Keep current, keep terse.
- **`SPECS.md`** — the original hand-off spec, **frozen history**. The implementation deviates from it
  deliberately; trust the code and `README.md` over SPECS.md where they disagree. Don't update it to
  match reality — that's what these two files are for.
- **this file** — architecture and behavior an agent needs before touching the area.

## Deviations from SPECS.md

- the token list lives in **`contracts.json` at the repo root**, keyed by chain id (`SN_MAIN`, `SN_SEPOLIA`), not in `config/tokens.json`; it is committed, not gitignored
- `worlds` is an **array** (SPECS.md had a single `world` object): Torii 1.8.16 indexes any number of worlds in one instance — verified — with a sync head per `WORLD:` entry and `models`/`entities` keyed by `world_address`. Disabled entries stay in the file as history. `indexing.namespaces`/`models` filters are global, not per-world.
- the top-level `world_address` TOML key is **not** emitted; the `WORLD:` entries in `indexing.contracts` are sufficient since Torii 1.6.1
- every entry (worlds and contracts) carries `game` (grouping key), `block` (deployment block) and `enabled`; the generator emits Torii's `TYPE:address:start_block` form — but see the start-block section below: in 1.8.16 that per-entry block never reaches the db
- **`scripts/find-deploy-block.mjs`** resolves a deployment block by binary searching `starknet_getClassHashAt` over block history (~24 RPC calls). Use it instead of guessing a block — `pnpm blocks` fills in any entry whose `block` is 0.
- the generator is **`scripts/generate-torii-config.mjs`** (Node, no deps), not a bash script
- the image is `node:22-trixie-slim` + the pinned `torii` release binary pulled from GitHub releases — no asdf in the image. **The base must stay trixie or newer:** the amd64 torii release requires glibc ≥ 2.39 and bookworm ships 2.36. The arm64 release is linked against an older glibc, so this only breaks on amd64 (i.e. Railway) — reproduce locally with `docker build --platform linux/amd64`.
- one image serves every network; `NETWORK` selects the `contracts.json` section, which is the only difference between the mainnet and sepolia Railway services

## Design points

- **Single JSON source of truth.** `contracts.json` lists the ERC-20/ERC-721 contracts and Dojo worlds to index. `generate-torii-config.mjs` converts it to a Torii TOML at container start. Adding a token should never require editing the Dockerfile, entrypoint, or TOML by hand.
- **Persistent storage is enforced.** `entrypoint.sh` refuses to boot if the parent of `TORII_DB_DIR` isn't a mount (`REQUIRE_PERSISTENT_DB=false` to bypass locally).
- **Two modes, one config path.** `world.enabled: true` prepends a `WORLD:0x…` entry to the same `indexing.contracts` array the tokens use; `false` (or omitted) gives pure token-indexer mode. Torii ≥1.6.1 no longer requires a world address.
- **Torii config precedence:** CLI args > `--config` TOML > env vars > defaults.
- **Railway deployment.** Railway injects `PORT` — never set it manually. A Volume must be mounted at `/data` with `TORII_DB_DIR=/data/torii-db`, or every redeploy re-indexes from scratch. GraphQL/SQL/MCP/gRPC all share the one HTTP port; metrics (`9200`) must stay off the public domain.
- **Torii's TOML schema changes between minor versions.** `TORII_VERSION` is pinned as a Docker build arg; validate generated config against `torii --help` for the pinned version before trusting any flag, and check the release notes on a bump.

## Start blocks — Torii never indexes backwards

**The oldest enabled `block` becomes `indexing.world_block`, and that value is only a fallback for
contracts with no row in the db yet.** A contract already indexed resumes from its own stored `head`
and cannot be pulled backwards by lowering a `block` in `contracts.json`.

Verified in torii 1.8.16 (`/Users/roger/Dev/Dojo/torii` is stale at 1.5 — read the tag on GitHub):

- the engine's contract list comes from the **db**, not the config — `SELECT * FROM contracts`, each row's `head` becoming its cursor (`crates/indexer/engine/src/engine.rs`, `get_contracts`)
- the fetcher resolves, per contract, `from = cursor.head.map_or(world_block, |h| h + 1)` (`crates/indexer/fetcher/src/json_rpc.rs`)
- boot-time seeding from `contracts.json` is `INSERT OR IGNORE INTO contracts …` (`crates/sqlite/sqlite/src/lib.rs`), so an existing row keeps its `head` untouched

### When asked to index a contract older than the current index

Say this **before** editing `contracts.json` — the user's mental model is usually "this forces a
long re-sync", and that is not what happens:

- lowering `world_block` costs **nothing** for already-indexed contracts; they do not re-scan the gap
- the **new** contract does backfill from `world_block` (it has no row yet) — that part just works
- **re-indexing an *existing* contract from an earlier block requires wiping data**: the Railway
  volume (full re-sync of everything) or that contract's `contracts` row + its rows by hand
  (`pnpm ssh`, then `sqlite3 /data/torii-db/torii.db`). Warn, give both options, let the user choose
  — never wipe anything without being asked.
- `enabled: false` on an already-indexed contract **does not stop indexing it** either — same reason,
  the list comes from the db
- check reality before reasoning about it:
  `curl -sG <toriiUrl>/sql --data-urlencode "query=SELECT contract_address, head FROM contracts"`

### 1.8.16 bug — recheck on a version bump

A contract's own `block` never lands in the db. The seeding statement names four columns with three
placeholders (`id, contract_address, contract_type, updated_at`) and binds a fourth argument
(`starting_block - 1`) that has no matching placeholder and no `head` column; `head` is nullable with
no default. So a **new** contract starts at the global `world_block`, not at its own block — a wider
scan, not wrong data. This makes the generator's `TYPE:address:start_block` form effectively inert.

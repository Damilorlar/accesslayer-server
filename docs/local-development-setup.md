# Local Development Setup

This guide is the single path from a fresh clone to a verified working local environment: API server running, database migrated and seeded, and the first requests returning real data.

If a step fails, check the [Troubleshooting](#troubleshooting) section before opening an issue.

---

## 1. Prerequisites

Install these before cloning:

| Tool           | Version                            | Notes                                                                                                                                   |
| :------------- | :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js**    | 20 or newer                        | CI runs on Node 20. Check with `node --version`.                                                                                        |
| **pnpm**       | 10.x (repo pins `10.6.5`)          | The repo enforces pnpm — `npm install` and `yarn` are rejected by a preinstall guard. Install via `corepack enable` or `npm i -g pnpm`. |
| **Docker**     | Any recent version with Compose v2 | Used to run the local PostgreSQL container. Not needed if you point `DATABASE_URL` at your own PostgreSQL 16 instance.                  |
| **PostgreSQL** | 16 (via Docker)                    | `docker-compose.yml` ships `postgres:16-alpine` preconfigured to match `.env.example`. No manual install needed when using Docker.      |
| **Git**        | Any recent version                 | —                                                                                                                                       |

### Stellar testnet RPC access

No account, API key, or funded wallet is required. The public testnet endpoints are preconfigured in `.env.example`:

- Horizon: `https://horizon-testnet.stellar.org`
- Soroban RPC: `https://soroban-testnet.stellar.org`

These two URLs (`STELLAR_HORIZON_URL`, `STELLAR_SOROBAN_RPC_URL`) are consumed by the **external indexer worker**, not by this server's request path — see [Starting the indexer](#4-starting-the-indexer) below. You can develop and test the API server without ever contacting the Stellar network.

---

## 2. Setup steps

Run these in order from a terminal.

### Step 1 — Clone the repository

```bash
git clone https://github.com/accesslayerorg/accesslayer-server.git
cd accesslayer-server
```

### Step 2 — Install dependencies

```bash
pnpm install
```

If you see `Use pnpm for this repository. Run: pnpm install`, you invoked npm or yarn — this repo only supports pnpm.

### Step 3 — Create your environment file

```bash
cp .env.example .env
```

> [!IMPORTANT]
> The server **refuses to start** while any of the required variables below is empty — startup fails with `MissingRequiredEnvError` naming the missing keys. `.env.example` intentionally ships them blank, so you must fill them in once after copying.

For local development you do **not** need real third-party accounts. Any non-empty placeholder value satisfies startup validation:

```dotenv
GMAIL_USER=localdev@example.test
GMAIL_APP_PASSWORD=localdev-placeholder
GOOGLE_CLIENT_ID=localdev-placeholder
GOOGLE_CLIENT_SECRET=localdev-placeholder
CLOUDINARY_CLOUD_NAME=localdev
CLOUDINARY_API_KEY=localdev-placeholder
CLOUDINARY_API_SECRET=localdev-placeholder
PAYSTACK_SECRET_KEY=sk_test_localdev_placeholder
```

With placeholders, the server boots and all core flows work (creator list, profiles, health, ownership checks). Only the features that call the corresponding provider need real credentials: email sending (Gmail), Google OAuth sign-in, image uploads (Cloudinary), and payments (Paystack).

Everything else in `.env.example` — `DATABASE_URL`, `PORT`, the Stellar URLs, feature flags — already has a working local default. See the [Configuration Guide](./configuration.md) for the full variable reference and validation rules.

### Step 4 — Start the database

```bash
pnpm db:up
```

This starts the `accesslayer-postgres` container (PostgreSQL 16) on port `5432`. The default `DATABASE_URL` in `.env.example` matches it exactly, so no edits are needed.

Useful companions: `pnpm db:logs` (follow logs), `pnpm db:down` (stop).

Using your own PostgreSQL 16 instead? Skip this step and set `DATABASE_URL` in `.env` to your instance.

### Step 5 — Generate the Prisma client

```bash
pnpm generate
```

Re-run this whenever any file under `prisma/schema/` changes.

### Step 6 — Run migrations

```bash
pnpm migrate
```

This applies every migration under `prisma/schema/migrations/` to your local database. See [Database Migrations](./database-migrations.md) for naming conventions and rollback workflows.

### Step 7 — Seed the database

```bash
pnpm exec ts-node prisma/seed.ts
```

The seed is idempotent (safe to re-run) and creates three deterministic users — `alice` (verified creator), `bob` (unverified creator), and `charlie` (fan) — with wallets and creator profiles, enough to exercise list, read, and ownership-gated write flows. The shared password is `localdev-password-1`. Full fixture catalogue: [Local seed and fixture guide](./contributor-seed.md).

---

## 3. Starting the API server

Development mode (auto-restarts on changes under `src/`):

```bash
pnpm dev
```

Compiled mode (what production runs):

```bash
pnpm build
pnpm start
```

A healthy boot logs, in order: the indexer feature-flag check passing, `Connected to database`, the connection-pool and config summaries, and finally:

```
Server running on port 3000
```

The API is now available at `http://localhost:3000` under the `/api/v1` prefix.

---

## 4. Starting the indexer

The Stellar polling loop is **not part of this server process** — it runs as a separate external worker that polls Soroban/Horizon RPC, delivers `ChainEvent` batches to the ingestion services in this repo, advances the ledger cursor, and reports liveness to this server. There is no `pnpm indexer` script in this repository; the worker starts from its own repository/deployment. See [Indexer Architecture](./indexer/ARCHITECTURE.md) for the full pipeline.

What this means locally:

- The API server runs fine **without** the indexer. Every flow covered by the seed data works with no worker running.
- `GET /api/v1/health/indexer` reports `"status": "unknown"` until a heartbeat is recorded — that is the expected state on a fresh local environment, and it returns `200`.

To exercise the indexer health path without the external worker, simulate a heartbeat against the running API server:

```bash
curl -X POST http://localhost:3000/api/v1/health/indexer/heartbeat
```

The status endpoint then reports `"healthy"` until the heartbeat goes stale (`INDEXER_HEARTBEAT_STALE_THRESHOLD_MS`, default 5 minutes).

The only indexer-adjacent job that runs **inside** this server is the ownership snapshot cleanup job, and it is disabled by default (`OWNERSHIP_SNAPSHOT_CLEANUP_ENABLED=false`); no action is needed locally.

---

## 5. Verifying your setup

Run these checks with the dev server running. All commands assume the default port `3000`.

### 5.1 Health check

```bash
curl http://localhost:3000/api/v1/health
```

Expected response (`200`):

```json
{
   "success": true,
   "message": "OK",
   "timestamp": "2026-07-20T10:30:00.000Z"
}
```

To confirm the database connection specifically, use the readiness probe — `200` with every check `"ok"` means the server can reach Postgres:

```bash
curl http://localhost:3000/api/v1/health/ready
```

See [Health and Readiness Endpoints](./health-endpoints.md) for all four health contracts.

### 5.2 First creator list response

```bash
curl http://localhost:3000/api/v1/creators
```

With the seed applied, expect a `200` envelope containing the three seeded creator profiles:

```json
{
   "success": true,
   "data": {
      "items": [
         { "handle": "alice", "...": "..." },
         { "handle": "bob", "...": "..." },
         { "handle": "charlie", "...": "..." }
      ],
      "meta": {
         "limit": 20,
         "offset": 0,
         "total": 3,
         "hasMore": false
      }
   }
}
```

An empty `items` array with `"total": 0` still confirms the server and database are wired correctly — it just means Step 7 (seeding) was skipped.

### 5.3 Repo checks

```bash
pnpm lint
pnpm build
pnpm test
```

All three passing on a clean clone confirms your toolchain matches CI.

---

## Troubleshooting

| Symptom                                                              | Cause and fix                                                                                                                                                                 |
| :------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MissingRequiredEnvError: Missing required environment variables: …` | Required variables in `.env` are still blank. Fill them with placeholders as shown in Step 3.                                                                                 |
| `Use pnpm for this repository. Run: pnpm install`                    | You ran npm or yarn. Use pnpm.                                                                                                                                                |
| `P1001: Can't reach database server at localhost:5432`               | Postgres is not running. Run `pnpm db:up` and wait for the container health check, or verify your own instance and `DATABASE_URL`.                                            |
| Port `5432` already in use when starting the container               | Another Postgres is bound to `5432`. Stop it, or change the port mapping in `docker-compose.yml` **and** the port in `DATABASE_URL`.                                          |
| `@prisma/client did not initialize yet` or missing Prisma types      | The client was never generated or is stale. Run `pnpm generate` (again after every schema change).                                                                            |
| Migration checksum/drift errors on startup                           | Local schema has drifted. Run `pnpm exec prisma migrate status` to inspect; a destructive local reset is `pnpm exec prisma migrate reset --force` (drops data), then re-seed. |
| `GET /api/v1/health/indexer` returns `"unknown"`                     | Expected locally — no indexer worker has recorded a heartbeat. See [Starting the indexer](#4-starting-the-indexer).                                                           |

---

## Related documentation

- [Configuration Guide](./configuration.md) — full environment variable reference
- [Local seed and fixture guide](./contributor-seed.md) — seeded accounts and example requests
- [Database Migrations](./database-migrations.md) — migration naming, status, rollback
- [Health and Readiness Endpoints](./health-endpoints.md) — endpoint contracts used in verification
- [Indexer Architecture](./indexer/ARCHITECTURE.md) — how the external worker feeds this server
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contribution workflow and test expectations

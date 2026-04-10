# Co-op Source Network

A federated collaboration platform for cooperatives, built on [ATProtocol](https://atproto.com). Cooperatives are genuine ATProto accounts — they appear on Bluesky and any compatible ATProto application. Members bring their own Bluesky identities. Governance records flow through the real relay network alongside posts, commits, and events from other ecosystem apps.

## How it works

### The recursive cooperative model

Everything is an entity — a `person` or a `cooperative`. A network is just a cooperative whose members happen to be other cooperatives. The same membership, governance, and agreement machinery works at every level with no special types:

- A person joins a cooperative → they cast votes, sign agreements, make pledges
- A cooperative joins a network → same records, same protocol, same governance
- A project is a mini-cooperative with its own membership → arbitrarily nested

### Bilateral membership

Membership requires both sides to write matching records. Status becomes `active` only when both exist:

1. **Member** creates `network.coopsource.org.membership` in their own PDS
2. **Cooperative** creates `network.coopsource.org.memberApproval` in its PDS
3. AppView matches the pair → status transitions to `active`

Deleting either record immediately revokes access. Role authority lives only in `memberApproval` — never self-declared by the member.

### Three tiers of data

| Tier | Storage | Visibility | Examples |
|------|---------|------------|---------|
| 1 — Public | ATProto PDS repos | On the firehose, visible to any ATProto app | Proposals, vote tallies, ratified agreements, member directories |
| 2 — Private | PostgreSQL `private_record` | Never published to the firehose | Draft proposals, closed deliberations, financial records |
| 3 — Encrypted | Germ DM / MLS | Platform facilitates, never handles content | Board discussions, salary records, personnel matters |

## Architecture

```
  ┌─── ATProto Ecosystem ───────────────────────────────────────────┐
  │                                                                 │
  │  Member's PDS ──────────────────────┐                          │
  │  (their Bluesky / own @atproto/pds) ├──► bsky.network relay    │
  │                                     │    (or private relay)    │
  │  Cooperative's PDS ─────────────────┘         │                │
  │  (self-hosted @atproto/pds)                   │ Tap            │
  │                                               │ (Go binary)    │
  └───────────────────────────────────────────────┼────────────────┘
                                                  │ filters
                                                  │ network.coopsource.*
  Browser ──► SvelteKit ──► Express API ◄─────────┘
                (apps/web)   (apps/api)
                               │  ├─ AppView loop (firehose consumer)
                               │  ├─ Hook pipeline (pre/post-storage)
                               │  ├─ 44 domain services
                               │  ├─ MemberWriteProxy (OAuth/DPoP) ──► Member PDS
                               │  └─ OperatorWriteProxy (ACL+audit) ──► Coop PDS
                               ▼
                         PostgreSQL 16
                    ┌─────────────────────┐
                    │ Tier 1: AppView      │  membership, proposal, vote,
                    │ (materialized index) │  agreement, officer, funding...
                    ├─────────────────────┤
                    │ Tier 2:             │  draft proposals, financial
                    │ private_record      │  records — never on firehose
                    ├─────────────────────┤
                    │ pds_record          │  raw JSONB source of truth
                    │ (firehose log)      │  for all indexed records
                    └─────────────────────┘
```

**Write path:** Browser → SvelteKit → API → `MemberWriteProxy` (OAuth/DPoP) → member's own PDS, or → `OperatorWriteProxy` → cooperative's PDS. Records appear on the relay firehose.

**Read path:** Tap consumes `network.coopsource.*` events from the relay, delivers them to `appview/loop.ts`, which runs the hook pipeline (pre-storage hooks → `pds_record` upsert → post-storage hooks → materialized view updates). The frontend reads from these PostgreSQL views via the API.

**In local development,** `LocalPdsService` (PostgreSQL-backed) + `pg_notify` replaces the entire PDS/relay/Tap stack. No Docker containers needed for basic development.

### Instance roles

| `INSTANCE_ROLE` | What it runs | Use case |
|----------------|-------------|---------|
| `standalone` | Hub + Coop + AppView in one process | Local dev, small single-cooperative deployments |
| `hub` | Network directory + cross-coop AppView | `coopsource.network` in production |
| `coop` | Single cooperative API + PDS + local AppView | Individual cooperative server |

### Monorepo layout

```
coopsource.network/
├── apps/
│   ├── api/          Express 5 backend — AppView indexer, 60+ services, 60+ route files
│   └── web/          SvelteKit 2 + Svelte 5 frontend — 88 pages, Tailwind 4
├── packages/
│   ├── federation/   IPdsService, AtprotoPdsService, LocalPdsService, PlcClient,
│   │                 MemberWriteProxy, OperatorWriteProxy, RFC 9421 HTTP signing
│   ├── db/           Kysely 0.28 migrations — 100 tables, PostgreSQL 16
│   ├── lexicons/     ATProto lexicon JSON + generated TypeScript (41 schemas)
│   ├── common/       Shared types, Zod 4 validation, error classes
│   └── config/       Shared tsconfig, eslint, prettier
└── infrastructure/
    ├── docker-compose.yml              Dev: PostgreSQL, Redis, Mailpit, PLC, PDS
    ├── docker-compose.prod.yml         Production: API, Web, Tap, Caddy (TLS)
    ├── docker-compose.private.yml      Private overlay: self-hosted PLC + relay + PDS
    ├── docker-compose.federation.yml   Multi-instance: hub + coop-a + coop-b
    ├── docker-compose.local.yml        Local prod preview (HTTP, no TLS)
    └── docker-compose.pds.yml          Standalone cooperative PDS (production)
```

## Quick Start (Development)

```bash
# Prerequisites: Node.js 24, pnpm 10+, PostgreSQL 16, Redis 7

# First-time setup — installs Homebrew services, creates DB, copies .env, runs migrations
make setup

# Start dev servers (API :3001, Web :5173)
# Uses LocalPdsService — no Docker containers needed for basic development
make dev
```

**With real ATProto PDS containers:**
```bash
make pds-up    # Start PLC (:2582) + PDS (:2583) via Docker
make pds-dev   # Start PostgreSQL + Redis + PDS containers + pnpm dev
```

**Multi-instance federation:**
```bash
make dev-federation  # hub :3001, coop-a :3002, coop-b :3003, web :5173
```

## Testing

| Command | What runs | Docker required? |
|---------|-----------|---------|
| `pnpm test` | Unit + integration tests (LocalPdsService) | No |
| `make test:all` | Full suite with real PDS (resets volumes first) | Yes |
| `make test:pds` | PDS federation integration tests only | Yes (auto-started) |
| `make test:e2e` | 339 Playwright E2E tests | No |

## Production Deployment

Deploy to a VPS with Docker Compose + Caddy (automatic HTTPS via Let's Encrypt).

```bash
# 1. Clone and configure
git clone <repo-url> coopsource.network && cd coopsource.network
cp infrastructure/.env.prod.example infrastructure/.env
# Edit infrastructure/.env — set required values (see below)

# 2. Build, start, migrate
make deploy-build && make deploy-up && make deploy-migrate

# 3. Verify
curl https://yourdomain.com/health
```

### Required environment variables

| Variable | Description | How to generate |
|----------|-------------|-----------------|
| `DOMAIN` | Your public domain | e.g. `mycooperative.org` |
| `POSTGRES_PASSWORD` | Database password | `openssl rand -hex 32` |
| `REDIS_PASSWORD` | Redis auth password | `openssl rand -hex 32` |
| `SESSION_SECRET` | Cookie signing secret (min 32 chars) | `openssl rand -hex 32` |
| `KEY_ENC_KEY` | Signing key encryption key (base64) | `openssl rand -base64 32` |
| `SMTP_HOST` | SMTP server for email | Leave unset to disable (invitations still work via shareable links) |

For the complete environment variable reference, docker-compose stack details, PDS setup, and private network deployment see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

### Production stack

| Service | Port | Description |
|---------|------|-------------|
| Caddy | 80, 443 | Reverse proxy + automatic TLS |
| API | 3001 (internal) | Express backend + AppView |
| Web | 3000 (internal) | SvelteKit frontend |
| Tap | 2480 (internal) | ATProto firehose sync + backfill |
| PostgreSQL | 5432 (internal) | Database |
| Redis | 6379 (internal) | Session cache |

### Recommended server sizing

| Workload | RAM | vCPUs | Disk |
|----------|-----|-------|------|
| Small (< 50 members) | 2 GB | 1 | 50 GB |
| Medium (50–500 members) | 4 GB | 2 | 80 GB |
| Large (500+ members) | 8 GB | 2 | 160 GB |

### Management

```bash
make deploy-up       # Start production stack
make deploy-down     # Stop production stack
make deploy-logs     # Tail logs
make deploy-build    # Rebuild Docker images
make deploy-migrate  # Run database migrations
```

### Updating

```bash
git pull
make deploy-build && make deploy-up && make deploy-migrate
```

### Backups

```bash
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml \
  exec -T postgres pg_dump -U coopsource coopsource | gzip > backup-$(date +%Y%m%d).sql.gz
```

See [docs/operations.md](./docs/operations.md) for full backup, log management, and operational procedures.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Caddy fails / no HTTPS | DNS not pointing to server | `dig +short yourdomain.com` must return your server IP |
| 502 Bad Gateway | Containers not ready | Wait 30s, then `make deploy-logs` |
| OOM during `deploy-build` | Insufficient RAM | Add swap: `fallocate -l 2G /swapfile` |
| Migration fails | API container not running | Run `make deploy-up` first |
| Can't connect | Firewall blocking ports | `ufw allow 80/tcp && ufw allow 443/tcp` |
| Session/login issues | Secrets not loaded | Verify `infrastructure/.env` has all required values |

## See also

- [DEPLOYMENT.md](./DEPLOYMENT.md) — full environment variable reference, all docker-compose stacks, Make targets, PDS setup, private network
- [packages/lexicons/LEXICONS.md](./packages/lexicons/LEXICONS.md) — ATProto lexicon schema reference (41 schemas, record ownership, field tables)
- [ARCHITECTURE-V6.md](./ARCHITECTURE-V6.md) — ATProto federation design (complete, merged March 2026)
- [ARCHITECTURE-V5.md](./ARCHITECTURE-V5.md) — cooperative lifecycle design, security model, lexicon schemas
- [ARCHITECTURE-V7.md](./ARCHITECTURE-V7.md) — remaining work: Ozone labeler, DB cleanup, ecosystem proposals
- [docs/operations.md](./docs/operations.md) — backups, log management, production ops

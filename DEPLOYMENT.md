# Deployment Guide — Co-op Source Network

This document covers development modes, test modes, environment variable reference, Docker Compose stacks, Make targets, PDS setup, and production/private network deployment details.

For architecture and design principles see [README.md](./README.md). For ATProto federation design see [ARCHITECTURE-V6.md](./ARCHITECTURE-V6.md).

---

## Development Modes

### 1. Local standalone (default)

Uses `LocalPdsService` (PostgreSQL-backed) and `pg_notify` as a firehose. No Docker containers needed. Best for most feature development.

```bash
make setup   # First-time: install Homebrew services, create DB, copy .env, migrate
make dev     # Start PostgreSQL + Redis + API :3001 + Web :5173
```

No `PDS_URL` or `PLC_URL` env var required. The API automatically uses `LocalPdsService` and `LocalPlcClient`.

### 2. Real ATProto PDS (Docker)

Uses `AtprotoPdsService` talking to a real `@atproto/pds` instance. Activates when `PDS_URL` (or `COOP_PDS_URL`) is set in your `.env`. Required for testing actual ATProto record signing, firehose events, and DID provisioning.

```bash
make pds-up    # Start PLC container (:2582) + PDS container (:2583)
make pds-dev   # Start PostgreSQL + Redis + PDS containers + pnpm dev

make pds-status  # Check container health
make pds-logs    # Tail PDS + PLC logs
make pds-reset   # Drop volumes and restart (clean slate)
make pds-down    # Stop PDS + PLC containers
```

PLC listens on `:2582`, PDS on `:2583`. Dev PDS uses `.test` TLD handles, `PDS_DEV_MODE=true`, and connects to the PLC container for DID resolution.

To activate `AtprotoPdsService`, set these in your `.env` before starting the API:
```
PDS_URL=http://localhost:2583
PDS_ADMIN_PASSWORD=admin
PLC_URL=http://localhost:2582
```
Without these, the API falls back to `LocalPdsService` even with the PDS containers running. `make test:pds` and `make test:all` set these automatically for the test run only.

### 3. Multi-instance federation (Docker)

Runs three independent cooperative instances — hub, coop-a, and coop-b — each with its own PostgreSQL database, sharing a single PLC and Redis. Used for testing cross-cooperative record flows.

```bash
make dev-federation    # Start hub :3001, coop-a :3002, coop-b :3003, web :5173
make stop-federation   # Stop the federation stack
make migrate-all       # Run migrations on all three databases
make test-federation   # Run federation integration tests (auto-starts stack)
```

Each instance has its own `SESSION_SECRET`, `KEY_ENC_KEY`, and database. All point to a shared PLC at `http://plc:2582`.

---

## Test Modes

| Command | What it tests | Docker? | Notes |
|---------|--------------|---------|-------|
| `pnpm test` | All unit + integration tests | No | Uses `LocalPdsService`; fast |
| `make test:all` | Full suite including real PDS | Yes | Resets PDS + PLC volumes first |
| `make test:pds` | Federation PDS integration tests only | Yes (auto-started) | Sets `PDS_URL` + `PLC_URL` for the test run |
| `make test:e2e` | 339 Playwright E2E tests | No | Starts PostgreSQL + Redis; kills stale ports |
| `make test:e2e-clean` | E2E tests (kills all dev servers first) | No | Use when ports 3001/5173 are occupied |
| `make test:e2e:real` | E2E real-network tests only | No | Playwright `--project=real` |
| `make test:e2e:mocked` | E2E mocked tests only | No | Playwright `--project=mocked`; no services needed |

---

## Environment Variables

### Group A — Core (required in production)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `3001` | API server port |
| `DATABASE_URL` | (none) | PostgreSQL connection string (e.g. `postgresql://user:pass@localhost:5432/dbname`) |
| `SESSION_SECRET` | `change-me-in-production` | Cookie signing secret — **must be ≥ 32 chars in production** |
| `KEY_ENC_KEY` | (placeholder) | Base64-encoded 32-byte key for encrypting signing keys in the database — **must be set in production** (`openssl rand -base64 32`) |
| `INSTANCE_URL` | `http://localhost:3001` | Public URL of this instance — used in DID documents and PDS records |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL — used by the API for OAuth redirect targets |
| `BLOB_DIR` | `./data/blobs` | Directory for uploaded blobs (avatars, attachments) |

### Group B — Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | (none) | Redis connection URL (e.g. `redis://localhost:6379` or `redis://:password@host:6379`) — optional in local dev, required in production |

### Group C — ATProto Federation / PDS

These variables control whether the API uses real ATProto infrastructure (`AtprotoPdsService`) or the local PostgreSQL-backed simulation (`LocalPdsService`).

| Variable | Default | Description |
|----------|---------|-------------|
| `PLC_URL` | `local` | `local` = DB-backed `LocalPlcClient`; any URL = real PLC directory (e.g. `https://plc.directory` or `http://localhost:2582` for dev containers) |
| `PDS_URL` | (none) | When set, activates `AtprotoPdsService`. URL of the ATProto PDS (e.g. `http://localhost:2583`) |
| `PDS_ADMIN_PASSWORD` | `admin` | PDS admin password for HTTP Basic auth |
| `COOP_PDS_URL` | (none) | Override: cooperative's own PDS URL — takes precedence over `PDS_URL` when set |
| `COOP_PDS_ADMIN_PASSWORD` | (none) | Admin password for the cooperative's own PDS |
| `COOP_DID` | (none) | Cooperative's `did:plc` identifier |
| `COOP_OPERATORS` | (none) | Comma-separated DIDs of authorized cooperative operators |
| `COOP_ROTATION_KEY_HEX` | (none) | Cooperative's secp256k1 rotation key (hex) — required for governance label signing and PLC rotation operations |

### Group D — Firehose / Tap

| Variable | Default | Description |
|----------|---------|-------------|
| `TAP_URL` | (none) | URL of the Tap firehose consumer (e.g. `http://localhost:2480`). When unset, the AppView loop falls back to `pg_notify` (local dev only) |
| `RELAY_URL` | (none) | Upstream ATProto relay for the **Tap container** (e.g. `wss://bsky.network`). Not read by the API — set in docker-compose for the Tap service |

### Group E — Email (SMTP)

Leave `SMTP_HOST` unset to disable email. Invitations still work via shareable links when email is disabled.

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | (none) | SMTP server hostname — leave unset to disable |
| `SMTP_PORT` | `587` | SMTP port (`1025` for Mailpit dev, `587` for production) |
| `SMTP_USER` | (none) | SMTP username |
| `SMTP_PASS` | (none) | SMTP password |
| `SMTP_FROM` | `noreply@coopsource.local` | Sender address (e.g. `noreply@mycooperative.org`) |

In local dev, Mailpit runs on port `:1025` (SMTP) and `:8025` (web UI). Set `SMTP_HOST=localhost SMTP_PORT=1025` to capture outgoing emails.

### Group F — ATProto OAuth (member write proxy)

Used by `MemberWriteProxy` to route member-owned record writes to the member's own PDS via DPoP-bound OAuth tokens.

| Variable | Default | Description |
|----------|---------|-------------|
| `OAUTH_CLIENT_ID` | (none) | ATProto OAuth client ID for the member write proxy |
| `OAUTH_PRIVATE_KEY` | (none) | ATProto OAuth private key (JWK or hex) |

When `OAUTH_CLIENT_ID` is unset, `MemberWriteProxy` falls back to the cooperative's PDS in dev mode (with a warning). In production this fallback is disabled.

### Group G — External connectors (optional)

OAuth credentials for connector integrations. Per-cooperative credentials can also be stored in the database (preferred for multi-tenant deployments).

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Slack app credentials |
| `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET` | Linear OAuth app credentials |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | Zoom app credentials |
| `CONNECTION_TOKEN_ENCRYPTION_KEY` | Encryption key for stored OAuth tokens (min 32 chars, `openssl rand -hex 32`) |
| `OIDC_JWKS` | OIDC JWKS configuration (if using OIDC provider) |

Note: Stripe and Anthropic API keys are stored per-cooperative in the database (`payment_provider_config`, `model_provider_config`) — not in environment variables.

### Group H — Federation roles

| Variable | Default | Description |
|----------|---------|-------------|
| `INSTANCE_ROLE` | `standalone` | `standalone` \| `hub` \| `coop` — controls which services run in this instance |
| `INSTANCE_DID` | (none) | Override the auto-derived instance DID |
| `HUB_URL` | (none) | Hub URL for `coop` instances to register with (e.g. `https://coopsource.network`) |

### Group I — Production infra (docker-compose.prod.yml)

These are read by docker-compose, not directly by the API.

| Variable | Required | Description |
|----------|----------|-------------|
| `DOMAIN` | Yes | Public domain name (e.g. `mycooperative.org`) — used by Caddy for TLS and URL construction |
| `POSTGRES_DB` | Yes | PostgreSQL database name (default: `coopsource`) |
| `POSTGRES_USER` | Yes | PostgreSQL username (default: `coopsource`) |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password — `openssl rand -hex 32` |
| `REDIS_PASSWORD` | Yes | Redis authentication password — `openssl rand -hex 32` |
| `PUBLIC_API_URL` | Auto | Client-side API base URL — set automatically from `DOMAIN` in docker-compose |
| `ORIGIN` | Auto | SvelteKit CSRF trusted origin — set automatically from `DOMAIN` in docker-compose |

### Group J — Private network (docker-compose.private.yml)

Additional variables for the fully self-hosted stack.

| Variable | Required | Description |
|----------|----------|-------------|
| `PDS_HOSTNAME` | Yes | Public hostname for the self-hosted PDS — **must differ from `DOMAIN`** (e.g. `pds.mycooperative-pds.net`) |
| `PDS_JWT_SECRET` | Yes | JWT secret for PDS session tokens (min 32 chars) — `openssl rand -hex 32` |
| `PDS_ADMIN_PASSWORD` | Yes | PDS admin password — `openssl rand -hex 16` |
| `PDS_ROTATION_KEY` | No | secp256k1 private key hex for PLC rotation — auto-generated by PDS if unset |
| `RELAY_ADMIN_PASSWORD` | Yes | Admin password for the self-hosted relay — `openssl rand -hex 16` |
| `TAP_ADMIN_PASSWORD` | No | Admin API password for Tap |

### Group K — Web frontend (apps/web)

| Variable | Description |
|----------|-------------|
| `API_URL` | API URL used by SvelteKit server-side code — set to internal docker URL in prod (e.g. `http://api:3001`) |
| `VITE_API_URL` | API URL used by the browser/client-side code — must be the public URL in prod |
| `PUBLIC_API_URL` | Public API URL for display and redirects |
| `ORIGIN` | Trusted origin for SvelteKit CSRF protection — must match the public domain in production |

### Group L — Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

---

## Docker Compose Stacks

### Development (`docker-compose.yml`)

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

Services:

| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| `postgres` | `postgres:16-alpine` | 5432 | Main database (`coopsource_dev`) |
| `redis` | `redis:7-alpine` | 6379 | Session cache (no password in dev) |
| `mailpit` | `axllent/mailpit` | 1025 (SMTP), 8025 (UI) | Email capture for dev |
| `plc` | Custom build | 2582 | Self-hosted PLC directory for dev |
| `pds` | `ghcr.io/bluesky-social/pds:0.4` | 2583 | ATProto PDS (dev mode, `.test` TLD) |

The `plc` and `pds` services are only started when needed (`make pds-up`). The rest start automatically with `make dev`.

### Production (`docker-compose.prod.yml`)

Requires `infrastructure/.env` with all required variables set.

```bash
make deploy-build   # Build images
make deploy-up      # Start stack
make deploy-migrate # Run migrations
```

Services:

| Service | Image | Resource limits | Purpose |
|---------|-------|----------------|---------|
| `postgres` | `postgres:16-alpine` | 1 GB RAM, 1.0 CPU | Database |
| `redis` | `redis:7-alpine` | 128 MB RAM, 0.25 CPU | Session cache (password-protected) |
| `api` | Custom (apps/api/Dockerfile) | 512 MB RAM, 1.0 CPU | Express API + AppView |
| `web` | Custom (apps/web/Dockerfile) | 256 MB RAM, 0.5 CPU | SvelteKit frontend |
| `tap` | `ghcr.io/bluesky-social/indigo/tap` | 256 MB RAM, 0.5 CPU | ATProto firehose consumer |
| `caddy` | `caddy:2-alpine` | 128 MB RAM, 0.25 CPU | Reverse proxy + TLS |

Caddy routes: `/api/*`, `/.well-known/*`, `/health` → `api:3001`; everything else → `web:3000`. TLS certificates are provisioned automatically via Let's Encrypt.

Tap is configured to filter `network.coopsource.*` events (plus any additional lexicon collections). It reads from `bsky.network` relay by default; override with `RELAY_URL`.

### Private network (`docker-compose.prod.yml` + `docker-compose.private.yml`)

Fully self-hosted: no traffic to `bsky.network` or `plc.directory`.

```bash
make private-build
make private-up
make private-migrate
```

Adds these services on top of the production stack:

| Service | Image | Purpose |
|---------|-------|---------|
| `plc` | `ghcr.io/bluesky-social/did-method-plc` | Self-hosted DID directory |
| `relay` | `ghcr.io/bluesky-social/indigo/relay` | Self-hosted ATProto relay |
| `pds` | `ghcr.io/bluesky-social/pds:0.4` | Self-hosted PDS for the network's cooperative account |

The `tap` and `api` services are automatically reconfigured to point to the private relay and PLC.

> **Domain requirement:** PDS and AppView must be on **different domains** (not subdomains). Example: AppView at `mycooperative.org`, PDS at `mycooperative-pds.net`. See [ATProto production guide](https://atproto.com/guides/going-to-production).

Management:
```bash
make private-up      # Start
make private-down    # Stop
make private-logs    # Tail logs
make private-migrate # Run migrations
```

### Multi-instance federation (`docker-compose.federation.yml`)

Three independent cooperative instances sharing a PLC and Redis — for federation testing.

```bash
make dev-federation    # Start (hub :3001, coop-a :3002, coop-b :3003)
make stop-federation   # Stop
make migrate-all       # Migrate all three databases
make test-federation   # Run integration tests (auto-starts stack)
```

Instances and databases:

| Instance | Port | Database |
|----------|------|---------|
| hub | 3001 | `coopsource_hub` |
| coop-a | 3002 | `coopsource_coop_a` |
| coop-b | 3003 | `coopsource_coop_b` |
| web | 5173 | — |

### Local production preview (`docker-compose.prod.yml` + `docker-compose.local.yml`)

Runs the production stack locally with HTTP (no TLS) on port 80. Useful for testing the production build before deploying.

```bash
make local-build    # Build images
make local-up       # Start (HTTP on :80)
make local-migrate  # Run migrations
make local-reset    # Drop and recreate database
make local-logs     # Tail logs
make local-down     # Stop
```

### Standalone cooperative PDS (`docker-compose.pds.yml`)

A production-oriented standalone PDS for cooperatives that want to self-host their own PDS separately from the AppView stack. Includes commented-out Ozone (labeling) and Tap (firehose filter) configurations.

```bash
docker compose -f infrastructure/docker-compose.pds.yml up -d
```

Required env vars: `PDS_HOSTNAME`, `PDS_ADMIN_PASSWORD`, `PDS_JWT_SECRET`. Optional: `PDS_ROTATION_KEY`, `PDS_PLC_URL` (defaults to `https://plc.directory`).

---

## Make Targets Reference

### Development

| Target | Description |
|--------|-------------|
| `make setup` | First-time setup: install Homebrew services, create DB, copy `.env`, run migrations |
| `make dev` | Start PostgreSQL + Redis + API :3001 + Web :5173 |
| `make dev-clean` | Kill stale servers on :3001 and :5173, then `make dev` |
| `make start` | Start PostgreSQL + Redis only |
| `make stop` | Stop PostgreSQL + Redis |
| `make status` | Check infrastructure health |
| `make ports` | Show what's running on dev/test ports |
| `make install` | Install pnpm dependencies |
| `make db-migrate` | Run pending database migrations |
| `make db-reset` | Drop DB, recreate, and re-migrate |
| `make clean` | Stop services + clean build artifacts |

### Testing

| Target | Description |
|--------|-------------|
| `make test:e2e` | Run all 339 Playwright E2E tests |
| `make test:e2e-clean` | Kill all dev/test servers, then run E2E tests |
| `make test:e2e:real` | Run real (non-mocked) E2E tests only |
| `make test:e2e:mocked` | Run mocked E2E tests (no services needed) |
| `make test:pds` | Run PDS integration tests (starts Docker containers) |
| `make test:all` | Run all tests with real PDS (resets volumes, Docker required) |

### PDS containers

| Target | Description |
|--------|-------------|
| `make pds-up` | Start PLC + PDS Docker containers |
| `make pds-dev` | Start all services + PDS + pnpm dev |
| `make pds-reset` | Drop PDS + PLC volumes and restart |
| `make pds-status` | Show PDS + PLC container status |
| `make pds-logs` | Tail PDS + PLC logs |
| `make pds-down` | Stop PDS + PLC containers |
| `make provision-coop` | Provision a cooperative identity on the PDS (`ARGS="--pds-url ... --handle ..."`) |

### Federation (multi-instance)

| Target | Description |
|--------|-------------|
| `make dev-federation` | Start hub + coop-a + coop-b stack |
| `make stop-federation` | Stop federation stack |
| `make migrate-all` | Run migrations on hub, coop-a, and coop-b databases |
| `make test-federation` | Run federation integration tests |

### Production

| Target | Description |
|--------|-------------|
| `make deploy-build` | Build production Docker images |
| `make deploy-up` | Start production stack |
| `make deploy-down` | Stop production stack |
| `make deploy-logs` | Tail production logs |
| `make deploy-migrate` | Run database migrations inside the API container |

### Local production preview

| Target | Description |
|--------|-------------|
| `make local-build` | Build images for local preview |
| `make local-up` | Start local preview (HTTP on :80) |
| `make local-down` | Stop local preview |
| `make local-logs` | Tail local preview logs |
| `make local-migrate` | Run migrations |
| `make local-reset` | Drop and recreate database |

### Private network

| Target | Description |
|--------|-------------|
| `make private-build` | Build images for private network |
| `make private-up` | Start private stack (PLC + relay + PDS + AppView) |
| `make private-down` | Stop private network |
| `make private-logs` | Tail private network logs |
| `make private-migrate` | Run migrations |

---

## PDS Setup (Cooperatives)

Each cooperative needs its own PDS instance, on a **separate domain** from the AppView.

### Option A: Use the self-hosted PDS in a private stack

Use `make private-up` — the private docker-compose overlay includes a self-hosted PDS configured for your domain.

### Option B: Use the official Bluesky PDS installer

```bash
# On the cooperative's server (separate from the AppView server)
curl https://raw.githubusercontent.com/bluesky-social/pds/main/installer.sh > installer.sh
sudo bash installer.sh
```

Create a cooperative account:
```bash
docker exec pds goat pds admin account create \
  --handle mycoop.pds-domain.net \
  --email admin@mycoop.example \
  --password <secure-password>
```

Then set in your AppView `.env`:
```
COOP_PDS_URL=https://pds.mycoop.net
COOP_PDS_ADMIN_PASSWORD=<password>
COOP_DID=did:plc:<your-coop-did>
PLC_URL=https://plc.directory
```

---

## Full Production Deployment

### Server prerequisites

```bash
# 1. Create swap (recommended for 2–4 GB servers — prevents OOM during Docker builds)
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 2. Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# 3. Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker

# 4. (Optional) Create a deploy user
adduser deploy && usermod -aG docker deploy
```

### DNS

Create an **A record** pointing your domain to the server IP. Verify before deploying:
```bash
dig +short yourdomain.com   # Must return your server IP
```

Caddy needs DNS to propagate before it can request TLS certificates from Let's Encrypt.

### Deploy

```bash
git clone <repo-url> coopsource.network && cd coopsource.network
cp infrastructure/.env.prod.example infrastructure/.env
# Edit infrastructure/.env — set all required variables

make deploy-build
make deploy-up
make deploy-migrate
curl https://yourdomain.com/health
```

### Backups

Quick backup:
```bash
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml \
  exec -T postgres pg_dump -U coopsource coopsource | gzip > backup-$(date +%Y%m%d).sql.gz
```

Automated daily backup via cron:
```
0 2 * * * cd /path/to/coopsource.network && docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml exec -T postgres pg_dump -U coopsource coopsource | gzip > /backups/coopsource-$(date +\%Y\%m\%d).sql.gz
```

See [docs/operations.md](./docs/operations.md) for full backup, rotation, and monitoring procedures.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Caddy fails / no HTTPS | DNS not resolving | `dig +short yourdomain.com` must return server IP |
| 502 Bad Gateway | Containers still starting | Wait 30s, then `make deploy-logs` |
| OOM during `deploy-build` | No swap / low RAM | `fallocate -l 2G /swapfile` (see server prerequisites) |
| Migration fails | API container not running | `make deploy-up` first, then `make deploy-migrate` |
| Can't connect | Firewall blocking ports | `ufw allow 80/tcp && ufw allow 443/tcp` |
| Session/login issues | Secrets missing or wrong | Verify `infrastructure/.env` has all required values |
| PDS records not indexing | `TAP_URL` or `RELAY_URL` misconfigured | Check Tap container logs: `make deploy-logs` |

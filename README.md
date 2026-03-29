# Co-op Source Network

A federated collaboration platform for cooperatives, built on [ATProtocol](https://atproto.com). Cooperatives are genuine ATProto accounts. Members bring their own Bluesky identities. Governance records flow through the real relay network.

## Quick Start (Development)

```bash
# Prerequisites: Node.js 24, pnpm 10+, PostgreSQL 16, Redis 7

# First-time setup
make setup

# Start dev servers (API :3001, Web :5173)
make dev
```

## Production Deployment

Deploy to a VPS with Docker Compose + Caddy (automatic HTTPS via Let's Encrypt).

### Prerequisites

- A Linux server with Docker and Docker Compose installed
- A domain name (e.g., `coopsource.network`) with DNS A record pointing to the server IP
- Ports 80 and 443 open

### Steps

```bash
# 1. Clone the repo on the server
git clone <repo-url> coopsource.network
cd coopsource.network

# 2. Create production environment file
cp infrastructure/.env.prod.example infrastructure/.env

# 3. Edit infrastructure/.env and set required values:
#    POSTGRES_PASSWORD  — generate with: openssl rand -hex 32
#    SESSION_SECRET     — generate with: openssl rand -hex 32
#    KEY_ENC_KEY        — generate with: openssl rand -base64 32
#    DOMAIN             — your domain (default: coopsource.network)
#    SMTP_HOST/PORT     — your email provider (optional — leave unset to disable email)

# 4. Build Docker images
make deploy-build

# 5. Start the stack (PostgreSQL, Redis, API, Web, Caddy)
make deploy-up

# 6. Run database migrations
DATABASE_URL=postgresql://coopsource:<POSTGRES_PASSWORD>@localhost:5432/coopsource \
  make deploy-migrate

# 7. Verify
curl https://your-domain.com/health
```

Caddy automatically provisions TLS certificates from Let's Encrypt. Ensure DNS is configured before starting.

### Production Stack

| Service | Port | Description |
|---------|------|-------------|
| Caddy | 80, 443 | Reverse proxy with automatic HTTPS |
| API | 3001 (internal) | Express backend |
| Web | 3000 (internal) | SvelteKit frontend (adapter-node) |
| PostgreSQL | 5432 (internal) | Database (99 tables, 51 migrations) |
| Redis | 6379 (internal) | Session cache |

### Management

```bash
make deploy-up       # Start production stack
make deploy-down     # Stop production stack
make deploy-logs     # Tail logs
make deploy-build    # Rebuild Docker images
make deploy-migrate  # Run database migrations
```

### Environment Variables

See `infrastructure/.env.prod.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DOMAIN` | Yes | Public domain name |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `SESSION_SECRET` | Yes | Cookie signing secret (min 32 chars) |
| `KEY_ENC_KEY` | Yes | Encryption key for signing keys (base64) |
| `SMTP_HOST` | No | Email server for invitations/notifications (leave unset to disable — invitations still work via shareable links) |
| `PLC_URL` | No | ATProto PLC directory (default: local) |
| `RELAY_URL` | No | ATProto relay for firehose (e.g., `wss://bsky.network`) |

## Architecture

See [ARCHITECTURE-V6.md](./ARCHITECTURE-V6.md) for the federation migration plan and [ARCHITECTURE-V5.md](./ARCHITECTURE-V5.md) for cooperative lifecycle design, security model, and lexicon schemas.

## Development

```bash
make dev              # Start API + Web dev servers
make test:e2e         # Run 279 Playwright E2E tests
make pds-up           # Start ATProto PDS + PLC containers
make provision-coop   # Provision a cooperative identity
pnpm test             # Run unit tests
pnpm build            # Build all packages
```

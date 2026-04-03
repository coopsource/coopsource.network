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

### Recommended Server Sizing

| Workload | Droplet | RAM | vCPUs | Disk |
|----------|---------|-----|-------|------|
| Small (< 50 members) | Basic | 2 GB | 1 | 50 GB |
| Medium (50-500 members) | Basic | 4 GB | 2 | 80 GB |
| Large (500+ members) | General Purpose | 8 GB | 2 | 160 GB |

### Initial Server Setup

```bash
# 1. Create swap (recommended for 2-4 GB droplets — prevents OOM during Docker builds)
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

# 4. (Optional) Create a deploy user instead of running as root
adduser deploy
usermod -aG docker deploy
# Then log in as deploy for the remaining steps
```

### DNS Configuration

Create an **A record** pointing your domain to the droplet's IP address. Allow 5-10 minutes for propagation before starting the stack — Caddy needs to reach Let's Encrypt, which validates via DNS.

```bash
# Verify DNS is resolving
dig +short yourdomain.com
# Should return your droplet's IP
```

### Deploy

```bash
# 1. Clone the repo
git clone <repo-url> coopsource.network
cd coopsource.network

# 2. Create production environment file
cp infrastructure/.env.prod.example infrastructure/.env

# 3. Edit infrastructure/.env — set all REQUIRED values:
#    DOMAIN             — your domain (e.g., mycooperative.org)
#    POSTGRES_PASSWORD  — generate with: openssl rand -hex 32
#    REDIS_PASSWORD     — generate with: openssl rand -hex 32
#    SESSION_SECRET     — generate with: openssl rand -hex 32
#    KEY_ENC_KEY        — generate with: openssl rand -base64 32
#    SMTP_HOST/PORT     — optional (leave unset to disable email; invitations still work via shareable links)

# 4. Build Docker images
make deploy-build

# 5. Start the stack (PostgreSQL, Redis, API, Web, Caddy)
make deploy-up

# 6. Run database migrations
make deploy-migrate

# 7. Verify
curl https://yourdomain.com/health
```

Caddy automatically provisions TLS certificates from Let's Encrypt.

### Production Stack

| Service | Port | Description |
|---------|------|-------------|
| Caddy | 80, 443 | Reverse proxy with automatic HTTPS |
| API | 3001 (internal) | Express backend |
| Web | 3000 (internal) | SvelteKit frontend (adapter-node) |
| PostgreSQL | 5432 (internal) | Database (99 tables, 51 migrations) |
| Redis | 6379 (internal) | Password-protected cache |

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
make deploy-build       # Rebuild changed images
make deploy-up          # Recreate only changed containers
make deploy-migrate     # Run any new migrations
```

### Backups

See [docs/operations.md](./docs/operations.md) for full backup, log management, and operational procedures.

Quick database backup:

```bash
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml \
  exec -T postgres pg_dump -U coopsource coopsource | gzip > backup-$(date +%Y%m%d).sql.gz
```

Automate with cron (daily at 2 AM):

```
0 2 * * * cd /path/to/coopsource.network && docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml exec -T postgres pg_dump -U coopsource coopsource | gzip > /backups/coopsource-$(date +\%Y\%m\%d).sql.gz
```

### Environment Variables

See `infrastructure/.env.prod.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DOMAIN` | Yes | Public domain name |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `REDIS_PASSWORD` | Yes | Redis authentication password |
| `SESSION_SECRET` | Yes | Cookie signing secret (min 32 chars) |
| `KEY_ENC_KEY` | Yes | Encryption key for signing keys (base64) |
| `SMTP_HOST` | No | Email server for invitations/notifications (leave unset to disable — invitations still work via shareable links) |
| `PLC_URL` | No | ATProto PLC directory (default: local) |
| `RELAY_URL` | No | ATProto relay for firehose (e.g., `wss://bsky.network`) |
| `PUBLIC_API_URL` | Auto | Client-side API base URL (set automatically from DOMAIN) |
| `ORIGIN` | Auto | SvelteKit CSRF origin (set automatically from DOMAIN) |

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Caddy fails to start / no HTTPS | DNS not pointing to server | Verify: `dig +short yourdomain.com` must return droplet IP |
| 502 Bad Gateway | App containers not ready yet | Wait 30s, then `make deploy-logs` to check for startup errors |
| OOM kills during `deploy-build` | Insufficient RAM / no swap | Add swap: `fallocate -l 2G /swapfile` (see setup above) |
| Migration fails | API container not running | Run `make deploy-up` first, then `make deploy-migrate` |
| Can't connect to site | Firewall blocking ports | `ufw allow 80/tcp && ufw allow 443/tcp` |
| Session/login issues | Secrets not loaded | Verify `infrastructure/.env` exists and has all required values |

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

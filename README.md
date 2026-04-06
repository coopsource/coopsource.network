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
| API | 3001 (internal) | Express backend (AppView) |
| Web | 3000 (internal) | SvelteKit frontend (adapter-node) |
| Tap | 2480 (internal) | ATProto firehose sync + backfill |
| PostgreSQL | 5432 (internal) | Database (100 tables, 56 migrations) |
| Redis | 6379 (internal) | Password-protected cache |

### PDS Setup (Cooperatives)

Each cooperative needs its own PDS. Use the [official installer](https://github.com/bluesky-social/pds):

```bash
# On the cooperative's server (separate from the AppView server)
curl https://raw.githubusercontent.com/bluesky-social/pds/main/installer.sh > installer.sh
sudo bash installer.sh
```

> **Domain separation required**: PDS and AppView MUST be on different domains (not subdomains). Example: AppView at `coopsource.network`, PDS at `coopsource-pds.net`. See [ATProto production guide](https://atproto.com/guides/going-to-production).

Create a cooperative account on the PDS:
```bash
docker exec pds goat pds admin account create \
  --handle mycoop.pds-domain.net \
  --email admin@mycoop.example \
  --password <secure-password>
```

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
| `TAP_URL` | Auto | Tap firehose consumer HTTP URL (defaults to `http://tap:2480` in docker-compose) |
| `RELAY_URL` | No | Configures Tap container's upstream relay (e.g., `wss://bsky.network`), not the API |
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

## Private Network Deployment

Run a fully self-hosted network disconnected from public ATProto — no traffic to `bsky.network` or `plc.directory`.

```bash
# 1. Create private network environment file
cp infrastructure/.env.private.example infrastructure/.env.private
# Edit and set all REQUIRED values (passwords, secrets, PDS_HOSTNAME)

# 2. Build and start (adds self-hosted PLC, relay, PDS to the base stack)
make private-build
make private-up
make private-migrate

# 3. Verify
curl https://yourdomain.com/health
```

The private stack adds:

| Service | Description |
|---------|-------------|
| PLC | Self-hosted DID directory |
| Relay | ATProto event relay (Go, from `bluesky-social/indigo`) |
| PDS | Data server for the network's cooperative account |

```bash
make private-up      # Start private network
make private-down    # Stop private network
make private-logs    # Tail logs
make private-migrate # Run migrations
```

See [ARCHITECTURE-V7.md](./ARCHITECTURE-V7.md) for the full private network topology.

## Architecture

See [ARCHITECTURE-V7.md](./ARCHITECTURE-V7.md) for production deployment plans, [ARCHITECTURE-V6.md](./ARCHITECTURE-V6.md) for the ATProto federation design (complete), and [ARCHITECTURE-V5.md](./ARCHITECTURE-V5.md) for cooperative lifecycle design, security model, and lexicon schemas.

## Development

```bash
make dev              # Start API + Web dev servers
make test:e2e         # Run 279 Playwright E2E tests
make pds-up           # Start ATProto PDS + PLC containers
make provision-coop   # Provision a cooperative identity
pnpm test             # Run unit tests
pnpm build            # Build all packages
```

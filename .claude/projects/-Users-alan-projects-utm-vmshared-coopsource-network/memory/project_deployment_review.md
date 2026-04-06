---
name: Deployment Infrastructure Review (In Progress)
description: Code review of deployment artifacts for Digital Ocean droplet deployment — findings and planned changes
type: project
---

## Task
Code review of deployment artifacts (Dockerfiles, compose files, Makefile, Caddyfile, scripts, web security, start/stop mechanics) to prepare for easy Digital Ocean droplet deployment. User also wants README.md updated with deployment instructions.

## Status
Complete. All 7 fixes implemented.

## Files Already Read
- `Makefile` — all targets reviewed
- `infrastructure/docker-compose.prod.yml` — full stack (postgres, redis, api, web, caddy)
- `infrastructure/docker-compose.local.yml` — HTTP override for local testing
- `infrastructure/docker-compose.yml` — dev stack
- `infrastructure/Caddyfile` — production reverse proxy config
- `infrastructure/Caddyfile.local` — HTTP-only local config
- `infrastructure/.env.prod.example` — production env template
- `infrastructure/.env` — local test secrets (gitignored)
- `apps/api/Dockerfile` — multi-stage build, node:24-alpine
- `apps/web/Dockerfile` — multi-stage build, SvelteKit adapter-node
- `apps/api/src/index.ts` — server startup, middleware, graceful shutdown
- `apps/api/src/config.ts` — Zod-validated env config with production checks
- `apps/api/src/auth/session.ts` — session middleware (secure cookie based on INSTANCE_URL)
- `apps/api/src/middleware/logger.ts` — pino logger
- `packages/db/src/migrate.ts` — FileMigrationProvider, reads from __dirname/migrations
- `packages/db/src/client.ts` — Kysely PostgresDialect with pg.Pool
- `packages/db/package.json` — prebuild clears dist, migrate via ts-node
- `scripts/dev-services.sh` — Homebrew-based local dev (macOS only)
- `.env.example` — full dev env template
- `.gitignore` — covers .env, dist, node_modules
- `.dockerignore` — EXISTS at root (content not yet read)
- `README.md` — has basic deployment section, needs expansion

## Issues Found

### Critical (will break deployment)

1. **Makefile deploy targets missing `--env-file`**
   `docker compose -f infrastructure/docker-compose.prod.yml` runs from project root. Docker Compose reads `.env` from CWD, NOT from the compose file's directory. So `infrastructure/.env` is never loaded. All `deploy-*` and `local-*` targets need `--env-file infrastructure/.env`.

2. **`Caddyfile.local` gitignored by `*.local` pattern**
   `.gitignore` has `*.local` which matches `infrastructure/Caddyfile.local`. File won't be available after clone. Need to add exception `!infrastructure/Caddyfile.local` or rename.

### Important (security/reliability)

3. **Web Dockerfile: no production dependency pruning**
   API Dockerfile has `RUN CI=true pnpm install --frozen-lockfile --prod` but web Dockerfile copies full build-time node_modules (including devDeps). SvelteKit adapter-node bundles most deps but runtime still loads node_modules.

4. **Web container has no healthcheck** in docker-compose.prod.yml — caddy depends on it but can't verify it's ready.

5. **Redis has no password** in production compose. Internal-network-only but still best practice.

6. **No Content-Security-Policy header** in Caddyfile. Has HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy but missing CSP.

### Nice-to-have (docs/DX)

7. **README references `docs/operations.md`** which likely doesn't exist.
8. **No swap/firewall/Docker install docs** for Digital Ocean droplet.
9. **`.dockerignore` content unknown** — needs review to ensure it excludes .git, node_modules, tests.

## Planned Changes

1. Fix Makefile: add `--env-file infrastructure/.env` to all deploy-*/local-* targets
2. Fix `.gitignore`: add exception for `Caddyfile.local`
3. Fix web Dockerfile: add prod dependency pruning step
4. Add web healthcheck to docker-compose.prod.yml
5. Add Redis password support to docker-compose.prod.yml + .env.prod.example
6. Review/fix `.dockerignore`
7. Update README.md with comprehensive Digital Ocean deployment guide (droplet sizing, initial server setup, firewall, swap, Docker install, DNS, deployment steps, backup, monitoring, troubleshooting)
8. Add CSP header to Caddyfile (conservative policy)

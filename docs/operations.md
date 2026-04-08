# Production Operations

## Database Backups

Back up PostgreSQL daily. Run from the repo root on the host:

```bash
make deploy-backup
# Or manually:
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml exec -T postgres \
  pg_dump -U coopsource coopsource | gzip > backup-$(date +%Y%m%d).sql.gz
```

Restore from a backup:

```bash
gunzip -c backup-20260329.sql.gz | \
  docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml exec -T postgres \
  psql -U coopsource coopsource
```

Automate with a cron job (e.g., daily at 2 AM):

```
0 2 * * * cd /path/to/coopsource.network && docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml exec -T postgres pg_dump -U coopsource coopsource | gzip > /backups/coopsource-$(date +\%Y\%m\%d).sql.gz
```

## Blob Storage Backups

User uploads (avatars, attachments) are stored in the `blobdata` Docker volume. Back it up alongside the database:

```bash
docker run --rm \
  -v coopsource-network_blobdata:/data:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/blobs-$(date +%Y%m%d).tar.gz -C /data .
```

## Log Management

All containers log to stdout. Docker captures these with the default `json-file` driver. To prevent unbounded disk usage, configure log rotation in `docker-compose.prod.yml` or in the Docker daemon config (`/etc/docker/daemon.json`):

Per-service (in docker-compose.prod.yml):

```yaml
services:
  api:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Or globally in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

View logs:

```bash
make deploy-logs                            # tail all services
make deploy-logs -- api                     # single service (append service name)
# Or manually:
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml logs api
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml logs --since 1h
```

## Session Cleanup

Expired sessions are automatically pruned from PostgreSQL every 15 minutes by `connect-pg-simple` (configured in `apps/api/src/auth/session.ts`). No manual intervention needed.

## Migrations

Run database migrations after deploying new code:

```bash
make deploy-migrate
```

This executes the migration runner inside the running API container. The API container must be up (`make deploy-up`) before running migrations.

### Migrations that require a maintenance window

Most migrations are safe to run online, but a few rewrite central tables and
take an `ACCESS EXCLUSIVE` lock — they should be run during a scheduled
maintenance window with the API offline (or at minimum, traffic drained).

| Migration | Why |
|---|---|
| `059_search_indexes.ts` (V8.6) | Adds two `GENERATED ALWAYS AS ... STORED` `tsvector` columns to `entity` and `post`. The `ALTER TABLE entity ADD COLUMN ...` rewrites the table and takes `ACCESS EXCLUSIVE`; `entity` is the central FK target so this blocks all in-flight queries. Sub-second on small datasets, but unbounded on large production tables. |

For future large-table migrations, prefer the safer pattern:
1. Add a nullable column.
2. Backfill in batches with throttled `UPDATE`s.
3. Add `NOT NULL` and `CREATE INDEX CONCURRENTLY` afterward.

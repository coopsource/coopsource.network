# Tap — ATProto Firehose Filter

Tap is a sidecar service that filters the ATProto relay firehose for
`network.coopsource.*` collections, reducing bandwidth and CPU for the AppView.

## Architecture

```
bsky.network relay → Tap (filter) → local WebSocket → AppView relay-consumer
```

## Usage

**Direct relay (development):**
Set `RELAY_URL=wss://bsky.network` — the AppView's relay-consumer connects
directly to the public relay and does its own filtering.

**Tap sidecar (production):**
Deploy Tap alongside the AppView. Set `RELAY_URL=ws://tap:6008` to connect
to Tap's filtered output instead of the full firehose.

## Docker Compose

Add to `docker-compose.pds.yml` when ready:

```yaml
tap:
  image: ghcr.io/mary-ext/tap:latest
  environment:
    RELAY_URL: wss://bsky.network
    FILTER_COLLECTIONS: network.coopsource.
  ports:
    - "6008:6008"
  restart: unless-stopped
```

## Notes

- Tap is optional — the relay-consumer handles filtering natively
- Tap reduces bandwidth from ~50MB/s (full firehose) to ~KB/s (our collections only)
- For development, connecting directly to `bsky.network` is fine
- The relay-consumer's two-pass decode already skips expensive CAR parsing
  for non-matching collections, so direct connection is efficient enough
  for moderate traffic

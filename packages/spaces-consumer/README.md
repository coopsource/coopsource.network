# @coopsource/spaces-consumer

Pull-based consumer over ATProto permissioned spaces. The Layer 1 substrate of the V11 four-layer architecture (see `ARCHITECTURE-V11.md` §16 Stage 1).

## Purpose

The spaces consumer subscribes to per-space write notifications from a cooperative's arbiter, pulls the changed records from member PDSes, verifies the batch digest, cross-checks each record's author against the arbiter's authoritative member list (defense in depth), and emits accepted records to a downstream handler.

V11's pull-based model replaces V9's firehose-based ingestion for permissioned data. Public records still flow through the existing Tap firehose consumer in `apps/api/src/appview/loop.ts`.

## Interfaces and sketch impls

| Interface | Default sketch | Test-only sketch | Real impl gated by |
|---|---|---|---|
| `SpaceCredentialStore` | `InMemorySpaceCredentialStore` | — | Persistence becomes meaningful in Stage 2 |
| `ArbiterMemberList` | `DenyAllArbiterMemberList` (fail-closed) | `StaticArbiterMemberList` | V11 Stage 2 (arbiter integration) |
| `NotificationSubscriber` | `InMemoryNotificationSubscriber` | — | Upstream notification protocol resolution |
| `RepoPuller` | `InMemoryRepoPuller([])` (empty) | `InMemoryRepoPuller(records)` | `@atproto/sync` integration against `permissioned-data` branch |
| `EcmhVerifier` | `FailClosedEcmhVerifier` | `UnsafeAlwaysOkEcmhVerifier` (opt-in via `UNSAFE_SKIP_ECMH`) | ECMH spec finalization + JS library decision |

Persistence:

| Component | Stage 1 |
|---|---|
| Cursor store | `KyselyCursorStore` against the `spaces_consumer_cursor` table |
| Cursor key | `(SpaceRef, memberDid)` — passed directly, no pipe-string encoding |
| Empty-cursor convention | `''` (empty string) means "from the beginning of the repo" |

## Security boundaries

- Records authored by DIDs not on the arbiter's authoritative member list are discarded. Cross-check happens twice: at notification handling (member iteration) and per-record (defense in depth — protects against a compromised member PDS returning forged records).
- Sketches default to fail-closed (`DenyAllArbiterMemberList`, `FailClosedEcmhVerifier`) so accidental production wiring cannot silently bypass verification.
- `UnsafeAlwaysOkEcmhVerifier` is reachable only via the explicit `UNSAFE_SKIP_ECMH=true` config flag, which logs a loud startup warning.
- Per CLAUDE-CODE-PROMPT-V11.md "Distinguishing Authorization Failures": this consumer touches **Axis 2 (space membership)** — never collapse it with Axis 1 (OAuth scope) or Axis 3 (application logic).
- Internal error taxonomy uses `kind` (not `axis`) to avoid overloading the V11 reserved term. See `SpacesConsumerError`.

## Health surface

`SpacesConsumer.health()` returns:

- `subscribedSpaces` — count of spaces subscribed to
- `lastPullAt` — ISO timestamp of last successful notification handle, or `null`
- `recordsAccepted` — total records accepted (passed digest + cross-check)
- `recordsRejected` — total records dropped at the per-record cross-check
- `digestMismatches` — number of batches where the verifier returned `ok: false`
- `memberCrossCheckFailures` — number of records dropped because `isMember()` returned false
- `errorCount` — number of times `onError` fired
- `startedAt` — ISO timestamp when the consumer was constructed

`apps/api`'s `/health` endpoint surfaces this under `spacesConsumer`.

## Wiring (apps/api)

```typescript
import { startSpacesConsumer } from './appview/spaces-consumer-dispatch.js';

await startSpacesConsumer({
  enabled: config.SPACES_CONSUMER_ENABLED,
  unsafeSkipEcmh: config.UNSAFE_SKIP_ECMH,
  db: container.db,
  spaces: [], // Stage 1: empty by design; real subscriptions land with Stage 2
});
```

## Stage 1 exit criteria

Stage 1 is complete when:

1. The five interfaces + the `SpacesConsumer` orchestrator + the `KyselyCursorStore` are implemented and unit-tested.
2. Sketches fail closed by default (`DenyAll`, `FailClosed`, `InMemoryRepoPuller([])`, empty notifications).
3. apps/api dispatch wires the consumer with `SPACES_CONSUMER_ENABLED=false` default.
4. Health endpoint exposes the consumer's metrics.
5. Schema additions (`did_rotation_history`, `spaces_consumer_cursor`) are in `packages/db/src/schema.ts`.
6. `SpaceCredentialStore` ships as Stage 1 surface but is not consumed by `SpacesConsumer` directly — it's pre-shaped for Stage 2's real `RepoPuller` and `NotificationSubscriber`.
7. No real data flows in Stage 1 — only sketches.

Real implementations come in Stage 2 onward, gated on upstream protocol resolution (see `ARCHITECTURE-V11.md` §18).

## Layout

```
packages/spaces-consumer/
├── src/
│   ├── types.ts                    # SpaceRef, SpaceNotification, PulledRecord, ConsumerHealth, ClockedOptions
│   ├── credential-store.ts         # SpaceCredentialStore + InMemory impl
│   ├── arbiter-member-list.ts      # ArbiterMemberList + DenyAll/Static sketches
│   ├── notification-subscriber.ts  # NotificationSubscriber + InMemory sketch
│   ├── repo-puller.ts              # RepoPuller + InMemory sketch
│   ├── ecmh-verifier.ts            # EcmhVerifier + FailClosed/UnsafeAlwaysOk sketches
│   ├── cursor-store.ts             # CursorStore interface
│   ├── consumer.ts                 # SpacesConsumer orchestrator
│   ├── kysely-cursor-store.ts      # KyselyCursorStore (Postgres-backed)
│   ├── index.ts                    # public API
│   └── __tests__/
│       ├── helpers/factories.ts    # test-only branded-type constructors
│       └── *.test.ts               # 26 unit tests across 7 files
└── README.md (this file)
```

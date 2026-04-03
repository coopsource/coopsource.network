# ATProto & Federation Deep Research Links

GitHub file links for deep research on making Co-op Source Network fully ATProto-native.

**Base repo:** [coopsource/coopsource.network](https://github.com/coopsource/coopsource.network)

---

## Architecture & Design Documents

- [ARCHITECTURE-V3.md](https://github.com/coopsource/coopsource.network/blob/main/ARCHITECTURE-V3.md) — Full architecture: federation design, instance roles, recursive cooperative model, upgrade phases
- [CLAUDE.md](https://github.com/coopsource/coopsource.network/blob/main/CLAUDE.md) — Project conventions: ATProto patterns, bilateral membership rules, lexicon namespace, pitfalls

---

## Lexicon Schemas (ATProto Record Definitions)

### Org Namespace (`network.coopsource.org.*`)

- [org/cooperative.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/org/cooperative.json) — Cooperative entity record
- [org/membership.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/org/membership.json) — Bilateral membership (member side)
- [org/memberApproval.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/org/memberApproval.json) — Bilateral membership (cooperative side; role authority)
- [org/project.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/org/project.json) — Project record
- [org/team.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/org/team.json) — Team record
- [org/role.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/org/role.json) — Role definition

### Governance Namespace (`network.coopsource.governance.*`)

- [governance/proposal.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/governance/proposal.json) — Governance proposal
- [governance/vote.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/governance/vote.json) — Vote with delegation support
- [governance/delegation.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/governance/delegation.json) — Vote delegation

### Agreement Namespace (`network.coopsource.agreement.*`)

- [agreement/master.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/agreement/master.json) — Master agreement record
- [agreement/signature.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/agreement/signature.json) — Digital signature (atproto-did-proof method)
- [agreement/amendment.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/agreement/amendment.json) — Amendment record
- [agreement/stakeholderTerms.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/agreement/stakeholderTerms.json) — Stakeholder terms
- [agreement/contribution.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/agreement/contribution.json) — Contribution record

### Alignment Namespace (`network.coopsource.alignment.*`)

- [alignment/interest.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/alignment/interest.json) — Interest record
- [alignment/interestMap.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/alignment/interestMap.json) — Interest map
- [alignment/outcome.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/alignment/outcome.json) — Outcome record
- [alignment/stakeholder.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/alignment/stakeholder.json) — Stakeholder record

### Connection Namespace (`network.coopsource.connection.*`)

- [connection/link.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/connection/link.json) — Connection link
- [connection/binding.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/connection/binding.json) — Connection binding
- [connection/sync.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/connection/sync.json) — Connection sync

### Funding Namespace (`network.coopsource.funding.*`)

- [funding/campaign.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/funding/campaign.json) — Funding campaign
- [funding/pledge.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/network/coopsource/funding/pledge.json) — Funding pledge

---

## Generated Lexicon TypeScript

- [src/generated/types.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/src/generated/types.ts) — TypeScript interfaces for all record types
- [src/generated/lexicons.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/src/generated/lexicons.ts) — Runtime lexicon schema objects
- [src/validator.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/src/validator.ts) — Runtime validator using `@atproto/lexicon`
- [src/index.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/src/index.ts) — Package entry: exports types and `LEXICON_IDS`
- [package.json](https://github.com/coopsource/coopsource.network/blob/main/packages/lexicons/package.json) — Lexicons package dependencies

---

## Federation Package — Core Interfaces

- [interfaces/pds-service.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/interfaces/pds-service.ts) — `IPdsService`: createDid, resolveDid, createRecord, putRecord, deleteRecord, subscribeRepos
- [interfaces/federation-client.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/interfaces/federation-client.ts) — `IFederationClient`: cross-co-op identity, membership, agreements, discovery
- [interfaces/blob-store.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/interfaces/blob-store.ts) — `IBlobStore` interface
- [interfaces/clock.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/interfaces/clock.ts) — `IClock` interface
- [interfaces/email-service.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/interfaces/email-service.ts) — `IEmailService` interface
- [types.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/types.ts) — Core federation types: BlobRef, PdsRecord, DidDocument, FirehoseEvent
- [index.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/index.ts) — Main package exports
- [package.json](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/package.json) — Federation package dependencies

---

## Federation Package — Local PDS Implementation (Stage 0-1)

- [local/local-pds-service.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/local-pds-service.ts) — `LocalPdsService`: PostgreSQL-backed PDS with pg_notify firehose
- [local/local-federation-client.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/local-federation-client.ts) — `LocalFederationClient`: standalone mode, local dispatch
- [local/local-plc-client.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/local-plc-client.ts) — `LocalPlcClient`: self-contained did:plc implementation (sha256-based DID computation)
- [local/plc-client.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/plc-client.ts) — `PlcClient`: HTTP client for real PLC directory (Stage 2+)
- [local/firehose.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/firehose.ts) — PostgreSQL LISTEN-based firehose emitter
- [local/tid.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/tid.ts) — ATProto TID (time-based identifier) generator
- [local/cid-utils.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/cid-utils.ts) — CID computation (SHA-256, noted as not yet spec-compliant)
- [local/did-manager.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/did-manager.ts) — Key management: ECDSA P-256 keypair generation, AES-256-GCM encryption, multibase encoding
- [local/local-blob-store.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/local-blob-store.ts) — Local filesystem blob store
- [local/db-tables.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/local/db-tables.ts) — Federation DB type alias

---

## Federation Package — HTTP Federation (Signed Server-to-Server)

- [http/http-federation-client.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/http/http-federation-client.ts) — `HttpFederationClient`: RFC 9421 signed HTTP calls between instances
- [http/signing.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/http/signing.ts) — HTTP Message Signatures (RFC 9421): ECDSA P-256/SHA-256, signRequest/verifyRequest
- [http/signing-key-resolver.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/http/signing-key-resolver.ts) — Loads signing keys from entity_key DB table
- [http/did-web-resolver.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/http/did-web-resolver.ts) — `DidWebResolver`: resolves did:web via /.well-known/did.json with TTL cache

---

## Federation Package — Real ATProto PDS (Stage 2)

- [atproto/atproto-pds-service.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/atproto/atproto-pds-service.ts) — `AtprotoPdsService`: wraps @atproto/api for real XRPC (createRecord, subscribeRepos WebSocket)
- [atproto/firehose-decoder.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/atproto/firehose-decoder.ts) — Decodes ATProto binary firehose: CBOR header + body with CAR/DAG-CBOR records

---

## Federation Package — Outbox & Saga

- [outbox/outbox-processor.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/outbox/outbox-processor.ts) — Reliable outbox delivery with RFC 9421 signing and exponential backoff
- [outbox/enqueue.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/outbox/enqueue.ts) — Outbox message enqueue with idempotency key
- [saga.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/federation/src/saga.ts) — `SagaCoordinator`: distributed operation coordinator with compensation

---

## Common Package — ATProto Utilities

- [src/types.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/common/src/types.ts) — Branded types: `DID`, `AtUri`, `CID`, `Money`
- [src/did-web.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/common/src/did-web.ts) — did:web utilities: didWebToUrl, urlToDidWeb, buildMemberDidWeb
- [src/uri.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/common/src/uri.ts) — AT URI utilities: buildAtUri, encodeAtUri, decodeAtUri, extractRkey
- [src/constants.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/common/src/constants.ts) — LEXICON_NAMESPACE, COLLECTIONS map
- [src/errors.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/common/src/errors.ts) — Domain error types
- [src/permissions.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/common/src/permissions.ts) — Permission definitions
- [src/validation.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/common/src/validation.ts) — Validation utilities
- [package.json](https://github.com/coopsource/coopsource.network/blob/main/packages/common/package.json) — Common package dependencies

---

## Database — Schema & Migrations

- [src/schema.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/schema.ts) — Complete Kysely Database interface: pds_record, pds_commit, plc_operation, entity_key, federation_peer, federation_outbox, etc.
- [migrations/002_entities.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/002_entities.ts) — Entity table (DID-keyed), entity_key (JWK + encrypted private key)
- [migrations/004_pds_store.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/004_pds_store.ts) — pds_record, pds_commit, pds_firehose_cursor
- [migrations/005_membership.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/005_membership.ts) — Membership + membership_role (bilateral state tracking)
- [migrations/007_governance.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/007_governance.ts) — Proposal, vote, delegation tables
- [migrations/008_agreements.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/008_agreements.ts) — Agreement tables
- [migrations/009_plc_store.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/009_plc_store.ts) — plc_operation table (did:plc genesis ops)
- [migrations/010_decouple_entity_key.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/010_decouple_entity_key.ts) — Decouple entity key from entity FK
- [migrations/012_decouple_pds_fks.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/012_decouple_pds_fks.ts) — Decouple PDS FKs for federation compatibility
- [migrations/018_unify_agreements.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/018_unify_agreements.ts) — Unified agreement system
- [migrations/021_federation_peer.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/021_federation_peer.ts) — federation_peer registry
- [migrations/022_signature_request.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/022_signature_request.ts) — Cross-instance signature request coordination
- [migrations/023_federation_outbox.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/023_federation_outbox.ts) — Reliable federation outbox queue
- [migrations/024_public_profile_fields.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/migrations/024_public_profile_fields.ts) — Public profile visibility for federation discovery
- [src/client.ts](https://github.com/coopsource/coopsource.network/blob/main/packages/db/src/client.ts) — Kysely client setup
- [package.json](https://github.com/coopsource/coopsource.network/blob/main/packages/db/package.json) — DB package dependencies

---

## API — Container & Configuration

- [src/container.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/container.ts) — DI container: selects PDS and federation client implementations by instance role
- [src/config.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/config.ts) — Zod config: INSTANCE_ROLE, INSTANCE_URL, INSTANCE_DID, PLC_URL, PDS_URL, KEY_ENC_KEY, HUB_URL
- [src/index.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/index.ts) — Express app bootstrap: route mounting, AppView loop, outbox processor

---

## API — AppView Loop & Indexers

- [appview/loop.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/appview/loop.ts) — Subscribes to PDS firehose, dispatches to indexers by collection
- [appview/indexers/membership-indexer.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/appview/indexers/membership-indexer.ts) — Bilateral membership state machine (active only when both records exist)
- [appview/indexers/proposal-indexer.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/appview/indexers/proposal-indexer.ts) — Governance record indexer
- [appview/indexers/agreement-indexer.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/appview/indexers/agreement-indexer.ts) — Agreement record indexer
- [appview/indexers/alignment-indexer.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/appview/indexers/alignment-indexer.ts) — Alignment record indexer
- [appview/sse.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/appview/sse.ts) — SSE event emitter

---

## API — Routes (Federation & ATProto-Related)

- [routes/federation.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/routes/federation.ts) — Server-to-server federation endpoints (signed HTTP receiving side)
- [routes/well-known.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/routes/well-known.ts) — `/.well-known/did.json` — serves instance DID document
- [routes/org/memberships.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/routes/org/memberships.ts) — Membership CRUD
- [routes/org/cooperatives.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/routes/org/cooperatives.ts) — Cooperative CRUD
- [routes/org/networks.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/routes/org/networks.ts) — Network routes
- [routes/governance/proposals.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/routes/governance/proposals.ts) — Proposal/vote routes
- [routes/agreement/agreements.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/routes/agreement/agreements.ts) — Agreement + signature routes
- [routes/blobs.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/routes/blobs.ts) — Blob upload/download

---

## API — Middleware & Auth

- [middleware/federation-auth.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/middleware/federation-auth.ts) — RFC 9421 HTTP signature verification for federation requests
- [middleware/permissions.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/middleware/permissions.ts) — Permission middleware
- [auth/session.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/auth/session.ts) — Session management
- [auth/middleware.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/auth/middleware.ts) — Auth middleware
- [auth/oauth-client.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/auth/oauth-client.ts) — OAuth client
- [auth/oauth-stores.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/auth/oauth-stores.ts) — OAuth storage

---

## API — Services

- [services/membership-service.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/services/membership-service.ts) — Bilateral membership with federation client calls
- [services/proposal-service.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/services/proposal-service.ts) — Proposals as PDS records
- [services/agreement-service.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/services/agreement-service.ts) — Agreements with cross-instance signing
- [services/entity-service.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/services/entity-service.ts) — Entity CRUD (person | cooperative)
- [services/network-service.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/services/network-service.ts) — Network service (cooperative with is_network: true)
- [services/auth-service.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/services/auth-service.ts) — Auth: creates entity + PDS DID on registration
- [services/alignment-service.ts](https://github.com/coopsource/coopsource.network/blob/main/apps/api/src/services/alignment-service.ts) — Alignment service
- [package.json](https://github.com/coopsource/coopsource.network/blob/main/apps/api/package.json) — API package dependencies (includes @atproto/api, @atproto/lexicon, etc.)

---

## Infrastructure & Dev Tooling

- [docker-compose.federation.yml](https://github.com/coopsource/coopsource.network/blob/main/infrastructure/docker-compose.federation.yml) — Multi-instance federation dev (hub + coop-a + coop-b)
- [docker-compose.yml](https://github.com/coopsource/coopsource.network/blob/main/infrastructure/docker-compose.yml) — Single-instance dev (PostgreSQL + Redis + Mailpit)
- [init-federation-dbs.sql](https://github.com/coopsource/coopsource.network/blob/main/infrastructure/init-federation-dbs.sql) — Creates per-instance federation databases
- [Dockerfile.dev](https://github.com/coopsource/coopsource.network/blob/main/infrastructure/Dockerfile.dev) — Dev container
- [Makefile](https://github.com/coopsource/coopsource.network/blob/main/Makefile) — Dev targets: dev-federation, migrate-all, test-federation, pds-up/down
- [scripts/dev-services.sh](https://github.com/coopsource/coopsource.network/blob/main/scripts/dev-services.sh) — Homebrew-based local dev setup
- [turbo.json](https://github.com/coopsource/coopsource.network/blob/main/turbo.json) — Turborepo pipeline config
- [pnpm-workspace.yaml](https://github.com/coopsource/coopsource.network/blob/main/pnpm-workspace.yaml) — pnpm workspace config

---

## Key Context for Deep Research

**Current state (Stage 0-1):**
- DIDs are `did:plc:` computed locally by `LocalPlcClient` (real algorithm but not globally resolvable)
- CIDs are `bafyrei<sha256hex>` — **not spec-compliant** (noted in `cid-utils.ts` as primary gap)
- PDS is PostgreSQL-backed (`pds_record`, `pds_commit`), not a real ATProto repo (no MST, no CAR, no signed commits)
- Firehose is PostgreSQL `pg_notify`, not WebSocket `com.atproto.sync.subscribeRepos`
- Instance identity uses `did:web:` via `/.well-known/did.json`

**Stage 2 hooks already built:**
- `AtprotoPdsService` wraps `@atproto/api` for real XRPC (activated by `PDS_URL` env var)
- `firehose-decoder.ts` decodes real ATProto binary CBOR/CAR firehose frames
- `PlcClient` talks to real `plc.directory`
- `HttpFederationClient` makes RFC 9421 signed HTTP calls between instances

**Primary gaps for full ATProto-native:**
1. CID computation needs `@atproto/repo` for proper CBOR/DAG-CBOR
2. No Merkle Search Tree (MST) for repo structure
3. No signed commits or CAR file serialization in local PDS
4. Firehose doesn't emit real ATProto sync events
5. No OAuth DPoP flow (ATProto's auth standard)

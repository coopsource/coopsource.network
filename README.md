# Co-op Source Network

A federated collaboration platform for technology-focused cooperatives, built on the [AT Protocol](https://atproto.com). Members bring their own Bluesky identities, cooperatives run as genuine ATProto accounts, and governance records flow through the real relay network alongside Bluesky posts, Tangled commits, and other ecosystem content.

The core design principle is the **recursive cooperative model**: everything is an entity (person or cooperative), and a network is just a cooperative whose members are other cooperatives. The same membership, governance, and agreement machinery works at every level — no special types needed.

## Why ATProto?

The ICA's seven cooperative principles map naturally onto ATProto's architecture. Voluntary membership becomes portable identity. Democratic control becomes public governance records verifiable by anyone. Autonomy becomes self-hosted PDS instances under the cooperative's domain. Cooperation among cooperatives becomes cross-app composability through shared lexicons. Co-op Source Network is a full ecosystem citizen — cooperatives federate with Bluesky, Tangled, OpenMeet, Smoke Signal, and any other ATProto application.

## Architecture

The platform uses a three-tier data model: public ATProto records for governance and membership (Tier 1), private PostgreSQL storage for internal cooperative data (Tier 2), and end-to-end encrypted messaging via the Germ protocol for confidential communications (Tier 3).

Membership follows a **bilateral protocol** — both the member and the cooperative must create matching records in their respective PDS instances for membership to become active. This prevents unilateral claims and ensures both parties consent.

### Instance Roles

A single codebase supports three deployment modes controlled by the `INSTANCE_ROLE` environment variable:

- **standalone** — Hub, co-op, and AppView in one process with one database (development and demos)
- **hub** — Network directory and cross-co-op AppView (runs coopsource.network in production)
- **coop** — A single cooperative's API, PDS, and local AppView (individual co-op servers)

## Monorepo Layout

```
coopsource.network/
├── apps/
│   ├── api/          — Express 5 backend (AppView + REST API)
│   └── web/          — SvelteKit 2 / Svelte 5 frontend
├── packages/
│   ├── lexicons/     — ATProto lexicon schemas + generated TypeScript
│   ├── federation/   — Federation client, PDS service, DID resolution
│   ├── db/           — Kysely database layer + migrations (PostgreSQL 16)
│   ├── common/       — Shared types, constants, errors, validation
│   └── config/       — Shared tsconfig, eslint, prettier
├── infrastructure/   — Docker Compose for dev (Postgres, Redis, Mailpit)
├── scripts/          — Dev tooling and setup scripts
└── docs/             — Planning and design documents
```

## Tech Stack

TypeScript (strict mode), Express 5, SvelteKit 2 with Svelte 5 runes, Kysely 0.28+ on PostgreSQL 16, Tailwind CSS 4, Vite 7, Vitest 4, Zod 4, pnpm 10 workspaces with Turborepo 2, and Node.js 24 LTS.

## Getting Started

### Prerequisites

- Node.js 24 LTS
- pnpm 10.30+
- PostgreSQL 16
- Redis 7

### Quick Start (macOS with Homebrew)

```bash
git clone https://github.com/coopsource/coopsource.network.git
cd coopsource.network
make setup    # Install services, create DB, copy .env, run migrations
make dev      # Start everything (API on :3001, Web on :5173)
```

### Quick Start (Docker)

```bash
pnpm install
docker compose -f infrastructure/docker-compose.yml up -d
pnpm --filter @coopsource/db migrate
pnpm dev
```

### Common Commands

```bash
pnpm dev                    # Start all dev servers
pnpm build                  # Build all packages
pnpm test                   # Run all tests
pnpm format                 # Format codebase

make dev-federation         # Multi-instance federation mode
make test-federation        # Run federation integration tests

pnpm --filter @coopsource/lexicons lex:generate   # Regenerate lexicon types
```

## Federation

Cooperatives federate with each other and with the broader ATProto ecosystem. Cross-co-op operations always go through the `IFederationClient` interface — never direct database access across co-op boundaries. Identity uses `did:web` in development (resolving via `/.well-known/did.json`) and migrates to `did:plc` for production.

The lexicon namespace is `network.coopsource.*`, covering organizations, governance, agreements, and alignment.

## Documentation

- **[ARCHITECTURE-V5.md](./ARCHITECTURE-V5.md)** — Full architecture specification covering ATProto integration, bilateral membership, security model, legal lifecycle, financial tools, and phased migration plan
- **[CLAUDE-CODE-PROMPT-V5.md](./CLAUDE-CODE-PROMPT-V5.md)** — Implementation guide with phased tasks, code patterns, and file references
- **[CLAUDE.md](./CLAUDE.md)** — Project context for AI-assisted development

## Contributing

Co-op Source Network is itself organized as a cooperative. We welcome contributions from developers, designers, cooperative organizers, and anyone interested in building federated infrastructure for democratic organizations.

## License

See repository for license details.

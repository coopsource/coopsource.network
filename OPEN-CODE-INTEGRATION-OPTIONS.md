# OpenCode Integration Options

> Decision document for integrating AI agent capabilities into Co-op Source Network.
> Created: March 2026 | Status: **Under Review**

## Background

We explored [opencode](https://github.com/sst/opencode) (formerly `anomalyco/opencode`) as a potential foundation for our AI agent framework. opencode is a TypeScript/Bun AI coding agent with 100k+ GitHub stars, built on top of the **Vercel AI SDK v5** (`ai` npm package).

### What We Already Built (AI Agent Framework — Phases 1-5)

Our current implementation uses direct provider SDKs (`@anthropic-ai/sdk`, Ollama REST API) with a custom `ChatEngine` that handles tool loops, session management, budget enforcement, and model routing. This works but couples us to individual provider APIs and requires maintaining provider-specific code for each new LLM vendor.

### What opencode Does Well

- **Provider abstraction via AI SDK**: Single `streamText()` call point handles 20+ providers through `@ai-sdk/*` packages
- **Model metadata from [models.dev](https://models.dev)**: Runtime-fetched model capabilities, pricing, and limits instead of hardcoded arrays
- **Battle-tested tool loop**: The "doom loop" (session processor) with tool repair, permission checks, and abort handling
- **Client/server architecture**: Hono HTTP server with SSE streaming, OpenAPI spec, and a generated TypeScript SDK
- **MCP support**: Both as client (connecting to tool servers) and server

### Key Technical Facts

| Property | opencode | Co-op Source Network |
|----------|----------|---------------------|
| Runtime | Bun | Node.js 24 |
| HTTP framework | Hono | Express 5 |
| Database | SQLite (Drizzle) | PostgreSQL (Kysely) |
| AI library | Vercel AI SDK v5 | @anthropic-ai/sdk + Ollama REST |
| Auth | Basic auth / none | Session cookies + federation signatures |
| Multi-tenant | No (single user) | Yes (per-cooperative) |
| MCP | Client + Server | Server only |

---

## Option A: Run opencode as a Sidecar Process

Proxy requests from our Express API to a co-located opencode server instance.

### Architecture

```
┌─────────────────────────┐     ┌──────────────────────────────┐
│  SvelteKit Frontend     │     │  opencode server (:4096)     │
│                         │     │                              │
│  Chat UI, Agent Config  │     │  - Vercel AI SDK             │
└───────────┬─────────────┘     │  - Tool execution            │
            │                   │  - Session management        │
            ▼                   │  - MCP client                │
┌─────────────────────────┐     │  - SQLite state              │
│  Express API (:3001)    │     └──────────────┬───────────────┘
│                         │                    │
│  Auth, co-op context,   ├────proxy──────────►│
│  permissions, PostgreSQL│◄───SSE─────────────┤
│                         │
└─────────────────────────┘
```

### How It Works

1. User sends chat message via SvelteKit → Express API
2. Express authenticates, checks permissions, resolves cooperative context
3. Express proxies the request to opencode's Hono server (with `x-opencode-directory` header)
4. opencode handles AI SDK calls, tool execution, session state
5. SSE stream proxied back through Express to the frontend

### Pros

- **Minimal code changes** — opencode runs as-is, we only write proxy logic
- **Get all upstream updates** — `git pull` to update opencode, no fork maintenance
- **Battle-tested AI core** — tool loop, provider switching, MCP all included
- **OpenAPI SDK available** — can use `@opencode-ai/sdk` for typed client calls

### Cons

- **Bun dependency** — must run Bun alongside Node.js in production
- **No multi-tenancy** — opencode assumes single user; would need one instance per cooperative or heavy session multiplexing
- **Two databases** — opencode uses SQLite for sessions; our data is in PostgreSQL
- **Auth boundary** — opencode's basic auth doesn't understand our cooperative membership model
- **Operational complexity** — two processes, two runtimes, health checks, lifecycle management
- **Tool isolation** — opencode's tools (file read/write, shell) assume local filesystem; our tools need database access and federation context

### Effort Estimate

Medium-low for initial setup, high for production hardening (multi-tenancy, auth bridging, tool scoping).

---

## Option B: Extract opencode's AI Core as a Package

Fork the relevant modules from `packages/opencode/src/` into our monorepo as a new `packages/ai-core/` package.

### Architecture

```
coopsource.network/
├── packages/
│   ├── ai-core/              ← extracted from opencode
│   │   ├── provider/          ← AI SDK wrapper + models.dev registry
│   │   ├── session/           ← processor + tool loop ("doom loop")
│   │   ├── tool/              ← tool registry + execution
│   │   └── mcp/              ← MCP client
│   ├── common/
│   ├── db/
│   └── federation/
├── apps/
│   ├── api/                   ← Express routes call ai-core
│   └── web/
```

### How It Works

1. Copy ~15 files from opencode's session, provider, tool, and LLM modules
2. Replace Bun-specific APIs (SQLite/Drizzle → PostgreSQL/Kysely, Bun.serve → Express)
3. Replace opencode's config/auth/permission system with our DI container
4. Keep the AI SDK integration, `streamText()` patterns, and models.dev fetching intact
5. Wire into our existing routes, middleware, and services

### What Gets Extracted

| opencode module | Purpose | Our adaptation |
|-----------------|---------|----------------|
| `provider/provider.ts` | AI SDK provider factory + models.dev | Rewrite for our ModelProviderRegistry |
| `session/processor.ts` | Tool loop (the "doom loop") | Adapt to our ChatEngine |
| `session/llm.ts` | `streamText()` wrapper | Direct reuse, swap config source |
| `tool/registry.ts` | Tool definition + execution | Merge with our existing tools |
| `mcp/` | MCP client connections | Integrate with our MCP server |
| `provider/transform.ts` | Provider-specific message transforms | Direct reuse |

### Pros

- **Full control** — adapt everything to our multi-tenant, Express/PostgreSQL stack
- **No Bun dependency** — runs on Node.js 24 natively
- **Cherry-pick the best parts** — take the AI SDK patterns, leave the TUI/CLI/shell concerns
- **Single database** — all state in PostgreSQL

### Cons

- **Fork maintenance** — must manually merge upstream improvements from opencode
- **Non-trivial extraction** — opencode modules have internal coupling (Bus events, Instance singletons, Bun APIs)
- **Risk of drift** — extracted code diverges from upstream, making future merges harder
- **Initial effort** — significant refactoring to replace Drizzle → Kysely, Bun → Node

### Effort Estimate

High initial effort (2-3 weeks), medium ongoing maintenance.

---

## Option C: Use Vercel AI SDK Directly (Learn Patterns, Don't Fork)

Instead of taking opencode's code, study its patterns and rebuild using the Vercel AI SDK directly — the same foundation opencode itself uses.

### Architecture

```
apps/api/src/ai/
├── chat-engine.ts          ← streamText/generateText (AI SDK directly)
├── model-registry.ts       ← models.dev fetch/cache (pattern from opencode)
├── tools/                  ← Zod-schema tools (AI SDK tool() format)
│   ├── list-members.ts
│   ├── get-proposal.ts
│   └── ...
├── tool-loop.ts            ← multi-step execution (stopWhen from AI SDK)
└── providers/
    ├── index.ts            ← AI SDK provider factory
    └── config.ts           ← per-co-op provider configuration
```

### How It Works

1. Replace `@anthropic-ai/sdk` with `ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai` + etc.
2. Replace our custom `ChatEngine.processToolLoop()` with AI SDK's built-in `stopWhen: stepCountIs(N)` (AI SDK v6) or manual loop with `streamText`
3. Adopt models.dev for model metadata (the same pattern opencode uses, implemented from scratch)
4. Convert our existing tools to AI SDK `tool()` format with Zod schemas
5. Keep our existing PostgreSQL storage, session management, and DI container

### Key AI SDK Patterns to Adopt

```typescript
// Single streamText call replaces our manual Anthropic SDK usage
import { streamText, tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

const result = streamText({
  model: createAnthropic()('claude-sonnet-4-20250514'),
  tools: {
    listMembers: tool({
      description: 'List members of the cooperative',
      inputSchema: z.object({ cooperativeDid: z.string() }),
      execute: async ({ cooperativeDid }) => {
        return membershipService.getMembers(cooperativeDid);
      },
    }),
  },
  stopWhen: stepCountIs(10),  // AI SDK v6 built-in tool loop
  messages: sessionMessages,
  system: agentSystemPrompt,
});
```

### Pros

- **Minimal new code** — AI SDK handles the hard parts (streaming, tool calls, provider switching)
- **No fork to maintain** — using AI SDK as intended; updates come via npm
- **Follows AI SDK best practices** — documented patterns, community support, Vercel backing
- **Any-provider support** — 20+ providers via `@ai-sdk/*` packages, no custom provider code
- **AI SDK v6 ready** — minor migration when upgrading (v5 → v6 has small breaking changes)

### Cons

- **Doesn't reuse opencode's battle-tested processor** — our tool loop is simpler but less proven
- **models.dev integration built from scratch** — opencode already handles edge cases we'd need to discover
- **No session sharing with opencode** — if a user wants both opencode CLI and our web UI, sessions are separate
- **AI SDK version coupling** — tied to Vercel's release cycle (currently v5, v6 available)

### Effort Estimate

Medium (1-2 weeks). Most of the work is converting existing tools and replacing the Anthropic SDK calls.

---

## Option D: Use the opencode SDK Client

Use opencode's published TypeScript SDK (`@opencode-ai/sdk`) to communicate with a running opencode instance, treating it as a managed service.

### Architecture

```
┌─────────────────────────┐
│  SvelteKit Frontend     │
│  Chat UI, Agent Config  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐     ┌──────────────────────────────┐
│  Express API (:3001)    │     │  opencode instance           │
│                         │     │  (managed per co-op)         │
│  import { createOpen-   │     │                              │
│    codeClient } from    ├────►│  Sessions, tools, providers  │
│    '@opencode-ai/sdk'   │◄────┤  all managed by opencode     │
│                         │     │                              │
│  Auth + permissions     │     └──────────────────────────────┘
│  wrap SDK calls         │
└─────────────────────────┘
```

### How It Works

1. Install `@opencode-ai/sdk` in our API package
2. For each cooperative, manage an opencode instance (or shared pool)
3. Our Express routes authenticate users, then delegate AI operations to opencode via the SDK
4. The SDK provides typed methods for sessions, messages, providers, config, and MCP

### SDK Example

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk';

const client = createOpencodeClient({
  baseUrl: 'http://localhost:4096',
  directory: '/path/to/coop/workspace',
});

// Create a session
const session = await client.session.create({ agentID: 'coder' });

// Send a message and stream the response
const stream = await client.session.chat({
  sessionID: session.id,
  parts: [{ type: 'text', text: userMessage }],
});
```

### Pros

- **Typed API** — generated from OpenAPI spec, stays in sync with opencode releases
- **Full opencode features** — sessions, tools, MCP, providers all accessible
- **Thinnest integration layer** — our code is just auth + SDK calls

### Cons

- **Same multi-tenancy problem as Option A** — opencode is single-user; need instance-per-coop or session isolation
- **Bun dependency** — still need to run opencode server (Bun runtime)
- **Tight coupling** — our agent behavior is controlled by opencode's agent definitions, not our own
- **No access to internals** — can't customize tool execution, prompt construction, or session processing
- **SDK maturity** — opencode is evolving rapidly; SDK may have breaking changes
- **Filesystem assumption** — opencode expects local project directories; our cooperatives don't have filesystems

### Effort Estimate

Low initial effort, high long-term risk (blocked by opencode's design decisions).

---

## Comparison Matrix

| Criterion | A: Sidecar | B: Extract | C: AI SDK Direct | D: SDK Client |
|-----------|-----------|-----------|-------------------|---------------|
| **Initial effort** | Medium-low | High | Medium | Low |
| **Ongoing maintenance** | Medium | High | Low | Medium |
| **Multi-tenancy** | Hard | Native | Native | Hard |
| **Provider flexibility** | Via opencode | Full | Full | Via opencode |
| **Bun dependency** | Yes | No | No | Yes |
| **Tool customization** | Limited | Full | Full | None |
| **Upstream updates** | Automatic | Manual merge | npm update | SDK update |
| **Production readiness** | Low | Medium | High | Low |
| **MCP support** | Built-in | Extracted | Build or use `@modelcontextprotocol/sdk` | Built-in |
| **Session/data in PostgreSQL** | No (SQLite) | Yes | Yes | No (SQLite) |
| **Fits our architecture** | Poor | Good | Best | Poor |

---

## Assessment

### Recommendation: Option C (AI SDK Direct)

**Option C is the strongest fit** for Co-op Source Network because:

1. **We're already multi-tenant** — opencode (Options A, D) assumes a single user with a local filesystem. Adapting it for per-cooperative isolation would require more work than building on the AI SDK directly.

2. **Same foundation, less baggage** — opencode itself is built on the Vercel AI SDK. By using the AI SDK directly, we get the same provider abstraction and streaming capabilities without opencode's TUI, CLI, filesystem tools, and Bun runtime.

3. **Our existing framework is close** — the AI Agent Framework (Phases 1-5) already has session management, tool execution, budget enforcement, and agent configuration in PostgreSQL. The main improvement needed is replacing our direct `@anthropic-ai/sdk` calls with AI SDK's unified `streamText()` / `generateText()`.

4. **Lowest ongoing maintenance** — AI SDK updates come via npm. No fork to maintain, no sidecar to operate.

5. **Vercel AI SDK is the standard** — v6 is stable, v5→v6 migration is straightforward, and the ecosystem (providers, community, documentation) is mature.

### Patterns to Adopt from opencode

Even with Option C, we should adopt these specific patterns discovered in opencode's source:

| Pattern | Source | How to Adopt |
|---------|--------|-------------|
| **models.dev registry** | `provider/provider.ts` | Fetch `https://models.dev/api.json`, cache 1hr, replace hardcoded model arrays |
| **Tool repair** | `session/llm.ts` | Use `experimental_repairToolCall` to handle model misspellings |
| **Provider-specific transforms** | `provider/transform.ts` | Use `wrapLanguageModel` middleware for per-provider message formatting |
| **Active tool filtering** | `session/llm.ts` | Filter `activeTools` based on permissions before passing to `streamText` |
| **Budget enforcement** | `session/processor.ts` | Track `usage.totalTokens` across steps, abort when budget exceeded |

### Next Steps

1. **Replace `@anthropic-ai/sdk` with `ai` + `@ai-sdk/anthropic`** in the ChatEngine
2. **Add `@ai-sdk/openai`** (and others) for multi-provider support via unified API
3. **Implement models.dev registry** to replace hardcoded `ANTHROPIC_MODELS`
4. **Convert tools to AI SDK `tool()` format** with Zod input schemas
5. **Adopt `streamText` with `stopWhen`** (AI SDK v6) for the tool loop

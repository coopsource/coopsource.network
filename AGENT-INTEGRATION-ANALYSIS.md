# Why Option C wins: AI SDK v6 changes the calculus

**Build directly on AI SDK v6's `ToolLoopAgent` — don't fork, don't sidecar, don't extract.** The release of AI SDK v6 in December 2025 introduced the exact agent primitives that opencode built custom, making the "learn patterns, don't fork" approach overwhelmingly the best choice for a multi-tenant cooperative platform running on Node.js. The existing feature branch with **277 tests, 10 tools, and a working ChatEngine** is the right foundation — it just needs upgrading to AI SDK v6's agent abstractions rather than bolting on opencode's Bun-dependent, single-user architecture.

The core tension in this decision is between reusing opencode's battle-tested code (112K+ GitHub stars, heavily production-tested doom loop detection, provider-specific transforms) versus architectural fit for a multi-tenant cooperative platform. After thoroughly researching opencode's internals, AI SDK v6's new capabilities, and alternative frameworks, the architectural mismatch with opencode is severe enough that no integration path — sidecar, extraction, or SDK client — justifies the cost.

## opencode is brilliant but architecturally incompatible

opencode (https://github.com/sst/opencode) is a remarkable piece of engineering: a client-server AI coding assistant with a Bun-based backend exposing a Hono HTTP + SSE API, a Go TUI built on Bubble Tea, desktop and VS Code clients, and the `@opencode-ai/sdk` package for programmatic access. Its core agent loop lives in `SessionPrompt.loop()`, which orchestrates multi-turn tool execution by repeatedly calling AI SDK's `streamText()` until the model's finish reason is no longer `"tool-calls"`. The `SessionProcessor.process()` iterates over `stream.fullStream` events, handling text deltas, reasoning, tool calls, and errors with sophisticated doom loop detection (checking last 3 tool calls for identical patterns).

But **five fundamental incompatibilities** make opencode wrong for Co-op Source Network:

**Runtime lock-in to Bun.** opencode's server uses Bun's built-in SQLite for session storage, Bun-specific APIs throughout its core, and distributes as a self-contained Bun binary. The cooperative platform runs on Node.js. This isn't a trivial migration — SQLite access, module resolution, and numerous internal APIs differ between runtimes.

**Single-user, project-directory-scoped design.** opencode assumes one developer working in one project directory. Session state lives in a global map. Configuration loads from `opencode.json` in the project root plus `~/.config/opencode/`. There is no concept of organizations, tenants, or cooperative members. The permission system (`allow/deny/ask` patterns with wildcard matching) governs which tools an agent can use — not which cooperative member can access which resources.

**SQLite storage is wrong for multi-tenant.** The cooperative platform needs PostgreSQL (or similar) with row-level security, per-cooperative isolation, and proper concurrent access. opencode's Bun-embedded SQLite cannot serve multiple cooperatives sharing infrastructure.

**No library mode — only HTTP API.** You cannot `import { SessionPrompt } from 'opencode'`. The core processing engine only runs as a server process. Integration is always via HTTP API or the `@opencode-ai/sdk` client. This means every AI operation adds network round-trip overhead and you lose the ability to deeply integrate agent behavior with your Express middleware, database transactions, or cooperative permission checks.

**Fork maintenance is unsustainable.** opencode is a 20+ package monorepo with extremely active development (the repo was recently mirrored to `anomalyco/opencode` as SST rebranded). A small cooperative team cannot maintain a fork of this rapidly-evolving codebase while also building platform features.

## Each option analyzed against cooperative requirements

### Option A (sidecar) — architectural mismatch is severe

Running opencode on port 4096 and proxying from Express gives you opencode's full feature set but creates **two processes with different runtimes** (Node.js for Express, Bun for opencode). Multi-tenancy is unsolvable: you'd need one opencode server per... cooperative? Per user? Session isolation, cooperative permissions, and database integration all break down. The SQLite storage can't participate in your PostgreSQL transactions. When a cooperative member sends a prompt, your Express middleware must authenticate them, check their cooperative role, determine which tools they're authorized to use — then somehow translate all of that into opencode's project-level configuration format. **Verdict: reject.**

### Option B (extract AI core) — enormous effort, diminishing returns

Extracting `packages/opencode/src/session/`, `src/provider/`, `src/tool/`, and `src/mcp/` into a `packages/ai-core` directory sounds appealing until you examine the coupling. The session system depends on Bun SQLite. The processor depends on the session system. Provider transforms depend on a specific message format (`MessageV2`). The tool system depends on the permission system, which depends on the agent configuration, which depends on the config loader. You would essentially be **rewriting 60-70% of the code** while maintaining compatibility with the parts you kept. For a small team, the extraction effort alone could consume months — and then you're maintaining a fork that diverges from upstream every week. **Verdict: reject.** The learning-to-effort ratio is poor.

### Option C (AI SDK directly) — now dramatically stronger with v6

When these options were originally drafted, AI SDK likely lacked the `ToolLoopAgent` class, `stopWhen` stop conditions, `prepareStep` callbacks, and `needsApproval` tool approval — all introduced in **AI SDK v6 (December 22, 2025)**. These features close the gap with opencode's custom agent loop:

| opencode pattern | AI SDK v6 equivalent |
|---|---|
| `SessionPrompt.loop()` continuation until finish ≠ "tool-calls" | `ToolLoopAgent` with `stopWhen: stepCountIs(20)` — automatic multi-step tool loop |
| Doom loop detection (3 identical tool calls) | Custom `stopWhen` condition: `({ steps }) => detectDoomLoop(steps)` |
| Context compaction when token limit approaches | `prepareStep` callback: compress messages when history grows large |
| Provider-specific transforms (Anthropic prompt caching) | Provider middleware or custom `prepareStep` logic |
| Tool permission system (allow/deny/ask patterns) | `needsApproval` per tool + cooperative permission middleware |
| Dynamic model switching | `prepareStep` can return different `model` per step |
| MCP tool registration | `@ai-sdk/mcp` `createMCPClient()` + `mcpClient.tools()` — stable in v6 |
| Provider registry with models.dev | `createProviderRegistry()` with `@ai-sdk/anthropic`, `@ai-sdk/openai`, Ollama providers |

The existing feature branch already has a ChatEngine, 10 tools with Zod schemas, Anthropic + Ollama providers, MCP server, event triggers, and **277 passing tests**. Upgrading this to AI SDK v6 patterns means migrating the ChatEngine to use `ToolLoopAgent`, updating tool definitions to the v6 `tool()` format with `needsApproval`, and adding `@ai-sdk/mcp` for client-side MCP connections. This is an incremental upgrade, not a rewrite. **Verdict: strongly recommended.**

### Option D (opencode SDK client) — cleaner API, same problems

The `@opencode-ai/sdk` provides an elegant API: `client.session.create()`, `client.session.prompt()`, `client.event.subscribe()`. But it still requires a running opencode server (Bun), stores sessions in SQLite, has no multi-tenancy concept, and adds HTTP overhead to every AI operation. It's Option A with a nicer interface. The only scenario where this makes sense is if you wanted to give individual cooperative members their own opencode instances for personal coding assistance — a completely different product than the cooperative platform's AI agent system. **Verdict: reject for the platform; potentially useful as a separate member benefit.**

## The recommended architecture in detail

The optimal path is **Option C enhanced with AI SDK v6 primitives and opencode-inspired patterns** — what could be called the "study, don't fork" approach. Here is what the implementation looks like:

**Agent definitions using ToolLoopAgent.** Replace the existing ChatEngine with composable `ToolLoopAgent` instances. Each cooperative can have custom agents with different tool sets, models, and system prompts. The `prepareStep` callback handles per-cooperative configuration:

```typescript
const cooperativeAgent = new ToolLoopAgent({
  model: registry.languageModel(cooperative.preferredModel),
  instructions: cooperative.systemPrompt,
  tools: resolveToolsForMember(member, cooperative),
  stopWhen: [stepCountIs(cooperative.maxSteps), detectDoomLoop],
  prepareStep: async ({ stepNumber, messages }) => {
    if (messages.length > 50) return { messages: compactHistory(messages) };
    return {};
  },
  needsApproval: (tool) => cooperative.requiresApproval(tool, member.role),
});
```

**Multi-tenant provider registry.** Use `createProviderRegistry` with cooperative-level API key management. Each cooperative configures which providers they want available:

```typescript
const registry = createProviderRegistry({
  anthropic: createAnthropic({ apiKey: cooperative.anthropicKey }),
  ollama: createOpenAICompatible({ baseURL: cooperative.ollamaEndpoint }),
});
```

**Cooperative permission integration.** Wrap tool execution in your existing Express middleware that checks the member's cooperative role against the tool's required permission level. AI SDK v6's `needsApproval` provides the hook point; your cooperative governance model provides the policy.

**Session persistence in PostgreSQL.** Store conversation history, tool results, and agent state in your existing database with proper row-level security per cooperative. This replaces opencode's SQLite with something production-ready for multi-tenancy.

**Specific patterns worth borrowing from opencode** (by studying the source, not forking):

- **Doom loop detection**: opencode's algorithm checks the last 3 message parts for identical tool calls with identical parameters. Implement this as a custom `stopWhen` condition — roughly 20 lines of code.
- **Provider transforms**: Anthropic prompt caching headers, tool call ID sanitization for specific providers. Implement as middleware in your provider setup.
- **Context compaction**: When approaching the token limit, summarize older messages. Implement in `prepareStep` using a separate lightweight model call.
- **Stream idle timeout**: opencode's `processor.ts` handles `StreamIdleTimeoutError` with configurable timeout and retry limits. Worth replicating for robustness.

## What about Mastra or other frameworks?

**Mastra** is the strongest framework alternative. Built on AI SDK, it offers an Express adapter (`@mastra/express`), thread-based conversation management, MCP client/server support, memory systems, evals, and observability. Its `MCPClient.listToolsets()` method directly supports per-request/per-tenant dynamic tool configuration. However, Mastra's multi-tenancy support is explicitly labeled "low priority" by its maintainers, and adopting it means **migrating 277 existing tests and 10 tools** to Mastra's patterns rather than upgrading them incrementally. For a small cooperative team, this migration cost likely outweighs the framework's benefits — especially since AI SDK v6's primitives now cover the core agent loop that Mastra provides.

**LangGraph.js** offers powerful graph-based orchestration for complex workflows but has a steeper learning curve and no built-in Express integration. It's better suited for complex multi-step workflows with branching logic than for a chat-based agent that primarily needs a tool execution loop.

**The "do nothing" anti-pattern** is worth explicitly rejecting. The existing feature branch with its custom ChatEngine predates AI SDK v6. Staying on older AI SDK patterns means maintaining a custom tool loop that AI SDK now handles natively, missing out on `needsApproval` for cooperative governance integration, and not benefiting from `prepareStep` for context management. The upgrade to v6 is the right move regardless of the opencode question.

## Concrete next steps for the cooperative

The migration from the existing feature branch to AI SDK v6 patterns should follow this sequence:

1. **Upgrade `ai` package to v6** and install `@ai-sdk/mcp`, `@ai-sdk/anthropic`, and an Ollama-compatible provider. Update `package.json` — this is Node.js only, no Bun.
2. **Refactor ChatEngine to use `ToolLoopAgent`**. The existing 10 tools likely already use Zod schemas; convert them to AI SDK v6's `tool()` format. The 277 tests provide a safety net for this refactoring.
3. **Add cooperative-aware `prepareStep` and `needsApproval`**. Wire these into the existing permission model so that democratic governance rules control agent behavior.
4. **Implement doom loop detection** as a custom `stopWhen` condition, borrowing the algorithm from opencode's `processor.ts` (lines 207-232).
5. **Add `@ai-sdk/mcp` client support** alongside the existing MCP server. This enables cooperatives to connect external MCP tool servers — a powerful extensibility point for customizable tools per cooperative.
6. **Implement context compaction in `prepareStep`** for long conversations, using the cooperative's configured small model for summarization.

The key insight is that **AI SDK v6 made this decision for you**. The `ToolLoopAgent` provides the production-ready agent loop that opencode built custom. The existing feature branch provides the cooperative-specific infrastructure (multi-tenancy, permissions, tools, tests) that opencode lacks. Combining them through Option C is the clear path — you get opencode's conceptual patterns without its architectural baggage, running natively on Node.js, deeply integrated with cooperative governance, and maintainable by a small team that stays on AI SDK's upgrade path rather than maintaining a fork of a 112K-star project.
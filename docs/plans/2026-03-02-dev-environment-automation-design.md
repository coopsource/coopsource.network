# Dev Environment Automation — Design

## Problem

Starting dev, test, or E2E environments requires manually killing stale processes on conflicting ports. Forgetting to do this causes:
- Dev server startup failures (port already in use)
- E2E tests connecting to stale/wrong API servers (the `PUBLIC_API_URL` bug we just fixed)
- Silent failures where tests run against a dev database instead of the test database

## Design

Enhance the existing Makefile and `scripts/dev-services.sh` with clean-start variants and a port diagnostic tool.

### New Targets

| Target | Behavior |
|--------|----------|
| `make dev-clean` | Kill ports 3001+5173 → verify infra → `make dev` |
| `make test:e2e-clean` | Kill ports 3001+3002+5173 → verify infra → `make test:e2e` |
| `make ports` | Show what's running on all dev/test ports (3001, 3002, 3003, 5173) |

### Implementation Details

**`scripts/dev-services.sh` — add two new commands:**

1. `kill-ports <port1> <port2> ...` — For each port, find and kill any process. Log what was killed. Idempotent (no error if port is free).

2. `ports` — Show PID, process name, and command for anything on ports 3001, 3002, 3003, 5173. Clean table output.

**`Makefile` — add three targets:**

```makefile
dev-clean:
	@./scripts/dev-services.sh kill-ports 3001 5173
	@$(MAKE) dev

test\:e2e-clean:
	@./scripts/dev-services.sh kill-ports 3001 3002 5173
	@$(MAKE) test:e2e

ports:
	@./scripts/dev-services.sh ports
```

### Seeding

Already handled — no changes needed:
- **E2E**: `global-setup.ts` drops/recreates test DB + runs migrations. Each test's `beforeEach` calls `setupCooperative()`.
- **Dev**: User goes through setup wizard in UI.

### Files to Modify

1. `scripts/dev-services.sh` — Add `kill-ports` and `ports` commands
2. `Makefile` — Add `dev-clean`, `test:e2e-clean`, `ports` targets

### Verification

1. `make ports` — shows clean output (nothing or existing processes)
2. Start a dev server manually on port 3001, then `make dev-clean` — should kill it and start fresh
3. `make test:e2e-clean` — runs full E2E suite with 107/107 passing

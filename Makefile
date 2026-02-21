# Makefile — Co-op Source Network local development
# Requires: macOS, Homebrew, pnpm, Node.js 22+

SHELL := /bin/bash
.DEFAULT_GOAL := help

SCRIPTS := ./scripts/dev-services.sh

.PHONY: help setup dev start stop status install db-migrate db-reset clean test\:e2e test\:e2e\:real test\:e2e\:mocked

help: ## Show all targets
	@echo ""
	@echo "Co-op Source Network — Development Commands"
	@echo "============================================"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""

setup: ## First-time setup: install services, create DB, .env, migrate
	@$(SCRIPTS) setup

dev: start ## Start services + pnpm dev (API :3001, Web :5173)
	pnpm turbo dev --filter=@coopsource/api --filter=@coopsource/web

start: ## Start PostgreSQL + Redis
	@$(SCRIPTS) start

stop: ## Stop PostgreSQL + Redis
	@$(SCRIPTS) stop

status: ## Check infrastructure health
	@$(SCRIPTS) status

install: ## Install pnpm dependencies
	pnpm install

db-migrate: ## Run pending database migrations
	@$(SCRIPTS) db:migrate

db-reset: ## Drop DB, recreate, and re-migrate
	@$(SCRIPTS) db:reset

test\:e2e: start ## Run ALL Playwright E2E tests
	pnpm --filter @coopsource/web exec playwright test

test\:e2e\:real: start ## Run real (non-mocked) E2E tests only
	pnpm --filter @coopsource/web exec playwright test --project=real

test\:e2e\:mocked: ## Run mocked E2E tests (no services needed)
	pnpm --filter @coopsource/web exec playwright test --project=mocked

clean: stop ## Stop services + clean build artifacts
	pnpm clean

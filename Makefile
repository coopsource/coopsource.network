# Makefile — Co-op Source Network local development
# Requires: macOS, Homebrew, pnpm, Node.js 24+

SHELL := /bin/bash
.DEFAULT_GOAL := help

SCRIPTS := ./scripts/dev-services.sh

.PHONY: help setup dev dev-clean start stop status ports install db-migrate db-reset clean test\:e2e test\:e2e-clean test\:e2e\:real test\:e2e\:mocked pds-up pds-reset pds-status pds-logs pds-down pds-dev provision-coop test\:pds test\:all dev-federation stop-federation migrate-all test-federation deploy-build deploy-up deploy-down deploy-logs deploy-migrate private-build private-up private-down private-logs private-migrate

help: ## Show all targets
	@echo ""
	@echo "Co-op Source Network — Development Commands"
	@echo "============================================"
	@echo ""
	@grep -E '^[a-zA-Z_\\:-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		sed 's/\\:/@C@/g' | \
		awk 'BEGIN {FS = ":.*## "}; {gsub(/@C@/, ":", $$1); printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

setup: ## First-time setup: install services, create DB, .env, migrate
	@$(SCRIPTS) setup

dev: start ## Start services + pnpm dev (API :3001, Web :5173)
	pnpm turbo dev --filter=@coopsource/api --filter=@coopsource/web

dev-clean: ## Kill stale servers, then start clean (API :3001, Web :5173)
	@$(SCRIPTS) kill-ports 3001 5173
	@$(MAKE) dev

start: ## Start PostgreSQL + Redis
	@$(SCRIPTS) start

stop: ## Stop PostgreSQL + Redis
	@$(SCRIPTS) stop

status: ## Check infrastructure health
	@$(SCRIPTS) status

ports: ## Show what's running on dev/test ports
	@$(SCRIPTS) ports

install: ## Install pnpm dependencies
	pnpm install

db-migrate: ## Run pending database migrations
	@$(SCRIPTS) db:migrate

db-reset: ## Drop DB, recreate, and re-migrate
	@$(SCRIPTS) db:reset

test\:e2e: start ## Run ALL Playwright E2E tests (kills stale test servers first)
	@$(SCRIPTS) kill-ports 3002 5173
	pnpm --filter @coopsource/web exec playwright test

test\:e2e-clean: ## Kill ALL dev/test servers, then run E2E tests clean
	@$(SCRIPTS) kill-ports 3001 3002 5173
	@$(MAKE) test:e2e

test\:e2e\:real: start ## Run real (non-mocked) E2E tests only
	@$(SCRIPTS) kill-ports 3002 5173
	pnpm --filter @coopsource/web exec playwright test --project=real

test\:e2e\:mocked: ## Run mocked E2E tests (no services needed)
	pnpm --filter @coopsource/web exec playwright test --project=mocked

pds-up: ## Start PDS + PLC + Mailpit via Docker Compose
	docker compose -f infrastructure/docker-compose.yml up -d plc pds mailpit

pds-reset: ## Reset PDS + PLC + Mailpit containers (drops volumes for clean state)
	docker compose -f infrastructure/docker-compose.yml down -v plc pds mailpit 2>/dev/null || true
	docker compose -f infrastructure/docker-compose.yml up -d plc pds mailpit

pds-status: ## Check PDS + PLC + Mailpit container status
	@docker compose -f infrastructure/docker-compose.yml ps plc pds mailpit

pds-logs: ## Tail PDS + PLC logs
	docker compose -f infrastructure/docker-compose.yml logs -f plc pds

pds-down: ## Stop PDS + PLC + Mailpit containers
	docker compose -f infrastructure/docker-compose.yml stop plc pds mailpit

test\:pds: pds-up ## Run PDS integration tests (starts PDS containers, waits for health)
	@echo "Waiting for PDS to be healthy..."
	@docker compose -f infrastructure/docker-compose.yml up -d --wait plc pds mailpit
	PDS_URL=http://localhost:2583 PLC_URL=http://localhost:2582 MAILPIT_URL=http://localhost:8025 pnpm --filter @coopsource/federation test

test\:all: pds-reset start ## Run ALL tests with real PDS (Docker required, resets volumes)
	@echo "Waiting for PDS + PLC to be healthy..."
	@docker compose -f infrastructure/docker-compose.yml up -d --wait plc pds mailpit
	pnpm test
	PDS_URL=http://localhost:2583 PLC_URL=http://localhost:2582 MAILPIT_URL=http://localhost:8025 pnpm --filter @coopsource/federation test

pds-dev: start pds-up ## Start all services + PDS for V6 development
	pnpm turbo dev --filter=@coopsource/api --filter=@coopsource/web

provision-coop: ## Provision a cooperative identity on the PDS
	pnpm --filter @coopsource/api exec tsx ../../scripts/provision-cooperative.ts $(ARGS)

clean: stop ## Stop services + clean build artifacts
	pnpm clean

# ─── Federation (multi-instance) ─────────────────────────────────────

dev-federation: ## Start federation stack (hub + coop-a + coop-b)
	cd infrastructure && docker compose -f docker-compose.federation.yml up --build

stop-federation: ## Stop federation stack
	cd infrastructure && docker compose -f docker-compose.federation.yml down

migrate-all: ## Run migrations on all federation databases
	DATABASE_URL=postgresql://coopsource:dev_password@localhost:5432/coopsource_hub pnpm --filter @coopsource/db migrate
	DATABASE_URL=postgresql://coopsource:dev_password@localhost:5432/coopsource_coop_a pnpm --filter @coopsource/db migrate
	DATABASE_URL=postgresql://coopsource:dev_password@localhost:5432/coopsource_coop_b pnpm --filter @coopsource/db migrate

test-federation: ## Run federation integration tests (requires running stack)
	cd infrastructure && docker compose -f docker-compose.federation.yml up -d --wait
	pnpm --filter @coopsource/api test:federation
	cd infrastructure && docker compose -f docker-compose.federation.yml down

# ─── Production deployment ──────────────────────────────────────────

PROD_COMPOSE := docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.prod.yml
LOCAL_COMPOSE := $(PROD_COMPOSE) -f infrastructure/docker-compose.local.yml
PRIVATE_COMPOSE := docker compose --env-file infrastructure/.env.private -f infrastructure/docker-compose.prod.yml -f infrastructure/docker-compose.private.yml

deploy-build: ## Build production Docker images
	$(PROD_COMPOSE) build

deploy-up: ## Start production stack (requires .env in infrastructure/)
	$(PROD_COMPOSE) up -d

deploy-down: ## Stop production stack
	$(PROD_COMPOSE) down

deploy-logs: ## Tail production logs
	$(PROD_COMPOSE) logs -f

deploy-migrate: ## Run database migrations inside the API container
	$(PROD_COMPOSE) exec api node packages/db/dist/migrate.js

# ─── Local production preview (HTTP, no TLS) ────────────────────────

local-build: ## Build production Docker images for local preview
	$(PROD_COMPOSE) build

local-up: ## Start local production preview (HTTP on port 80)
	$(LOCAL_COMPOSE) up -d

local-down: ## Stop local production preview
	$(LOCAL_COMPOSE) down

local-logs: ## Tail local production preview logs
	$(LOCAL_COMPOSE) logs -f

local-migrate: ## Run migrations for local production preview
	$(LOCAL_COMPOSE) exec api node packages/db/dist/migrate.js

local-reset: ## Reset database for local production preview
	$(LOCAL_COMPOSE) exec postgres psql -U coopsource -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'coopsource' AND pid <> pg_backend_pid();" -c "DROP DATABASE IF EXISTS coopsource;" -c "CREATE DATABASE coopsource;"
	$(MAKE) local-migrate

# ─── Private network (self-hosted PLC + relay + PDS) ────────────────

private-build: ## Build images for private network
	$(PRIVATE_COMPOSE) build

private-up: ## Start private network stack (PLC, relay, PDS, Tap, AppView)
	$(PRIVATE_COMPOSE) up -d

private-down: ## Stop private network stack
	$(PRIVATE_COMPOSE) down

private-logs: ## Tail private network logs
	$(PRIVATE_COMPOSE) logs -f

private-migrate: ## Run migrations for private network
	$(PRIVATE_COMPOSE) exec api node packages/db/dist/migrate.js

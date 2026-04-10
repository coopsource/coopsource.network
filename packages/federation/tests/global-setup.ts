/**
 * Vitest global setup: ensure PDS + PLC Docker containers are running.
 *
 * If PDS_URL is already set (e.g., by make test:pds), uses those.
 * Otherwise, starts the Docker services automatically, waits for
 * health checks, and sets the env vars so no tests are skipped.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const COMPOSE_FILE = resolve(__dirname, '../../../infrastructure/docker-compose.yml');
const PDS_URL = 'http://localhost:2583';
const PLC_URL = 'http://localhost:2582';
const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

let startedByUs = false;

async function waitForHealth(url: string, label: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`${label} not healthy after ${MAX_WAIT_MS / 1000}s at ${url}`);
}

export async function setup(): Promise<void> {
  // If PDS_URL is already set, assume services are managed externally
  if (process.env.PDS_URL) return;

  // Check if PDS is already running
  try {
    const res = await fetch(`${PDS_URL}/xrpc/_health`);
    if (res.ok) {
      // PDS already running — just set env vars
      process.env.PDS_URL = PDS_URL;
      process.env.PLC_URL = PLC_URL;
      return;
    }
  } catch {
    // Not running — start it
  }

  console.log('[global-setup] Starting PDS + PLC Docker containers...');
  try {
    // Ensure plc_dev database exists (PLC needs it)
    execSync(
      `docker compose -f "${COMPOSE_FILE}" up -d postgres`,
      { stdio: 'pipe' },
    );
    // Wait for postgres
    await waitForHealth('http://localhost:5432', 'postgres').catch(() => {
      // pg doesn't have an HTTP health endpoint — just wait a bit
    });
    // Try to create plc_dev if it doesn't exist
    try {
      execSync(
        `docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U coopsource -d postgres -c "CREATE DATABASE plc_dev" 2>/dev/null`,
        { stdio: 'pipe' },
      );
    } catch {
      // Already exists — fine
    }

    execSync(
      `docker compose -f "${COMPOSE_FILE}" up -d plc pds`,
      { stdio: 'pipe' },
    );
    startedByUs = true;
  } catch (err) {
    console.error('[global-setup] Failed to start Docker containers:', err);
    throw new Error(
      'PDS + PLC Docker containers required for federation tests. ' +
      'Run: docker compose -f infrastructure/docker-compose.yml up -d plc pds',
    );
  }

  // Wait for PLC health
  console.log('[global-setup] Waiting for PLC to be healthy...');
  await waitForHealth(`${PLC_URL}/_health`, 'PLC');

  // Wait for PDS health
  console.log('[global-setup] Waiting for PDS to be healthy...');
  await waitForHealth(`${PDS_URL}/xrpc/_health`, 'PDS');

  console.log('[global-setup] PDS + PLC are healthy.');

  // Set env vars for tests
  process.env.PDS_URL = PDS_URL;
  process.env.PLC_URL = PLC_URL;
}

export async function teardown(): Promise<void> {
  // Only stop containers if we started them
  if (!startedByUs) return;

  console.log('[global-setup] Stopping PDS + PLC containers...');
  try {
    execSync(
      `docker compose -f "${COMPOSE_FILE}" stop plc pds`,
      { stdio: 'pipe' },
    );
  } catch {
    // Best-effort cleanup
  }
}

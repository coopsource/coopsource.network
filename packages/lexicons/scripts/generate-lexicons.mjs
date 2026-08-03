#!/usr/bin/env node
/**
 * Generates `src/generated/lexicons.ts` from the lexicon JSON documents.
 *
 * Why this wrapper exists
 * -----------------------
 * `lex-cli gen-ts-obj` multiplexes two unrelated things onto stdout:
 *
 *   1. the generated TypeScript module, and
 *   2. human-readable validation diagnostics ("Issues at /record/properties/...").
 *
 * It additionally reports `Invalid lexicon <path>` on stderr, exits 0 either way,
 * and silently OMITS every lexicon that failed validation from the module it emits.
 *
 * The previous script was:
 *
 *     lex-cli gen-ts-obj network/coopsource/**\/*.json > src/generated/lexicons.ts
 *
 * so a single failing lexicon prepended English prose to a .ts file, and dropped
 * that lexicon from the runtime array without a word. Both failures were silent.
 *
 * This wrapper closes both holes, for current AND future failing lexicons:
 *   - every diagnostic goes to stderr, never into the generated file;
 *   - the file is written only after the payload is PROVEN to be pure data
 *     (`JSON.parse` of the whole array literal), so prose cannot survive
 *     anywhere in the output, whatever future lex-cli decides to print;
 *   - dropped lexicons are named explicitly, with an emitted/expected count.
 *
 * Exit codes: 0 normally, 1 if the output was structurally unusable (nothing is
 * written in that case), or if `--strict` was passed and any lexicon failed.
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = join(PACKAGE_ROOT, 'src/generated/lexicons.ts');
const MODULE_PREFIX = 'export const lexicons = ';

/**
 * Which documents get compiled in.
 *
 * This is deliberately two levels deep, matching what the old `**` glob actually
 * expanded to under `sh` (POSIX `**` is not recursive, so it behaved as `*`).
 * The three-level `network/coopsource/org/spaceType/*.json` documents are
 * intentionally excluded: they use Proposal 0016's `"type": "space"`, which the
 * released lexicon tooling rejects. They are hand-exported from
 * `src/space-types.ts` instead — see the comment in `src/index.ts`.
 */
const INPUT_GLOB = 'network/coopsource/*/*.json';
const EXCLUDED_GLOB = 'network/coopsource/*/*/*.json';

const strict = process.argv.includes('--strict');

/** Resolve the locally installed lex-cli binary rather than going through npx. */
function resolveLexCli() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('@atproto/lex-cli/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const binField = manifest.bin;
  const binRelative = typeof binField === 'string' ? binField : Object.values(binField)[0];
  return resolve(dirname(manifestPath), binRelative);
}

// Sorted so the emitted order — and therefore the generated file — is stable
// across runs and across filesystems.
const inputs = globSync(INPUT_GLOB, { cwd: PACKAGE_ROOT }).sort();
if (inputs.length === 0) {
  console.error(`No lexicon documents matched ${INPUT_GLOB}`);
  process.exit(1);
}

const lexCli = resolveLexCli();
let stdout;
try {
  // stderr is inherited so lex-cli's own "Invalid lexicon <path>" lines reach the
  // terminal unchanged; only stdout is captured, because that is the stream that
  // must be split into diagnostics vs. generated code.
  stdout = execFileSync(process.execPath, [lexCli, 'gen-ts-obj', ...inputs], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch (cause) {
  console.error(`lex-cli failed (${cause.message}). ${OUTPUT_FILE} left untouched.`);
  process.exit(1);
}

// --- Split diagnostics from code -------------------------------------------
const markerIndex = stdout.indexOf(MODULE_PREFIX);
if (markerIndex === -1) {
  process.stderr.write(stdout);
  console.error(
    `\nlex-cli produced no generated module (expected a line starting with ` +
      `"${MODULE_PREFIX}"). ${OUTPUT_FILE} left untouched.`,
  );
  process.exit(1);
}

const diagnostics = stdout.slice(0, markerIndex);
const moduleSource = stdout.slice(markerIndex);
const payload = moduleSource.slice(MODULE_PREFIX.length);

// --- Prove the payload is pure data ----------------------------------------
// Any prose lex-cli injects — before, inside, or after the array — breaks this,
// so a clean parse is a structural guarantee that no diagnostic reached the file.
let parsed;
try {
  parsed = JSON.parse(payload.trim().replace(/;$/, ''));
} catch (cause) {
  process.stderr.write(diagnostics);
  console.error(
    `\nGenerated payload is not pure JSON data (${cause.message}). ` +
      `Refusing to write ${OUTPUT_FILE}.`,
  );
  process.exit(1);
}
if (!Array.isArray(parsed)) {
  console.error(`Generated payload is ${typeof parsed}, expected an array. Nothing written.`);
  process.exit(1);
}

// --- Report, loudly, on stderr ---------------------------------------------
if (diagnostics.trim()) {
  process.stderr.write(`lex-cli validation diagnostics:\n${diagnostics.trim()}\n\n`);
}

const emittedIds = new Set(parsed.map((doc) => doc.id));
const dropped = inputs.filter((file) => {
  const id = JSON.parse(readFileSync(join(PACKAGE_ROOT, file), 'utf8')).id;
  return !emittedIds.has(id);
});

if (dropped.length > 0) {
  console.error(
    `${dropped.length} lexicon(s) FAILED validation and were omitted from the generated module:`,
  );
  for (const file of dropped) console.error(`  - ${file}`);
  console.error('');
}

const excluded = globSync(EXCLUDED_GLOB, { cwd: PACKAGE_ROOT }).sort();
if (excluded.length > 0) {
  console.error(
    `Note: ${excluded.length} document(s) sit below ${INPUT_GLOB} and are not compiled in:`,
  );
  for (const file of excluded) console.error(`  - ${file}`);
  console.error('');
}

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, moduleSource);

console.error(
  `Wrote ${OUTPUT_FILE}: ${parsed.length} of ${inputs.length} lexicon(s) emitted.`,
);

if (strict && dropped.length > 0) {
  console.error('--strict: failing because some lexicons did not validate.');
  process.exit(1);
}

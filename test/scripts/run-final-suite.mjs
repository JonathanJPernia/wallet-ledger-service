#!/usr/bin/env node
/**
 * Evaluación final — orden fijo, falla si cualquier paso falla.
 * 1. financial-flow
 * 2. concurrency
 * 3. money-integrity
 * 4. pnl
 * 5. global conservation (assert examen)
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const steps = [
  { name: 'STEP 1 — financial-flow', file: 'test/e2e/financial-flow.spec.ts' },
  {
    name: 'STEP 2a — concurrency (misma idempotency key)',
    file: 'test/e2e/concurrency-caso-a.spec.ts',
  },
  {
    name: 'STEP 2b — concurrency (keys distintas)',
    file: 'test/e2e/concurrency-caso-b.spec.ts',
  },
  { name: 'STEP 3 — money-integrity', file: 'test/audit/money-integrity.spec.ts' },
  { name: 'STEP 4 — pnl', file: 'test/reporting/pnl.spec.ts' },
  {
    name: 'FINAL — global conservation',
    file: 'test/final/global-conservation.final.spec.ts',
  },
];

const env = {
  ...process.env,
  TEST_DB_AUTO_RESET: 'true',
  E2E_THROTTLE_LIMIT: process.env.E2E_THROTTLE_LIMIT ?? '100000',
};

let failed = false;

for (const step of steps) {
  console.log(`\n=== ${step.name} ===\n`);
  const result = spawnSync(
    'npx',
    ['jest', '--config', 'test/jest-final.json', '--runInBand', step.file],
    {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: false,
    },
  );

  if (result.status !== 0) {
    failed = true;
    console.error(`\n✗ ${step.name} failed (exit ${result.status ?? 1})\n`);
    break;
  }
  console.log(`\n✓ ${step.name} passed\n`);
  const pauseMs = Number(process.env.TEST_FINAL_STEP_PAUSE_MS ?? '8000');
  await new Promise((resolve) => setTimeout(resolve, pauseMs));
}

process.exit(failed ? 1 : 0);

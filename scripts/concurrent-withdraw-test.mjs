/**
 * FASE 2.7 — Concurrencia withdraw
 *
 * same-key: 1 withdraw real + replays (balance -AMOUNT)
 * unique:   N withdraws si hay fondos (balance -N*AMOUNT)
 * overdraft: intentar más del balance → 422
 *
 * WALLET_ID=... node scripts/concurrent-withdraw-test.mjs same-key
 * WALLET_ID=... node scripts/concurrent-withdraw-test.mjs unique
 * WALLET_ID=... node scripts/concurrent-withdraw-test.mjs overdraft
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const WALLET_ID = process.env.WALLET_ID;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 100);
const AMOUNT = Number(process.env.AMOUNT ?? 1);
const MODE = process.argv[2] ?? 'unique';

if (!WALLET_ID) {
  console.error('Set WALLET_ID');
  process.exit(1);
}

async function withdrawOnce(i, idemKey) {
  const res = await fetch(`${BASE}/wallets/${WALLET_ID}/withdraw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
    },
    body: JSON.stringify({ amount: AMOUNT, referenceId: `wd-${i}` }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const runId = Date.now();
const sharedKey = process.env.IDEMPOTENCY_KEY ?? `wd-same-${runId}`;

let results;
if (MODE === 'overdraft') {
  results = [
    await withdrawOnce(0, `wd-over-${runId}`),
    await withdrawOnce(1, `wd-over-${runId}-2`),
  ];
} else {
  results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      withdrawOnce(
        i,
        MODE === 'same-key' ? sharedKey : `wd-unique-${runId}-${i}`,
      ),
    ),
  );
}

const statuses = results.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});

const ok = results.find((r) => r.status === 201)?.body?.data;

console.log({
  MODE,
  CONCURRENCY: MODE === 'overdraft' ? 2 : CONCURRENCY,
  AMOUNT,
  statuses,
  sample: ok
    ? {
        balanceAfter: ok.balanceAfter,
        withdrawId: ok.withdrawId,
      }
    : results[0]?.body,
});

/**
 * Race test: N depósitos concurrentes de 1 USD con la MISMA idempotency key.
 * Esperado: 1 depósito real + replays cacheados (balance +1, no +N).
 *
 * Uso:
 *   WALLET_ID=uuid node scripts/concurrent-deposit-test.mjs
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const WALLET_ID = process.env.WALLET_ID;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 100);
const IDEM_KEY = process.env.IDEMPOTENCY_KEY ?? `concurrent-test-${Date.now()}`;

if (!WALLET_ID) {
  console.error('Set WALLET_ID env var');
  process.exit(1);
}

async function depositOnce(i) {
  const res = await fetch(`${BASE}/wallets/${WALLET_ID}/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': IDEM_KEY,
    },
    body: JSON.stringify({ amount: 1, referenceId: `load-${i}` }),
  });
  return { status: res.status, body: await res.json() };
}

const results = await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, i) => depositOnce(i)),
);

const statuses = results.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});

const lastOk = results.find((r) => r.status === 201)?.body?.data;

console.log({ CONCURRENCY, IDEM_KEY, statuses, finalBalance: lastOk?.balanceAfter });

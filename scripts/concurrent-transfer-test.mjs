/**
 * FASE 2.5 — Tests de concurrencia para transfer.
 *
 * Caso 1 — N transfers con keys distintas:
 *   FROM_WALLET_ID=... TO_WALLET_ID=... node scripts/concurrent-transfer-test.mjs unique
 *
 * Caso 2 — misma Idempotency-Key (1 transfer real, replays):
 *   FROM_WALLET_ID=... TO_WALLET_ID=... node scripts/concurrent-transfer-test.mjs same-key
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const FROM = process.env.FROM_WALLET_ID;
const TO = process.env.TO_WALLET_ID;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 100);
const AMOUNT = Number(process.env.AMOUNT ?? 1);
const MODE = process.argv[2] ?? 'unique';

if (!FROM || !TO) {
  console.error('Set FROM_WALLET_ID and TO_WALLET_ID');
  process.exit(1);
}

async function transferOnce(i, idemKey) {
  const res = await fetch(`${BASE}/wallets/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
    },
    body: JSON.stringify({
      fromWalletId: FROM,
      toWalletId: TO,
      amount: AMOUNT,
      referenceId: `xfer-${i}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const sharedKey = process.env.IDEMPOTENCY_KEY ?? `transfer-same-${Date.now()}`;
const runId = Date.now();

const results = await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, i) =>
    transferOnce(
      i,
      MODE === 'same-key' ? sharedKey : `transfer-unique-${runId}-${i}`,
    ),
  ),
);

const statuses = results.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});

const ok = results.filter((r) => r.status === 201);
const last = ok[ok.length - 1]?.body?.data;

console.log({
  MODE,
  CONCURRENCY,
  AMOUNT,
  statuses,
  successCount: ok.length,
  lastTransfer: last
    ? {
        transferId: last.transferId,
        fromBalanceAfter: last.fromBalanceAfter,
        toBalanceAfter: last.toBalanceAfter,
      }
    : null,
  hint:
    MODE === 'same-key'
      ? 'Esperado: replays 201, from -AMOUNT total, to +AMOUNT total'
      : 'Esperado: N x 201, from -N*AMOUNT, to +N*AMOUNT (si hay fondos)',
});

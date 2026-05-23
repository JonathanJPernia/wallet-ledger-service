import { apiData, newIdempotencyKey, type ApiCallResult } from '@/lib/api/client';
import type { DepositResult, TransferResult, Wallet, WithdrawResult } from '@/lib/api/types';
import type { StressAttempt } from './runner';

export type ScenarioContext = {
  walletId?: string;
  walletBId?: string;
  sharedKey?: string;
};

export type StressScenario = {
  id: string;
  title: string;
  description: string;
  defaultTotal: number;
  defaultConcurrency: number;
  defaultAmount: number;
  defaultDeposit: number;
  setup: () => Promise<{ context: ScenarioContext; log: string[] }>;
  runAttempt: (
    index: number,
    context: ScenarioContext,
    amount: number,
  ) => Promise<StressAttempt>;
  assert: (attempts: StressAttempt[], context: ScenarioContext) => string[];
};

async function createWallet(): Promise<ApiCallResult<Wallet>> {
  return apiData<Wallet>('/wallets', {
    method: 'POST',
    body: { currency: 'USD' },
  });
}

async function deposit(
  walletId: string,
  amount: number,
  key: string,
): Promise<ApiCallResult<DepositResult>> {
  return apiData<DepositResult>(`/wallets/${walletId}/deposit`, {
    method: 'POST',
    body: { amount },
    idempotencyKey: key,
  });
}

async function withdraw(
  walletId: string,
  amount: number,
  key: string,
): Promise<ApiCallResult<WithdrawResult>> {
  return apiData<WithdrawResult>(`/wallets/${walletId}/withdraw`, {
    method: 'POST',
    body: { amount },
    idempotencyKey: key,
  });
}

async function transfer(
  from: string,
  to: string,
  amount: number,
  key: string,
): Promise<ApiCallResult<TransferResult>> {
  return apiData<TransferResult>('/wallets/transfer', {
    method: 'POST',
    body: { fromWalletId: from, toWalletId: to, amount },
    idempotencyKey: key,
  });
}

function attemptFromApi(
  index: number,
  label: string,
  result: ApiCallResult<unknown>,
  summaryFn?: (data: unknown) => string,
): StressAttempt {
  return {
    index,
    label,
    ok: result.ok,
    status: result.status,
    durationMs: result.durationMs,
    error: result.error,
    payload: result.data,
    summary: result.data && summaryFn ? summaryFn(result.data) : undefined,
  };
}

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'caso-a-withdraw-same-key',
    title: 'CASO A — misma Idempotency-Key (withdraw)',
    description:
      'N requests paralelos con la misma key. Esperado: 1 withdraw real, mismos withdrawId/balanceAfter, todos 201.',
    defaultTotal: 20,
    defaultConcurrency: 5,
    defaultAmount: 50,
    defaultDeposit: 1000,
    async setup() {
      const log: string[] = [];
      const w = await createWallet();
      if (!w.ok || !w.data) {
        throw new Error(w.error ?? 'create wallet failed');
      }
      log.push(`wallet ${w.data.id}`);
      const depKey = newIdempotencyKey('stress-dep');
      const dep = await deposit(w.data.id, 1000, depKey);
      if (!dep.ok) {
        throw new Error(dep.error ?? 'deposit failed');
      }
      log.push(`deposit 1000 → balance ${dep.data?.balanceAfter}`);
      return { context: { walletId: w.data.id, sharedKey: newIdempotencyKey('stress-wd-same') }, log };
    },
    async runAttempt(index, ctx, amount) {
      const key = ctx.sharedKey!;
      const result = await withdraw(ctx.walletId!, amount, key);
      return attemptFromApi(index, 'withdraw', result, (d) => {
        const w = d as WithdrawResult;
        return `withdrawId=${w.withdrawId} balanceAfter=${w.balanceAfter}`;
      });
    },
    assert(attempts) {
      const oks = attempts.filter((a) => a.ok);
      const withdrawIds = new Set(
        oks.map((a) => (a.payload as WithdrawResult)?.withdrawId).filter(Boolean),
      );
      const balances = new Set(
        oks.map((a) => (a.payload as WithdrawResult)?.balanceAfter).filter(Boolean),
      );
      const notes: string[] = [];
      notes.push(`${oks.length}/${attempts.length} HTTP 201`);
      notes.push(
        withdrawIds.size === 1
          ? 'PASS: single withdrawId'
          : `FAIL: ${withdrawIds.size} distinct withdrawIds`,
      );
      notes.push(
        balances.size <= 1
          ? 'PASS: consistent balanceAfter'
          : `FAIL: multiple balanceAfter values`,
      );
      return notes;
    },
  },
  {
    id: 'caso-b-withdraw-distinct-keys',
    title: 'CASO B — keys distintas (withdraw $1)',
    description:
      'N withdraws en paralelo con keys únicas. Esperado: sin 500, balances coherentes, ≤ fondos disponibles.',
    defaultTotal: 20,
    defaultConcurrency: 8,
    defaultAmount: 1,
    defaultDeposit: 500,
    async setup() {
      const log: string[] = [];
      const w = await createWallet();
      if (!w.ok || !w.data) {
        throw new Error(w.error ?? 'create wallet failed');
      }
      await deposit(w.data.id, 500, newIdempotencyKey('stress-dep-b'));
      log.push(`wallet ${w.data.id} funded 500`);
      return { context: { walletId: w.data.id }, log };
    },
    async runAttempt(index, ctx, amount) {
      const key = newIdempotencyKey(`wd-${index}`);
      const result = await withdraw(ctx.walletId!, amount, key);
      return attemptFromApi(index, key, result, (d) => {
        const w = d as WithdrawResult;
        return `balanceAfter=${w.balanceAfter}`;
      });
    },
    assert(attempts) {
      const allowed = new Set([201, 409, 422, 503]);
      const bad = attempts.filter((a) => !allowed.has(a.status));
      return [
        bad.length === 0 ? 'PASS: no unexpected status' : `FAIL: ${bad.length} bad statuses`,
        `${attempts.filter((a) => a.ok).length} completed 201`,
      ];
    },
  },
  {
    id: 'duplicate-100-20',
    title: 'Clásico — $100, withdraw $20 ×2 misma key',
    description: '2 withdraws paralelos misma key. Esperado: un solo débito (~$20.10 con fee).',
    defaultTotal: 2,
    defaultConcurrency: 2,
    defaultAmount: 20,
    defaultDeposit: 100,
    async setup() {
      const w = await createWallet();
      if (!w.ok || !w.data) {
        throw new Error('wallet failed');
      }
      await deposit(w.data.id, 100, newIdempotencyKey('dup-dep'));
      return {
        context: { walletId: w.data.id, sharedKey: newIdempotencyKey('dup-wd') },
        log: [`wallet ${w.data.id}`],
      };
    },
    async runAttempt(index, ctx, amount) {
      const result = await withdraw(ctx.walletId!, amount, ctx.sharedKey!);
      return attemptFromApi(index, `parallel-${index}`, result, (d) => {
        const w = d as WithdrawResult;
        return `balanceAfter=${w.balanceAfter}`;
      });
    },
    assert(attempts) {
      const oks = attempts.filter((a) => a.ok) as StressAttempt[];
      const balances = new Set(
        oks.map((a) => (a.payload as WithdrawResult)?.balanceAfter),
      );
      return [
        oks.length === 2 ? 'PASS: both 201' : `WARN: ${oks.length}/2 success`,
        balances.size === 1 ? 'PASS: same balanceAfter' : 'FAIL: different balances',
      ];
    },
  },
  {
    id: 'transfer-same-key',
    title: 'Transfer — misma Idempotency-Key',
    description: 'N transfers paralelos misma key entre 2 wallets.',
    defaultTotal: 15,
    defaultConcurrency: 5,
    defaultAmount: 30,
    defaultDeposit: 1000,
    async setup() {
      const a = await createWallet();
      const b = await createWallet();
      if (!a.data || !b.data) {
        throw new Error('wallets failed');
      }
      await deposit(a.data.id, 1000, newIdempotencyKey('tr-dep'));
      return {
        context: {
          walletId: a.data.id,
          walletBId: b.data.id,
          sharedKey: newIdempotencyKey('stress-tr-same'),
        },
        log: [`from ${a.data.id}`, `to ${b.data.id}`],
      };
    },
    async runAttempt(index, ctx, amount) {
      const result = await transfer(
        ctx.walletId!,
        ctx.walletBId!,
        amount,
        ctx.sharedKey!,
      );
      return attemptFromApi(index, 'transfer', result, (d) => {
        const t = d as TransferResult;
        return `transferId=${t.transferId}`;
      });
    },
    assert(attempts) {
      const ids = new Set(
        attempts
          .filter((a) => a.ok)
          .map((a) => (a.payload as TransferResult)?.transferId),
      );
      return [
        `${attempts.filter((a) => a.ok).length}/${attempts.length} OK`,
        ids.size === 1 ? 'PASS: single transferId' : `FAIL: ${ids.size} transferIds`,
      ];
    },
  },
];

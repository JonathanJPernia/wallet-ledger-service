export type StressRequest = {
  label: string;
  execute: (index: number) => Promise<StressAttempt>;
};

export type StressAttempt = {
  index: number;
  label: string;
  ok: boolean;
  status: number;
  durationMs: number;
  error?: string;
  summary?: string;
  payload?: unknown;
};

export type StressRunOptions = {
  total: number;
  concurrency: number;
  warmupMs?: number;
  onProgress?: (completed: number, total: number) => void;
};

export type StressRunResult = {
  attempts: StressAttempt[];
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  successCount: number;
  errorCount: number;
  statusHistogram: Record<number, number>;
};

export async function runWithConcurrency(
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<StressAttempt>,
  onProgress?: (completed: number, total: number) => void,
): Promise<StressAttempt[]> {
  const results: StressAttempt[] = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  async function poolWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) {
        return;
      }
      results[index] = await worker(index);
      completed += 1;
      onProgress?.(completed, total);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, total)) },
    () => poolWorker(),
  );
  await Promise.all(workers);
  return results;
}

export async function runStress(
  request: StressRequest,
  options: StressRunOptions,
): Promise<StressRunResult> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  if (options.warmupMs) {
    await sleep(options.warmupMs);
  }

  const attempts = await runWithConcurrency(
    options.total,
    options.concurrency,
    (index) => request.execute(index),
    options.onProgress,
  );

  const statusHistogram: Record<number, number> = {};
  let successCount = 0;

  for (const attempt of attempts) {
    statusHistogram[attempt.status] = (statusHistogram[attempt.status] ?? 0) + 1;
    if (attempt.ok) {
      successCount += 1;
    }
  }

  return {
    attempts,
    startedAt,
    finishedAt: new Date().toISOString(),
    totalMs: Math.round(performance.now() - t0),
    successCount,
    errorCount: options.total - successCount,
    statusHistogram,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function summarizeWithdrawIds(attempts: StressAttempt[]): {
  uniqueWithdrawIds: number;
  uniqueBalanceAfter: number;
} {
  const withdrawIds = new Set<string>();
  const balances = new Set<string>();

  for (const attempt of attempts) {
    if (!attempt.ok || !attempt.payload) {
      continue;
    }
    const p = attempt.payload as { withdrawId?: string; balanceAfter?: string };
    if (p.withdrawId) {
      withdrawIds.add(p.withdrawId);
    }
    if (p.balanceAfter) {
      balances.add(p.balanceAfter);
    }
  }

  return {
    uniqueWithdrawIds: withdrawIds.size,
    uniqueBalanceAfter: balances.size,
  };
}

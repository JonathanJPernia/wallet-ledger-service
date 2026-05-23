/**
 * Ejecuta N tareas async con tope de concurrencia (evita ECONNRESET / pool Prisma agotado).
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = items.length;
  if (size === 0) {
    return [];
  }

  const concurrency = Math.max(1, Math.min(limit, size));
  const results = new Array<R>(size);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= size) {
        return;
      }
      try {
        results[index] = await fn(items[index]!, index);
      } catch (error) {
        if (!isRetryableSupertestError(error)) {
          throw error;
        }
        let lastError: unknown = error;
        for (let attempt = 2; attempt <= 10; attempt++) {
          await sleep(120 * attempt);
          try {
            results[index] = await fn(items[index]!, index);
            lastError = undefined;
            break;
          } catch (retryError) {
            lastError = retryError;
            if (!isRetryableSupertestError(retryError)) {
              throw retryError;
            }
          }
        }
        if (lastError) {
          throw lastError;
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  return results;
}

export function e2eHttpConcurrencyLimit(): number {
  const raw = process.env.E2E_HTTP_CONCURRENCY ?? '8';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

/** Ejecuta N items en oleadas (75 totales, pico de concurrencia acotado). */
export async function mapInWaves<T, R>(
  items: readonly T[],
  waveSize: number,
  concurrency: number,
  pauseMs: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < items.length; offset += waveSize) {
    const slice = items.slice(offset, offset + waveSize);
    const wave = await mapWithConcurrencyLimit(slice, concurrency, (item, index) =>
      fn(item, offset + index),
    );
    results.push(...wave);
    if (offset + waveSize < items.length && pauseMs > 0) {
      await sleep(pauseMs);
    }
  }
  return results;
}

export function isRetryableSupertestError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message.toLowerCase();
  return (
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused')
  );
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import type { Prisma } from '@prisma/client';

const ALLOWED_LEVELS = new Set<Prisma.LogLevel>([
  'query',
  'info',
  'warn',
  'error',
]);

/**
 * Prisma log levels from env (production observability).
 *
 * - `PRISMA_LOG=query,info,warn,error` — explicit list (initial prod audit)
 * - `PRISMA_LOG_QUERY=true` — append query logging
 * - Default production: warn + error only (drop query after stabilizing)
 */
export function resolvePrismaLogLevels(): Prisma.LogLevel[] {
  const explicit = process.env.PRISMA_LOG?.split(',')
    .map((s) => s.trim())
    .filter((s): s is Prisma.LogLevel => ALLOWED_LEVELS.has(s as Prisma.LogLevel));

  if (explicit?.length) {
    return explicit;
  }

  const levels: Prisma.LogLevel[] = ['warn', 'error'];

  if (process.env.PRISMA_LOG_INFO === 'true') {
    levels.unshift('info');
  }

  if (process.env.PRISMA_LOG_QUERY === 'true') {
    levels.unshift('query');
  }

  return levels;
}

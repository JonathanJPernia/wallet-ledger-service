/**
 * Entorno compartido para suite final y E2E de evaluación.
 * - Rate limit alto (e2e-env)
 * - Timeout Jest consistente
 * - Reset automático de tablas financieras
 */
import '../e2e/e2e-env';

process.env.TEST_DB_AUTO_RESET = process.env.TEST_DB_AUTO_RESET ?? 'true';
process.env.E2E_THROTTLE_LIMIT = process.env.E2E_THROTTLE_LIMIT ?? '100000';
process.env.E2E_DISABLE_CRONS = 'true';
process.env.E2E_HTTP_CONCURRENCY = process.env.E2E_HTTP_CONCURRENCY ?? '8';
process.env.E2E_SERIALIZABLE_MAX_RETRIES =
  process.env.E2E_SERIALIZABLE_MAX_RETRIES ?? '6';
process.env.E2E_SERIALIZABLE_MAX_WAIT =
  process.env.E2E_SERIALIZABLE_MAX_WAIT ?? '8000';
process.env.E2E_SERIALIZABLE_TIMEOUT =
  process.env.E2E_SERIALIZABLE_TIMEOUT ?? '12000';

function withTestDatabasePool(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set(
        'connection_limit',
        process.env.E2E_DB_CONNECTION_LIMIT ?? '50',
      );
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '30');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = withTestDatabasePool(process.env.DATABASE_URL);
}

jest.setTimeout(180_000);

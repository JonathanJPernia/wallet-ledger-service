import { Prisma, PrismaClient, WalletKind } from '@prisma/client';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

type PrismaLike = PrismaService | PrismaClient;

const TRUNCATE_TABLES = [
  'financial_event_dlq',
  'financial_event_outbox',
  'financial_events',
  'audit_log',
  'wallet_circuit_breakers',
  'mv_refresh_watermarks',
  'mv_daily_wallet_balance',
  'mv_daily_fee_revenue',
  'mv_daily_system_volume',
  'financial_snapshots',
  'idempotency_keys',
  'ledger_entries',
  'transaction_groups',
] as const;

function assertSafeToReset(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.trim()) {
    throw new Error(
      'DATABASE_URL is required for financial test DB reset (see .env.example)',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset financial tables when NODE_ENV=production');
  }
}

/**
 * Trunca tablas financieras, elimina wallets USER y deja SYSTEM_FEE en cero.
 * Idempotente; seguro para CI y `npm run test:final` (cada paso).
 */
export async function resetFinancialTestDatabase(
  prisma: PrismaLike,
): Promise<void> {
  assertSafeToReset();

  const tables = TRUNCATE_TABLES.join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  );

  await prisma.$executeRaw`
    DELETE FROM wallets WHERE kind = ${WalletKind.USER}::"WalletKind"
  `;

  await prisma.$executeRaw`
    UPDATE wallets
    SET "currentBalance" = 0,
        version = 1,
        status = 'ACTIVE'::"WalletStatus",
        "updatedAt" = NOW()
    WHERE kind = ${WalletKind.SYSTEM_FEE}::"WalletKind"
  `;

  await ensureSystemFeeWallet(prisma, 'USD');

  if (typeof (prisma as PrismaClient).$connect === 'function') {
    await (prisma as PrismaClient).$connect();
  }
  await prisma.$queryRaw`SELECT 1`;
}

async function ensureSystemFeeWallet(
  prisma: PrismaLike,
  currency: string,
): Promise<void> {
  const existing = await prisma.wallet.findFirst({
    where: { kind: WalletKind.SYSTEM_FEE, currency },
  });
  if (existing) {
    return;
  }

  await prisma.wallet.create({
    data: {
      kind: WalletKind.SYSTEM_FEE,
      currency,
      currentBalance: new Prisma.Decimal(0),
      status: 'ACTIVE',
    },
  });
}

/**
 * Reset cuando TEST_DB_AUTO_RESET=true.
 * Usa un PrismaClient propio y lo desconecta para no tumbar el engine del app Nest.
 */
export async function maybeResetFinancialTestDatabase(): Promise<void> {
  if (process.env.TEST_DB_AUTO_RESET !== 'true') {
    return;
  }

  const client = new PrismaClient();
  try {
    await resetFinancialTestDatabase(client);
  } finally {
    await client.$disconnect();
  }
}

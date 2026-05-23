import { Prisma, WalletKind } from '@prisma/client';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ledgerSignedAmountExpression } from '../../src/modules/reconciliation/repositories/ledger-signed-amount.sql';

export type GlobalMoneySnapshot = {
  /** SUM(currentBalance) todas las wallets (incluye SYSTEM_FEE). */
  totalProjection: Prisma.Decimal;
  /** SUM(signed amount) sobre todo el ledger. */
  totalLedgerSigned: Prisma.Decimal;
  /** SUM proyección wallets USER. */
  userWalletsProjection: Prisma.Decimal;
  /** Proyección wallet SYSTEM_FEE (USD). */
  systemFeeProjection: Prisma.Decimal;
  totalFeeIn: Prisma.Decimal;
  totalFeeOut: Prisma.Decimal;
  drift: Prisma.Decimal;
};

export async function captureGlobalMoneySnapshot(
  prisma: PrismaService,
): Promise<GlobalMoneySnapshot> {
  const signedAmount = ledgerSignedAmountExpression();

  const [projectionRows, ledgerRows, feeRows] = await Promise.all([
    prisma.$queryRaw<
      {
        total: Prisma.Decimal;
        userTotal: Prisma.Decimal;
        systemFeeTotal: Prisma.Decimal;
      }[]
    >`
      SELECT
        COALESCE(SUM("currentBalance"), 0)::decimal(18, 2) AS total,
        COALESCE(SUM(CASE WHEN kind = 'USER'::"WalletKind" THEN "currentBalance" ELSE 0 END), 0)::decimal(18, 2) AS "userTotal",
        COALESCE(SUM(CASE WHEN kind = 'SYSTEM_FEE'::"WalletKind" THEN "currentBalance" ELSE 0 END), 0)::decimal(18, 2) AS "systemFeeTotal"
      FROM wallets
    `,
    prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(${signedAmount}), 0)::decimal(18, 2) AS total
      FROM ledger_entries
    `,
    prisma.$queryRaw<
      { feeIn: Prisma.Decimal; feeOut: Prisma.Decimal }[]
    >`
      SELECT
        COALESCE(SUM(CASE WHEN "operationType" = 'FEE_IN'::"OperationType" THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "feeIn",
        COALESCE(SUM(CASE WHEN "operationType" = 'FEE_OUT'::"OperationType" THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "feeOut"
      FROM ledger_entries
    `,
  ]);

  const totalProjection = new Prisma.Decimal(projectionRows[0]?.total ?? 0);
  const totalLedgerSigned = new Prisma.Decimal(ledgerRows[0]?.total ?? 0);

  return {
    totalProjection,
    totalLedgerSigned,
    userWalletsProjection: new Prisma.Decimal(projectionRows[0]?.userTotal ?? 0),
    systemFeeProjection: new Prisma.Decimal(
      projectionRows[0]?.systemFeeTotal ?? 0,
    ),
    totalFeeIn: new Prisma.Decimal(feeRows[0]?.feeIn ?? 0),
    totalFeeOut: new Prisma.Decimal(feeRows[0]?.feeOut ?? 0),
    drift: totalProjection.sub(totalLedgerSigned),
  };
}

export async function findSystemFeeWallet(
  prisma: PrismaService,
  currency = 'USD',
) {
  return prisma.wallet.findFirst({
    where: { kind: WalletKind.SYSTEM_FEE, currency },
  });
}

export async function listWalletIdsWithLedgerActivity(
  prisma: PrismaService,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ walletId: string }[]>`
    SELECT DISTINCT "walletId" FROM ledger_entries ORDER BY "walletId"
  `;
  return rows.map((r) => r.walletId);
}

export function assertMoneyEquality(
  label: string,
  left: Prisma.Decimal,
  right: Prisma.Decimal,
): void {
  expect(left.toFixed(2)).toBe(right.toFixed(2));
}

export function assertZeroDrift(
  label: string,
  snapshot: GlobalMoneySnapshot,
): void {
  expect(snapshot.drift.abs().toFixed(2)).toBe('0.00');
  assertMoneyEquality(
    `${label}: projection vs ledger`,
    snapshot.totalProjection,
    snapshot.totalLedgerSigned,
  );
}

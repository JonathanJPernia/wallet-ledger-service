/**
 * Assert final de examen — cierre explícito de la evaluación.
 * SUM(wallets.currentBalance) === SUM(ledger signed amount) a nivel global.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  assertZeroDrift,
  captureGlobalMoneySnapshot,
} from '../audit/money-integrity-audit.util';
import { maybeResetFinancialTestDatabase } from '../support/test-db-bootstrap';

describe('FINAL — global money conservation (exam closure)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await maybeResetFinancialTestDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('SUM(wallets.currentBalance) === SUM(ledger signed amount) globally', async () => {
    const snapshot = await captureGlobalMoneySnapshot(prisma);

    expect(snapshot.totalProjection.toFixed(2)).toBe(
      snapshot.totalLedgerSigned.toFixed(2),
    );
    expect(snapshot.drift.abs().toFixed(2)).toBe('0.00');

    assertZeroDrift(
      'FINAL EXAM: SUM(wallets) === SUM(ledger signed)',
      snapshot,
    );
  });
});

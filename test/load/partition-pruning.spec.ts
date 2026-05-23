const RUN_LOAD =
  process.env.RUN_LOAD_TESTS === 'true' && !!process.env.DATABASE_URL;

const describeLoad = RUN_LOAD ? describe : describe.skip;

describeLoad('load: partition pruning', () => {
  it('EXPLAIN plan references partition scan for bounded createdAt', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const wallet = await prisma.wallet.findFirst();
      if (!wallet) {
        return;
      }

      const start = new Date();
      start.setUTCMonth(start.getUTCMonth() - 1);
      const end = new Date();

      const rows = await prisma.$queryRaw<{ plan: string }[]>`
        EXPLAIN (FORMAT TEXT)
        SELECT COUNT(*)::int
        FROM ledger_entries
        WHERE "walletId" = ${wallet.id}
          AND "createdAt" >= ${start}
          AND "createdAt" < ${end}
      `;

      const plan = rows.map((r) => r.plan).join('\n').toLowerCase();
      expect(
        plan.includes('partition') ||
          plan.includes('ledger_entries_'),
      ).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });
});

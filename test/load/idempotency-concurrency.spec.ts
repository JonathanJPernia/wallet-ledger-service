import { Prisma } from '@prisma/client';

const RUN_LOAD =
  process.env.RUN_LOAD_TESTS === 'true' && !!process.env.DATABASE_URL;

const describeLoad = RUN_LOAD ? describe : describe.skip;

/**
 * Soak test de idempotencia concurrente (mismo key, mismo payload).
 * Activar: RUN_LOAD_TESTS=true npm run test:load
 */
describeLoad('load: idempotency concurrency', () => {
  const concurrency = 8;
  const amount = '1.00';

  it('parallel deposit attempts share one idempotency outcome', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const wallet = await prisma.wallet.create({
        data: {
          currentBalance: new Prisma.Decimal(1000),
          currency: 'USD',
        },
      });

      const idempotencyKey = `load-${Date.now()}-${Math.random()}`;

      const results = await Promise.allSettled(
        Array.from({ length: concurrency }, () =>
          fetch('http://localhost:3000/api/wallets/' + wallet.id + '/deposit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({ amount }),
          }).then((r) => r.json()),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(0);

      const keys = await prisma.idempotencyKey.findMany({
        where: { key: idempotencyKey },
      });
      expect(keys.length).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);
});

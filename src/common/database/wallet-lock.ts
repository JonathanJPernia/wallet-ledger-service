import { Prisma } from '@prisma/client';
import type { WalletStatus } from '@prisma/client';
import { WalletNotFoundException } from '../errors/financial.exceptions';
export type LockedWalletRow = {
  id: string;
  currentBalance: Prisma.Decimal;
  currency: string;
  status: WalletStatus;
  version: number;
};

/**
 * Lock pessimista — Prisma no expone FOR UPDATE en findUnique.
 * Usar lockWalletsForUpdateInOrder cuando hay más de una wallet (transfers).
 */
export async function lockWalletForUpdate(
  tx: Prisma.TransactionClient,
  walletId: string,
): Promise<LockedWalletRow> {
  const [wallet] = await lockWalletsForUpdateInOrder(tx, [walletId]);
  return wallet;
}

/**
 * Bloquea wallets en orden UUID asc (paso 2 del lock order global).
 */
export async function lockWalletsForUpdateInOrder(
  tx: Prisma.TransactionClient,
  walletIds: string[],
): Promise<LockedWalletRow[]> {
  const sortedIds = [...new Set(walletIds)].sort();
  if (sortedIds.length === 0) {
    return [];
  }

  const locked: LockedWalletRow[] = [];
  for (const walletId of sortedIds) {
    const rows = await tx.$queryRaw<LockedWalletRow[]>`
      SELECT
        id,
        "currentBalance",
        currency,
        status,
        version
      FROM wallets
      WHERE id = ${walletId}
      FOR UPDATE
    `;

    const wallet = rows[0];
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }

    locked.push({
      ...wallet,
      currentBalance: new Prisma.Decimal(wallet.currentBalance),
    });
  }

  return locked;
}

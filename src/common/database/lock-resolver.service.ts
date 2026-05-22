import { Injectable } from '@nestjs/common';

/**
 * Orden determinista de wallets para FOR UPDATE (paso 2 del lock order global).
 * Centraliza expansión del lock set (fee wallet, splits futuros, affiliates).
 */
@Injectable()
export class LockResolverService {
  /**
   * UUID asc, sin duplicados. Filtra null/undefined/vacío.
   */
  resolveOrderedWalletIds(
    ...candidates: Array<string | null | undefined>
  ): string[] {
    const ids = candidates.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    return [...new Set(ids)].sort();
  }

  resolveTransferLockSet(
    fromWalletId: string,
    toWalletId: string,
    systemFeeWalletId: string,
  ): string[] {
    return this.resolveOrderedWalletIds(
      fromWalletId,
      toWalletId,
      systemFeeWalletId,
    );
  }

  resolveWithdrawLockSet(
    payerWalletId: string,
    systemFeeWalletId: string,
  ): string[] {
    return this.resolveOrderedWalletIds(payerWalletId, systemFeeWalletId);
  }
}

/** Pure helper para módulos sin DI (wallet-lock). */
export function resolveOrderedWalletIds(
  ...candidates: Array<string | null | undefined>
): string[] {
  const ids = candidates.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  return [...new Set(ids)].sort();
}

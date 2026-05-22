import { Prisma } from '@prisma/client';
import type { TransferResponseDto } from '../../modules/wallets/dto/transfer-response.dto';
import type { WithdrawResponseDto } from '../../modules/wallets/dto/withdraw-response.dto';

const MONEY_STRING = /^\d+\.\d{2}$/;

function isMoneyString(v: unknown): v is string {
  return typeof v === 'string' && MONEY_STRING.test(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function isValidTransferResponse(body: unknown): body is TransferResponseDto {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const o = body as Record<string, unknown>;
  return (
    isNonEmptyString(o.transferId) &&
    isNonEmptyString(o.fromWalletId) &&
    isNonEmptyString(o.toWalletId) &&
    isMoneyString(o.amount) &&
    isMoneyString(o.baseAmount) &&
    isMoneyString(o.feeAmount) &&
    isMoneyString(o.totalDeducted) &&
    isMoneyString(o.fromBalanceBefore) &&
    isMoneyString(o.fromBalanceAfter) &&
    isMoneyString(o.toBalanceBefore) &&
    isMoneyString(o.toBalanceAfter) &&
    o.status === 'COMPLETED'
  );
}

export function isValidWithdrawResponse(body: unknown): body is WithdrawResponseDto {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const o = body as Record<string, unknown>;
  return (
    isNonEmptyString(o.withdrawId) &&
    isNonEmptyString(o.ledgerEntryId) &&
    isNonEmptyString(o.walletId) &&
    isNonEmptyString(o.currency) &&
    isMoneyString(o.amount) &&
    isMoneyString(o.baseAmount) &&
    isMoneyString(o.feeAmount) &&
    isMoneyString(o.totalDeducted) &&
    isMoneyString(o.balanceBefore) &&
    isMoneyString(o.balanceAfter) &&
    o.status === 'COMPLETED'
  );
}

export function assertValidTransferResponseForPersist(
  response: TransferResponseDto,
): void {
  if (!isValidTransferResponse(response)) {
    throw new Error(
      'Transfer response failed idempotency persist validation (invariant)',
    );
  }
}

export function assertValidWithdrawResponseForPersist(
  response: WithdrawResponseDto,
): void {
  if (!isValidWithdrawResponse(response)) {
    throw new Error(
      'Withdraw response failed idempotency persist validation (invariant)',
    );
  }
}

type LedgerSnap = {
  walletId: string;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
};

async function ledgerSnapshotsByWallet(
  tx: Prisma.TransactionClient,
  transactionGroupId: string,
): Promise<Map<string, LedgerSnap>> {
  const entries = await tx.ledgerEntry.findMany({
    where: { transactionGroupId },
    orderBy: { createdAt: 'asc' },
    select: {
      walletId: true,
      balanceBefore: true,
      balanceAfter: true,
    },
  });

  const map = new Map<string, LedgerSnap>();
  for (const e of entries) {
    map.set(e.walletId, {
      walletId: e.walletId,
      balanceBefore: new Prisma.Decimal(e.balanceBefore),
      balanceAfter: new Prisma.Decimal(e.balanceAfter),
    });
  }
  return map;
}

function metadataString(
  metadata: unknown,
  key: string,
): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Reconstruye respuesta desde ledger + metadata del group si responseBody corrupto.
 * Dinero ya está en ledger; esto solo restaura snapshot UX/audit.
 */
export async function rebuildTransferResponseFromLedger(
  tx: Prisma.TransactionClient,
  transactionGroupId: string,
  idempotencyKey: string,
): Promise<TransferResponseDto | null> {
  const group = await tx.transactionGroup.findUnique({
    where: { id: transactionGroupId },
    select: { metadata: true },
  });
  if (!group) {
    return null;
  }

  const fromWalletId = metadataString(group.metadata, 'fromWalletId');
  const toWalletId = metadataString(group.metadata, 'toWalletId');
  const baseAmount = metadataString(group.metadata, 'baseAmount');
  const feeAmount = metadataString(group.metadata, 'feeAmount');
  const totalDeducted = metadataString(group.metadata, 'totalDeducted');
  const feeWalletId = metadataString(group.metadata, 'feeWalletId');

  if (!fromWalletId || !toWalletId || !baseAmount || !feeAmount || !totalDeducted) {
    return null;
  }

  const snaps = await ledgerSnapshotsByWallet(tx, transactionGroupId);
  const fromSnap = snaps.get(fromWalletId);
  const toSnap = snaps.get(toWalletId);
  const feeSnap = feeWalletId ? snaps.get(feeWalletId) : undefined;

  if (!fromSnap || !toSnap) {
    return null;
  }

  const response: TransferResponseDto = {
    transferId: transactionGroupId,
    fromWalletId,
    toWalletId,
    amount: baseAmount,
    baseAmount,
    feeAmount,
    totalDeducted,
    fromBalanceBefore: fromSnap.balanceBefore.toFixed(2),
    fromBalanceAfter: fromSnap.balanceAfter.toFixed(2),
    toBalanceBefore: toSnap.balanceBefore.toFixed(2),
    toBalanceAfter: toSnap.balanceAfter.toFixed(2),
    status: 'COMPLETED',
    idempotencyKey,
  };

  if (feeSnap) {
    response.systemFeeWalletBalanceAfter = feeSnap.balanceAfter.toFixed(2);
  }

  return isValidTransferResponse(response) ? response : null;
}

export async function rebuildWithdrawResponseFromLedger(
  tx: Prisma.TransactionClient,
  transactionGroupId: string,
  idempotencyKey: string,
): Promise<WithdrawResponseDto | null> {
  const group = await tx.transactionGroup.findUnique({
    where: { id: transactionGroupId },
    select: { metadata: true },
  });
  if (!group) {
    return null;
  }

  const baseAmount = metadataString(group.metadata, 'baseAmount');
  const feeAmount = metadataString(group.metadata, 'feeAmount');
  const totalDeducted = metadataString(group.metadata, 'totalDeducted');
  const feeWalletId = metadataString(group.metadata, 'feeWalletId');

  if (!baseAmount || !feeAmount || !totalDeducted) {
    return null;
  }

  const entries = await tx.ledgerEntry.findMany({
    where: { transactionGroupId },
    orderBy: { createdAt: 'asc' },
  });

  const withdrawEntry = entries.find((e) => e.operationType === 'WITHDRAW');
  if (!withdrawEntry) {
    return null;
  }

  const snaps = await ledgerSnapshotsByWallet(tx, transactionGroupId);
  const walletSnap = snaps.get(withdrawEntry.walletId);
  const feeSnap = feeWalletId ? snaps.get(feeWalletId) : undefined;

  if (!walletSnap) {
    return null;
  }

  const response: WithdrawResponseDto = {
    withdrawId: transactionGroupId,
    ledgerEntryId: withdrawEntry.id,
    walletId: withdrawEntry.walletId,
    currency: withdrawEntry.currency,
    amount: baseAmount,
    baseAmount,
    feeAmount,
    totalDeducted,
    balanceBefore: walletSnap.balanceBefore.toFixed(2),
    balanceAfter: walletSnap.balanceAfter.toFixed(2),
    status: 'COMPLETED',
    idempotencyKey,
  };

  if (feeSnap) {
    response.systemFeeWalletBalanceAfter = feeSnap.balanceAfter.toFixed(2);
  }

  return isValidWithdrawResponse(response) ? response : null;
}

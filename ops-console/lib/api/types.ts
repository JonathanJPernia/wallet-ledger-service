export type ApiEnvelope<T> = {
  data: T;
  meta: { timestamp: string };
};

export type HealthResponse = {
  status: 'ok' | 'error';
  service: string;
  version: string;
  buildSha: string | null;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  database: { status: 'up' | 'down'; latencyMs?: number };
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
};

export type Wallet = {
  id: string;
  currency: string;
  currentBalance: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type WalletDetail = Wallet & {
  ledgerBalance: string;
  isConsistent: boolean;
};

export type WalletMovement = {
  id: string;
  operationType: string;
  amount: string;
  signedAmount: string;
  currency: string;
  balanceBefore: string;
  balanceAfter: string;
  transactionGroupId?: string | null;
  correlationId?: string | null;
  createdAt: string;
};

export type WalletMovementsList = {
  walletId: string;
  movements: WalletMovement[];
  count: number;
  hasMore: boolean;
  nextCursor?: string;
};

export type DepositResult = {
  transactionGroupId: string;
  ledgerEntryId: string;
  walletId: string;
  currency: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  status: string;
  idempotencyKey: string;
};

export type TransferResult = {
  transferId: string;
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  feeAmount: string;
  totalDeducted: string;
  fromBalanceAfter: string;
  toBalanceAfter: string;
  status: string;
  idempotencyKey: string;
};

export type WithdrawResult = {
  withdrawId: string;
  ledgerEntryId: string;
  walletId: string;
  amount: string;
  feeAmount: string;
  totalDeducted: string;
  balanceBefore: string;
  balanceAfter: string;
  status: string;
  idempotencyKey: string;
};

export type ReconciliationResult = {
  walletId: string;
  ledgerBalance: string;
  projectionBalance: string;
  difference: string;
  isConsistent: boolean;
  severity?: string;
  dataSource?: string;
};

export type DriftReport = {
  driftCount: number;
  drifts: ReconciliationResult[];
  scannedAt: string;
  severitySummary?: Record<string, number>;
};

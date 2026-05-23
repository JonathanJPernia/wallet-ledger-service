-- =============================================================================
-- Production hardening: partitions, outbox/DLQ, circuit breaker, audit, watermarks
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ledger RANGE partitions (monthly on createdAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "ledger_entries" RENAME TO "ledger_entries_legacy";

ALTER TABLE "ledger_entries_legacy" RENAME CONSTRAINT "ledger_entries_pkey" TO "ledger_entries_legacy_pkey";
ALTER TABLE "ledger_entries_legacy" RENAME CONSTRAINT "ledger_entries_walletId_fkey" TO "ledger_entries_legacy_walletId_fkey";
ALTER TABLE "ledger_entries_legacy" RENAME CONSTRAINT "ledger_entries_transactionGroupId_fkey" TO "ledger_entries_legacy_transactionGroupId_fkey";

CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "operationType" "OperationType" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "transactionGroupId" TEXT,
    "referenceId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

CREATE TABLE "ledger_entries_default" PARTITION OF "ledger_entries" DEFAULT;

CREATE OR REPLACE FUNCTION ensure_ledger_month_partition(p_month_start DATE)
RETURNS VOID AS $$
DECLARE
  v_partition_name TEXT;
  v_range_start TIMESTAMPTZ;
  v_range_end TIMESTAMPTZ;
BEGIN
  v_partition_name := 'ledger_entries_' || to_char(p_month_start, 'YYYY_MM');
  v_range_start := p_month_start::timestamptz;
  v_range_end := (p_month_start + INTERVAL '1 month')::timestamptz;

  IF to_regclass(v_partition_name) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF ledger_entries FOR VALUES FROM (%L) TO (%L)',
      v_partition_name,
      v_range_start,
      v_range_end
    );
    INSERT INTO ledger_partition_registry (partition_name, range_start, range_end)
    VALUES (v_partition_name, v_range_start, v_range_end)
    ON CONFLICT (partition_name) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE "ledger_partition_registry" (
    "partition_name" TEXT NOT NULL,
    "range_start" TIMESTAMPTZ NOT NULL,
    "range_end" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_partition_registry_pkey" PRIMARY KEY ("partition_name")
);

-- Bootstrap partitions: legacy min month through +3 months ahead
DO $$
DECLARE
  m DATE;
  min_month DATE;
  max_month DATE;
BEGIN
  SELECT date_trunc('month', COALESCE(MIN("createdAt"), NOW()))::date
  INTO min_month FROM ledger_entries_legacy;

  max_month := (date_trunc('month', NOW()) + INTERVAL '4 months')::date;

  m := min_month;
  WHILE m <= max_month LOOP
    PERFORM ensure_ledger_month_partition(m);
    m := (m + INTERVAL '1 month')::date;
  END LOOP;
END $$;

INSERT INTO "ledger_entries" (
    "id", "walletId", "operationType", "currency", "amount",
    "balanceBefore", "balanceAfter", "transactionGroupId", "referenceId",
    "correlationId", "createdAt"
)
SELECT
    "id", "walletId", "operationType", "currency", "amount",
    "balanceBefore", "balanceAfter", "transactionGroupId", "referenceId",
    "correlationId", "createdAt"
FROM "ledger_entries_legacy";

DROP TABLE "ledger_entries_legacy";

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionGroupId_fkey"
  FOREIGN KEY ("transactionGroupId") REFERENCES "transaction_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ledger_entries_walletId_idx" ON "ledger_entries" ("walletId");
CREATE INDEX "ledger_entries_transactionGroupId_idx" ON "ledger_entries" ("transactionGroupId");
CREATE INDEX "ledger_entries_operationType_idx" ON "ledger_entries" ("operationType");
CREATE INDEX "ledger_entries_currency_idx" ON "ledger_entries" ("currency");
CREATE INDEX "ledger_entries_referenceId_idx" ON "ledger_entries" ("referenceId");
CREATE INDEX "ledger_entries_createdAt_idx" ON "ledger_entries" ("createdAt");
CREATE INDEX "ledger_entries_walletId_createdAt_idx" ON "ledger_entries" ("walletId", "createdAt");
CREATE INDEX "ledger_entries_operationType_createdAt_idx" ON "ledger_entries" ("operationType", "createdAt");

DROP INDEX IF EXISTS "ledger_entries_group_op_wallet_uidx";
CREATE UNIQUE INDEX "ledger_entries_group_op_wallet_uidx"
  ON "ledger_entries" ("transactionGroupId", "operationType", "walletId", "createdAt")
  WHERE "transactionGroupId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Event outbox + DLQ
-- ---------------------------------------------------------------------------
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'DLQ');

CREATE TABLE "financial_event_outbox" (
    "id" TEXT NOT NULL,
    "type" "FinancialEventType" NOT NULL,
    "walletId" TEXT,
    "counterpartyWalletId" TEXT,
    "transactionGroupId" TEXT,
    "amount" DECIMAL(18,2),
    "currency" CHAR(3),
    "metadata" JSONB,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "financial_event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_event_dlq" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "type" "FinancialEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "lastError" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_event_dlq_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_event_dlq_outboxId_key" ON "financial_event_dlq"("outboxId");
CREATE INDEX "financial_event_outbox_status_nextRetryAt_idx"
  ON "financial_event_outbox"("status", "nextRetryAt");
CREATE INDEX "financial_event_outbox_transactionGroupId_idx"
  ON "financial_event_outbox"("transactionGroupId");

-- ---------------------------------------------------------------------------
-- 3. Circuit breaker state
-- ---------------------------------------------------------------------------
CREATE TYPE "CircuitState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

CREATE TABLE "wallet_circuit_breakers" (
    "scope" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "state" "CircuitState" NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wallet_circuit_breakers_pkey" PRIMARY KEY ("scope", "targetId")
);

-- ---------------------------------------------------------------------------
-- 4. Audit log (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actor" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");
CREATE INDEX "audit_log_correlationId_idx" ON "audit_log"("correlationId");

-- ---------------------------------------------------------------------------
-- 5. MV incremental watermarks
-- ---------------------------------------------------------------------------
CREATE TABLE "mv_refresh_watermarks" (
    "viewKey" TEXT NOT NULL,
    "bucketDate" DATE NOT NULL,
    "lastEntryCreatedAt" TIMESTAMP(3),
    "lastEntryId" TEXT,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mv_refresh_watermarks_pkey" PRIMARY KEY ("viewKey", "bucketDate")
);

-- CreateEnum
CREATE TYPE "TransactionGroupType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionGroupStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "transaction_groups" (
    "id" TEXT NOT NULL,
    "type" "TransactionGroupType" NOT NULL,
    "status" "TransactionGroupStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'default',
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "requestMethod" TEXT,
    "requestPath" TEXT,
    "requestHash" TEXT,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "transactionGroupId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- AlterTable (add new columns before dropping legacy ones)
ALTER TABLE "ledger_entries" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "ledger_entries" ADD COLUMN "transactionGroupId" TEXT;

-- Backfill: one TransactionGroup per legacy transactionId
INSERT INTO "transaction_groups" (
    "id",
    "type",
    "status",
    "createdAt",
    "updatedAt",
    "completedAt"
)
SELECT
    le."transactionId",
    CASE
        WHEN bool_or(le."operationType" = 'TRANSFER_OUT'::"OperationType")
            AND bool_or(le."operationType" = 'TRANSFER_IN'::"OperationType") THEN 'TRANSFER'::"TransactionGroupType"
        WHEN bool_or(le."operationType" = 'DEPOSIT'::"OperationType") THEN 'DEPOSIT'::"TransactionGroupType"
        WHEN bool_or(le."operationType" = 'WITHDRAW'::"OperationType") THEN 'WITHDRAW'::"TransactionGroupType"
        ELSE 'ADJUSTMENT'::"TransactionGroupType"
    END,
    'COMPLETED'::"TransactionGroupStatus",
    MIN(le."createdAt"),
    MAX(le."createdAt"),
    MAX(le."createdAt")
FROM "ledger_entries" le
GROUP BY le."transactionId";

UPDATE "ledger_entries" le
SET "transactionGroupId" = le."transactionId";

-- Drop legacy idempotency / transaction columns on ledger
DROP INDEX "ledger_entries_walletId_idempotencyKey_key";
DROP INDEX "ledger_entries_transactionId_idx";
DROP INDEX "ledger_entries_idempotencyKey_idx";

ALTER TABLE "ledger_entries" DROP COLUMN "transactionId";
ALTER TABLE "ledger_entries" DROP COLUMN "idempotencyKey";

-- CreateIndex
CREATE INDEX "transaction_groups_type_idx" ON "transaction_groups"("type");
CREATE INDEX "transaction_groups_status_idx" ON "transaction_groups"("status");
CREATE INDEX "transaction_groups_correlationId_idx" ON "transaction_groups"("correlationId");
CREATE INDEX "transaction_groups_createdAt_idx" ON "transaction_groups"("createdAt");

CREATE UNIQUE INDEX "idempotency_keys_transactionGroupId_key" ON "idempotency_keys"("transactionGroupId");
CREATE INDEX "idempotency_keys_status_idx" ON "idempotency_keys"("status");
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

CREATE INDEX "ledger_entries_transactionGroupId_idx" ON "ledger_entries"("transactionGroupId");
CREATE INDEX "ledger_entries_operationType_idx" ON "ledger_entries"("operationType");
CREATE INDEX "ledger_entries_createdAt_idx" ON "ledger_entries"("createdAt");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_transactionGroupId_fkey" FOREIGN KEY ("transactionGroupId") REFERENCES "transaction_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionGroupId_fkey" FOREIGN KEY ("transactionGroupId") REFERENCES "transaction_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

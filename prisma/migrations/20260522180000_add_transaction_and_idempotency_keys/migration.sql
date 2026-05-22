-- AlterTable: backfill existing rows before NOT NULL
ALTER TABLE "ledger_entries" ADD COLUMN "transactionId" TEXT;
ALTER TABLE "ledger_entries" ADD COLUMN "idempotencyKey" TEXT;

UPDATE "ledger_entries"
SET
  "transactionId" = "id",
  "idempotencyKey" = "id"
WHERE "transactionId" IS NULL;

ALTER TABLE "ledger_entries" ALTER COLUMN "transactionId" SET NOT NULL;
ALTER TABLE "ledger_entries" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

CREATE INDEX "ledger_entries_idempotencyKey_idx" ON "ledger_entries"("idempotencyKey");

CREATE UNIQUE INDEX "ledger_entries_walletId_idempotencyKey_key" ON "ledger_entries"("walletId", "idempotencyKey");

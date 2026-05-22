-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- AlterTable: wallets
ALTER TABLE "wallets" ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE "wallets" ADD COLUMN "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable: transaction_groups
ALTER TABLE "transaction_groups" ADD COLUMN "businessReference" TEXT;
ALTER TABLE "transaction_groups" ADD COLUMN "initiatedBy" TEXT;

-- AlterTable: ledger_entries (currency backfill)
ALTER TABLE "ledger_entries" ADD COLUMN "currency" CHAR(3);
UPDATE "ledger_entries" SET "currency" = 'USD' WHERE "currency" IS NULL;
ALTER TABLE "ledger_entries" ALTER COLUMN "currency" SET NOT NULL;

-- Regla fintech: amount siempre positivo; el signo lo define operationType
ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0);

-- CreateIndex
CREATE INDEX "wallets_status_idx" ON "wallets"("status");
CREATE INDEX "wallets_currency_idx" ON "wallets"("currency");
CREATE INDEX "transaction_groups_businessReference_idx" ON "transaction_groups"("businessReference");
CREATE INDEX "transaction_groups_initiatedBy_idx" ON "transaction_groups"("initiatedBy");
CREATE INDEX "ledger_entries_currency_idx" ON "ledger_entries"("currency");

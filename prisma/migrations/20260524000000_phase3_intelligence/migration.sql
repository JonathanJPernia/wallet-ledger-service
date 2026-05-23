-- CreateEnum
CREATE TYPE "FinancialEventType" AS ENUM (
  'DEPOSIT_COMPLETED',
  'TRANSFER_COMPLETED',
  'WITHDRAW_COMPLETED',
  'FEE_APPLIED',
  'WALLET_CREATED'
);

-- CreateTable
CREATE TABLE "financial_events" (
    "id" TEXT NOT NULL,
    "type" "FinancialEventType" NOT NULL,
    "walletId" TEXT,
    "counterpartyWalletId" TEXT,
    "transactionGroupId" TEXT,
    "amount" DECIMAL(18,2),
    "currency" CHAR(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mv_daily_wallet_balance" (
    "bucket_date" DATE NOT NULL,
    "walletId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "ledgerBalance" DECIMAL(18,2) NOT NULL,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mv_daily_wallet_balance_pkey" PRIMARY KEY ("bucket_date","walletId")
);

CREATE TABLE "mv_daily_fee_revenue" (
    "bucket_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalFees" DECIMAL(18,2) NOT NULL,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mv_daily_fee_revenue_pkey" PRIMARY KEY ("bucket_date","currency")
);

CREATE TABLE "mv_daily_system_volume" (
    "bucket_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalVolume" DECIMAL(18,2) NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mv_daily_system_volume_pkey" PRIMARY KEY ("bucket_date","currency")
);

CREATE INDEX "financial_events_type_createdAt_idx" ON "financial_events"("type", "createdAt");
CREATE INDEX "financial_events_walletId_createdAt_idx" ON "financial_events"("walletId", "createdAt");
CREATE INDEX "financial_events_transactionGroupId_idx" ON "financial_events"("transactionGroupId");
CREATE INDEX "mv_daily_wallet_balance_walletId_idx" ON "mv_daily_wallet_balance"("walletId");

-- CreateTable
CREATE TABLE "financial_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "totalSystemBalance" DECIMAL(18,2) NOT NULL,
    "totalFeeRevenue" DECIMAL(18,2) NOT NULL,
    "totalVolume" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_snapshots_snapshot_date_currency_key" ON "financial_snapshots"("snapshot_date", "currency");

-- CreateIndex
CREATE INDEX "financial_snapshots_snapshot_date_idx" ON "financial_snapshots"("snapshot_date");

-- Reporting performance indexes (ledger_entries)
CREATE INDEX "ledger_entries_walletId_createdAt_idx" ON "ledger_entries"("walletId", "createdAt");

CREATE INDEX "ledger_entries_operationType_createdAt_idx" ON "ledger_entries"("operationType", "createdAt");

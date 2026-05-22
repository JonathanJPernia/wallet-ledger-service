-- Snapshot: ventana de cierre explícita (freeze contable)
ALTER TABLE "financial_snapshots"
  ADD COLUMN "period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "period_end" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Anti-duplicate ledger por operación lógica (mismo group + wallet + tipo)
CREATE UNIQUE INDEX "ledger_entries_group_op_wallet_uidx"
  ON "ledger_entries" ("transactionGroupId", "operationType", "walletId")
  WHERE "transactionGroupId" IS NOT NULL;

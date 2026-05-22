-- Idempotency observability (FAILED fuera de TX financiera)
ALTER TABLE "idempotency_keys" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "idempotency_keys" ADD COLUMN "failedAt" TIMESTAMP(3);

-- Wallet projection: balance no negativo (defensa en profundidad)
ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_current_balance_non_negative" CHECK ("currentBalance" >= 0);

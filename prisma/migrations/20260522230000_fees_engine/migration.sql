-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('USER', 'SYSTEM_FEE');

-- AlterEnum
ALTER TYPE "OperationType" ADD VALUE 'FEE_IN';
ALTER TYPE "OperationType" ADD VALUE 'FEE_OUT';

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN "kind" "WalletKind" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "wallets_kind_idx" ON "wallets"("kind");

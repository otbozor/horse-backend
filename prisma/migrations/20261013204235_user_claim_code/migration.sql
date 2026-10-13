-- AlterTable
ALTER TABLE "users" ADD COLUMN     "claim_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_claim_code_key" ON "users"("claim_code");


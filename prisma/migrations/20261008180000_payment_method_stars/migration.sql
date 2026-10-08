-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CLICK', 'STARS');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'CLICK',
ADD COLUMN     "stars_amount" INTEGER,
ADD COLUMN     "telegram_charge_id" TEXT;


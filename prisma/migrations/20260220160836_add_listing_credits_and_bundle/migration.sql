-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "listing_bundle_size" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "listing_credits" INTEGER NOT NULL DEFAULT 3;

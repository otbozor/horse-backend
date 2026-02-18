-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "horse_listings" ADD COLUMN     "expires_at" TIMESTAMP(3);

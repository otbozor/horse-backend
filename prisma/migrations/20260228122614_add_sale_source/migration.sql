-- CreateEnum
CREATE TYPE "SaleSource" AS ENUM ('OTBOZOR', 'OTHER');

-- AlterTable
ALTER TABLE "horse_listings" ADD COLUMN     "sale_source" "SaleSource";

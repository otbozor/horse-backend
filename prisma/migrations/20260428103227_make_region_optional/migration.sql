-- DropForeignKey
ALTER TABLE "horse_listings" DROP CONSTRAINT "horse_listings_region_id_fkey";

-- AlterTable
ALTER TABLE "horse_listings" ALTER COLUMN "region_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "horse_listings" ADD CONSTRAINT "horse_listings_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

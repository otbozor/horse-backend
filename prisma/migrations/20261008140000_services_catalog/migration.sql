-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('VETERINAR', 'TAQACHI', 'OT_TASHISH', 'CHAVANDOZ', 'MURABBIY', 'OT_BOQISH', 'EGAR_USTASI', 'YEM_YETKAZISH', 'BOSHQA');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "service_listings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "region_id" TEXT,
    "district_id" TEXT,
    "price_from" DECIMAL(15,2),
    "price_note" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_telegram" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_media" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_listings_status_category_idx" ON "service_listings"("status", "category");

-- CreateIndex
CREATE INDEX "service_listings_user_id_idx" ON "service_listings"("user_id");

-- CreateIndex
CREATE INDEX "service_listings_region_id_idx" ON "service_listings"("region_id");

-- CreateIndex
CREATE INDEX "service_media_service_id_idx" ON "service_media"("service_id");

-- AddForeignKey
ALTER TABLE "service_listings" ADD CONSTRAINT "service_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_listings" ADD CONSTRAINT "service_listings_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_listings" ADD CONSTRAINT "service_listings_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_media" ADD CONSTRAINT "service_media_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


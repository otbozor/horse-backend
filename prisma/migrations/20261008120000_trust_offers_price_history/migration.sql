-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('FRAUD', 'SOLD', 'WRONG_INFO', 'DUPLICATE', 'OFFENSIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PriceOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "horse_listings" ADD COLUMN     "previous_price" DECIMAL(15,2);

-- CreateTable
CREATE TABLE "listing_reports" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "comment" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "listing_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_reviews" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "seller_reply" TEXT,
    "seller_replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_offers" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "message" TEXT,
    "status" "PriceOfferStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "price_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "old_price" DECIMAL(15,2) NOT NULL,
    "new_price" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_reports_status_idx" ON "listing_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_reports_listing_id_reporter_id_key" ON "listing_reports"("listing_id", "reporter_id");

-- CreateIndex
CREATE INDEX "seller_reviews_seller_id_idx" ON "seller_reviews"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_reviews_seller_id_reviewer_id_key" ON "seller_reviews"("seller_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "price_offers_listing_id_idx" ON "price_offers"("listing_id");

-- CreateIndex
CREATE INDEX "price_offers_buyer_id_idx" ON "price_offers"("buyer_id");

-- CreateIndex
CREATE INDEX "price_history_listing_id_idx" ON "price_history"("listing_id");

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "horse_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "horse_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "horse_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "horse_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


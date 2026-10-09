-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PHONE', 'TELEGRAM', 'CHAT');

-- CreateTable
CREATE TABLE "listing_contacts" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "ContactType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_contacts_listing_id_created_at_idx" ON "listing_contacts"("listing_id", "created_at");

-- AddForeignKey
ALTER TABLE "listing_contacts" ADD CONSTRAINT "listing_contacts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "horse_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


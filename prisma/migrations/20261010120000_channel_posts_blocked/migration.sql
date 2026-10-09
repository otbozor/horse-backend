-- CreateEnum
CREATE TYPE "ChannelPostKind" AS ENUM ('LISTING', 'AUCTION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bot_blocked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "channel_posts" (
    "id" TEXT NOT NULL,
    "kind" "ChannelPostKind" NOT NULL,
    "listing_id" TEXT NOT NULL,
    "auction_id" TEXT,
    "chat_id" TEXT NOT NULL,
    "message_id" INTEGER NOT NULL,
    "is_photo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_posts_listing_id_idx" ON "channel_posts"("listing_id");

-- CreateIndex
CREATE INDEX "channel_posts_auction_id_idx" ON "channel_posts"("auction_id");

-- AddForeignKey
ALTER TABLE "channel_posts" ADD CONSTRAINT "channel_posts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "horse_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


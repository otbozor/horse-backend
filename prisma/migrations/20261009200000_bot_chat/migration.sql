-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active_chat_thread_id" TEXT;

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_relays" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "recipient_tg_id" BIGINT NOT NULL,
    "tg_message_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_relays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_threads_seller_id_idx" ON "chat_threads"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_threads_listing_id_buyer_id_key" ON "chat_threads"("listing_id", "buyer_id");

-- CreateIndex
CREATE INDEX "chat_relays_recipient_tg_id_tg_message_id_idx" ON "chat_relays"("recipient_tg_id", "tg_message_id");

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "horse_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_relays" ADD CONSTRAINT "chat_relays_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


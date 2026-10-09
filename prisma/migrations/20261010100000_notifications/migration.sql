-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('LISTINGS', 'OFFERS', 'SEARCHES', 'AUCTIONS', 'KOPKARI', 'SYSTEM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notification_prefs" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancel_request_reason" TEXT,
ADD COLUMN     "cancel_requested_at" TIMESTAMP(3),
ADD COLUMN     "ending_soon_notified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


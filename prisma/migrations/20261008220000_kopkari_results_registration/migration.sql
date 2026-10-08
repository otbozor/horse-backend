-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "max_participants" INTEGER,
ADD COLUMN     "registration_open" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "results_summary" TEXT;

-- CreateTable
CREATE TABLE "event_winners" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "rider_name" TEXT NOT NULL,
    "horse_name" TEXT,
    "prize" TEXT,

    CONSTRAINT "event_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_photos" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rider_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "horse_name" TEXT,
    "horse_breed" TEXT,
    "note" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_winners_event_id_idx" ON "event_winners"("event_id");

-- CreateIndex
CREATE INDEX "event_photos_event_id_idx" ON "event_photos"("event_id");

-- CreateIndex
CREATE INDEX "event_registrations_event_id_status_idx" ON "event_registrations"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_event_id_user_id_key" ON "event_registrations"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "event_winners" ADD CONSTRAINT "event_winners_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


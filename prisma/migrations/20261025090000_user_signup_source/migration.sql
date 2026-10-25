-- CreateEnum
CREATE TYPE "SignupSource" AS ENUM ('MINIAPP', 'BOT', 'SITE', 'ANDROID', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signup_source" "SignupSource",
ADD COLUMN     "signup_source_estimated" BOOLEAN NOT NULL DEFAULT false;

-- Eski foydalanuvchilar: manba yozilmagan, taxminan aniqlaymiz (signup_source_estimated = true)
-- 1) Telegram'siz, parolsiz akkaunt — admin sotuvchi nomidan ochgan
UPDATE "users" SET "signup_source" = 'ADMIN', "signup_source_estimated" = true
WHERE "signup_source" IS NULL AND "telegram_user_id" IS NULL AND "username" IS NULL;

-- 2) Ro'yxatdan o'tish atrofida shu akkauntga bog'langan Android o'rnatish bor
UPDATE "users" u SET "signup_source" = 'ANDROID', "signup_source_estimated" = true
WHERE u."signup_source" IS NULL AND u."telegram_user_id" IS NOT NULL AND u."phone" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "app_installs" a
    WHERE a."user_id" = u."id"
      AND a."first_seen_at" BETWEEN u."created_at" - INTERVAL '1 day' AND u."created_at" + INTERVAL '1 hour'
  );

-- 3) Telefonsiz Telegram akkaunt — sayt va ilova kirishi telefon so'raydi, demak mini app
UPDATE "users" SET "signup_source" = 'MINIAPP', "signup_source_estimated" = true
WHERE "signup_source" IS NULL AND "telegram_user_id" IS NOT NULL AND "phone" IS NULL;

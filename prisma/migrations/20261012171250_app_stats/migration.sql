-- CreateTable
CREATE TABLE "app_downloads" (
    "id" TEXT NOT NULL,
    "source" TEXT,
    "visitor_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_installs" (
    "install_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "version" TEXT NOT NULL,
    "user_id" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opens" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "app_installs_pkey" PRIMARY KEY ("install_id")
);

-- CreateTable
CREATE TABLE "app_active_days" (
    "install_id" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "app_active_days_pkey" PRIMARY KEY ("install_id","day")
);

-- CreateIndex
CREATE INDEX "app_downloads_created_at_idx" ON "app_downloads"("created_at");

-- CreateIndex
CREATE INDEX "app_installs_last_seen_at_idx" ON "app_installs"("last_seen_at");

-- CreateIndex
CREATE INDEX "app_installs_user_id_idx" ON "app_installs"("user_id");

-- CreateIndex
CREATE INDEX "app_active_days_day_idx" ON "app_active_days"("day");

-- AddForeignKey
ALTER TABLE "app_installs" ADD CONSTRAINT "app_installs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_active_days" ADD CONSTRAINT "app_active_days_install_id_fkey" FOREIGN KEY ("install_id") REFERENCES "app_installs"("install_id") ON DELETE CASCADE ON UPDATE CASCADE;


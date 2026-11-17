-- CreateTable
CREATE TABLE "game_scores" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_scores_kind_period_telegram_user_id_key" ON "game_scores"("kind", "period", "telegram_user_id");

-- CreateIndex
CREATE INDEX "game_scores_kind_period_value_idx" ON "game_scores"("kind", "period", "value");

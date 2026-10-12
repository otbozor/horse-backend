-- CreateTable
CREATE TABLE "server_metrics" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpu" DOUBLE PRECISION NOT NULL,
    "mem_used_mb" DOUBLE PRECISION NOT NULL,
    "mem_total_mb" DOUBLE PRECISION NOT NULL,
    "swap_used_mb" DOUBLE PRECISION NOT NULL,
    "load1" DOUBLE PRECISION NOT NULL,
    "disk_used_gb" DOUBLE PRECISION NOT NULL,
    "disk_total_gb" DOUBLE PRECISION NOT NULL,
    "requests" INTEGER NOT NULL,
    "errors_5xx" INTEGER NOT NULL,
    "avg_ms" INTEGER NOT NULL,
    "p95_ms" INTEGER NOT NULL,
    "db_size_mb" DOUBLE PRECISION NOT NULL,
    "db_conns" INTEGER NOT NULL,
    "backend_rss_mb" DOUBLE PRECISION NOT NULL,
    "containers" JSONB,

    CONSTRAINT "server_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_metrics_created_at_idx" ON "server_metrics"("created_at");


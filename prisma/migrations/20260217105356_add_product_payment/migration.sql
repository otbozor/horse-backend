-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "product_id" TEXT,
ALTER COLUMN "listing_id" DROP NOT NULL,
ALTER COLUMN "package_type" DROP NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_paid" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "payments_product_id_idx" ON "payments"("product_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

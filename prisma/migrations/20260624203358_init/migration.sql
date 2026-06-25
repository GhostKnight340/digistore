-- PostgreSQL migration for Karta digital store.
-- gen_random_uuid() is built into PostgreSQL 13+ (Supabase, Neon, Railway, etc.).
-- The ::text cast keeps the column as TEXT for compatibility with application code.

-- CreateTable: ParentProduct
CREATE TABLE "ParentProduct" (
    "slug"             TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "category"         TEXT NOT NULL,
    "brand"            TEXT,
    "region"           TEXT NOT NULL DEFAULT '',
    "deliveryType"     TEXT NOT NULL DEFAULT '',
    "description"      TEXT NOT NULL DEFAULT '',
    "shortDescription" TEXT,
    "longDescription"  TEXT,
    "instructions"     TEXT,
    "thumbnail"        TEXT,
    "active"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentProduct_pkey" PRIMARY KEY ("slug")
);

-- CreateTable: Product
CREATE TABLE "Product" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name"         TEXT NOT NULL,
    "slug"         TEXT NOT NULL,
    "parentSlug"   TEXT NOT NULL DEFAULT '',
    "category"     TEXT NOT NULL,
    "priceMad"     INTEGER NOT NULL,
    "faceValue"    DOUBLE PRECISION,
    "faceCurrency" TEXT NOT NULL DEFAULT 'MAD',
    "region"       TEXT NOT NULL,
    "deliveryType" TEXT NOT NULL,
    "active"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featured"     BOOLEAN NOT NULL DEFAULT false,
    "stockControl" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DigitalCode
CREATE TABLE "DigitalCode" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "productId"       TEXT NOT NULL,
    "code"            TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'unused',
    "assignedOrderId" TEXT,
    "reservedAt"      TIMESTAMP(3),
    "usedAt"          TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Order
CREATE TABLE "Order" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "customerName"  TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'pending_payment',
    "paymentMethod" TEXT NOT NULL,
    "totalMad"      INTEGER NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrderItem
CREATE TABLE "OrderItem" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId"      TEXT NOT NULL,
    "productId"    TEXT NOT NULL,
    "quantity"     INTEGER NOT NULL,
    "unitPriceMad" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DeliveredCode
CREATE TABLE "DeliveredCode" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId"       TEXT NOT NULL,
    "orderItemId"   TEXT NOT NULL,
    "productId"     TEXT NOT NULL,
    "digitalCodeId" TEXT,
    "manualCode"    TEXT,
    "deliveredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveredCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmailLog
CREATE TABLE "EmailLog" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId"   TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject"   TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "DigitalCode_productId_status_idx" ON "DigitalCode"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalCode_productId_code_key" ON "DigitalCode"("productId", "code");

-- CreateIndex
CREATE INDEX "DeliveredCode_orderId_idx" ON "DeliveredCode"("orderId");

-- CreateIndex
CREATE INDEX "EmailLog_orderId_idx" ON "EmailLog"("orderId");

-- AddForeignKey
ALTER TABLE "DigitalCode" ADD CONSTRAINT "DigitalCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveredCode" ADD CONSTRAINT "DeliveredCode_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveredCode" ADD CONSTRAINT "DeliveredCode_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveredCode" ADD CONSTRAINT "DeliveredCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveredCode" ADD CONSTRAINT "DeliveredCode_digitalCodeId_fkey" FOREIGN KEY ("digitalCodeId") REFERENCES "DigitalCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

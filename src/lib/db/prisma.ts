import "server-only";

import { PrismaClient } from "@prisma/client";
import { categories, products } from "@/lib/products";
import { defaultStoreSettings } from "@/lib/storeSettings";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

let ensurePromise: Promise<void> | null = null;

export function ensureDatabaseReady(): Promise<void> {
  ensurePromise ??= ensureDatabaseSchema().then(seedCatalogProducts);
  return ensurePromise;
}

async function ensureDatabaseSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "Product" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "priceMad" INTEGER NOT NULL,
      "region" TEXT NOT NULL,
      "deliveryType" TEXT NOT NULL,
      "imageUrl" TEXT,
      "featured" BOOLEAN NOT NULL DEFAULT true,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "Category" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "tagline" TEXT NOT NULL DEFAULT '',
      "gradient" TEXT NOT NULL DEFAULT 'from-[#1b2838] to-[#2a475e]',
      "icon" TEXT NOT NULL DEFAULT '',
      "active" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS "DigitalCode" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'unused',
      "assignedOrderId" TEXT,
      "reservedAt" TIMESTAMP(3),
      "usedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DigitalCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Order" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "customerName" TEXT NOT NULL,
      "customerEmail" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending_payment',
      "paymentMethod" TEXT NOT NULL,
      "totalMad" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "OrderItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL,
      "unitPriceMad" INTEGER NOT NULL,
      CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "DeliveredCode" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "orderItemId" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "digitalCodeId" TEXT,
      "manualCode" TEXT,
      "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DeliveredCode_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DeliveredCode_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DeliveredCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "DeliveredCode_digitalCodeId_fkey" FOREIGN KEY ("digitalCodeId") REFERENCES "DigitalCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "EmailLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "recipient" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EmailLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Customer" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerId" TEXT`,
    `CREATE TABLE IF NOT EXISTS "ProductMedia" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "alt" TEXT NOT NULL DEFAULT '',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "ProductVariant" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "priceMad" INTEGER NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "PaymentProof" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "data" TEXT NOT NULL,
      "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PaymentProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "PaymentEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "fromStatus" TEXT,
      "toStatus" TEXT,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Bank" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "accountHolder" TEXT NOT NULL,
      "accountNumber" TEXT NOT NULL DEFAULT '',
      "rib" TEXT NOT NULL DEFAULT '',
      "iban" TEXT NOT NULL DEFAULT '',
      "swift" TEXT NOT NULL DEFAULT '',
      "instructions" TEXT NOT NULL DEFAULT '',
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "CryptoWallet" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "coin" TEXT NOT NULL DEFAULT 'USDT',
      "network" TEXT NOT NULL,
      "address" TEXT NOT NULL,
      "label" TEXT NOT NULL DEFAULT '',
      "instructions" TEXT NOT NULL DEFAULT '',
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "PaymentMethodConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "method" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "proofRequired" BOOLEAN NOT NULL DEFAULT true,
      "paypalEmail" TEXT NOT NULL DEFAULT '',
      "cardMessage" TEXT NOT NULL DEFAULT 'Paiement par carte bientot disponible.',
      "instructions" TEXT NOT NULL DEFAULT '',
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "SupportConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "whatsappNumber" TEXT NOT NULL DEFAULT '+212 600 000 000',
      "supportEmail" TEXT NOT NULL DEFAULT 'support@karta.ma',
      "instructions" TEXT NOT NULL DEFAULT '',
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "StoreSetting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "value" JSONB NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // ── New columns added in migration 20260626030000 ──────────────────────
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brand" TEXT`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "longDescription" TEXT`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "instructions" TEXT`,
    `ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "faceValue" DOUBLE PRECISION`,
    `ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "faceCurrency" TEXT NOT NULL DEFAULT 'MAD'`,
    `ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "stockControl" TEXT NOT NULL DEFAULT 'manual'`,
    `ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "stockMode" TEXT NOT NULL DEFAULT 'automatic'`,
    `ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "supplierCost" DOUBLE PRECISION`,
    `ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "supplierCurrency" TEXT NOT NULL DEFAULT 'MAD'`,
    // ────────────────────────────────────────────────────────────────────────
    `CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug")`,
    `CREATE INDEX IF NOT EXISTS "Product_active_sortOrder_idx" ON "Product"("active", "sortOrder")`,
    `CREATE INDEX IF NOT EXISTS "Product_category_active_idx" ON "Product"("category", "active")`,
    `CREATE INDEX IF NOT EXISTS "DigitalCode_productId_status_idx" ON "DigitalCode"("productId", "status")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DigitalCode_productId_code_key" ON "DigitalCode"("productId", "code")`,
    `CREATE INDEX IF NOT EXISTS "DeliveredCode_orderId_idx" ON "DeliveredCode"("orderId")`,
    `CREATE INDEX IF NOT EXISTS "EmailLog_orderId_idx" ON "EmailLog"("orderId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PaymentProof_orderId_key" ON "PaymentProof"("orderId")`,
    `CREATE INDEX IF NOT EXISTS "PaymentEvent_orderId_idx" ON "PaymentEvent"("orderId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethodConfig_method_key" ON "PaymentMethodConfig"("method")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Customer_email_key" ON "Customer"("email")`,
    `CREATE INDEX IF NOT EXISTS "ProductMedia_productId_idx" ON "ProductMedia"("productId")`,
    `CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId")`,
    `CREATE INDEX IF NOT EXISTS "ProductVariant_productId_active_idx" ON "ProductVariant"("productId", "active")`,
    `CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status")`,
    `CREATE INDEX IF NOT EXISTS "Order_customerEmail_idx" ON "Order"("customerEmail")`,
    `CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Order_paymentMethod_idx" ON "Order"("paymentMethod")`,
    `CREATE INDEX IF NOT EXISTS "Order_paymentMethod_createdAt_idx" ON "Order"("paymentMethod", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "PaymentProof_uploadedAt_idx" ON "PaymentProof"("uploadedAt")`,
    `CREATE INDEX IF NOT EXISTS "PaymentEvent_createdAt_idx" ON "PaymentEvent"("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Customer_updatedAt_idx" ON "Customer"("updatedAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DeliveredCode_digitalCodeId_key" ON "DeliveredCode"("digitalCodeId") WHERE "digitalCodeId" IS NOT NULL`,
    // ── Performance indexes ───────────────────────────────────────────────────
    `CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt" DESC)`,
    `CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status")`,
    `CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId")`,
    `CREATE INDEX IF NOT EXISTS "Order_customerEmail_idx" ON "Order"("customerEmail")`,
    `CREATE INDEX IF NOT EXISTS "Product_active_idx" ON "Product"("active")`,
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedCatalogProducts(): Promise<void> {
  for (const [index, category] of categories.entries()) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: {
        name: category.name,
        tagline: category.tagline,
        gradient: category.gradient,
        icon: category.icon,
        active: true,
        sortOrder: index,
      },
      create: {
        id: category.id,
        name: category.name,
        tagline: category.tagline,
        gradient: category.gradient,
        icon: category.icon,
        active: true,
        sortOrder: index,
      },
    });
  }

  for (const [index, product] of products.entries()) {
    const existing = await prisma.product.findUnique({
      where: { slug: product.id },
      select: { id: true },
    });

    if (!existing) {
      await prisma.product.create({
        data: {
          slug: product.id,
          name: product.name,
          category: product.category,
          description: product.description,
          priceMad: product.price,
          region: product.region,
          deliveryType: product.deliveryType,
          featured: Boolean(product.featured),
          active: true,
          sortOrder: index,
        },
      });
    }
  }

  await prisma.storeSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", value: defaultStoreSettings },
  });
}

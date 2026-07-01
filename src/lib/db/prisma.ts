import "server-only";

import { PrismaClient } from "@prisma/client";
import { categories } from "@/lib/products";
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
  ensurePromise ??= ensureDatabaseSchema()
    .then(seedCatalogProducts);
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
      "slug" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "tagline" TEXT NOT NULL DEFAULT '',
      "gradient" TEXT NOT NULL DEFAULT 'from-[#1b2838] to-[#2a475e]',
      "icon" TEXT NOT NULL DEFAULT '',
      "iconUrl" TEXT,
      "coverImageUrl" TEXT,
      "accentColor" TEXT NOT NULL DEFAULT '#3e7bfa',
      "active" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "slug" TEXT`,
    `ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "iconUrl" TEXT`,
    `ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT`,
    `ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#3e7bfa'`,
    `UPDATE "Category" SET "slug" = "id" WHERE "slug" IS NULL OR "slug" = ''`,
    `ALTER TABLE "Category" ALTER COLUMN "slug" SET NOT NULL`,
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
      "orderId" TEXT,
      "customerId" TEXT,
      "type" TEXT NOT NULL,
      "templateKey" TEXT,
      "recipient" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "html" TEXT NOT NULL DEFAULT '',
      "text" TEXT NOT NULL DEFAULT '',
      "provider" TEXT NOT NULL DEFAULT 'simulation',
      "providerMessageId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'simulated',
      "errorMessage" TEXT,
      "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EmailLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "EmailLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `ALTER TABLE "EmailLog" ALTER COLUMN "orderId" DROP NOT NULL`,
    `CREATE TABLE IF NOT EXISTS "Customer" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phone" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "image" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "googleId" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "authProvider" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3)`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3)`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastPasswordChangeAt" TIMESTAMP(3)`,
    `CREATE TABLE IF NOT EXISTS "AuthToken" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "customerId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "usedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuthToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerId" TEXT`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "customerId" TEXT`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "templateKey" TEXT`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "html" TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "text" TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'simulation'`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'simulated'`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "manuallyEdited" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "metadata" JSONB`,
    `ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `UPDATE "EmailLog" SET "text" = COALESCE(NULLIF("text", ''), "body"), "html" = COALESCE(NULLIF("html", ''), "body") WHERE "body" IS NOT NULL`,
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
      "cardMessage" TEXT NOT NULL DEFAULT 'Paiement par carte bientôt disponible.',
      "instructions" TEXT NOT NULL DEFAULT '',
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "SupportConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "whatsappNumber" TEXT NOT NULL DEFAULT '+212 600 000 000',
      "supportEmail" TEXT NOT NULL DEFAULT 'support@ghost.ma',
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
    `ALTER TABLE "DigitalCode" ADD COLUMN IF NOT EXISTS "variantId" TEXT`,
    `ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT`,
    `UPDATE "DigitalCode" dc
      SET "variantId" = only_variant."id"
      FROM (
        SELECT "productId", MIN("id") AS "id"
        FROM "ProductVariant"
        GROUP BY "productId"
        HAVING COUNT(*) = 1
      ) only_variant
      WHERE dc."variantId" IS NULL
        AND dc."productId" = only_variant."productId"`,
    // ────────────────────────────────────────────────────────────────────────
    `CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Category_slug_key" ON "Category"("slug")`,
    `CREATE INDEX IF NOT EXISTS "Product_active_sortOrder_idx" ON "Product"("active", "sortOrder")`,
    `CREATE INDEX IF NOT EXISTS "Product_category_active_idx" ON "Product"("category", "active")`,
    `CREATE INDEX IF NOT EXISTS "DigitalCode_productId_status_idx" ON "DigitalCode"("productId", "status")`,
    `CREATE INDEX IF NOT EXISTS "DigitalCode_variantId_status_idx" ON "DigitalCode"("variantId", "status")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DigitalCode_productId_code_key" ON "DigitalCode"("productId", "code")`,
    `CREATE INDEX IF NOT EXISTS "DeliveredCode_orderId_idx" ON "DeliveredCode"("orderId")`,
    `CREATE INDEX IF NOT EXISTS "EmailLog_orderId_idx" ON "EmailLog"("orderId")`,
    `CREATE INDEX IF NOT EXISTS "EmailLog_customerId_idx" ON "EmailLog"("customerId")`,
    `CREATE INDEX IF NOT EXISTS "EmailLog_status_idx" ON "EmailLog"("status")`,
    `CREATE INDEX IF NOT EXISTS "EmailLog_templateKey_idx" ON "EmailLog"("templateKey")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PaymentProof_orderId_key" ON "PaymentProof"("orderId")`,
    `CREATE INDEX IF NOT EXISTS "PaymentEvent_orderId_idx" ON "PaymentEvent"("orderId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethodConfig_method_key" ON "PaymentMethodConfig"("method")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Customer_email_key" ON "Customer"("email")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Customer_googleId_key" ON "Customer"("googleId")`,
    `CREATE INDEX IF NOT EXISTS "Customer_emailVerified_idx" ON "Customer"("emailVerified")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash")`,
    `CREATE INDEX IF NOT EXISTS "AuthToken_customerId_type_idx" ON "AuthToken"("customerId", "type")`,
    `CREATE INDEX IF NOT EXISTS "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt")`,
    `CREATE INDEX IF NOT EXISTS "ProductMedia_productId_idx" ON "ProductMedia"("productId")`,
    `CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId")`,
    `CREATE INDEX IF NOT EXISTS "ProductVariant_productId_active_idx" ON "ProductVariant"("productId", "active")`,
    `CREATE INDEX IF NOT EXISTS "OrderItem_variantId_idx" ON "OrderItem"("variantId")`,
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
        slug: category.id,
        name: category.name,
        description: category.tagline,
        tagline: category.tagline,
        gradient: category.gradient,
        icon: category.icon,
        accentColor: category.accentColor ?? "#3e7bfa",
        sortOrder: index,
      },
      create: {
        id: category.id,
        slug: category.id,
        name: category.name,
        description: category.tagline,
        tagline: category.tagline,
        gradient: category.gradient,
        icon: category.icon,
        accentColor: category.accentColor ?? "#3e7bfa",
        active: true,
        sortOrder: index,
      },
    });
  }

  await prisma.storeSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", value: defaultStoreSettings },
  });
}

async function cleanupEmptyParentProducts(): Promise<void> {
  const products = await prisma.product.findMany({
    where: { variants: { none: {} } },
    select: {
      id: true,
      slug: true,
      active: true,
      _count: {
        select: {
          digitalCodes: true,
          orderItems: true,
          deliveredCodes: true,
        },
      },
    },
  });

  let deleted = 0;
  let archived = 0;
  let skipped = 0;

  for (const product of products) {
    const hasProtectedReferences =
      product._count.digitalCodes > 0 ||
      product._count.orderItems > 0 ||
      product._count.deliveredCodes > 0;

    if (hasProtectedReferences) {
      if (product.active) {
        await prisma.product.update({
          where: { id: product.id },
          data: { active: false, featured: false },
        });
        archived += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    await prisma.productMedia.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    deleted += 1;
  }

  if (deleted > 0 || archived > 0 || skipped > 0) {
    console.info(
      `[product-cleanup] empty parents deleted=${deleted} archived=${archived} skipped=${skipped}`,
    );
  }
}

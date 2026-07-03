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
  ensurePromise ??= bootstrapDatabase();
  return ensurePromise;
}

async function bootstrapDatabase(): Promise<void> {
  await ensureOrderNumberColumn();
  await seedCatalogProducts();
}

/**
 * Ensure the stored public order number exists. This deployment applies schema
 * changes at runtime (there is no `migrate deploy` step), so the column, its
 * backing sequence, the chronological backfill of existing rows, and the unique
 * index are all provisioned idempotently here. Every statement is safe to run on
 * each cold start; they no-op once the column is in place. The Prisma migration
 * under prisma/migrations covers environments that do run migrations.
 */
async function ensureOrderNumberColumn(): Promise<void> {
  const statements = [
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderNumber" INTEGER`,
    `CREATE SEQUENCE IF NOT EXISTS "Order_orderNumber_seq" AS INTEGER`,
    `ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET DEFAULT nextval('"Order_orderNumber_seq"')`,
    `ALTER SEQUENCE "Order_orderNumber_seq" OWNED BY "Order"."orderNumber"`,
    // Backfill only rows still missing a number, in creation order, offset past
    // any existing max so we never collide with numbers already assigned.
    `WITH ordered AS (
       SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS seq
       FROM "Order" WHERE "orderNumber" IS NULL
     )
     UPDATE "Order" o
     SET "orderNumber" = ordered.seq + COALESCE((SELECT MAX("orderNumber") FROM "Order"), 0)
     FROM ordered
     WHERE o."id" = ordered."id"`,
    // Advance the sequence monotonically past the highest assigned number.
    `DO $$ BEGIN PERFORM setval(
       '"Order_orderNumber_seq"',
       GREATEST(
         (SELECT COALESCE(MAX("orderNumber"), 0) FROM "Order"),
         (SELECT last_value FROM "Order_orderNumber_seq")
       ),
       true
     ); END $$`,
    `ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber")`,
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (error) {
      console.error("[schema:orderNumber]", error);
    }
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

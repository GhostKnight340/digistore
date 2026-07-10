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
  ensurePromise ??= seedCatalogProducts().catch((error) => {
    // Never memoize a rejection: a transient DB outage (e.g. Neon waking from
    // auto-suspend) would otherwise poison this instance for its whole life,
    // failing every future read. Reset so the next call retries.
    ensurePromise = null;
    throw error;
  });
  return ensurePromise;
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

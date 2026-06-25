/**
 * Seeds the database with the current catalog products and sample codes.
 * Products are represented as variant rows — one DB row per variant.
 * Safe to run repeatedly — products are upserted by slug.
 *
 * Run with: npm run prisma:seed
 */
import { PrismaClient } from "@prisma/client";
import { products, parentProducts, getParentByVariant } from "../src/lib/products";

const prisma = new PrismaClient();

const seedCodes: Record<string, string[]> = {
  "steam-50":      ["STEAM-TEST-50-001", "STEAM-TEST-50-002"],
  "steam-100":     ["STEAM-TEST-100-001", "STEAM-TEST-100-002", "STEAM-TEST-100-003"],
  "steam-200":     ["STEAM-TEST-200-001", "STEAM-TEST-200-002"],
  "psn-100":       ["PSN-TEST-100-001", "PSN-TEST-100-002"],
  "psn-250":       ["PSN-TEST-250-001"],
  "xbox-100":      ["XBOX-TEST-100-001", "XBOX-TEST-100-002"],
  "xbox-200":      ["XBOX-TEST-200-001"],
  "nintendo-150":  ["NINTENDO-TEST-150-001"],
  "roblox-100":    ["ROBLOX-TEST-100-001", "ROBLOX-TEST-100-002"],
  "roblox-200":    ["ROBLOX-TEST-200-001"],
  "valorant-100":  ["VALORANT-TEST-100-001", "VALORANT-TEST-100-002"],
  "valorant-200":  ["VALORANT-TEST-200-001"],
};

async function main() {
  // Upsert ParentProduct rows
  for (const parent of parentProducts) {
    await prisma.parentProduct.upsert({
      where: { slug: parent.id },
      update: {
        name:             parent.name,
        category:         parent.category,
        brand:            parent.brand ?? null,
        region:           parent.region,
        deliveryType:     parent.deliveryType,
        description:      parent.description,
        shortDescription: parent.shortDescription ?? null,
        longDescription:  parent.longDescription ?? null,
        instructions:     parent.instructions ?? null,
        thumbnail:        parent.thumbnail ?? null,
        active:           parent.active !== false,
      },
      create: {
        slug:             parent.id,
        name:             parent.name,
        category:         parent.category,
        brand:            parent.brand ?? null,
        region:           parent.region,
        deliveryType:     parent.deliveryType,
        description:      parent.description,
        shortDescription: parent.shortDescription ?? null,
        longDescription:  parent.longDescription ?? null,
        instructions:     parent.instructions ?? null,
        thumbnail:        parent.thumbnail ?? null,
        active:           true,
      },
    });
  }

  // Upsert Product (variant) rows
  for (const product of products) {
    const parent = getParentByVariant(product.id);
    // Find the original variant to get the featured flag
    const variant = parent?.variants.find((v) => v.id === product.id);

    const record = await prisma.product.upsert({
      where: { slug: product.id },
      update: {
        name:         product.name,
        parentSlug:   parent?.id ?? product.id,
        category:     product.category,
        priceMad:     product.price,
        faceValue:    product.faceValue ?? null,
        faceCurrency: product.faceCurrency ?? "MAD",
        region:       product.region,
        deliveryType: product.deliveryType,
        active:       product.active !== false,
        featured:     variant?.featured ?? false,
      },
      create: {
        slug:         product.id,
        name:         product.name,
        parentSlug:   parent?.id ?? product.id,
        category:     product.category,
        priceMad:     product.price,
        faceValue:    product.faceValue ?? null,
        faceCurrency: product.faceCurrency ?? "MAD",
        region:       product.region,
        deliveryType: product.deliveryType,
        active:       product.active !== false,
        featured:     variant?.featured ?? false,
      },
    });

    for (const code of seedCodes[product.id] ?? []) {
      const existing = await prisma.digitalCode.findUnique({
        where: { productId_code: { productId: record.id, code } },
      });
      if (!existing) {
        await prisma.digitalCode.create({
          data: { productId: record.id, code, status: "unused" },
        });
      }
    }
  }

  console.log(
    `Seed complete: ${await prisma.parentProduct.count()} parents, ${await prisma.product.count()} variants, ${await prisma.digitalCode.count()} codes.`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

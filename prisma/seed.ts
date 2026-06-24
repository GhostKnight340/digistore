/**
 * Seeds the database with the current catalog products and a handful of
 * sample UNUSED test codes per product. Safe to run repeatedly — products
 * are upserted by slug and codes are created only if missing.
 *
 * Run with: npm run prisma:seed
 */
import { PrismaClient } from "@prisma/client";
import { products } from "../src/lib/products";

const prisma = new PrismaClient();

// Sample test codes per product slug (fake — no real gift cards involved).
const seedCodes: Record<string, string[]> = {
  "steam-50": ["STEAM-TEST-50-001", "STEAM-TEST-50-002"],
  "steam-100": [
    "STEAM-TEST-100-001",
    "STEAM-TEST-100-002",
    "STEAM-TEST-100-003",
  ],
  "steam-200": ["STEAM-TEST-200-001", "STEAM-TEST-200-002"],
  "psn-100": ["PSN-TEST-100-001", "PSN-TEST-100-002"],
  "psn-250": ["PSN-TEST-250-001"],
  "xbox-100": ["XBOX-TEST-100-001", "XBOX-TEST-100-002"],
  "xbox-200": ["XBOX-TEST-200-001"],
  "nintendo-150": ["NINTENDO-TEST-150-001"],
  "roblox-100": ["ROBLOX-TEST-100-001", "ROBLOX-TEST-100-002"],
  "roblox-200": ["ROBLOX-TEST-200-001"],
  "valorant-100": ["VALORANT-TEST-100-001", "VALORANT-TEST-100-002"],
  "valorant-200": ["VALORANT-TEST-200-001"],
};

async function main() {
  for (const product of products) {
    const record = await prisma.product.upsert({
      where: { slug: product.id },
      update: {
        name: product.name,
        category: product.category,
        priceMad: product.price,
        region: product.region,
        deliveryType: product.deliveryType,
        active: true,
      },
      create: {
        slug: product.id,
        name: product.name,
        category: product.category,
        priceMad: product.price,
        region: product.region,
        deliveryType: product.deliveryType,
        active: true,
      },
    });

    const codes = seedCodes[product.id] ?? [];
    for (const code of codes) {
      // Skip if this code already exists for the product (idempotent seed).
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

  const productCount = await prisma.product.count();
  const codeCount = await prisma.digitalCode.count();
  console.log(`Seed complete: ${productCount} products, ${codeCount} codes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

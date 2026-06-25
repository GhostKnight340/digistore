/**
 * Seeds the database with the current catalog products and a handful of
 * sample UNUSED test codes per product. Safe to run repeatedly — products
 * are upserted by slug and codes are created only if missing.
 *
 * Run with: npm run prisma:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const seedProducts = [
  { id: "steam-50", name: "Steam Wallet 50 MAD", category: "steam", region: "Maroc / Global", price: 50, deliveryType: "Code numérique instantané", description: "Ajoutez 50 MAD à votre Steam Wallet.", featured: true },
  { id: "steam-100", name: "Steam Wallet 100 MAD", category: "steam", region: "Maroc / Global", price: 100, deliveryType: "Code numérique instantané", description: "Ajoutez 100 MAD à votre Steam Wallet.", featured: true },
  { id: "steam-200", name: "Steam Wallet 200 MAD", category: "steam", region: "Maroc / Global", price: 200, deliveryType: "Code numérique instantané", description: "Ajoutez 200 MAD à votre Steam Wallet." },
  { id: "psn-100", name: "PlayStation Store 100 MAD", category: "playstation", region: "Maroc", price: 100, deliveryType: "Code numérique instantané", description: "Rechargez votre portefeuille PlayStation Store.", featured: true },
  { id: "psn-250", name: "PlayStation Store 250 MAD", category: "playstation", region: "Maroc", price: 250, deliveryType: "Code numérique instantané", description: "Ajoutez 250 MAD à votre portefeuille PlayStation Store." },
  { id: "xbox-100", name: "Xbox Gift Card 100 MAD", category: "xbox", region: "Maroc / Global", price: 100, deliveryType: "Code numérique instantané", description: "Utilisez cette carte sur Microsoft Store et Xbox.", featured: true },
  { id: "xbox-200", name: "Xbox Gift Card 200 MAD", category: "xbox", region: "Maroc / Global", price: 200, deliveryType: "Code numérique instantané", description: "Ajoutez 200 MAD à votre compte Xbox." },
  { id: "nintendo-150", name: "Nintendo eShop 150 MAD", category: "nintendo", region: "Maroc / EU", price: 150, deliveryType: "Code numérique instantané", description: "Ajoutez des fonds à votre compte Nintendo." },
  { id: "roblox-100", name: "Roblox Gift Card 100 MAD", category: "roblox", region: "Global", price: 100, deliveryType: "Code numérique instantané", description: "Échangez cette carte contre des Robux ou Premium.", featured: true },
  { id: "roblox-200", name: "Roblox Gift Card 200 MAD", category: "roblox", region: "Global", price: 200, deliveryType: "Code numérique instantané", description: "Échangez 200 MAD contre des Robux ou Premium." },
  { id: "valorant-100", name: "Valorant Points 100 MAD", category: "valorant", region: "MENA", price: 100, deliveryType: "Code numérique instantané", description: "Échangez des Valorant Points pour skins et agents.", featured: true },
  { id: "valorant-200", name: "Valorant Points 200 MAD", category: "valorant", region: "MENA", price: 200, deliveryType: "Code numérique instantané", description: "Échangez 200 MAD de Valorant Points." },
];

// Sample test codes per product slug (fake — no real gift cards involved).
const seedCodes: Record<string, string[]> = {
  "steam-50": ["STEAM-TEST-50-001", "STEAM-TEST-50-002"],
  "steam-100": ["STEAM-TEST-100-001", "STEAM-TEST-100-002", "STEAM-TEST-100-003"],
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
  for (const product of seedProducts) {
    const record = await prisma.product.upsert({
      where: { slug: product.id },
      update: {
        name: product.name,
        category: product.category,
        priceMad: product.price,
        region: product.region,
        deliveryType: product.deliveryType,
        active: true,
        featured: product.featured ?? false,
        stockControl: "manual",
      },
      create: {
        slug: product.id,
        name: product.name,
        category: product.category,
        priceMad: product.price,
        region: product.region,
        deliveryType: product.deliveryType,
        active: true,
        featured: product.featured ?? false,
        stockControl: "manual",
      },
    });

    const codes = seedCodes[product.id] ?? [];
    for (const code of codes) {
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

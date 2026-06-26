import type { Category, Product } from "./types";

export const categories: Category[] = [
  {
    id: "steam",
    name: "Steam Wallet",
    tagline: "Rechargez votre solde Steam",
    gradient: "from-[#1b2838] to-[#2a475e]",
    icon: "🎮",
  },
  {
    id: "playstation",
    name: "PlayStation Store",
    tagline: "Jeux, extensions et plus encore",
    gradient: "from-[#0033a0] to-[#0a6bff]",
    icon: "🕹️",
  },
  {
    id: "xbox",
    name: "Xbox Gift Cards",
    tagline: "À utiliser sur le store Xbox",
    gradient: "from-[#0e7a0d] to-[#16c60c]",
    icon: "🟢",
  },
  {
    id: "nintendo",
    name: "Nintendo eShop",
    tagline: "Jeux Switch et DLC",
    gradient: "from-[#b30000] to-[#ff4554]",
    icon: "🔴",
  },
  {
    id: "roblox",
    name: "Roblox",
    tagline: "Cartes Robux",
    gradient: "from-[#2b2b2b] to-[#5a5a5a]",
    icon: "🟥",
  },
  {
    id: "valorant",
    name: "Valorant Points",
    tagline: "VP et points Riot",
    gradient: "from-[#7a1320] to-[#ff4655]",
    icon: "🎯",
  },
];

export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

// Current product catalog — denominations use native card currency (EUR/USD).
// Selling prices in MAD are initial defaults; the admin can override them.
export const products: Product[] = [
  // Steam Wallet — EUR
  { id: "steam-5eur",  name: "Steam Wallet 5 EUR",  category: "steam",       region: "Maroc / Global", price: 65,  deliveryType: "Code numérique instantané", description: "Ajoutez 5 EUR à votre Steam Wallet pour acheter jeux, DLC et contenus sur Steam.", featured: true },
  { id: "steam-10eur", name: "Steam Wallet 10 EUR", category: "steam",       region: "Maroc / Global", price: 130, deliveryType: "Code numérique instantané", description: "Ajoutez 10 EUR à votre Steam Wallet pour acheter jeux, DLC et contenus sur Steam.", featured: true },
  { id: "steam-20eur", name: "Steam Wallet 20 EUR", category: "steam",       region: "Maroc / Global", price: 250, deliveryType: "Code numérique instantané", description: "Ajoutez 20 EUR à votre Steam Wallet pour vos achats et promotions saisonnières." },
  { id: "steam-50eur", name: "Steam Wallet 50 EUR", category: "steam",       region: "Maroc / Global", price: 610, deliveryType: "Code numérique instantané", description: "Ajoutez 50 EUR à votre Steam Wallet pour vos achats importants sur Steam." },
  // PlayStation Store — USD
  { id: "psn-10usd",  name: "PlayStation Store 10 USD", category: "playstation", region: "Maroc", price: 105, deliveryType: "Code numérique instantané", description: "Rechargez 10 USD sur le PlayStation Store pour acheter jeux, extensions et abonnements.", featured: true },
  { id: "psn-20usd",  name: "PlayStation Store 20 USD", category: "playstation", region: "Maroc", price: 210, deliveryType: "Code numérique instantané", description: "Rechargez 20 USD sur le PlayStation Store pour vos jeux et contenus favoris." },
  { id: "psn-50usd",  name: "PlayStation Store 50 USD", category: "playstation", region: "Maroc", price: 520, deliveryType: "Code numérique instantané", description: "Rechargez 50 USD sur le PlayStation Store pour jeux complets et abonnements." },
  // Xbox Gift Card — USD
  { id: "xbox-25usd", name: "Xbox Gift Card 25 USD", category: "xbox", region: "Maroc / Global", price: 265, deliveryType: "Code numérique instantané", description: "Utilisez 25 USD sur le Microsoft Store et Xbox pour jeux, applications et divertissement.", featured: true },
  // Nintendo eShop — EUR
  { id: "nintendo-25eur", name: "Nintendo eShop 25 EUR", category: "nintendo", region: "Maroc / EU", price: 295, deliveryType: "Code numérique instantané", description: "Ajoutez 25 EUR à votre compte Nintendo pour acheter jeux Switch et contenus Nintendo eShop." },
  // Roblox Gift Card — USD
  { id: "roblox-10usd", name: "Roblox Gift Card 10 USD", category: "roblox", region: "Global", price: 105, deliveryType: "Code numérique instantané", description: "Échangez 10 USD contre des Robux ou un abonnement Premium sur Roblox.", featured: true },
  { id: "roblox-25usd", name: "Roblox Gift Card 25 USD", category: "roblox", region: "Global", price: 265, deliveryType: "Code numérique instantané", description: "Échangez 25 USD contre des Robux ou un abonnement Premium sur Roblox." },
  // Valorant Points — USD
  { id: "valorant-10usd", name: "Valorant Points 10 USD", category: "valorant", region: "MENA", price: 105, deliveryType: "Code numérique instantané", description: "Échangez 10 USD de Valorant Points pour skins, passes de combat et agents.", featured: true },
  { id: "valorant-25usd", name: "Valorant Points 25 USD", category: "valorant", region: "MENA", price: 265, deliveryType: "Code numérique instantané", description: "Échangez 25 USD de Valorant Points pour skins et passes de combat." },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getFeatured(): Product[] {
  return products.filter((p) => p.featured);
}

export function getProductsByCategory(category: string): Product[] {
  return products.filter((p) => p.category === category);
}

// Legacy MAD-based denomination slugs — deactivated but kept in DB so that
// existing orders can still reference them. Never appear on the storefront.
export const OLD_DENOMINATION_SLUGS = new Set([
  "steam-50", "steam-100", "steam-200",
  "psn-100", "psn-250",
  "xbox-100", "xbox-200",
  "nintendo-150",
  "roblox-100", "roblox-200",
  "valorant-100", "valorant-200",
]);

// All denomination slugs (legacy + current). Products whose slug is in this
// set are individual purchasable denominations, NOT parent platform products.
// Used to filter the admin product list so it shows only parent products.
export const DENOMINATION_SLUGS = new Set([
  ...OLD_DENOMINATION_SLUGS,
  // Current EUR/USD denominations
  "steam-5eur", "steam-10eur", "steam-20eur", "steam-50eur",
  "psn-10usd", "psn-20usd", "psn-50usd",
  "xbox-25usd",
  "nintendo-25eur",
  "roblox-10usd", "roblox-25usd",
  "valorant-10usd", "valorant-25usd",
]);

export interface DenominationSeed {
  id: string;
  name: string;
  priceMad: number;
  faceValue: number;
  faceCurrency: string;
  featured: boolean;
  sortOrder: number;
}

export interface ProductGroupSeed {
  id: string;
  name: string;
  category: string;
  region: string;
  deliveryType: string;
  description: string;
  sortOrder: number;
  denominations: DenominationSeed[];
}

// Canonical parent product groups — one per platform.
// Each denomination is seeded as both a storefront Product row and an admin
// ProductVariant row so the two views stay in sync automatically.
export const productGroups: ProductGroupSeed[] = [
  {
    id: "steam-wallet",
    name: "Steam Wallet",
    category: "steam",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    description: "Rechargez votre Steam Wallet et utilisez votre solde pour acheter jeux, DLC et contenus en jeu sur Steam.",
    sortOrder: 0,
    denominations: [
      { id: "steam-5eur",  name: "5 EUR",  priceMad: 65,  faceValue: 5,  faceCurrency: "EUR", featured: true,  sortOrder: 0 },
      { id: "steam-10eur", name: "10 EUR", priceMad: 130, faceValue: 10, faceCurrency: "EUR", featured: true,  sortOrder: 1 },
      { id: "steam-20eur", name: "20 EUR", priceMad: 250, faceValue: 20, faceCurrency: "EUR", featured: false, sortOrder: 2 },
      { id: "steam-50eur", name: "50 EUR", priceMad: 610, faceValue: 50, faceCurrency: "EUR", featured: false, sortOrder: 3 },
    ],
  },
  {
    id: "psn-store",
    name: "PlayStation Store",
    category: "playstation",
    region: "Maroc",
    deliveryType: "Code numérique instantané",
    description: "Rechargez votre portefeuille PlayStation Store pour acheter jeux, extensions et abonnements.",
    sortOrder: 1,
    denominations: [
      { id: "psn-10usd", name: "10 USD", priceMad: 105, faceValue: 10, faceCurrency: "USD", featured: true,  sortOrder: 0 },
      { id: "psn-20usd", name: "20 USD", priceMad: 210, faceValue: 20, faceCurrency: "USD", featured: false, sortOrder: 1 },
      { id: "psn-50usd", name: "50 USD", priceMad: 520, faceValue: 50, faceCurrency: "USD", featured: false, sortOrder: 2 },
    ],
  },
  {
    id: "xbox-gift-card",
    name: "Xbox Gift Card",
    category: "xbox",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    description: "Utilisez cette carte sur Microsoft Store et Xbox pour acheter jeux, applications et divertissement.",
    sortOrder: 2,
    denominations: [
      { id: "xbox-25usd", name: "25 USD", priceMad: 265, faceValue: 25, faceCurrency: "USD", featured: true, sortOrder: 0 },
    ],
  },
  {
    id: "nintendo-eshop",
    name: "Nintendo eShop",
    category: "nintendo",
    region: "Maroc / EU",
    deliveryType: "Code numérique instantané",
    description: "Ajoutez des fonds à votre compte Nintendo pour acheter jeux Switch et contenus depuis le Nintendo eShop.",
    sortOrder: 3,
    denominations: [
      { id: "nintendo-25eur", name: "25 EUR", priceMad: 295, faceValue: 25, faceCurrency: "EUR", featured: false, sortOrder: 0 },
    ],
  },
  {
    id: "roblox-gift-card",
    name: "Roblox Gift Card",
    category: "roblox",
    region: "Global",
    deliveryType: "Code numérique instantané",
    description: "Échangez cette carte contre des Robux ou un abonnement Premium sur Roblox.",
    sortOrder: 4,
    denominations: [
      { id: "roblox-10usd", name: "10 USD", priceMad: 105, faceValue: 10, faceCurrency: "USD", featured: true,  sortOrder: 0 },
      { id: "roblox-25usd", name: "25 USD", priceMad: 265, faceValue: 25, faceCurrency: "USD", featured: false, sortOrder: 1 },
    ],
  },
  {
    id: "valorant-points",
    name: "Valorant Points",
    category: "valorant",
    region: "MENA",
    deliveryType: "Code numérique instantané",
    description: "Échangez des Valorant Points pour skins, passes de combat et agents.",
    sortOrder: 5,
    denominations: [
      { id: "valorant-10usd", name: "10 USD", priceMad: 105, faceValue: 10, faceCurrency: "USD", featured: true,  sortOrder: 0 },
      { id: "valorant-25usd", name: "25 USD", priceMad: 265, faceValue: 25, faceCurrency: "USD", featured: false, sortOrder: 1 },
    ],
  },
];

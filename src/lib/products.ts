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

export const products: Product[] = [
  {
    id: "steam-50",
    name: "Steam Wallet 50 MAD",
    category: "steam",
    region: "Maroc / Global",
    price: 50,
    deliveryType: "Code numérique instantané",
    description:
      "Ajoutez 50 MAD à votre Steam Wallet et utilisez votre solde pour acheter jeux, DLC et contenus en jeu sur Steam.",
    featured: true,
  },
  {
    id: "steam-100",
    name: "Steam Wallet 100 MAD",
    category: "steam",
    region: "Maroc / Global",
    price: 100,
    deliveryType: "Code numérique instantané",
    description:
      "Ajoutez 100 MAD à votre Steam Wallet et profitez de vos jeux, DLC et contenus préférés sur Steam.",
    featured: true,
  },
  {
    id: "steam-200",
    name: "Steam Wallet 200 MAD",
    category: "steam",
    region: "Maroc / Global",
    price: 200,
    deliveryType: "Code numérique instantané",
    description:
      "Ajoutez 200 MAD à votre Steam Wallet pour vos achats plus importants et les promotions saisonnières.",
  },
  {
    id: "psn-100",
    name: "PlayStation Store 100 MAD",
    category: "playstation",
    region: "Maroc",
    price: 100,
    deliveryType: "Code numérique instantané",
    description:
      "Rechargez votre portefeuille PlayStation Store pour acheter jeux, extensions et abonnements.",
    featured: true,
  },
  {
    id: "psn-250",
    name: "PlayStation Store 250 MAD",
    category: "playstation",
    region: "Maroc",
    price: 250,
    deliveryType: "Code numérique instantané",
    description:
      "Ajoutez 250 MAD à votre portefeuille PlayStation Store pour vos jeux complets et contenus favoris.",
  },
  {
    id: "xbox-100",
    name: "Xbox Gift Card 100 MAD",
    category: "xbox",
    region: "Maroc / Global",
    price: 100,
    deliveryType: "Code numérique instantané",
    description:
      "Utilisez cette carte sur Microsoft Store et Xbox pour acheter jeux, applications et divertissement.",
    featured: true,
  },
  {
    id: "xbox-200",
    name: "Xbox Gift Card 200 MAD",
    category: "xbox",
    region: "Maroc / Global",
    price: 200,
    deliveryType: "Code numérique instantané",
    description:
      "Ajoutez 200 MAD à votre compte Xbox pour jeux, abonnements et contenus numériques.",
  },
  {
    id: "nintendo-150",
    name: "Nintendo eShop 150 MAD",
    category: "nintendo",
    region: "Maroc / EU",
    price: 150,
    deliveryType: "Code numérique instantané",
    description:
      "Ajoutez des fonds à votre compte Nintendo pour acheter jeux Switch et contenus depuis le Nintendo eShop.",
  },
  {
    id: "roblox-100",
    name: "Roblox Gift Card 100 MAD",
    category: "roblox",
    region: "Global",
    price: 100,
    deliveryType: "Code numérique instantané",
    description:
      "Échangez cette carte contre des Robux ou un abonnement Premium sur Roblox.",
    featured: true,
  },
  {
    id: "roblox-200",
    name: "Roblox Gift Card 200 MAD",
    category: "roblox",
    region: "Global",
    price: 200,
    deliveryType: "Code numérique instantané",
    description:
      "Échangez 200 MAD contre des Robux ou un abonnement Premium sur Roblox.",
  },
  {
    id: "valorant-100",
    name: "Valorant Points 100 MAD",
    category: "valorant",
    region: "MENA",
    price: 100,
    deliveryType: "Code numérique instantané",
    description:
      "Échangez des Valorant Points pour skins, passes de combat et agents.",
    featured: true,
  },
  {
    id: "valorant-200",
    name: "Valorant Points 200 MAD",
    category: "valorant",
    region: "MENA",
    price: 200,
    deliveryType: "Code numérique instantané",
    description:
      "Échangez 200 MAD de Valorant Points pour skins et passes de combat.",
  },
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

// IDs of legacy denomination products that are NOT parent products.
// These exist in the DB to preserve order history but should be excluded from
// the admin product list so only the grouped parent products appear there.
export const DENOMINATION_SLUGS = new Set([
  "steam-50", "steam-100", "steam-200",
  "psn-100", "psn-250",
  "xbox-100", "xbox-200",
  "nintendo-150",
  "roblox-100", "roblox-200",
  "valorant-100", "valorant-200",
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

// Canonical parent product definitions — one per platform.
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
      { id: "steam-wallet-50mad", name: "50 MAD", priceMad: 50, faceValue: 50, faceCurrency: "MAD", featured: true, sortOrder: 0 },
      { id: "steam-wallet-100mad", name: "100 MAD", priceMad: 100, faceValue: 100, faceCurrency: "MAD", featured: true, sortOrder: 1 },
      { id: "steam-wallet-200mad", name: "200 MAD", priceMad: 200, faceValue: 200, faceCurrency: "MAD", featured: false, sortOrder: 2 },
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
      { id: "psn-store-100mad", name: "100 MAD", priceMad: 100, faceValue: 100, faceCurrency: "MAD", featured: true, sortOrder: 0 },
      { id: "psn-store-250mad", name: "250 MAD", priceMad: 250, faceValue: 250, faceCurrency: "MAD", featured: false, sortOrder: 1 },
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
      { id: "xbox-gift-card-100mad", name: "100 MAD", priceMad: 100, faceValue: 100, faceCurrency: "MAD", featured: true, sortOrder: 0 },
      { id: "xbox-gift-card-200mad", name: "200 MAD", priceMad: 200, faceValue: 200, faceCurrency: "MAD", featured: false, sortOrder: 1 },
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
      { id: "nintendo-eshop-150mad", name: "150 MAD", priceMad: 150, faceValue: 150, faceCurrency: "MAD", featured: false, sortOrder: 0 },
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
      { id: "roblox-gift-card-100mad", name: "100 MAD", priceMad: 100, faceValue: 100, faceCurrency: "MAD", featured: true, sortOrder: 0 },
      { id: "roblox-gift-card-200mad", name: "200 MAD", priceMad: 200, faceValue: 200, faceCurrency: "MAD", featured: false, sortOrder: 1 },
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
      { id: "valorant-points-100mad", name: "100 MAD", priceMad: 100, faceValue: 100, faceCurrency: "MAD", featured: true, sortOrder: 0 },
      { id: "valorant-points-200mad", name: "200 MAD", priceMad: 200, faceValue: 200, faceCurrency: "MAD", featured: false, sortOrder: 1 },
    ],
  },
];

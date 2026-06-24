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

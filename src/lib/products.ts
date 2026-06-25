import type { Category } from "./types";

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

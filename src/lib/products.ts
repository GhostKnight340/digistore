import { variantTitle } from "./format";
import type { Category, ParentProduct, Product, ProductVariant } from "./types";

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

// ── Platform instructions ─────────────────────────────────────────────────────

const steamInstructions = `1. Ouvrez Steam et connectez-vous à votre compte.
2. Cliquez sur votre nom en haut à droite, puis sur "Utiliser un code produit Steam".
3. Saisissez votre code et cliquez sur "Continuer".
4. Les fonds seront ajoutés immédiatement à votre portefeuille Steam.`;

const psnInstructions = `1. Connectez-vous au PlayStation Store depuis votre console ou navigateur.
2. Accédez à "Ajouter des fonds" dans votre portefeuille PSN.
3. Sélectionnez "Utiliser un code de téléchargement PSN".
4. Saisissez le code à 12 chiffres et confirmez l'ajout.`;

const xboxInstructions = `1. Connectez-vous à votre compte Microsoft sur xbox.com ou votre console.
2. Accédez à "Utiliser un code" dans le Microsoft Store.
3. Saisissez le code à 25 caractères et validez.
4. Le montant sera immédiatement crédité sur votre compte Microsoft.`;

const nintendoInstructions = `1. Depuis votre Nintendo Switch, ouvrez le Nintendo eShop.
2. Sélectionnez votre compte et accédez à "Saisir un code de téléchargement".
3. Entrez le code à 16 chiffres et confirmez.
4. Les fonds sont instantanément disponibles dans l'eShop.`;

const robloxInstructions = `1. Rendez-vous sur roblox.com/upgrades/redeem.
2. Connectez-vous à votre compte Roblox.
3. Saisissez le code de la carte-cadeau et cliquez sur "Redeem".
4. Vos Robux ou jours Premium seront ajoutés instantanément à votre compte.`;

const valorantInstructions = `1. Connectez-vous sur playvalorant.com ou ouvrez le client Valorant.
2. Accédez au Store, puis à "Acheter des VP".
3. Sélectionnez "Utiliser un code prépayé Riot".
4. Saisissez votre code et confirmez pour recevoir vos VP.`;

// ── Parent products with variants ─────────────────────────────────────────────

export const parentProducts: ParentProduct[] = [
  // ── Steam Wallet ────────────────────────────────────────────────────────────
  {
    id: "steam-wallet",
    name: "Steam Wallet",
    category: "steam",
    brand: "Valve",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    description: "Rechargez votre portefeuille Steam pour acheter jeux, DLC et contenus en jeu.",
    shortDescription: "Rechargez votre Steam Wallet et accédez à des milliers de jeux.",
    longDescription:
      "Avec une carte Steam Wallet, rechargez votre compte Steam et accédez à des milliers de jeux, DLC, extensions et contenus en jeu. Compatible avec tous les comptes Steam actifs. Les fonds sont crédités immédiatement et n'expirent pas.",
    instructions: steamInstructions,
    variants: [
      { id: "steam-50",  productId: "steam-wallet", faceValue: 5,  faceCurrency: "EUR", price: 60,  featured: true,  active: true },
      { id: "steam-100", productId: "steam-wallet", faceValue: 10, faceCurrency: "EUR", price: 120, featured: true,  active: true },
      { id: "steam-200", productId: "steam-wallet", faceValue: 20, faceCurrency: "EUR", price: 240, featured: false, active: true },
    ],
  },

  // ── PlayStation Store ───────────────────────────────────────────────────────
  {
    id: "playstation-store",
    name: "PlayStation Store",
    category: "playstation",
    brand: "Sony",
    region: "Maroc",
    deliveryType: "Code numérique instantané",
    description: "Rechargez votre portefeuille PlayStation Store pour acheter jeux, extensions et abonnements.",
    shortDescription: "Rechargez votre PSN pour jeux, extensions et PS Plus.",
    longDescription:
      "Carte PlayStation Store valable pour acheter des jeux PS4/PS5, du contenu additionnel, des abonnements PS Plus et des films. Région Maroc — utilisez-la uniquement avec un compte PSN créé au Maroc.",
    instructions: psnInstructions,
    variants: [
      { id: "psn-100", productId: "playstation-store", faceValue: 100, faceCurrency: "MAD", price: 100, featured: true,  active: true },
      { id: "psn-250", productId: "playstation-store", faceValue: 250, faceCurrency: "MAD", price: 250, featured: false, active: true },
    ],
  },

  // ── Xbox Gift Card ──────────────────────────────────────────────────────────
  {
    id: "xbox-gift-card",
    name: "Xbox Gift Card",
    category: "xbox",
    brand: "Microsoft",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    description: "Utilisez cette carte sur Microsoft Store et Xbox pour acheter jeux, applications et divertissement.",
    shortDescription: "Créditez votre compte Xbox et Microsoft Store.",
    longDescription:
      "Carte Xbox Gift Card valable sur le Microsoft Store, Xbox Game Pass, et pour l'achat de jeux et contenus Xbox. Fonctionne sur Xbox Series X/S, Xbox One et PC Windows.",
    instructions: xboxInstructions,
    variants: [
      { id: "xbox-100", productId: "xbox-gift-card", faceValue: 100, faceCurrency: "MAD", price: 100, featured: true,  active: true },
      { id: "xbox-200", productId: "xbox-gift-card", faceValue: 200, faceCurrency: "MAD", price: 200, featured: false, active: true },
    ],
  },

  // ── Nintendo eShop ──────────────────────────────────────────────────────────
  {
    id: "nintendo-eshop",
    name: "Nintendo eShop",
    category: "nintendo",
    brand: "Nintendo",
    region: "Maroc / EU",
    deliveryType: "Code numérique instantané",
    description: "Ajoutez des fonds à votre compte Nintendo pour acheter jeux Switch et contenus depuis le Nintendo eShop.",
    shortDescription: "Fonds pour vos achats sur le Nintendo eShop.",
    longDescription:
      "Carte Nintendo eShop utilisable pour acheter des jeux Nintendo Switch, des DLC, des applications et du contenu additionnel. Fonds disponibles immédiatement sur votre compte Nintendo.",
    instructions: nintendoInstructions,
    variants: [
      { id: "nintendo-150", productId: "nintendo-eshop", faceValue: 150, faceCurrency: "MAD", price: 150, featured: false, active: true },
    ],
  },

  // ── Roblox ──────────────────────────────────────────────────────────────────
  {
    id: "roblox",
    name: "Roblox Gift Card",
    category: "roblox",
    brand: "Roblox Corporation",
    region: "Global",
    deliveryType: "Code numérique instantané",
    description: "Échangez cette carte contre des Robux ou un abonnement Premium sur Roblox.",
    shortDescription: "Obtenez des Robux ou Premium sur Roblox.",
    longDescription:
      "Carte Roblox à échanger contre des Robux ou des jours d'abonnement Roblox Premium. Les Robux vous permettent d'acheter des accessoires, avatars, passes de jeu et objets exclusifs dans l'univers Roblox.",
    instructions: robloxInstructions,
    variants: [
      { id: "roblox-100", productId: "roblox", faceValue: 100, faceCurrency: "MAD", price: 100, featured: true,  active: true },
      { id: "roblox-200", productId: "roblox", faceValue: 200, faceCurrency: "MAD", price: 200, featured: false, active: true },
    ],
  },

  // ── Valorant Points ─────────────────────────────────────────────────────────
  {
    id: "valorant-points",
    name: "Valorant Points",
    category: "valorant",
    brand: "Riot Games",
    region: "MENA",
    deliveryType: "Code numérique instantané",
    description: "Échangez des Valorant Points pour skins, passes de combat et agents.",
    shortDescription: "Achetez des VP pour skins et passes de combat Valorant.",
    longDescription:
      "Carte Valorant Points pour la région MENA. Utilisez vos VP pour acheter des skins d'armes, des passes de combat, des cartes de visite et des agents dans Valorant. Les VP sont crédités instantanément sur votre compte Riot Games.",
    instructions: valorantInstructions,
    variants: [
      { id: "valorant-100", productId: "valorant-points", faceValue: 100, faceCurrency: "MAD", price: 100, featured: true,  active: true },
      { id: "valorant-200", productId: "valorant-points", faceValue: 200, faceCurrency: "MAD", price: 200, featured: false, active: true },
    ],
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getParentProduct(id: string): ParentProduct | undefined {
  return parentProducts.find((p) => p.id === id);
}

export function getVariantById(variantId: string): ProductVariant | undefined {
  for (const parent of parentProducts) {
    const v = parent.variants.find((v) => v.id === variantId);
    if (v) return v;
  }
  return undefined;
}

export function getParentByVariant(variantId: string): ParentProduct | undefined {
  return parentProducts.find((p) => p.variants.some((v) => v.id === variantId));
}

export function getParentsByCategory(categoryId: string): ParentProduct[] {
  return parentProducts.filter(
    (p) => p.category === categoryId && p.active !== false,
  );
}

// ── Flat product list (backwards-compatible with cart / checkout / cards) ─────

function toFlatProduct(parent: ParentProduct, variant: ProductVariant): Product {
  return {
    id: variant.id,
    variantOf: parent.id,
    name: variantTitle(parent.name, variant.faceValue, variant.faceCurrency),
    category: parent.category,
    brand: parent.brand,
    region: parent.region,
    deliveryType: parent.deliveryType,
    active: variant.active !== false && parent.active !== false,
    featured: variant.featured,
    faceValue: variant.faceValue,
    faceCurrency: variant.faceCurrency,
    price: variant.price,
    supplierCost: variant.supplierCost,
    supplierCurrency: variant.supplierCurrency,
    description: parent.description,
    shortDescription: parent.shortDescription,
    longDescription: parent.longDescription,
    instructions: parent.instructions,
    thumbnail: parent.thumbnail,
    galleryImages: parent.galleryImages,
  };
}

/** All variants as flat Product objects. Used by cart, checkout, stock status. */
export const products: Product[] = parentProducts.flatMap((parent) =>
  parent.variants.map((v) => toFlatProduct(parent, v)),
);

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getFeatured(): Product[] {
  return products.filter((p) => p.featured);
}

/** @deprecated Use getParentsByCategory for the new grouped architecture. */
export function getProductsByCategory(category: string): Product[] {
  return products.filter((p) => p.category === category);
}

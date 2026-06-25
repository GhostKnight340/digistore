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

// ── Platform instructions ────────────────────────────────────────────────────

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

// ── Products ─────────────────────────────────────────────────────────────────

export const products: Product[] = [
  // ── Steam Wallet ──────────────────────────────────────────────────────────
  {
    id: "steam-50",
    name: "Steam Wallet 50 MAD",
    category: "steam",
    brand: "Valve",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    active: true,
    featured: true,
    faceValue: 50,
    faceCurrency: "MAD",
    price: 50,
    description:
      "Ajoutez 50 MAD à votre Steam Wallet et utilisez votre solde pour acheter jeux, DLC et contenus en jeu sur Steam.",
    shortDescription:
      "Ajoutez 50 MAD à votre Steam Wallet pour vos achats sur Steam.",
    longDescription:
      "Avec cette carte Steam Wallet de 50 MAD, rechargez votre compte Steam et accédez à des milliers de jeux, DLC, extensions et contenus en jeu. Compatible avec tous les comptes Steam actifs au Maroc. Les fonds sont crédités immédiatement et n'expirent pas.",
    instructions: steamInstructions,
  },
  {
    id: "steam-100",
    name: "Steam Wallet 100 MAD",
    category: "steam",
    brand: "Valve",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    active: true,
    featured: true,
    faceValue: 100,
    faceCurrency: "MAD",
    price: 100,
    description:
      "Ajoutez 100 MAD à votre Steam Wallet et profitez de vos jeux, DLC et contenus préférés sur Steam.",
    shortDescription:
      "Ajoutez 100 MAD à votre Steam Wallet pour vos achats sur Steam.",
    longDescription:
      "Carte Steam Wallet de 100 MAD. Idéale pour les jeux indépendants, les DLC populaires et les promotions saisonnières sur Steam. Valable sur tous les produits du catalogue Steam.",
    instructions: steamInstructions,
  },
  {
    id: "steam-200",
    name: "Steam Wallet 200 MAD",
    category: "steam",
    brand: "Valve",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    active: true,
    faceValue: 200,
    faceCurrency: "MAD",
    price: 200,
    description:
      "Ajoutez 200 MAD à votre Steam Wallet pour vos achats plus importants et les promotions saisonnières.",
    shortDescription:
      "Ajoutez 200 MAD à votre Steam Wallet.",
    longDescription:
      "Carte Steam Wallet de 200 MAD pour les achats plus importants. Parfaite pour les jeux AAA en promotion ou plusieurs jeux indépendants. Fonds crédités immédiatement, sans date d'expiration.",
    instructions: steamInstructions,
  },

  // ── PlayStation Store ─────────────────────────────────────────────────────
  {
    id: "psn-100",
    name: "PlayStation Store 100 MAD",
    category: "playstation",
    brand: "Sony",
    region: "Maroc",
    deliveryType: "Code numérique instantané",
    active: true,
    featured: true,
    faceValue: 100,
    faceCurrency: "MAD",
    price: 100,
    description:
      "Rechargez votre portefeuille PlayStation Store pour acheter jeux, extensions et abonnements.",
    shortDescription:
      "Rechargez votre PSN de 100 MAD pour jeux et extensions.",
    longDescription:
      "Carte PlayStation Store de 100 MAD. Valable pour acheter des jeux PS4/PS5, du contenu additionnel, des abonnements PS Plus et des films sur le PlayStation Store. Région Maroc — utilisez-la uniquement avec un compte PSN créé au Maroc.",
    instructions: psnInstructions,
  },
  {
    id: "psn-250",
    name: "PlayStation Store 250 MAD",
    category: "playstation",
    brand: "Sony",
    region: "Maroc",
    deliveryType: "Code numérique instantané",
    active: true,
    faceValue: 250,
    faceCurrency: "MAD",
    price: 250,
    description:
      "Ajoutez 250 MAD à votre portefeuille PlayStation Store pour vos jeux complets et contenus favoris.",
    shortDescription:
      "Rechargez votre PSN de 250 MAD.",
    longDescription:
      "Carte PlayStation Store de 250 MAD. Suffisant pour les jeux complets à prix réduit ou une combinaison d'extensions et abonnements. Compatible PS4 et PS5, région Maroc.",
    instructions: psnInstructions,
  },

  // ── Xbox ──────────────────────────────────────────────────────────────────
  {
    id: "xbox-100",
    name: "Xbox Gift Card 100 MAD",
    category: "xbox",
    brand: "Microsoft",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    active: true,
    featured: true,
    faceValue: 100,
    faceCurrency: "MAD",
    price: 100,
    description:
      "Utilisez cette carte sur Microsoft Store et Xbox pour acheter jeux, applications et divertissement.",
    shortDescription:
      "100 MAD sur votre compte Xbox et Microsoft Store.",
    longDescription:
      "Carte Xbox Gift Card de 100 MAD. Valable sur le Microsoft Store, Xbox Game Pass, et pour l'achat de jeux et contenus Xbox. Fonctionne sur Xbox Series X/S, Xbox One et PC Windows.",
    instructions: xboxInstructions,
  },
  {
    id: "xbox-200",
    name: "Xbox Gift Card 200 MAD",
    category: "xbox",
    brand: "Microsoft",
    region: "Maroc / Global",
    deliveryType: "Code numérique instantané",
    active: true,
    faceValue: 200,
    faceCurrency: "MAD",
    price: 200,
    description:
      "Ajoutez 200 MAD à votre compte Xbox pour jeux, abonnements et contenus numériques.",
    shortDescription:
      "200 MAD sur votre compte Xbox et Microsoft Store.",
    longDescription:
      "Carte Xbox Gift Card de 200 MAD. Idéale pour acheter des jeux complets sur le Microsoft Store ou renouveler Xbox Game Pass Ultimate. Compatible Xbox Series, Xbox One et Windows.",
    instructions: xboxInstructions,
  },

  // ── Nintendo eShop ────────────────────────────────────────────────────────
  {
    id: "nintendo-150",
    name: "Nintendo eShop 150 MAD",
    category: "nintendo",
    brand: "Nintendo",
    region: "Maroc / EU",
    deliveryType: "Code numérique instantané",
    active: true,
    faceValue: 150,
    faceCurrency: "MAD",
    price: 150,
    description:
      "Ajoutez des fonds à votre compte Nintendo pour acheter jeux Switch et contenus depuis le Nintendo eShop.",
    shortDescription:
      "150 MAD pour vos achats sur le Nintendo eShop.",
    longDescription:
      "Carte Nintendo eShop de 150 MAD. Utilisable pour acheter des jeux Nintendo Switch, des DLC, des applications et du contenu additionnel. Fonds disponibles immédiatement sur votre compte Nintendo.",
    instructions: nintendoInstructions,
  },

  // ── Roblox ────────────────────────────────────────────────────────────────
  {
    id: "roblox-100",
    name: "Roblox Gift Card 100 MAD",
    category: "roblox",
    brand: "Roblox Corporation",
    region: "Global",
    deliveryType: "Code numérique instantané",
    active: true,
    featured: true,
    faceValue: 100,
    faceCurrency: "MAD",
    price: 100,
    description:
      "Échangez cette carte contre des Robux ou un abonnement Premium sur Roblox.",
    shortDescription:
      "Obtenez des Robux ou Premium sur Roblox.",
    longDescription:
      "Carte Roblox de 100 MAD à échanger contre des Robux ou des jours d'abonnement Roblox Premium. Les Robux vous permettent d'acheter des accessoires, avatars, passes de jeu et objets exclusifs dans l'univers Roblox.",
    instructions: robloxInstructions,
  },
  {
    id: "roblox-200",
    name: "Roblox Gift Card 200 MAD",
    category: "roblox",
    brand: "Roblox Corporation",
    region: "Global",
    deliveryType: "Code numérique instantané",
    active: true,
    faceValue: 200,
    faceCurrency: "MAD",
    price: 200,
    description:
      "Échangez 200 MAD contre des Robux ou un abonnement Premium sur Roblox.",
    shortDescription:
      "Obtenez plus de Robux ou Premium sur Roblox.",
    longDescription:
      "Carte Roblox de 200 MAD. Idéale pour les joueurs qui veulent maximiser leurs Robux et accéder à plus de contenu premium. Compatible avec tous les comptes Roblox dans le monde.",
    instructions: robloxInstructions,
  },

  // ── Valorant ──────────────────────────────────────────────────────────────
  {
    id: "valorant-100",
    name: "Valorant Points 100 MAD",
    category: "valorant",
    brand: "Riot Games",
    region: "MENA",
    deliveryType: "Code numérique instantané",
    active: true,
    featured: true,
    faceValue: 100,
    faceCurrency: "MAD",
    price: 100,
    description:
      "Échangez des Valorant Points pour skins, passes de combat et agents.",
    shortDescription:
      "Achetez des VP pour skins et passes de combat Valorant.",
    longDescription:
      "Carte Valorant Points de 100 MAD pour la région MENA. Utilisez vos VP pour acheter des skins d'armes, des passes de combat, des cartes de visite et des agents dans Valorant. Les VP sont crédités instantanément sur votre compte Riot Games.",
    instructions: valorantInstructions,
  },
  {
    id: "valorant-200",
    name: "Valorant Points 200 MAD",
    category: "valorant",
    brand: "Riot Games",
    region: "MENA",
    deliveryType: "Code numérique instantané",
    active: true,
    faceValue: 200,
    faceCurrency: "MAD",
    price: 200,
    description:
      "Échangez 200 MAD de Valorant Points pour skins et passes de combat.",
    shortDescription:
      "Plus de VP pour skins et passes de combat Valorant.",
    longDescription:
      "Carte Valorant Points de 200 MAD pour la région MENA. Suffisant pour un pass de combat complet ou plusieurs skins d'armes. Compatible avec tous les comptes Riot MENA.",
    instructions: valorantInstructions,
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

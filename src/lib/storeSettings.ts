import type { PaymentMethod, StockMode } from "./types";

export type TrustItemSetting = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

export type PaymentDisplaySetting = {
  displayName?: string;
  subtitle?: string;
  logoType?: "image" | "initials" | "generated";
  logoUrl?: string;
  iconUrl?: string;
  initials?: string;
  accentColor?: string;
};

export type StoreSettings = {
  inventoryMode: "automatic" | "manual";
  branding: {
    siteName: string;
    logoText: string;
    heroTitle: string;
    heroSubtitle: string;
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
  };
  homepage: {
    showHero: boolean;
    showTrustStrip: boolean;
    showCategories: boolean;
    showFeaturedProducts: boolean;
    showHowItWorks: boolean;
    showWhyChooseUs: boolean;
    showFooter: boolean;
    categoriesTitle: string;
    categoriesSubtitle: string;
    featuredTitle: string;
    featuredSubtitle: string;
    howItWorksTitle: string;
    howItWorksSubtitle: string;
    whyChooseUsTitle: string;
    whyChooseUsSubtitle: string;
    ctaTitle: string;
    ctaSubtitle: string;
  };
  /** Map of category id to custom image URL. */
  categoryMedia: Record<string, string | null>;
  /** Map of category id to stock display mode override. */
  categoryStockModes: Record<string, StockMode>;
  /** Whether to show or hide out-of-stock featured products on the homepage. */
  featuredOutOfStock: "show" | "hide";
  trustItems: TrustItemSetting[];
  featuredProductIds: string[];
  paymentMethods: Record<PaymentMethod, boolean>;
  paymentDisplay: Record<string, PaymentDisplaySetting>;
  footer: {
    contactEmail: string;
    whatsappNumber: string;
    supportText: string;
    socialLinks: {
      instagram: string;
      facebook: string;
      x: string;
    };
  };
  theme: {
    accentColor: string;
    backgroundColor: string;
    cardRadius: string;
    buttonRadius: string;
  };
};

export const defaultStoreSettings: StoreSettings = {
  inventoryMode: "automatic",
  branding: {
    siteName: "Karta",
    logoText: "Karta",
    heroTitle: "Achetez vos cartes de jeu instantanement au Maroc",
    heroSubtitle:
      "Achetez vos cartes Steam, PlayStation et Xbox au meilleur prix. Code recu instantanement par email, paiement 100% securise.",
    primaryCtaLabel: "Parcourir le catalogue",
    secondaryCtaLabel: "Comment ca marche",
  },
  homepage: {
    showHero: true,
    showTrustStrip: true,
    showCategories: true,
    showFeaturedProducts: true,
    showHowItWorks: true,
    showWhyChooseUs: true,
    showFooter: true,
    categoriesTitle: "Categories populaires",
    categoriesSubtitle: "Les plateformes les plus demandees au Maroc.",
    featuredTitle: "Produits populaires",
    featuredSubtitle: "Selection verifiee, codes livres apres paiement.",
    howItWorksTitle: "Comment ca marche",
    howItWorksSubtitle: "Trois etapes, en moins d'une minute.",
    whyChooseUsTitle: "Pourquoi choisir Karta?",
    whyChooseUsSubtitle: "Des codes numeriques fiables, simples et rapides.",
    ctaTitle: "Pret a jouer?",
    ctaSubtitle: "Choisissez une carte et suivez votre commande apres paiement.",
  },
  categoryMedia: {},
  categoryStockModes: {},
  featuredOutOfStock: "show",
  trustItems: [
    {
      id: "instant-delivery",
      title: "Livraison instantanee",
      description: "Votre code est disponible des la confirmation du paiement.",
      enabled: true,
    },
    {
      id: "secure-checkout",
      title: "Paiement securise",
      description: "Transactions chiffrees et conformes aux standards bancaires.",
      enabled: true,
    },
    {
      id: "saved-codes",
      title: "Codes sauvegardes",
      description: "Vos codes restent accessibles dans votre historique.",
      enabled: true,
    },
    {
      id: "local-support",
      title: "Support local",
      description: "Une equipe au Maroc, joignable en francais et en arabe.",
      enabled: true,
    },
  ],
  featuredProductIds: [
    "steam-50",
    "steam-100",
    "psn-100",
    "xbox-100",
    "roblox-100",
    "valorant-100",
  ],
  paymentMethods: {
    bank: true,
    usdt: true,
    crypto: true,
    paypal: true,
    card: false,
    test: true,
  },
  paymentDisplay: {},
  footer: {
    contactEmail: "support@karta.ma",
    whatsappNumber: "+212 600 000 000",
    supportText:
      "Le moyen le plus simple d'acheter vos cartes et codes numeriques au Maroc.",
    socialLinks: {
      instagram: "",
      facebook: "",
      x: "",
    },
  },
  theme: {
    accentColor: "#3e7bfa",
    backgroundColor: "#0a0b0d",
    cardRadius: "16px",
    buttonRadius: "12px",
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeStoreSettings(value: unknown): StoreSettings {
  if (!isObject(value)) return defaultStoreSettings;

  return {
    ...defaultStoreSettings,
    ...value,
    inventoryMode:
      value.inventoryMode === "manual" || value.inventoryMode === "automatic"
        ? value.inventoryMode
        : defaultStoreSettings.inventoryMode,
    branding: {
      ...defaultStoreSettings.branding,
      ...(isObject(value.branding) ? value.branding : {}),
    },
    homepage: {
      ...defaultStoreSettings.homepage,
      ...(isObject(value.homepage) ? value.homepage : {}),
    },
    trustItems: Array.isArray(value.trustItems)
      ? value.trustItems.map((item, index) => ({
          ...defaultStoreSettings.trustItems[
            index % defaultStoreSettings.trustItems.length
          ],
          ...(isObject(item) ? item : {}),
        }))
      : defaultStoreSettings.trustItems,
    featuredProductIds: Array.isArray(value.featuredProductIds)
      ? value.featuredProductIds.filter((id): id is string => typeof id === "string")
      : defaultStoreSettings.featuredProductIds,
    categoryMedia: isObject(value.categoryMedia)
      ? (value.categoryMedia as Record<string, string | null>)
      : defaultStoreSettings.categoryMedia,
    categoryStockModes: isObject(value.categoryStockModes)
      ? (value.categoryStockModes as Record<string, StockMode>)
      : defaultStoreSettings.categoryStockModes,
    featuredOutOfStock:
      value.featuredOutOfStock === "hide" || value.featuredOutOfStock === "show"
        ? value.featuredOutOfStock
        : defaultStoreSettings.featuredOutOfStock,
    paymentMethods: {
      ...defaultStoreSettings.paymentMethods,
      ...(isObject(value.paymentMethods) ? value.paymentMethods : {}),
    },
    paymentDisplay: isObject(value.paymentDisplay)
      ? (value.paymentDisplay as Record<string, PaymentDisplaySetting>)
      : defaultStoreSettings.paymentDisplay,
    footer: {
      ...defaultStoreSettings.footer,
      ...(isObject(value.footer) ? value.footer : {}),
      socialLinks: {
        ...defaultStoreSettings.footer.socialLinks,
        ...(isObject(value.footer) && isObject(value.footer.socialLinks)
          ? value.footer.socialLinks
          : {}),
      },
    },
    theme: {
      ...defaultStoreSettings.theme,
      ...(isObject(value.theme) ? value.theme : {}),
    },
  };
}

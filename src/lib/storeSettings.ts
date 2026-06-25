import type { PaymentMethod } from "./types";

export type TrustItemSetting = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

export type StoreSettings = {
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
    showWhyChooseUs: boolean;
    showFooter: boolean;
  };
  trustItems: TrustItemSetting[];
  featuredProductIds: string[];
  paymentMethods: Record<PaymentMethod, boolean>;
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

export const STORE_SETTINGS_KEY = "digitalshop.storeSettings.v1";

export const defaultStoreSettings: StoreSettings = {
  branding: {
    siteName: "Karta",
    logoText: "Karta",
    heroTitle: "Achetez vos cartes de jeu instantanément au Maroc",
    heroSubtitle:
      "Achetez vos cartes Steam, PlayStation et Xbox au meilleur prix. Code reçu instantanément par email, paiement 100% sécurisé.",
    primaryCtaLabel: "Parcourir le catalogue",
    secondaryCtaLabel: "Comment ça marche",
  },
  homepage: {
    showHero: true,
    showTrustStrip: true,
    showCategories: true,
    showFeaturedProducts: true,
    showWhyChooseUs: true,
    showFooter: true,
  },
  trustItems: [
    {
      id: "mad-pricing",
      title: "Prix clairs en MAD",
      description: "Les prix sont affichés simplement en dirhams, sans confusion ni mauvaises surprises.",
      enabled: true,
    },
    {
      id: "manual-verification",
      title: "Vérification manuelle",
      description: "Chaque commande est contrôlée avant livraison pour éviter les erreurs et protéger les clients.",
      enabled: true,
    },
    {
      id: "saved-codes",
      title: "Codes conservés",
      description: "Vos codes restent accessibles depuis l'historique de vos commandes.",
      enabled: true,
    },
    {
      id: "local-support",
      title: "Support local",
      description: "Une aide disponible en français et en arabe en cas de problème.",
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
    test: true,
    bank: true,
    crypto: true,
    paypal: true,
  },
  footer: {
    contactEmail: "support@karta.ma",
    whatsappNumber: "+212 600 000 000",
    supportText:
      "Le moyen le plus simple d'acheter vos cartes et codes numériques au Maroc.",
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
          ...defaultStoreSettings.trustItems[index % defaultStoreSettings.trustItems.length],
          ...(isObject(item) ? item : {}),
        }))
      : defaultStoreSettings.trustItems,
    featuredProductIds: Array.isArray(value.featuredProductIds)
      ? value.featuredProductIds.filter((id): id is string => typeof id === "string")
      : defaultStoreSettings.featuredProductIds,
    paymentMethods: {
      ...defaultStoreSettings.paymentMethods,
      ...(isObject(value.paymentMethods) ? value.paymentMethods : {}),
    },
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

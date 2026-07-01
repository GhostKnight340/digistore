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
  maintenance: {
    enabled: boolean;
    message: string;
  };
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
  emailTemplates: Record<string, { subject: string; body: string }>;
  legalPages: Record<
    string,
    {
      title: string;
      slug: string;
      content: string;
      seoTitle: string;
      seoDescription: string;
    }
  >;
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
  maintenance: {
    enabled: false,
    message:
      "La boutique ghost.ma est momentanément en maintenance. Les commandes existantes restent accessibles depuis leurs liens de suivi.",
  },
  branding: {
    siteName: "ghost.ma",
    logoText: "ghost.ma",
    heroTitle: "Achetez vos produits numériques rapidement au Maroc",
    heroSubtitle:
      "Achetez vos cartes cadeaux, logiciels, licences et abonnements au meilleur prix. Livraison rapide après confirmation du paiement.",
    primaryCtaLabel: "Parcourir le catalogue",
    secondaryCtaLabel: "Comment ça marche",
  },
  homepage: {
    showHero: true,
    showTrustStrip: true,
    showCategories: true,
    showFeaturedProducts: true,
    showHowItWorks: true,
    showWhyChooseUs: true,
    showFooter: true,
    categoriesTitle: "Catégories populaires",
    categoriesSubtitle: "Les produits numériques les plus demandés au Maroc.",
    featuredTitle: "Produits populaires",
    featuredSubtitle: "Sélection vérifiée, livraison après confirmation du paiement.",
    howItWorksTitle: "Comment ça marche",
    howItWorksSubtitle: "Trois étapes simples, sans friction.",
    whyChooseUsTitle: "Pourquoi choisir ghost.ma?",
    whyChooseUsSubtitle: "Des produits numériques fiables, simples et rapides.",
    ctaTitle: "Prêt à commencer ?",
    ctaSubtitle: "Choisissez un produit et suivez votre commande après paiement.",
  },
  categoryMedia: {},
  categoryStockModes: {},
  featuredOutOfStock: "show",
  trustItems: [
    {
      id: "instant-delivery",
      title: "Livraison rapide",
      description: "Votre produit est disponible après confirmation du paiement.",
      enabled: true,
    },
    {
      id: "secure-checkout",
      title: "Paiement sécurisé",
      description: "Transactions chiffrées et conformes aux standards bancaires.",
      enabled: true,
    },
    {
      id: "saved-codes",
      title: "Produits sauvegardés",
      description: "Vos produits restent accessibles dans votre historique.",
      enabled: true,
    },
    {
      id: "local-support",
      title: "Support local",
      description: "Une équipe au Maroc, disponible en français et en arabe.",
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
  emailTemplates: {
    welcome: {
      subject: "Bienvenue sur ghost.ma",
      body: "Bonjour {{customer_name}},\n\nBienvenue sur ghost.ma. Notre support reste disponible à {{support_email}} ou WhatsApp {{support_whatsapp}}.",
    },
    email_confirmation: {
      subject: "Confirmez votre e-mail ghost.ma",
      body: "Bonjour {{customer_name}},\n\nConfirmez votre adresse e-mail pour sécuriser votre compte ghost.ma.",
    },
    email_verification: {
      subject: "Vérifiez votre e-mail ghost.ma",
      body: "Bonjour {{customer_name}},\n\nVérifiez votre adresse e-mail pour sécuriser votre compte ghost.ma : {{verification_url}}\n\nVotre espace client : {{account_url}}\n\nSupport : {{support_email}} / {{support_whatsapp}}.",
    },
    password_reset: {
      subject: "Réinitialisation de mot de passe",
      body: "Bonjour {{customer_name}},\n\nUtilisez le lien reçu pour réinitialiser votre mot de passe. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    },
    password_changed: {
      subject: "Votre mot de passe ghost.ma a été modifié",
      body: "Bonjour {{customer_name}},\n\nLe mot de passe de votre compte ghost.ma vient d’être modifié.\n\nSi vous n’êtes pas à l’origine de cette action, contactez immédiatement le support.",
    },
    order_received: {
      subject: "Votre commande {{order_number}} a bien été reçue",
      body: "Bonjour {{customer_name}},\n\nNous avons reçu votre commande {{order_number}} d'un total de {{total}}.\n\nFinalisez le paiement ici : {{payment_url}}\n\nMerci pour votre confiance.",
    },
    awaiting_payment: {
      subject: "Paiement attendu pour {{order_number}}",
      body: "Bonjour {{customer_name}},\n\nVotre commande {{order_number}} est en attente de paiement : {{payment_url}}.",
    },
    proof_received: {
      subject: "Paiement reçu pour {{order_number}}",
      body: "Bonjour {{customer_name}},\n\nNous avons reçu votre justificatif de paiement pour {{order_number}}. Notre équipe le vérifie rapidement.",
    },
    new_proof_requested: {
      subject: "Nouveau justificatif demandé pour {{order_number}}",
      body: "Bonjour {{customer_name}},\n\nNous avons besoin d'un nouveau justificatif pour {{order_number}}.\n\nRaison : {{reason}}\n\nAjoutez-le ici : {{payment_url}}.",
    },
    payment_rejected: {
      subject: "Paiement refusé pour {{order_number}}",
      body: "Bonjour {{customer_name}},\n\nLe paiement de votre commande {{order_number}} n'a pas pu être validé.\n\nRaison : {{reason}}\n\nContactez-nous à {{support_email}}.",
    },
    payment_confirmed: {
      subject: "Votre paiement pour {{order_number}} est confirmé",
      body: "Bonjour {{customer_name}},\n\nVotre paiement pour {{order_number}} est confirmé. Votre produit numérique sera disponible sous peu.",
    },
    order_delivered: {
      subject: "Votre commande {{order_number}} est prête",
      body: "Bonjour {{customer_name}},\n\nVotre commande {{order_number}} est disponible ici : {{delivery_url}}\n\nCodes :\n{{codes}}\n\nMerci pour votre achat.",
    },
    refund_update: {
      subject: "Mise à jour remboursement {{order_number}}",
      body: "Bonjour {{customer_name}},\n\nMise à jour concernant votre remboursement : {{reason}}\n\nSupport : {{support_email}}",
    },
  },
  legalPages: {
    terms: {
      title: "Conditions Générales de Vente",
      slug: "terms",
      seoTitle: "Conditions Générales de Vente - ghost.ma",
      seoDescription: "Conditions de vente des produits numériques proposés par ghost.ma.",
      content:
        "Les présentes Conditions Générales de Vente encadrent les achats de produits numériques sur ghost.ma.\n\n1. Identité du vendeur\nghost.ma est exploité par {{business_name}}, {{business_address}}. Les informations légales définitives, notamment l'identifiant fiscal et le registre de commerce, doivent être complétées avant lancement public.\n\n2. Produits numériques\nLes produits vendus sont des codes, cartes cadeaux, licences ou accès numériques. Les caractéristiques essentielles sont indiquées sur chaque fiche produit.\n\n3. Prix et paiement\nLes prix sont affichés en dirhams marocains (MAD), sauf indication contraire. La commande est traitée après validation du paiement.\n\n4. Livraison\nLa livraison est effectuée par voie numérique sur la page de suivi de commande et/ou par e-mail après confirmation du paiement.\n\n5. Utilisation des codes\nLe client est responsable de vérifier la compatibilité régionale et la plateforme avant achat. Une fois un code révélé ou livré, il peut être considéré comme consommé.\n\n6. Support\nPour toute question, contactez {{support_email}} ou {{support_whatsapp}}.",
    },
    privacy: {
      title: "Politique de Confidentialité",
      slug: "privacy",
      seoTitle: "Politique de Confidentialité - ghost.ma",
      seoDescription: "Informations sur la collecte et l'utilisation des données personnelles par ghost.ma.",
      content:
        "Cette Politique de Confidentialité explique comment ghost.ma traite les données nécessaires au fonctionnement de la boutique.\n\n1. Données collectées\nNous pouvons collecter le nom, l'adresse e-mail, les informations de commande, le mode de paiement choisi et les justificatifs nécessaires au traitement d'une commande.\n\n2. Finalités\nCes données servent à créer la commande, vérifier le paiement, livrer le produit numérique, fournir le support client et respecter les obligations applicables.\n\n3. Conservation\nLes données sont conservées pendant la durée nécessaire au suivi commercial, au support et aux obligations légales.\n\n4. Partage\nLes données ne sont partagées qu'avec les prestataires nécessaires au fonctionnement du service, lorsque cela est requis.\n\n5. Droits\nVous pouvez demander l'accès, la rectification ou la suppression de vos données en contactant {{support_email}}.",
    },
    refunds: {
      title: "Politique de Remboursement",
      slug: "refunds",
      seoTitle: "Politique de Remboursement - ghost.ma",
      seoDescription: "Règles de remboursement applicables aux produits numériques ghost.ma.",
      content:
        "Les produits numériques nécessitent une politique de remboursement adaptée à leur nature.\n\n1. Avant livraison\nUne commande peut être annulée ou remboursée si le paiement n'a pas encore été confirmé ou si le code n'a pas encore été livré.\n\n2. Après livraison\nUne fois le code livré ou révélé, le remboursement n'est généralement pas possible, sauf erreur avérée, doublon, code invalide ou problème imputable à ghost.ma.\n\n3. Demande de support\nToute demande doit inclure le numéro de commande, l'e-mail utilisé et une description du problème.\n\n4. Délais\nLes demandes sont analysées au cas par cas. Les délais peuvent varier selon le mode de paiement.",
    },
    legal: {
      title: "Mentions légales",
      slug: "legal",
      seoTitle: "Mentions légales - ghost.ma",
      seoDescription: "Mentions légales et informations d'identité de ghost.ma.",
      content:
        "Éditeur du site : {{business_name}}\nAdresse : {{business_address}}\nE-mail : {{support_email}}\nWhatsApp : {{support_whatsapp}}\nRegistre de commerce : {{business_register}}\nIdentifiant fiscal : {{business_tax_id}}\n\nCes champs doivent être complétés avec les informations officielles de l'entreprise avant le lancement public.",
    },
    support: {
      title: "Contact & Support",
      slug: "support",
      seoTitle: "Contact & Support - ghost.ma",
      seoDescription: "Contacter le support ghost.ma pour une commande ou une question.",
      content:
        "Pour toute question sur une commande, un paiement ou un produit numérique, contactez le support ghost.ma.\n\nE-mail : {{support_email}}\nWhatsApp : {{support_whatsapp}}\n\nMerci d'indiquer votre numéro de commande et l'adresse e-mail utilisée lors de l'achat afin d'accélérer le traitement.",
    },
  },
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
    contactEmail: "support@ghost.ma",
    whatsappNumber: "+212 600 000 000",
    supportText:
      "Le moyen le plus simple d'acheter vos produits numériques au Maroc.",
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
    maintenance: {
      ...defaultStoreSettings.maintenance,
      ...(isObject(value.maintenance) ? value.maintenance : {}),
      enabled:
        isObject(value.maintenance) && typeof value.maintenance.enabled === "boolean"
          ? value.maintenance.enabled
          : defaultStoreSettings.maintenance.enabled,
    },
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
    emailTemplates: isObject(value.emailTemplates)
      ? {
          ...defaultStoreSettings.emailTemplates,
          ...(value.emailTemplates as StoreSettings["emailTemplates"]),
        }
      : defaultStoreSettings.emailTemplates,
    legalPages: isObject(value.legalPages)
      ? {
          ...defaultStoreSettings.legalPages,
          ...(value.legalPages as StoreSettings["legalPages"]),
        }
      : defaultStoreSettings.legalPages,
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

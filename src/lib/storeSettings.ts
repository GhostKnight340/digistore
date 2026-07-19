import type { StockMode } from "./types";
import {
  defaultWhyGhost,
  defaultReviews,
  defaultNavigatorTips,
  defaultDeliverySteps,
  defaultFaqCategories,
  defaultFaqItems,
  type WhyGhostItemSetting,
  type WhyGhostIcon,
  type ReviewSetting,
  type ReviewStatus,
  type NavigatorTipSetting,
  type NavigatorTipType,
  type DeliveryStepSetting,
  type FaqCategorySetting,
  type FaqItemSetting,
} from "./trust/content";

export type {
  WhyGhostItemSetting,
  ReviewSetting,
  NavigatorTipSetting,
  DeliveryStepSetting,
  FaqCategorySetting,
  FaqItemSetting,
} from "./trust/content";

export type TrustItemSetting = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

export type StatItemSetting = {
  id: string;
  /** Large emphasised figure, e.g. "24/7", "MAD", "100%". */
  value: string;
  /** Supporting caption under the figure, e.g. "Livraison digitale". */
  label: string;
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

export type FooterPaymentBadgeSetting = {
  id: string;
  label: string;
  enabled: boolean;
};

export type StoreSettings = {
  /** Global inventory system switch. When false, the stock/inventory system is
   * hidden and purchases are never blocked by quantity — availability is
   * controlled only by the manual active/inactive fields. Inventory data is
   * preserved and reappears when re-enabled. */
  inventoryEnabled: boolean;
  inventoryMode: "automatic" | "manual";
  /** Global "Accept customer orders" switch. When false, the catalog stays
   * fully browsable but every path that could create or pay for an order is
   * disabled (frontend and server-side), and no payment instructions are
   * exposed. Existing orders remain viewable. Products, prices and payment
   * configuration are untouched, so flipping this back on restores the normal
   * purchase flow with no further changes. Defaults to OFF (see
   * `isOrderingEnabled` — legacy blobs without the field are treated as OFF). */
  ordersEnabled: boolean;
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
    showStats: boolean;
    showBrandNav: boolean;
    showCategories: boolean;
    showFeaturedProducts: boolean;
    /** Master switch for the curated collection sections on the homepage. Each
     *  collection still has its own per-collection "Afficher sur l'accueil"
     *  toggle; this hides all of them at once when off. */
    showCollections: boolean;
    showHowItWorks: boolean;
    showWhyChooseUs: boolean;
    /** Customer Trust & Conversion sections. */
    showWhyGhost: boolean;
    showReviews: boolean;
    showDelivery: boolean;
    showPaymentMethods: boolean;
    showFaq: boolean;
    showFooter: boolean;
    brandNavTitle: string;
    brandNavSubtitle: string;
    categoriesTitle: string;
    categoriesSubtitle: string;
    /** Heading + subtitle for the compact "Explorer les collections" cards. */
    collectionsTitle: string;
    collectionsSubtitle: string;
    featuredTitle: string;
    featuredSubtitle: string;
    howItWorksTitle: string;
    howItWorksSubtitle: string;
    whyChooseUsTitle: string;
    whyChooseUsSubtitle: string;
    whyGhostTitle: string;
    whyGhostSubtitle: string;
    reviewsTitle: string;
    reviewsSubtitle: string;
    deliveryTitle: string;
    deliverySubtitle: string;
    paymentMethodsTitle: string;
    paymentMethodsSubtitle: string;
    faqTitle: string;
    faqSubtitle: string;
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
  statItems: StatItemSetting[];
  /** Customer Trust & Conversion content (admin-editable via the settings blob). */
  whyGhost: WhyGhostItemSetting[];
  reviews: ReviewSetting[];
  navigatorTips: NavigatorTipSetting[];
  deliverySteps: DeliveryStepSetting[];
  faqCategories: FaqCategorySetting[];
  faqItems: FaqItemSetting[];
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
    paymentBadges: FooterPaymentBadgeSetting[];
  };
  theme: {
    accentColor: string;
    backgroundColor: string;
    cardRadius: string;
    buttonRadius: string;
  };
  // Admin-only expense-ledger config. No actual expense values live here — just
  // reporting/notification preferences.
  expenses: {
    reportingCurrency: string;
    discordEnabled: boolean;
    monthlySummaryEnabled: boolean;
    monthlySummaryDay: number;
    defaultReminderDaysBefore: number[];
    remindOnDue: boolean;
    remindOverdue: boolean;
    // End-of-month expense review (posted to the #ghost-expenses channel on the
    // last calendar day of the month). businessTimezone decides which day is
    // "the last day"; monthlyReviewHour is the earliest business-local hour the
    // dedicated evening cron may send at (keep it aligned with the cron's UTC
    // time in vercel.json — see src/app/api/cron/expense-review/route.ts).
    monthlyReviewEnabled: boolean;
    businessTimezone: string;
    monthlyReviewHour: number;
  };
  // Ghost Credit wallet config. No balances live here — only policy.
  ghostCredit: {
    // Days of inactivity (no qualifying earned credit) before the wallet
    // expires. Default 180. Only promo/milestone rewards from paid+completed
    // orders reset this timer.
    inactivityDays: number;
    // Days before expiry the reminder email is sent (when the customer opted in).
    reminderDaysBefore: number;
  };
  // Discovery/engagement feature switches. Additive; safe defaults keep the new
  // storefront features on without any admin action.
  features: {
    // Master switch for the customer wishlist ("Favoris"). Off → hearts hide and
    // /account/favoris shows a disabled notice; existing saved rows are kept.
    wishlistEnabled: boolean;
    // Show the "Consultés récemment" strip on the homepage.
    recentlyViewedOnHomepage: boolean;
    // Max recently-viewed products kept per device/customer (parent products).
    recentlyViewedMax: number;
  };
};

export const defaultStoreSettings: StoreSettings = {
  inventoryEnabled: true,
  inventoryMode: "automatic",
  // Ordering is OFF until live fulfilment is ready (pre-launch mode).
  ordersEnabled: false,
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
    showStats: true,
    showBrandNav: true,
    showCategories: true,
    showFeaturedProducts: true,
    showCollections: true,
    showHowItWorks: true,
    showWhyChooseUs: true,
    showWhyGhost: true,
    showReviews: true,
    showDelivery: true,
    showPaymentMethods: true,
    showFaq: true,
    showFooter: true,
    brandNavTitle: "Parcourir par marque",
    brandNavSubtitle: "Accédez directement à vos plateformes préférées.",
    categoriesTitle: "Catégories populaires",
    categoriesSubtitle: "Les produits numériques les plus demandés au Maroc.",
    collectionsTitle: "Explorer les collections",
    collectionsSubtitle: "Découvrez nos sélections par univers, usage ou région.",
    featuredTitle: "Produits populaires",
    featuredSubtitle: "Sélection vérifiée, livraison après confirmation du paiement.",
    howItWorksTitle: "Comment ça marche",
    howItWorksSubtitle: "Trois étapes simples, sans friction.",
    whyChooseUsTitle: "Pourquoi choisir ghost.ma ?",
    whyChooseUsSubtitle: "Des produits numériques fiables, simples et rapides.",
    whyGhostTitle: "Pourquoi acheter sur ghost.ma",
    whyGhostSubtitle: "Des avantages concrets, pensés pour les acheteurs au Maroc.",
    reviewsTitle: "Ce que disent nos clients",
    reviewsSubtitle: "Des achats réels, vérifiés après la livraison.",
    deliveryTitle: "Comment se passe la livraison",
    deliverySubtitle: "De la commande à l'utilisation de votre code, en toute clarté.",
    paymentMethodsTitle: "Moyens de paiement acceptés",
    paymentMethodsSubtitle: "Seuls les moyens réellement disponibles sont affichés.",
    faqTitle: "Questions fréquentes",
    faqSubtitle: "Les réponses aux questions les plus posées avant l'achat.",
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
  statItems: [
    { id: "delivery", value: "24/7", label: "Livraison digitale", enabled: true },
    { id: "local-payment", value: "DH", label: "Paiement local", enabled: true },
    { id: "official-codes", value: "100%", label: "Sources vérifiées", enabled: true },
  ],
  whyGhost: defaultWhyGhost,
  reviews: defaultReviews,
  navigatorTips: defaultNavigatorTips,
  deliverySteps: defaultDeliverySteps,
  faqCategories: defaultFaqCategories,
  faqItems: defaultFaqItems,
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
    checkout_email_verification: {
      subject: "Votre code de vérification ghost.ma",
      body: "Bonjour {{customer_name}},\n\nVotre code de vérification est {{verification_code}}. Il expire dans {{expiry_minutes}} minutes.",
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
      // Body only — the shell adds the greeting once, an optional Motif block
      // (from the reason), and the "Ajouter un justificatif" CTA button.
      body: "Nous avons besoin d'un nouveau justificatif de paiement pour votre commande {{order_number}}.",
    },
    payment_issue: {
      subject: "Problème avec votre paiement pour {{order_number}}",
      // Body only — shell adds greeting, optional Motif block and "Voir le
      // paiement" CTA. Used for admin "mark issue" and PayPal capture denials.
      body: "Un problème a été détecté avec le paiement de votre commande {{order_number}}. Vérifiez les informations sur la page de paiement ou contactez notre support.",
    },
    order_cancelled: {
      subject: "Commande {{order_number}} annulée",
      // Body only — the shell adds the greeting once, an optional Motif block
      // and the "Voir ma commande" CTA. No payment was taken at this stage, so
      // the copy must not imply a refund is coming.
      body:
        "Votre commande {{order_number}} a bien été annulée. Aucun paiement n'a été prélevé. " +
        "Vous pouvez repasser commande à tout moment.",
    },
    payment_rejected: {
      subject: "Paiement refusé pour {{order_number}}",
      // Body only — the shell adds the greeting once, an optional Motif block
      // (from the reason) and the "Voir le paiement" CTA. Support contact lives
      // in the footer.
      body: "Le paiement de votre commande {{order_number}} n'a pas pu être validé.",
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
      // Body only — the shell adds the greeting once, an optional Motif block
      // (from the reason) and the "Suivre ma commande" CTA.
      body: "Voici une mise à jour concernant le remboursement de votre commande {{order_number}}.",
    },
    support_received: {
      subject: "Votre demande {{reference}} a bien été reçue",
      // Body only — the shell adds the greeting once and the "Suivre ma
      // demande" CTA button.
      body: "Nous avons bien reçu votre demande {{reference}} concernant « {{subject}} ». Notre équipe vous répondra dans les plus brefs délais, généralement sous 24 h. Vous pouvez suivre l'état de votre demande à tout moment.",
    },
    support_reply: {
      subject: "Réponse à votre demande {{reference}}",
      // Body only — the shell adds the greeting once, the "Réponse de notre
      // équipe" block (from the reply text) and the "Voir ma demande" CTA.
      body: "Notre équipe a répondu à votre demande {{reference}}.",
    },
    support_closed: {
      subject: "Votre demande {{reference}} a été clôturée",
      // Body only — the shell adds the greeting once, an optional "Statut de
      // clôture" block (from the resolution) and the "Donner mon avis" CTA.
      body: "Votre demande {{reference}} a été clôturée. Votre avis compte beaucoup pour nous : dites-nous comment s'est passée votre expérience avec notre support en laissant une note et un commentaire. Cela nous aide à nous améliorer.",
    },
    ghost_credit_expiry_reminder: {
      subject: "Votre crédit Ghost expire bientôt",
      body: "Il vous reste {{credit_amount}} de crédit Ghost, qui expire dans {{days_remaining}} jours (le {{expiry_date}}). Seul un nouveau crédit gagné après une commande payée et finalisée prolonge sa validité — dépenser votre crédit ou recevoir un ajustement manuel ne réinitialise pas ce délai. Utilisez-le sur Ghost.ma avant qu'il n'expire.",
    },
  },
  legalPages: {
    terms: {
      title: "Conditions Générales de Vente",
      slug: "terms",
      seoTitle: "Conditions Générales de Vente - ghost.ma",
      seoDescription: "Conditions de vente des produits numériques proposés par ghost.ma.",
      content:
        "Les présentes Conditions Générales de Vente encadrent les achats de produits numériques sur ghost.ma.\n\n1. Identité du vendeur\nghost.ma est exploité par {{business_name}}, {{business_address}}. Les informations légales définitives, notamment l'identifiant fiscal et le registre de commerce, doivent être complétées avant lancement public.\n\n2. Produits numériques\nLes produits vendus sont des codes, cartes cadeaux, licences ou accès numériques. Les caractéristiques essentielles sont indiquées sur chaque fiche produit.\n\n3. Prix et paiement\nLes prix sont affichés en dirhams marocains (DH), sauf indication contraire. La commande est traitée après validation du paiement.\n\n4. Livraison\nLa livraison est effectuée par voie numérique sur la page de suivi de commande et/ou par e-mail après confirmation du paiement.\n\n5. Utilisation des codes\nLe client est responsable de vérifier la compatibilité régionale et la plateforme avant achat. Une fois un code révélé ou livré, il peut être considéré comme consommé.\n\n6. Support\nPour toute question, contactez {{support_email}} ou {{support_whatsapp}}.",
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
  paymentDisplay: {},
  footer: {
    contactEmail: "support@ghost.ma",
    whatsappNumber: "+212 600 000 000",
    supportText:
      "Le moyen le plus simple d'acheter vos produits numériques au Maroc.",
    socialLinks: {
      instagram: "https://www.instagram.com/ghost.ma/",
      facebook: "",
      x: "",
    },
    paymentBadges: [
      { id: "visa", label: "Visa", enabled: true },
      { id: "mastercard", label: "Mastercard", enabled: true },
      { id: "paypal", label: "PayPal", enabled: true },
    ],
  },
  theme: {
    accentColor: "#3e7bfa",
    backgroundColor: "#0a0b0d",
    cardRadius: "16px",
    buttonRadius: "12px",
  },
  expenses: {
    reportingCurrency: "MAD",
    discordEnabled: true,
    monthlySummaryEnabled: true,
    monthlySummaryDay: 1,
    defaultReminderDaysBefore: [7, 3, 1],
    remindOnDue: true,
    remindOverdue: true,
    monthlyReviewEnabled: true,
    businessTimezone: "Africa/Casablanca",
    monthlyReviewHour: 20,
  },
  ghostCredit: {
    inactivityDays: 180,
    reminderDaysBefore: 3,
  },
  features: {
    wishlistEnabled: true,
    recentlyViewedOnHomepage: false,
    recentlyViewedMax: 12,
  },
};

/**
 * Single source of truth for the global inventory toggle. Use this everywhere
 * instead of ad-hoc checks. Defaults to enabled for any settings blob that
 * predates the toggle.
 */
export function isInventoryEnabled(
  settings: Pick<StoreSettings, "inventoryEnabled">,
): boolean {
  return settings.inventoryEnabled !== false;
}

/**
 * Single source of truth for the global "Accept customer orders" toggle. Use
 * this everywhere (server actions, API routes, product/cart/checkout/payment
 * pages) instead of reading the raw field, so the behaviour stays consistent.
 * Strict `=== true`: any settings blob predating the toggle — or with the field
 * missing/malformed — is treated as ordering DISABLED (pre-launch default).
 */
export function isOrderingEnabled(
  settings: Pick<StoreSettings, "ordersEnabled">,
): boolean {
  return settings.ordersEnabled === true;
}

/**
 * Centralized customer-facing copy for the "orders unavailable" state. Shared
 * by the product page, cart, checkout, payment page and the site-wide banner so
 * the wording stays identical everywhere.
 */
export const ORDERS_UNAVAILABLE_COPY = {
  title: "Les commandes sont temporairement indisponibles.",
  body: "Notre catalogue reste accessible, mais les achats sont momentanément suspendus pendant la finalisation de nos intégrations. Revenez bientôt.",
  /** Label for the disabled purchase button that replaces add-to-cart/buy. */
  buttonLabel: "Commandes temporairement indisponibles",
  /** Optional secondary action pointing at the contact page. */
  contactLabel: "Nous contacter",
  contactHref: "/contact",
  /** Compact one-liner for the unintrusive site-wide banner. */
  banner: "Les commandes sont temporairement indisponibles — le catalogue reste consultable.",
} as const;

/**
 * True only when stock quantities should be tracked and may block a purchase:
 * inventory globally enabled AND not in the "manual" (always in-stock) mode.
 * When false, availability is decided solely by manual active/inactive fields.
 */
export function isStockTracked(
  settings: Pick<StoreSettings, "inventoryEnabled" | "inventoryMode">,
): boolean {
  return isInventoryEnabled(settings) && settings.inventoryMode !== "manual";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Normalizes a stored content array (why-choose cards, reviews, tips, FAQ…).
 * Unlike the legacy `trustItems`/`statItems` index-backfill, these items are
 * self-contained and variable-length, so each object is mapped through a
 * coercer and invalid entries are dropped. Non-arrays fall back to defaults.
 */
function mergeList<T>(
  value: unknown,
  fallback: T[],
  coerce: (raw: Record<string, unknown>) => T | null,
): T[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => (isObject(item) ? coerce(item) : null))
    .filter((item): item is T => item !== null);
}

const WHY_GHOST_ICONS: WhyGhostIcon[] = [
  "official",
  "payment",
  "region",
  "delivery",
  "support",
  "secure",
];
const NAVIGATOR_TIP_TYPES: NavigatorTipType[] = [
  "information",
  "compatibility",
  "warning",
  "security",
];
const REVIEW_STATUSES: ReviewStatus[] = ["approved", "pending", "hidden"];

/**
 * Per-template merge of stored email templates over the defaults. A stored
 * subject/body only wins when it's a non-empty string; a subject equal to the
 * raw template key (an old bug that leaked keys like
 * "checkout_email_verification" into real inbox subjects) is treated as
 * missing so the default subject is used instead.
 */
function mergeEmailTemplates(stored: unknown): StoreSettings["emailTemplates"] {
  const merged = { ...defaultStoreSettings.emailTemplates };
  if (!isObject(stored)) return merged;
  for (const [key, raw] of Object.entries(stored)) {
    if (!isObject(raw)) continue;
    const fallback = merged[key] ?? { subject: key, body: "" };
    const subject = str(raw.subject).trim();
    const body = str(raw.body);
    merged[key] = {
      subject: subject && subject !== key ? subject : fallback.subject,
      body: body.trim() ? body : fallback.body,
    };
  }
  return merged;
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
    inventoryEnabled:
      typeof value.inventoryEnabled === "boolean"
        ? value.inventoryEnabled
        : defaultStoreSettings.inventoryEnabled,
    ordersEnabled:
      typeof value.ordersEnabled === "boolean"
        ? value.ordersEnabled
        : defaultStoreSettings.ordersEnabled,
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
    statItems: Array.isArray(value.statItems)
      ? value.statItems.map((item, index) => ({
          ...defaultStoreSettings.statItems[
            index % defaultStoreSettings.statItems.length
          ],
          ...(isObject(item) ? item : {}),
        }))
      : defaultStoreSettings.statItems,
    whyGhost: mergeList(value.whyGhost, defaultStoreSettings.whyGhost, (raw) => {
      const id = str(raw.id).trim();
      const title = str(raw.title).trim();
      if (!id || !title) return null;
      const icon = raw.icon as WhyGhostIcon;
      return {
        id,
        icon: WHY_GHOST_ICONS.includes(icon) ? icon : "secure",
        title,
        description: str(raw.description),
        enabled: bool(raw.enabled),
      };
    }),
    reviews: mergeList(value.reviews, defaultStoreSettings.reviews, (raw) => {
      const id = str(raw.id).trim();
      const name = str(raw.name).trim();
      const text = str(raw.text).trim();
      if (!id || !name || !text) return null;
      const status = raw.status as ReviewStatus;
      const rating =
        typeof raw.rating === "number" && Number.isFinite(raw.rating)
          ? Math.min(5, Math.max(1, Math.round(raw.rating)))
          : 5;
      return {
        id,
        name,
        rating,
        region: str(raw.region),
        product: str(raw.product),
        date: str(raw.date),
        text,
        imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
        verified: bool(raw.verified, false),
        status: REVIEW_STATUSES.includes(status) ? status : "pending",
        seeded: bool(raw.seeded, false),
      };
    }),
    navigatorTips: mergeList(
      value.navigatorTips,
      defaultStoreSettings.navigatorTips,
      (raw) => {
        const id = str(raw.id).trim();
        const message = str(raw.message).trim();
        if (!id || !message) return null;
        const type = raw.type as NavigatorTipType;
        return {
          id,
          contexts: Array.isArray(raw.contexts)
            ? raw.contexts.filter((c): c is string => typeof c === "string")
            : ["general"],
          type: NAVIGATOR_TIP_TYPES.includes(type) ? type : "information",
          title: str(raw.title),
          message,
          enabled: bool(raw.enabled),
        };
      },
    ),
    deliverySteps: mergeList(
      value.deliverySteps,
      defaultStoreSettings.deliverySteps,
      (raw) => {
        const id = str(raw.id).trim();
        const title = str(raw.title).trim();
        if (!id || !title) return null;
        return {
          id,
          title,
          text: str(raw.text),
          enabled: bool(raw.enabled),
        };
      },
    ),
    faqCategories: mergeList(
      value.faqCategories,
      defaultStoreSettings.faqCategories,
      (raw) => {
        const id = str(raw.id).trim();
        const label = str(raw.label).trim();
        if (!id || !label) return null;
        return { id, label };
      },
    ),
    faqItems: mergeList(value.faqItems, defaultStoreSettings.faqItems, (raw) => {
      const id = str(raw.id).trim();
      const question = str(raw.question).trim();
      const answer = str(raw.answer).trim();
      if (!id || !question || !answer) return null;
      return {
        id,
        category: str(raw.category, "support"),
        question,
        answer,
        enabled: bool(raw.enabled),
      };
    }),
    featuredProductIds: Array.isArray(value.featuredProductIds)
      ? value.featuredProductIds.filter((id): id is string => typeof id === "string")
      : defaultStoreSettings.featuredProductIds,
    emailTemplates: mergeEmailTemplates(value.emailTemplates),
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
      paymentBadges:
        isObject(value.footer) && Array.isArray(value.footer.paymentBadges)
          ? value.footer.paymentBadges
              .map((badge) => ({
                id: isObject(badge) && typeof badge.id === "string" ? badge.id : "",
                label: isObject(badge) && typeof badge.label === "string" ? badge.label : "",
                enabled: isObject(badge) && typeof badge.enabled === "boolean" ? badge.enabled : true,
              }))
              .filter((badge) => badge.id.trim() && badge.label.trim())
          : defaultStoreSettings.footer.paymentBadges,
    },
    theme: {
      ...defaultStoreSettings.theme,
      ...(isObject(value.theme) ? value.theme : {}),
    },
    expenses: {
      ...defaultStoreSettings.expenses,
      ...(isObject(value.expenses) ? value.expenses : {}),
      defaultReminderDaysBefore:
        isObject(value.expenses) && Array.isArray(value.expenses.defaultReminderDaysBefore)
          ? value.expenses.defaultReminderDaysBefore.filter((n): n is number => typeof n === "number")
          : defaultStoreSettings.expenses.defaultReminderDaysBefore,
    },
    ghostCredit: {
      ...defaultStoreSettings.ghostCredit,
      ...(isObject(value.ghostCredit) ? value.ghostCredit : {}),
      inactivityDays:
        isObject(value.ghostCredit) &&
        typeof value.ghostCredit.inactivityDays === "number" &&
        value.ghostCredit.inactivityDays > 0
          ? Math.round(value.ghostCredit.inactivityDays)
          : defaultStoreSettings.ghostCredit.inactivityDays,
      reminderDaysBefore:
        isObject(value.ghostCredit) &&
        typeof value.ghostCredit.reminderDaysBefore === "number" &&
        value.ghostCredit.reminderDaysBefore > 0
          ? Math.round(value.ghostCredit.reminderDaysBefore)
          : defaultStoreSettings.ghostCredit.reminderDaysBefore,
    },
    features: {
      wishlistEnabled:
        isObject(value.features) && typeof value.features.wishlistEnabled === "boolean"
          ? value.features.wishlistEnabled
          : defaultStoreSettings.features.wishlistEnabled,
      recentlyViewedOnHomepage:
        isObject(value.features) &&
        typeof value.features.recentlyViewedOnHomepage === "boolean"
          ? value.features.recentlyViewedOnHomepage
          : defaultStoreSettings.features.recentlyViewedOnHomepage,
      recentlyViewedMax:
        isObject(value.features) &&
        typeof value.features.recentlyViewedMax === "number" &&
        value.features.recentlyViewedMax > 0
          ? Math.min(24, Math.round(value.features.recentlyViewedMax))
          : defaultStoreSettings.features.recentlyViewedMax,
    },
  };
}

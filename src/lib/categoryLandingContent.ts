/**
 * Predefined rich landing-page content for the known brand categories, with
 * accurate French copy (hero, intro, quick-info points, a region/compatibility
 * Navigator tip, FAQ, related brands, SEO). Pure/data-only — no database, no
 * server-only imports — so it is shared by both the CLI seed script
 * (scripts/seed-category-landing.ts) and the in-admin "fill brands" action.
 *
 * Matching is by canonical brand key (see canonicalBrandKey) with a few extra
 * content aliases (iTunes/App Store → Apple). `buildLanding` turns a brand's
 * content into a normalized CategoryLanding ready to persist.
 */
import {
  normalizeCategoryLanding,
  type CategoryLanding,
  type InfoIconKey,
  type NavigatorTipType,
} from "@/lib/categoryLanding";

export type BrandContent = {
  heroSubtitle: string;
  intro: string;
  info: { icon: InfoIconKey; title: string; description: string }[];
  tip: { type: NavigatorTipType; title: string; message: string };
  faq: { q: string; a: string }[];
  related: string[];
  seo: { title: string; description: string };
};

// Shared building blocks — accurate for digital codes delivered after payment
// confirmation (NOT "instant"), sold with region choices.
const DELIVERY = {
  icon: "bolt" as InfoIconKey,
  title: "Livraison après confirmation",
  description: "Code envoyé par e-mail dès la confirmation du paiement.",
};
const OFFICIAL = {
  icon: "shield" as InfoIconKey,
  title: "Codes 100% officiels",
  description: "Produits numériques authentiques.",
};
const REGIONS = {
  icon: "globe" as InfoIconKey,
  title: "Plusieurs régions",
  description: "Choisissez la région adaptée à votre compte.",
};
const SUPPORT = {
  icon: "support" as InfoIconKey,
  title: "Support Ghost.ma",
  description: "Une équipe au Maroc, disponible avant et après l'achat.",
};
const REFUND_FAQ = {
  q: "Les produits numériques sont-ils remboursables ?",
  a: "Les produits numériques sont livrés sous forme de code à usage unique. Avant tout achat, vérifiez la région et la compatibilité, et consultez notre politique de remboursement ou contactez le support en cas de doute.",
};
const DELIVERY_FAQ = {
  q: "Quand vais-je recevoir mon code ?",
  a: "Votre code est envoyé par e-mail dès que votre paiement est confirmé.",
};

export const CONTENT: Record<string, BrandContent> = {
  steam: {
    heroSubtitle:
      "Rechargez votre portefeuille Steam et payez vos jeux, DLC et objets en toute simplicité.",
    intro:
      "Les cartes **Steam Wallet** créditent votre compte Steam pour acheter des jeux, des extensions (DLC), des objets et tout le contenu de la boutique — sans carte bancaire.\n\n**À retenir :**\n- Choisissez le montant qui vous convient parmi les cartes disponibles ci-dessous.\n- Compatible PC, Mac et Steam Deck.\n- Sans date d'expiration : utilisez votre solde quand vous le souhaitez.\n- Idéale pour offrir à un joueur.\n- Le solde suit la devise de votre compte — vérifiez la région avant de commander.",
    info: [DELIVERY, OFFICIAL, REGIONS, SUPPORT],
    tip: {
      type: "compatibility",
      title: "Vérifiez la région de votre compte Steam",
      message:
        "Le solde Steam est lié à la devise de votre compte. Assurez-vous que la région/devise de votre compte Steam correspond à celle de la carte avant de commander.",
    },
    faq: [
      {
        q: "Comment utiliser une carte Steam Wallet ?",
        a: "Connectez-vous à Steam, ouvrez « Ajouter des fonds au portefeuille Steam » ou saisissez le code via « Activer un produit sur Steam », puis suivez les instructions.",
      },
      {
        q: "La région de la carte est-elle importante ?",
        a: "Oui. Le portefeuille Steam utilise la devise de votre compte. Choisissez une carte correspondant à la région de votre compte Steam.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["playstation", "xbox", "roblox"],
    seo: {
      title: "Cartes Steam Wallet au Maroc - ghost.ma",
      description:
        "Achetez vos cartes Steam Wallet au meilleur prix. Codes officiels, livraison après confirmation du paiement.",
    },
  },
  playstation: {
    heroSubtitle:
      "Cartes PlayStation Store pour vos jeux, abonnements et achats sur le PSN.",
    intro:
      "Les cartes **PlayStation Store** créditent votre portefeuille PSN pour acheter des jeux, des extensions, du contenu et des abonnements **PlayStation Plus** sur le PlayStation Store.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- Fonctionne sur PS5 et PS4, et depuis le site PlayStation.\n- Sans carte bancaire, paiement local en dirham.\n- Cartes régionales : choisissez la région de votre compte PSN.\n- Parfaites comme cadeau.",
    info: [DELIVERY, OFFICIAL, REGIONS, SUPPORT],
    tip: {
      type: "compatibility",
      title: "Vérifiez la région de votre compte PSN",
      message:
        "Les cartes PlayStation sont liées à une région. Assurez-vous que la région de votre compte PSN correspond à celle de la carte avant de commander.",
    },
    faq: [
      {
        q: "Comment activer une carte PlayStation ?",
        a: "Sur votre console ou sur le site PlayStation, ouvrez le PlayStation Store, choisissez « Utiliser un code », puis saisissez le code reçu.",
      },
      {
        q: "Puis-je utiliser une carte d'une autre région ?",
        a: "Non. La carte doit correspondre à la région de votre compte PSN. Vérifiez votre région avant de commander.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["steam", "xbox", "nintendo"],
    seo: {
      title: "Cartes PlayStation Store (PSN) au Maroc - ghost.ma",
      description:
        "Cartes PSN officielles pour jeux et abonnements. Choisissez votre région, livraison après confirmation du paiement.",
    },
  },
  xbox: {
    heroSubtitle:
      "Cartes cadeaux Xbox et Microsoft pour vos jeux, Game Pass et contenu.",
    intro:
      "Les cartes **Xbox / Microsoft** créditent votre compte Microsoft pour les jeux, le contenu et les abonnements (dont **Game Pass**) sur Xbox et le Microsoft Store.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- Compatible consoles Xbox et PC Windows.\n- Sans date d'expiration.\n- Choisissez la région de votre compte Microsoft.\n- Idéales pour offrir.",
    info: [DELIVERY, OFFICIAL, REGIONS, SUPPORT],
    tip: {
      type: "compatibility",
      title: "Vérifiez la région de votre compte Microsoft",
      message:
        "Les cartes Xbox/Microsoft dépendent de la région du compte. Assurez-vous que la région de votre compte Microsoft correspond à celle de la carte.",
    },
    faq: [
      {
        q: "Comment utiliser une carte cadeau Xbox ?",
        a: "Connectez-vous à votre compte Microsoft, ouvrez « Utiliser un code » sur la console ou sur microsoft.com/redeem, puis saisissez le code.",
      },
      {
        q: "La région de la carte compte-t-elle ?",
        a: "Oui. Choisissez une carte correspondant à la région de votre compte Microsoft.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["steam", "playstation", "nintendo"],
    seo: {
      title: "Cartes cadeaux Xbox au Maroc - ghost.ma",
      description:
        "Cartes Xbox / Microsoft officielles pour jeux et Game Pass. Livraison après confirmation du paiement.",
    },
  },
  nintendo: {
    heroSubtitle:
      "Cartes Nintendo eShop pour vos jeux et contenu sur Nintendo Switch.",
    intro:
      "Les cartes **Nintendo eShop** ajoutent un solde à votre compte Nintendo pour acheter des jeux et du contenu sur le Nintendo eShop.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- Pour Nintendo Switch (et la famille Switch).\n- Sans date d'expiration.\n- L'eShop est régional : choisissez la région de votre compte.\n- Une belle idée cadeau.",
    info: [DELIVERY, OFFICIAL, REGIONS, SUPPORT],
    tip: {
      type: "compatibility",
      title: "Vérifiez la région de votre compte Nintendo",
      message:
        "Le Nintendo eShop est régional. Assurez-vous que la région de votre compte Nintendo correspond à celle de la carte avant de commander.",
    },
    faq: [
      {
        q: "Comment utiliser une carte Nintendo eShop ?",
        a: "Sur votre Switch, ouvrez le Nintendo eShop, sélectionnez « Entrer un code », puis saisissez le code reçu.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["playstation", "xbox", "steam"],
    seo: {
      title: "Cartes Nintendo eShop au Maroc - ghost.ma",
      description:
        "Cartes Nintendo eShop officielles pour Switch. Choisissez votre région, livraison après confirmation.",
    },
  },
  "google-play": {
    heroSubtitle:
      "Cartes Google Play pour vos applications, jeux et achats intégrés.",
    intro:
      "Les cartes **Google Play** créditent votre compte Google pour les applications, jeux, achats intégrés, films et livres du Play Store.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- Pour smartphones et tablettes Android.\n- Sans carte bancaire.\n- La carte doit correspondre au pays de votre compte Google.\n- Sans date d'expiration.",
    info: [DELIVERY, OFFICIAL, REGIONS, SUPPORT],
    tip: {
      type: "compatibility",
      title: "Vérifiez le pays de votre compte Google",
      message:
        "Les cartes Google Play sont liées à un pays. Le pays de votre compte Google doit correspondre à celui de la carte pour pouvoir l'utiliser.",
    },
    faq: [
      {
        q: "Comment utiliser une carte Google Play ?",
        a: "Ouvrez l'application Google Play, appuyez sur votre profil puis « Paiements et abonnements » › « Utiliser un code », et saisissez le code.",
      },
      {
        q: "Le pays de la carte est-il important ?",
        a: "Oui. La carte doit correspondre au pays de votre compte Google.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["apple", "roblox"],
    seo: {
      title: "Cartes Google Play au Maroc - ghost.ma",
      description:
        "Cartes Google Play officielles pour applications et jeux. Livraison après confirmation du paiement.",
    },
  },
  apple: {
    heroSubtitle:
      "Cartes Apple / iTunes pour l'App Store, iCloud, la musique et vos abonnements.",
    intro:
      "Les cartes **Apple / iTunes** créditent votre identifiant Apple pour l'App Store, **iCloud+**, **Apple Music**, les jeux et les abonnements.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- Pour iPhone, iPad et Mac.\n- Sans date d'expiration.\n- La carte doit correspondre au pays de votre identifiant Apple.\n- Idéale pour offrir.",
    info: [DELIVERY, OFFICIAL, REGIONS, SUPPORT],
    tip: {
      type: "compatibility",
      title: "Vérifiez le pays de votre identifiant Apple",
      message:
        "Les cartes Apple sont régionales. Le pays de votre identifiant Apple doit correspondre à celui de la carte pour l'utiliser.",
    },
    faq: [
      {
        q: "Comment utiliser une carte Apple / iTunes ?",
        a: "Ouvrez l'App Store, appuyez sur votre photo de profil, choisissez « Utiliser une carte cadeau ou un code », puis saisissez le code.",
      },
      {
        q: "La région de la carte compte-t-elle ?",
        a: "Oui. Choisissez une carte correspondant au pays de votre identifiant Apple.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["google-play", "netflix"],
    seo: {
      title: "Cartes Apple / iTunes au Maroc - ghost.ma",
      description:
        "Cartes Apple / iTunes officielles pour App Store, iCloud et Apple Music. Livraison après confirmation.",
    },
  },
  netflix: {
    heroSubtitle: "Cartes cadeaux Netflix pour régler votre abonnement streaming.",
    intro:
      "Les cartes cadeaux **Netflix** ajoutent un crédit à votre compte, appliqué automatiquement à votre abonnement mensuel — une façon simple de payer Netflix sans carte bancaire.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- S'utilise sur un compte du même pays que la carte.\n- Le crédit couvre l'abonnement jusqu'à épuisement.\n- Idéale pour offrir un abonnement.",
    info: [DELIVERY, OFFICIAL, REGIONS, SUPPORT],
    tip: {
      type: "information",
      title: "Carte liée au pays du compte",
      message:
        "Les cartes cadeaux Netflix s'utilisent sur un compte du même pays. Vérifiez que la carte correspond à la région de votre compte Netflix.",
    },
    faq: [
      {
        q: "Comment utiliser une carte cadeau Netflix ?",
        a: "Rendez-vous sur netflix.com/redeem, saisissez le code, et le crédit sera appliqué à votre compte pour vos prochains paiements.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["apple", "google-play"],
    seo: {
      title: "Cartes cadeaux Netflix au Maroc - ghost.ma",
      description:
        "Cartes cadeaux Netflix officielles pour votre abonnement. Livraison après confirmation du paiement.",
    },
  },
  roblox: {
    heroSubtitle: "Cartes Roblox pour obtenir des Robux et du contenu premium.",
    intro:
      "Les cartes **Roblox** créditent votre compte en **Robux**, la monnaie pour acheter objets, accessoires et améliorations dans les expériences Roblox.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- Robux crédités sur le compte qui saisit le code.\n- Certaines cartes incluent un objet virtuel bonus.\n- Multi-plateforme : mobile, PC, console.\n- Idéale pour offrir.",
    info: [DELIVERY, OFFICIAL, { icon: "sparkle", title: "Robux & bonus", description: "Crédité directement sur votre compte." }, SUPPORT],
    tip: {
      type: "information",
      title: "Robux crédités sur votre compte",
      message:
        "Utilisez le code sur roblox.com/redeem en étant connecté au bon compte : les Robux sont ajoutés au compte qui saisit le code.",
    },
    faq: [
      {
        q: "Comment échanger une carte Roblox ?",
        a: "Connectez-vous à votre compte, allez sur roblox.com/redeem, saisissez le code puis validez pour créditer vos Robux.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["steam", "google-play"],
    seo: {
      title: "Cartes Roblox (Robux) au Maroc - ghost.ma",
      description:
        "Cartes Roblox officielles pour obtenir des Robux. Livraison après confirmation du paiement.",
    },
  },
  pubg: {
    heroSubtitle: "Rechargez vos UC PUBG Mobile pour vos objets et Royale Pass.",
    intro:
      "Les recharges **PUBG Mobile (UC)** créditent votre compte en **Unknown Cash**, pour le **Royale Pass**, les skins et les objets du jeu.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- Recharge via votre ID de joueur ou par code, selon le produit.\n- Crédit disponible rapidement après confirmation du paiement.\n- Vérifiez votre identifiant de joueur avant de commander.",
    info: [DELIVERY, OFFICIAL, { icon: "card", title: "Recharge simple", description: "Par ID de joueur ou code selon le produit." }, SUPPORT],
    tip: {
      type: "information",
      title: "Vérifiez votre identifiant de joueur",
      message:
        "Selon le produit, la recharge se fait via votre ID de joueur PUBG Mobile ou via un code. Vérifiez votre identifiant avant de commander.",
    },
    faq: [
      {
        q: "Comment recevoir mes UC ?",
        a: "Selon le produit choisi, les UC sont crédités via votre ID de joueur ou via un code à saisir dans le jeu. Les détails figurent sur la page du produit.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["free-fire"],
    seo: {
      title: "Recharge UC PUBG Mobile au Maroc - ghost.ma",
      description:
        "Rechargez vos UC PUBG Mobile au meilleur prix. Livraison après confirmation du paiement.",
    },
  },
  "free-fire": {
    heroSubtitle: "Diamants Free Fire pour vos skins, personnages et Pass.",
    intro:
      "Les recharges **Free Fire (Diamants)** créditent votre compte pour débloquer personnages, skins et le **Pass** de niveau dans Garena Free Fire.\n\n**À retenir :**\n- Plusieurs montants disponibles ci-dessous.\n- Recharge via votre ID de joueur ou par code, selon le produit.\n- Crédit disponible rapidement après confirmation du paiement.\n- Vérifiez votre identifiant de joueur avant de commander.",
    info: [DELIVERY, OFFICIAL, { icon: "card", title: "Recharge simple", description: "Par ID de joueur ou code selon le produit." }, SUPPORT],
    tip: {
      type: "information",
      title: "Vérifiez votre identifiant de joueur",
      message:
        "Selon le produit, la recharge se fait via votre ID de joueur Free Fire ou via un code. Vérifiez votre identifiant avant de commander.",
    },
    faq: [
      {
        q: "Comment recevoir mes diamants ?",
        a: "Selon le produit choisi, les diamants sont crédités via votre ID de joueur ou via un code à saisir dans le jeu. Les détails figurent sur la page du produit.",
      },
      DELIVERY_FAQ,
      REFUND_FAQ,
    ],
    related: ["pubg"],
    seo: {
      title: "Recharge Diamants Free Fire au Maroc - ghost.ma",
      description:
        "Rechargez vos diamants Free Fire au meilleur prix. Livraison après confirmation du paiement.",
    },
  },
};

// Extra content aliases for brands whose category id/slug doesn't fold to a
// CONTENT key via canonicalBrandKey (which is logo-oriented). iTunes/App Store
// share the Apple gift-card content.
const CONTENT_ALIASES: Record<string, string> = {
  itunes: "apple",
  "itunes-store": "apple",
  "app-store": "apple",
  "google-play-store": "google-play",
  googleplay: "google-play",
};

export function resolveContentKey(...candidates: string[]): BrandContent | undefined {
  for (const raw of candidates) {
    const key = raw.toLowerCase();
    const mapped = CONTENT[key] ?? CONTENT[CONTENT_ALIASES[key] ?? ""];
    if (mapped) return mapped;
  }
  return undefined;
}

export function buildLanding(content: BrandContent, relatedIds: string[]): CategoryLanding {
  return normalizeCategoryLanding({
    heroSubtitle: content.heroSubtitle,
    primaryCtaLabel: "Voir les produits",
    primaryCtaMode: "products",
    secondaryCtaLabel: "Contacter le support",
    secondaryCtaUrl: "/support",
    introText: content.intro,
    infoItems: content.info.map((item, index) => ({ ...item, active: true, sortOrder: index })),
    navigatorTip: {
      enabled: true,
      title: content.tip.title,
      message: content.tip.message,
      type: content.tip.type,
      ctaLabel: "",
      ctaUrl: "",
    },
    faqItems: content.faq.map((item, index) => ({
      question: item.q,
      answer: item.a,
      active: true,
      sortOrder: index,
    })),
    relatedCategoryIds: relatedIds,
    seo: { title: content.seo.title, description: content.seo.description, imageUrl: "" },
  });
}


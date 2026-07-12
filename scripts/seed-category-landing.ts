/**
 * One-off content seed: fills the rich category landing-page content
 * (`Category.landing`) for the known brand categories with accurate French copy
 * — hero, intro, quick-info points, a Navigator compatibility/region tip, FAQ,
 * related categories and SEO.
 *
 * SAFE BY DESIGN:
 *   - Updates ONLY the `landing` JSON column. No other category field, and no
 *     product/pricing/inventory data, is touched.
 *   - Only updates categories that ALREADY EXIST (matched by id, slug, or brand
 *     alias via canonicalBrandKey). Unknown categories are left untouched; brands
 *     in the content map that have no matching category are skipped.
 *   - By default only fills categories whose landing is currently EMPTY, so it
 *     never clobbers content an admin has already written. Pass --force to
 *     overwrite.
 *   - Related-category links are resolved to real existing categories (self and
 *     missing ids dropped).
 *   - Everything runs through the same production guard as the other scripts:
 *     writing to prod requires CONFIRM_PRODUCTION_DB=true.
 *
 * Run (dev/local — targets .env.local / .env):
 *   npm run seed:category-landing            # fill empty categories
 *   npm run seed:category-landing -- --dry-run
 *   npm run seed:category-landing -- --force # overwrite existing landing too
 *
 * Run against production (deliberate):
 *   CONFIRM_PRODUCTION_DB=true npm run seed:category-landing
 *
 * Safe to re-run.
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertWriteAllowed } from "./lib/db-guard.mjs";
import { canonicalBrandKey } from "../src/lib/brandAssets";
import {
  normalizeCategoryLanding,
  hasLandingContent,
  type CategoryLanding,
  type InfoIconKey,
  type NavigatorTipType,
} from "../src/lib/categoryLanding";

const prisma = new PrismaClient();

type BrandContent = {
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
      "Les cartes **Steam Wallet** ajoutent un solde à votre compte Steam, utilisable pour acheter des jeux, des extensions, des objets et du contenu sur la boutique Steam. Une solution simple si vous préférez ne pas utiliser de carte bancaire.",
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
      "Les cartes **PlayStation Store** créditent votre portefeuille PSN pour acheter des jeux, des extensions, des abonnements PlayStation Plus et du contenu sur le PlayStation Store.",
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
      "Les cartes **Xbox / Microsoft** créditent votre compte Microsoft pour acheter des jeux, des abonnements et du contenu sur le Microsoft Store et Xbox.",
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
      "Les cartes **Nintendo eShop** ajoutent un solde à votre compte Nintendo pour acheter des jeux et du contenu sur le Nintendo eShop.",
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
      "Les cartes **Google Play** créditent votre compte Google pour acheter des applications, des jeux, des achats intégrés, des films et des livres sur le Google Play Store.",
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
      "Les cartes **Apple / iTunes** créditent votre identifiant Apple pour l'App Store, iCloud+, Apple Music, les jeux et les abonnements.",
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
      "Les cartes cadeaux **Netflix** ajoutent un crédit à votre compte Netflix, appliqué à votre abonnement mensuel. Une manière simple de payer Netflix sans carte bancaire.",
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
      "Les cartes **Roblox** créditent votre compte en Robux, la monnaie utilisée pour acheter des objets, des accessoires et des expériences dans Roblox.",
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
      "Les recharges **PUBG Mobile (UC)** créditent votre compte en Unknown Cash, utilisé pour le Royale Pass, les skins et les objets du jeu.",
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
      "Les recharges **Free Fire (Diamants)** créditent votre compte pour acheter des personnages, des skins et le Pass de niveau dans Garena Free Fire.",
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

async function main() {
  assertWriteAllowed("seed:category-landing");

  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  const categories = await prisma.category.findMany({
    select: { id: true, slug: true, name: true, landing: true },
  });

  // Map every existing category to its canonical brand key so we can match
  // content and resolve related links regardless of exact id/slug.
  const keyToCategoryId = new Map<string, string>();
  for (const c of categories) {
    keyToCategoryId.set(canonicalBrandKey(c.slug ?? c.id), c.id);
    keyToCategoryId.set(c.id.toLowerCase(), c.id);
    if (c.slug) keyToCategoryId.set(c.slug.toLowerCase(), c.id);
  }

  let updated = 0;
  let skippedExisting = 0;
  let noContent = 0;

  for (const category of categories) {
    const brandKey = canonicalBrandKey(category.slug ?? category.id);
    const content = resolveContentKey(
      brandKey,
      category.id,
      category.slug ?? "",
    );

    if (!content) {
      noContent++;
      continue;
    }

    const already = hasLandingContent(normalizeCategoryLanding(category.landing));
    if (already && !force) {
      console.log(`  = ${category.id}: déjà rempli — ignoré (utilisez --force pour écraser)`);
      skippedExisting++;
      continue;
    }

    // Resolve related brand keys → real existing category ids, drop self/missing.
    const relatedIds = Array.from(
      new Set(
        content.related
          .map((key) => keyToCategoryId.get(key))
          .filter((id): id is string => Boolean(id) && id !== category.id),
      ),
    );

    const landing = buildLanding(content, relatedIds);

    if (dryRun) {
      console.log(
        `  ~ ${category.id} (« ${category.name} »): ${content.faq.length} FAQ, ${landing.infoItems.length} infos, ${relatedIds.length} liées → ${relatedIds.join(", ") || "aucune"}`,
      );
      updated++;
      continue;
    }

    await prisma.category.update({
      where: { id: category.id },
      data: { landing: landing as unknown as object },
    });
    console.log(`  ✓ ${category.id} (« ${category.name} ») rempli.`);
    updated++;
  }

  console.log(
    `\n${dryRun ? "[DRY-RUN] " : ""}Terminé : ${updated} ${dryRun ? "à remplir" : "remplies"}, ${skippedExisting} déjà remplies ignorées, ${noContent} sans contenu défini.`,
  );
  if (noContent > 0) {
    console.log(
      "Catégories sans contenu prédéfini (remplissez-les dans l'admin si besoin) — c'est normal pour les catégories non-marques.",
    );
  }
}

// Only run the DB seed when invoked directly (so the content/helpers above can
// be imported by tests without opening a database connection).
const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

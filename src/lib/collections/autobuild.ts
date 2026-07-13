/**
 * Pure builder that turns the eligible catalogue into a restrained set of
 * curated collection plans. No DB, no `server-only`, so it is shared by the CLI
 * seed script AND the admin "generate from catalogue" server action, and stays
 * unit-testable. It never invents products — it only orders and groups the real
 * eligible parents it is given, using the structured-metadata classifier.
 */
import {
  isGaming,
  isGiftCard,
  isSubscription,
  isSoftware,
  inEurope,
  inUnitedStates,
  isGlobal,
  type ClassifiableProduct,
} from "./classify";

/** Below this many eligible products a collection is skipped. */
export const MIN_COLLECTION_PRODUCTS = 3;

/** A real eligible parent + the fields needed for ordering. */
export interface CollectionCandidate extends ClassifiableProduct {
  featured: boolean;
  sortOrder: number;
  createdAt: string;
}

/** Everything needed to upsert a collection except its product ids. Matches
 *  SeedCollectionInput structurally (minus productIds), plus a `key`. */
export interface CollectionPlanMeta {
  key: string;
  slug: string;
  name: string;
  shortDescription: string;
  seoTitle: string;
  seoDescription: string;
  aliases: string[];
  showOnHomepage: boolean;
  active: boolean;
  sortOrder: number;
  homepageLimit: number;
}

export interface BuiltCollectionPlan {
  meta: CollectionPlanMeta;
  products: CollectionCandidate[];
  skipped: boolean;
  reason?: string;
}

/** Intentional ordering: featured first, then catalogue sort order, then name. */
export function byPriority(a: CollectionCandidate, b: CollectionCandidate): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

/** One representative parent per category (priority wins), ordered by priority —
 *  a varied premium mix rather than near-duplicate denominations. */
export function navigatorSelection(
  eligible: CollectionCandidate[],
  limit: number,
): CollectionCandidate[] {
  const bestByCategory = new Map<string, CollectionCandidate>();
  for (const product of [...eligible].sort(byPriority)) {
    if (!bestByCategory.has(product.category)) bestByCategory.set(product.category, product);
  }
  return [...bestByCategory.values()].sort(byPriority).slice(0, limit);
}

/**
 * Build every candidate collection from the eligible catalogue. Pure given its
 * inputs, so the same logic drives the CLI seed, the admin action, and tests.
 */
export function buildCollectionPlans(
  eligible: CollectionCandidate[],
  popularParentIds: string[],
): BuiltCollectionPlan[] {
  const byId = new Map(eligible.map((p) => [p.id, p]));
  const ordered = (list: CollectionCandidate[]) => [...list].sort(byPriority);

  const popular = popularParentIds
    .map((id) => byId.get(id))
    .filter((p): p is CollectionCandidate => Boolean(p));

  const newest = [...eligible]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  const definitions: { meta: CollectionPlanMeta; products: CollectionCandidate[] }[] = [
    {
      meta: {
        key: "popular",
        slug: "produits-populaires",
        name: "Produits populaires",
        shortDescription: "Les produits numériques les plus demandés du moment.",
        seoTitle: "Produits populaires | ghost.ma",
        seoDescription:
          "Découvrez les produits numériques les plus populaires sur ghost.ma : cartes, crédits et abonnements livrés rapidement.",
        aliases: ["populaire", "best sellers", "meilleures ventes", "tendances"],
        // Homepage already renders "Produits populaires" via the existing
        // featured-products section (featuredProductIds); keep this collection
        // OFF the homepage to avoid duplicating that section. It still gets a
        // dedicated page + search presence.
        showOnHomepage: false,
        active: true,
        sortOrder: 1,
        homepageLimit: 8,
      },
      products: popular,
    },
    {
      meta: {
        key: "navigator",
        slug: "selection-du-navigator",
        name: "Sélection du Navigator",
        shortDescription: "Une sélection de produits recommandés par le Navigator.",
        seoTitle: "Sélection du Navigator | ghost.ma",
        seoDescription:
          "La sélection du Navigator : un choix varié des meilleurs produits numériques de ghost.ma.",
        aliases: ["navigator", "selection", "recommandations", "coups de coeur"],
        showOnHomepage: true,
        active: true,
        sortOrder: 2,
        homepageLimit: 10,
      },
      products: navigatorSelection(eligible, 10),
    },
    {
      meta: {
        key: "gaming",
        slug: "gaming",
        name: "Gaming",
        shortDescription:
          "Cartes, crédits et abonnements pour vos plateformes et jeux préférés.",
        seoTitle: "Gaming : cartes et crédits de jeu | ghost.ma",
        seoDescription:
          "Rechargez Steam, PlayStation, Xbox, Nintendo et vos jeux préférés au Maroc, livraison rapide après paiement.",
        aliases: ["gaming", "jeux", "jeux video", "gamer"],
        showOnHomepage: true,
        active: true,
        sortOrder: 3,
        homepageLimit: 8,
      },
      products: ordered(eligible.filter(isGaming)),
    },
    {
      meta: {
        key: "giftcards",
        slug: "cartes-cadeaux",
        name: "Cartes cadeaux",
        shortDescription:
          "Rechargez vos comptes et offrez des cartes cadeaux numériques en quelques étapes.",
        seoTitle: "Cartes cadeaux numériques | ghost.ma",
        seoDescription:
          "Cartes cadeaux Google Play, Apple, Steam, PlayStation, Xbox et plus — livrées rapidement au Maroc.",
        aliases: ["cartes cadeaux", "gift card", "carte cadeau", "recharge"],
        showOnHomepage: true,
        active: true,
        sortOrder: 4,
        homepageLimit: 8,
      },
      products: ordered(eligible.filter(isGiftCard)),
    },
    {
      meta: {
        key: "subscriptions",
        slug: "abonnements-et-divertissement",
        name: "Abonnements et divertissement",
        shortDescription: "Accédez à vos services de streaming, gaming et divertissement.",
        seoTitle: "Abonnements et divertissement | ghost.ma",
        seoDescription:
          "Abonnements streaming, gaming et divertissement : Netflix, Spotify, Game Pass et plus, au meilleur prix.",
        aliases: ["abonnements", "streaming", "divertissement", "subscription"],
        showOnHomepage: true,
        active: true,
        sortOrder: 5,
        homepageLimit: 8,
      },
      products: ordered(eligible.filter(isSubscription)),
    },
    {
      meta: {
        key: "nouveautes",
        slug: "nouveautes",
        name: "Nouveautés",
        shortDescription: "Les derniers produits ajoutés au catalogue ghost.ma.",
        seoTitle: "Nouveautés | ghost.ma",
        seoDescription:
          "Les derniers produits numériques ajoutés sur ghost.ma : cartes, crédits et abonnements.",
        aliases: ["nouveautes", "nouveau", "recent", "new"],
        showOnHomepage: true,
        active: true,
        sortOrder: 6,
        homepageLimit: 8,
      },
      products: newest,
    },
    {
      meta: {
        key: "software",
        slug: "logiciels",
        name: "Logiciels",
        shortDescription:
          "Licences numériques pour Windows, Office et autres logiciels essentiels.",
        seoTitle: "Logiciels et licences | ghost.ma",
        seoDescription:
          "Licences Windows, Office, antivirus et VPN : clés numériques livrées après paiement.",
        aliases: ["logiciels", "software", "licence", "windows", "office"],
        showOnHomepage: false,
        active: true,
        sortOrder: 7,
        homepageLimit: 12,
      },
      products: ordered(eligible.filter(isSoftware)),
    },
    {
      meta: {
        key: "europe",
        slug: "europe-eur",
        name: "Europe / EUR",
        shortDescription:
          "Produits destinés aux comptes et régions compatibles avec l’Europe ou l’euro.",
        seoTitle: "Produits Europe / EUR | ghost.ma",
        seoDescription:
          "Cartes et crédits pour comptes européens (EU / France) — région vérifiée depuis les données produit.",
        aliases: ["europe", "eur", "euro", "eu", "france"],
        showOnHomepage: false,
        active: true,
        sortOrder: 8,
        homepageLimit: 12,
      },
      products: ordered(eligible.filter(inEurope)),
    },
    {
      meta: {
        key: "us",
        slug: "etats-unis-usd",
        name: "États-Unis / USD",
        shortDescription: "Produits destinés aux comptes configurés pour les États-Unis.",
        seoTitle: "Produits États-Unis / USD | ghost.ma",
        seoDescription:
          "Cartes et crédits pour comptes américains (US) — région vérifiée depuis les données produit.",
        aliases: ["etats unis", "usa", "usd", "us", "amerique"],
        showOnHomepage: false,
        active: true,
        sortOrder: 9,
        homepageLimit: 12,
      },
      products: ordered(eligible.filter(inUnitedStates)),
    },
    {
      meta: {
        key: "global",
        slug: "global",
        name: "Global",
        shortDescription:
          "Produits utilisables dans plusieurs régions lorsqu’ils sont explicitement indiqués comme Global.",
        seoTitle: "Produits Global | ghost.ma",
        seoDescription:
          "Produits numériques marqués Global, utilisables dans plusieurs régions.",
        aliases: ["global", "worldwide", "monde", "international"],
        showOnHomepage: false,
        active: true,
        sortOrder: 10,
        homepageLimit: 12,
      },
      products: ordered(eligible.filter(isGlobal)),
    },
  ];

  return definitions.map(({ meta, products }) => {
    // De-duplicate within a collection (never the same product twice).
    const seen = new Set<string>();
    const unique = products.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    if (unique.length < MIN_COLLECTION_PRODUCTS) {
      return {
        meta,
        products: unique,
        skipped: true,
        reason: `seulement ${unique.length} produit(s) éligible(s) (minimum ${MIN_COLLECTION_PRODUCTS})`,
      };
    }
    return { meta, products: unique, skipped: false };
  });
}

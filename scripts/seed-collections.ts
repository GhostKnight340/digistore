/**
 * Seed a restrained set of curated storefront collections from the REAL product
 * catalogue. It never invents products: it reads the products that already
 * exist, keeps only storefront-eligible parents (active product + active
 * category + ≥1 active variant), and classifies them from structured metadata
 * (category / brand / name / region codes).
 *
 * Usage:
 *   npm run seed:collections              # DRY RUN — preview only, writes nothing
 *   npm run seed:collections -- --apply   # write/update collections (idempotent)
 *   npm run seed:collections -- --demo    # offline preview using the static seed
 *                                         # catalogue (no DB) — for a quick look
 *
 * Safety:
 *   - Default is a dry run. Nothing is written without --apply.
 *   - --apply is idempotent: re-running makes no changes (all "unchanged").
 *   - Writes are guarded by assertWriteAllowed (blocks accidental prod writes
 *     unless CONFIRM_PRODUCTION_DB=true), like `prisma db seed`.
 *   - Only upserts by slug; never deletes an existing collection.
 *   - A collection with fewer than 3 eligible products is SKIPPED (logged).
 */
import { prisma } from "../src/lib/db/prisma";
import {
  getSeedCatalog,
  getPopularParentIds,
  seedCollectionBySlug,
  type SeedCatalogProduct,
  type SeedCollectionInput,
} from "../src/lib/db/collectionsSeed";
import {
  isGaming,
  isGiftCard,
  isSubscription,
  isSoftware,
  inEurope,
  inUnitedStates,
  isGlobal,
} from "../src/lib/collections/classify";
import { categories as seedCategories, products as seedProducts } from "../src/lib/products";
import { assertWriteAllowed } from "./lib/db-guard.mjs";

const MIN_PRODUCTS = 3;

type PlanMeta = Omit<SeedCollectionInput, "productIds"> & { key: string };

/** Intentional ordering: featured first, then catalogue sort order, then name. */
function byPriority(a: SeedCatalogProduct, b: SeedCatalogProduct): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

/** One representative parent per category (featured/priority wins), ordered by
 *  category priority — a varied premium mix rather than near-duplicates. */
function navigatorSelection(eligible: SeedCatalogProduct[], limit: number): SeedCatalogProduct[] {
  const bestByCategory = new Map<string, SeedCatalogProduct>();
  for (const product of [...eligible].sort(byPriority)) {
    if (!bestByCategory.has(product.category)) bestByCategory.set(product.category, product);
  }
  return [...bestByCategory.values()].sort(byPriority).slice(0, limit);
}

type BuiltPlan = {
  meta: PlanMeta;
  products: SeedCatalogProduct[];
  skipped: boolean;
  reason?: string;
};

/**
 * Build every candidate collection from the eligible catalogue. Pure given its
 * inputs, so the same logic drives the real run and the offline demo.
 */
function buildPlans(
  eligible: SeedCatalogProduct[],
  popularParentIds: string[],
): BuiltPlan[] {
  const byId = new Map(eligible.map((p) => [p.id, p]));
  const ordered = (list: SeedCatalogProduct[]) => [...list].sort(byPriority);

  const popular = popularParentIds
    .map((id) => byId.get(id))
    .filter((p): p is SeedCatalogProduct => Boolean(p));

  const newest = [...eligible]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  // key, meta, and the resolved ordered product list per collection.
  const definitions: { meta: PlanMeta; products: SeedCatalogProduct[] }[] = [
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
        // featured-products section (featuredProductIds). Keeping this collection
        // OFF the homepage avoids duplicating that section; the collection still
        // gives it a dedicated page + search presence.
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
        // Off the homepage by default — accessible via its page, search, catalogue.
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
    if (unique.length < MIN_PRODUCTS) {
      return {
        meta,
        products: unique,
        skipped: true,
        reason: `seulement ${unique.length} produit(s) éligible(s) (minimum ${MIN_PRODUCTS})`,
      };
    }
    return { meta, products: unique, skipped: false };
  });
}

/** Static-seed catalogue collapsed to one parent per category, for the offline
 *  --demo preview (no DB). The real run uses true parent products from the DB. */
function demoCatalog(): { catalog: SeedCatalogProduct[]; popularIds: string[] } {
  const nameById = new Map(seedCategories.map((c) => [c.id, c.name]));
  const groups = new Map<string, SeedCatalogProduct>();
  const popular: string[] = [];
  seedProducts.forEach((product, index) => {
    const category = product.category;
    const existing = groups.get(category);
    if (!existing) {
      groups.set(category, {
        id: category,
        slug: category,
        name: nameById.get(category) ?? category,
        brand: null,
        category,
        categoryName: nameById.get(category) ?? category,
        regions: product.region ? [product.region] : [],
        featured: Boolean(product.featured),
        sortOrder: index,
        createdAt: new Date(2026, 0, 1 + index).toISOString(),
        active: true,
        categoryActive: true,
        eligible: true,
      });
    } else {
      if (product.region && !existing.regions.includes(product.region)) {
        existing.regions.push(product.region);
      }
      existing.featured = existing.featured || Boolean(product.featured);
    }
    if (product.featured && !popular.includes(category)) popular.push(category);
  });
  return { catalog: [...groups.values()], popularIds: popular };
}

function printPreview(plans: BuiltPlan[], ineligible: SeedCatalogProduct[], apply: boolean) {
  console.log("\n" + "=".repeat(64));
  console.log(`COLLECTIONS PREVIEW  (${apply ? "APPLY" : "DRY RUN"})`);
  console.log("=".repeat(64));
  for (const plan of plans) {
    const flag = plan.skipped ? "SKIP" : "OK  ";
    const home = plan.meta.showOnHomepage ? "homepage" : "off-homepage";
    console.log(
      `\n[${flag}] ${plan.meta.name}  (/collections/${plan.meta.slug})  ` +
        `— ${plan.products.length} produit(s), ${home}, ordre #${plan.meta.sortOrder}`,
    );
    if (plan.skipped) {
      console.log(`       ↳ ignorée : ${plan.reason}`);
      continue;
    }
    plan.products.forEach((p, i) => {
      const regions = p.regions.length ? ` [${p.regions.join(",")}]` : "";
      console.log(`       ${String(i + 1).padStart(2)}. ${p.name}${regions}  (${p.slug})`);
    });
  }
  if (ineligible.length > 0) {
    console.log(`\nProduits exclus (non éligibles) : ${ineligible.length}`);
    for (const p of ineligible.slice(0, 20)) {
      const why = !p.active
        ? "inactif"
        : !p.categoryActive
          ? "catégorie inactive"
          : "aucune variante active";
      console.log(`       - ${p.name} (${p.slug}) : ${why}`);
    }
    if (ineligible.length > 20) console.log(`       … +${ineligible.length - 20} de plus`);
  }
  console.log("\n" + "=".repeat(64) + "\n");
}

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const apply = args.includes("--apply") && !demo;

  let catalog: SeedCatalogProduct[];
  let popularIds: string[];

  if (demo) {
    console.log("[seed:collections] DEMO mode — offline preview from static seed (no DB).");
    ({ catalog, popularIds } = demoCatalog());
  } else {
    if (apply) {
      // Writes collections — block accidental production writes.
      assertWriteAllowed("seed:collections");
    }
    catalog = await getSeedCatalog();
    popularIds = await getPopularParentIds();
  }

  const eligible = catalog.filter((p) => p.eligible);
  const ineligible = catalog.filter((p) => !p.eligible);
  const plans = buildPlans(eligible, popularIds);

  printPreview(plans, ineligible, apply);

  if (!apply) {
    console.log(
      demo
        ? "[seed:collections] Demo only — no database was touched."
        : "[seed:collections] Dry run — nothing written. Re-run with --apply to create/update.",
    );
    return;
  }

  const counters = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const plan of plans) {
    if (plan.skipped) {
      counters.skipped += 1;
      console.log(`[skip] ${plan.meta.name} — ${plan.reason}`);
      continue;
    }
    const { key, ...meta } = plan.meta;
    void key;
    const result = await seedCollectionBySlug({
      ...meta,
      productIds: plan.products.map((p) => p.id),
    });
    counters[result.status] += 1;
    console.log(`[${result.status}] ${plan.meta.name} (${result.id})`);
  }

  console.log(
    `\n[seed:collections] Done. created=${counters.created} updated=${counters.updated} ` +
      `unchanged=${counters.unchanged} skipped=${counters.skipped}`,
  );
}

main()
  .catch((error) => {
    console.error(
      "[seed:collections] FAILED:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

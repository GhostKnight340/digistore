/**
 * Seed a restrained set of curated storefront collections from the REAL product
 * catalogue. It never invents products: it reads the products that already
 * exist, keeps only storefront-eligible parents (active product + active
 * category + ≥1 active variant), and classifies them from structured metadata
 * (category / brand / name / region codes).
 *
 * The same logic is available in the admin UI (Collections → "Générer depuis le
 * catalogue"); this CLI is the headless equivalent.
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
} from "../src/lib/db/collectionsSeed";
import {
  buildCollectionPlans,
  type BuiltCollectionPlan,
  type CollectionCandidate,
} from "../src/lib/collections/autobuild";
import { categories as seedCategories, products as seedProducts } from "../src/lib/products";
import { assertWriteAllowed } from "./lib/db-guard.mjs";

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

function printPreview(plans: BuiltCollectionPlan[], ineligible: SeedCatalogProduct[], apply: boolean) {
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

  const eligible: CollectionCandidate[] = catalog.filter((p) => p.eligible);
  const ineligible = catalog.filter((p) => !p.eligible);
  const plans = buildCollectionPlans(eligible, popularIds);

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
    const { key: _key, ...meta } = plan.meta;
    void _key;
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

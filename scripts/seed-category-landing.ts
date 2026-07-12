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
import { normalizeCategoryLanding, hasLandingContent } from "../src/lib/categoryLanding";
import { CONTENT, buildLanding, resolveContentKey } from "../src/lib/categoryLandingContent";

const prisma = new PrismaClient();

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

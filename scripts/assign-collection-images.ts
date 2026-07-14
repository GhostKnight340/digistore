/**
 * Assign the bundled collection artwork (public/collections/*.webp) to matching
 * collections BY SLUG. Idempotent and non-destructive:
 *   - only sets `imageUrl` on collections whose slug is in the map below;
 *   - never creates, deletes, or reorders collections, and never touches
 *     memberships, schedules, or any other field;
 *   - by default it will NOT overwrite a collection that already has a DIFFERENT
 *     image (so a hand-picked banner is preserved) — pass --force to replace.
 *
 * Usage:
 *   npm run assign:collection-images              # DRY RUN — preview only
 *   npm run assign:collection-images -- --apply   # write imageUrl (idempotent)
 *   npm run assign:collection-images -- --apply --force  # also replace existing images
 *
 * Safety: writes are guarded by assertWriteAllowed (blocks accidental prod
 * writes unless CONFIRM_PRODUCTION_DB=true), exactly like the collections seed.
 */
import { prisma } from "../src/lib/db/prisma";
import { assertWriteAllowed } from "./lib/db-guard.mjs";

// slug → hosted image path. Multiple slugs may point at the same asset so the
// mapping catches naming variants (e.g. a France/EUR collection whether it is
// slugged "europe-eur", "france", or "france-eur"). Only slugs that actually
// exist are touched.
const IMAGE_BY_SLUG: Record<string, string> = {
  gaming: "/collections/gaming.webp",
  "cartes-cadeaux": "/collections/cartes-cadeaux.webp",
  "abonnements-et-divertissement": "/collections/abonnements.webp",
  abonnements: "/collections/abonnements.webp",
  logiciels: "/collections/logiciels.webp",
  nouveautes: "/collections/nouveautes.webp",
  "produits-populaires": "/collections/populaires.webp",
  populaires: "/collections/populaires.webp",
  "selection-du-navigator": "/collections/navigator.webp",
  navigator: "/collections/navigator.webp",
  global: "/collections/global.webp",
  // Europe / France (Eiffel + FR artwork)
  "europe-eur": "/collections/france.webp",
  europe: "/collections/france.webp",
  france: "/collections/france.webp",
  "france-eur": "/collections/france.webp",
  // Morocco (arch + MA artwork)
  maroc: "/collections/maroc.webp",
  "maroc-mad": "/collections/maroc.webp",
  morocco: "/collections/maroc.webp",
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const force = args.includes("--force");

  if (apply) assertWriteAllowed("assign:collection-images");

  const slugs = Object.keys(IMAGE_BY_SLUG);
  const rows = await prisma.collection.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, imageUrl: true },
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  let set = 0;
  let unchanged = 0;
  let kept = 0; // has a different image; not replaced (no --force)
  const missing: string[] = [];

  console.log("\n" + "=".repeat(56));
  console.log(`ASSIGN COLLECTION IMAGES  (${apply ? "APPLY" : "DRY RUN"}${force ? " --force" : ""})`);
  console.log("=".repeat(56));

  for (const slug of slugs) {
    const target = IMAGE_BY_SLUG[slug];
    const row = bySlug.get(slug);
    if (!row) {
      missing.push(slug);
      continue;
    }
    if (row.imageUrl === target) {
      unchanged += 1;
      console.log(`  = ${slug} — already set`);
      continue;
    }
    if (row.imageUrl && !force) {
      kept += 1;
      console.log(`  ~ ${slug} — has a different image, kept (use --force to replace): ${row.imageUrl}`);
      continue;
    }
    if (apply) {
      await prisma.collection.update({ where: { id: row.id }, data: { imageUrl: target } });
    }
    set += 1;
    console.log(`  ${apply ? "✓" : "→"} ${slug} → ${target}`);
  }

  console.log("-".repeat(56));
  console.log(
    `set=${set} unchanged=${unchanged} kept=${kept} missing=${missing.length}` +
      (missing.length ? ` (${missing.join(", ")})` : ""),
  );
  if (!apply) console.log("\nDry run — nothing written. Re-run with --apply.");
  console.log("=".repeat(56) + "\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

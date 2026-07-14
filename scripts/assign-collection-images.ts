/**
 * Assign the bundled collection artwork (public/collections/*.webp) to matching
 * collections BY SLUG. Idempotent and non-destructive:
 *   - only sets `imageUrl` on collections whose slug is in the shared map;
 *   - never creates, deletes, or reorders collections, and never touches
 *     memberships, schedules, or any other field;
 *   - by default it will NOT overwrite a collection that already has a DIFFERENT
 *     image (so a hand-picked banner is preserved) — pass --force to replace.
 *
 * The mapping and update rules live in src/lib/db/collectionImages.ts and are
 * shared with the admin "Assigner les images" button, so both stay in sync.
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
import {
  assignCollectionImages,
  COLLECTION_IMAGE_BY_SLUG,
} from "../src/lib/db/collectionImages";
import { assertWriteAllowed } from "./lib/db-guard.mjs";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const force = args.includes("--force");

  if (apply) assertWriteAllowed("assign:collection-images");

  const result = await assignCollectionImages({ apply, force });

  console.log("\n" + "=".repeat(56));
  console.log(`ASSIGN COLLECTION IMAGES  (${apply ? "APPLY" : "DRY RUN"}${force ? " --force" : ""})`);
  console.log("=".repeat(56));
  for (const slug of result.set) {
    console.log(`  ${apply ? "✓" : "→"} ${slug} → ${COLLECTION_IMAGE_BY_SLUG[slug]}`);
  }
  for (const slug of result.unchanged) console.log(`  = ${slug} — already set`);
  for (const slug of result.kept) {
    console.log(`  ~ ${slug} — has a different image, kept (use --force to replace)`);
  }
  console.log("-".repeat(56));
  console.log(
    `set=${result.set.length} unchanged=${result.unchanged.length} ` +
      `kept=${result.kept.length} missing=${result.missing.length}` +
      (result.missing.length ? ` (${result.missing.join(", ")})` : ""),
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

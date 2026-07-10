/**
 * One-off cleanup: regenerates clean, consistent SKUs for a parent product's
 * variants. Fixes the doubled-region ids that older imports produced (e.g.
 * "google-play-us-us-10-usd", "google-play-fr-fr-50-eur") and ad-hoc manual
 * ones (e.g. "10-EUR") by rebuilding each SKU from the region-neutral base
 * slug + the variant's effective region + face value + currency, via the same
 * variantSku() the importer now uses.
 *
 * SAFETY:
 *  - Dry-run by DEFAULT. Prints the planned renames and exits without writing.
 *    Pass --apply to actually rename.
 *  - A variant id is a primary key referenced by DigitalCode.variantId and
 *    OrderItem.variantId. This script SKIPS (never renames) any variant that has
 *    inventory codes or order history, so no foreign key is ever orphaned.
 *  - Collisions (target SKU already taken by another variant, or by another
 *    variant in this same run) are skipped and reported.
 *
 * Usage:
 *   npx tsx scripts/fix-variant-skus.ts --parent google-play-us
 *   npx tsx scripts/fix-variant-skus.ts --parent google-play-us --base google-play
 *   npx tsx scripts/fix-variant-skus.ts --parent google-play-us --base google-play --apply
 *
 *   --parent <slug>   (required) the parent product whose variants to clean.
 *   --base   <slug>   (optional) slug to embed in the generated SKUs. Use this
 *                     to get region-neutral ids (e.g. "google-play") without
 *                     first renaming the product's own slug. Defaults to the
 *                     parent product's slug.
 *   --apply           write the renames (otherwise dry-run).
 */
import { PrismaClient } from "@prisma/client";
import { variantSku } from "../src/lib/pricing/variant-identity";

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const parentSlug = getArg("parent");
  const baseSlug = getArg("base");
  const apply = process.argv.includes("--apply");

  if (!parentSlug) {
    console.error("Missing --parent <slug>. See the header for usage.");
    process.exitCode = 1;
    return;
  }

  const product = await prisma.product.findUnique({
    where: { slug: parentSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      region: true,
      variants: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          faceValue: true,
          faceCurrency: true,
          region: true,
          _count: { select: { digitalCodes: true, orderItems: true } },
        },
      },
    },
  });

  if (!product) {
    console.error(`Product not found for slug "${parentSlug}".`);
    process.exitCode = 1;
    return;
  }

  const skuBase = (baseSlug ?? product.slug).trim();
  console.log(
    `Parent: ${product.name} (slug: ${product.slug}) — SKU base: "${skuBase}" — mode: ${
      apply ? "APPLY" : "DRY-RUN"
    }\n`,
  );

  // All variant ids in use anywhere, for collision detection.
  const allIds = new Set(
    (await prisma.productVariant.findMany({ select: { id: true } })).map((v) => v.id),
  );

  const planned: { from: string; to: string }[] = [];
  const skippedUnsafe: { id: string; codes: number; orders: number }[] = [];
  const skippedCollision: { id: string; to: string }[] = [];
  const skippedNoFace: string[] = [];
  let alreadyClean = 0;

  const claimed = new Set<string>();

  for (const v of product.variants) {
    if (v.faceValue == null) {
      // No face value → variantSku has nothing deterministic to build from.
      skippedNoFace.push(v.id);
      continue;
    }

    const effectiveRegion = v.region || product.region || "";
    const target = variantSku(skuBase, {
      faceValue: v.faceValue,
      faceCurrency: v.faceCurrency,
      reloadlyCountryCode: effectiveRegion,
    });

    if (target === v.id) {
      alreadyClean++;
      continue;
    }

    // FK safety: never rename a variant with inventory or order history.
    if (v._count.digitalCodes > 0 || v._count.orderItems > 0) {
      skippedUnsafe.push({ id: v.id, codes: v._count.digitalCodes, orders: v._count.orderItems });
      continue;
    }

    // Collision: target already exists elsewhere, or was just claimed this run.
    if ((allIds.has(target) && target !== v.id) || claimed.has(target)) {
      skippedCollision.push({ id: v.id, to: target });
      continue;
    }

    claimed.add(target);
    planned.push({ from: v.id, to: target });
  }

  if (planned.length === 0) {
    console.log("No renames to apply.");
  } else {
    console.log(`Planned renames (${planned.length}):`);
    for (const p of planned) console.log(`  ${p.from}  ->  ${p.to}`);
  }

  if (alreadyClean) console.log(`\nAlready clean: ${alreadyClean}`);
  if (skippedNoFace.length)
    console.log(`\nSkipped (no face value): ${skippedNoFace.join(", ")}`);
  if (skippedUnsafe.length) {
    console.log(`\nSkipped (has inventory/orders — rename manually or migrate refs):`);
    for (const s of skippedUnsafe)
      console.log(`  ${s.id}  (codes: ${s.codes}, orders: ${s.orders})`);
  }
  if (skippedCollision.length) {
    console.log(`\nSkipped (target SKU already taken):`);
    for (const s of skippedCollision) console.log(`  ${s.id}  ->  ${s.to}`);
  }

  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to write these ${planned.length} rename(s).`);
    return;
  }

  if (planned.length === 0) return;

  await prisma.$transaction(
    planned.map((p) =>
      prisma.productVariant.update({ where: { id: p.from }, data: { id: p.to } }),
    ),
  );
  console.log(`\nApplied ${planned.length} rename(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

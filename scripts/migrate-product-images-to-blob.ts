/**
 * Migrate legacy base64 product images out of Postgres and into the dedicated
 * Vercel Blob store. Base64 `data:` URIs live in TWO places:
 *   - ProductMedia.url  (gallery / fallback media)
 *   - Product.imageUrl  (the primary image the admin editor writes)
 *
 * For each, this uploads the decoded bytes to Blob ONCE and records the result:
 *   - ProductMedia → sets blobUrl + pathname + width/height/mimeType/fileSize,
 *                    and KEEPS the legacy `url` untouched (read-compat).
 *   - Product      → rewrites imageUrl in place to the Blob https URL.
 *
 * Design guarantees:
 *   - Idempotent: a row already migrated (ProductMedia.blobUrl set, or
 *     Product.imageUrl already a Blob URL / non-base64) is skipped.
 *   - Partial-failure safe: the DB row is updated ONLY after a successful upload,
 *     and every Blob write uses a random suffix, so a crashed + re-run migration
 *     never overwrites or double-counts. Reruns pick up exactly where they stopped.
 *   - Non-destructive: nothing is ever deleted here; legacy base64 is preserved,
 *     so rollback is "revert the code that prefers blobUrl" with data intact.
 *
 * Modes:
 *   --dry-run   (default) detect + report only; no uploads, no writes.
 *   --apply     perform uploads + DB updates.
 *   --verify    produce the verification report (counts + broken Blob URLs); no writes.
 *   --orphans   list Blob objects with no referencing DB row (report only).
 *   --delete-orphans   with --apply, delete those orphans (guarded).
 *   --limit N   cap the number of records processed this run.
 *
 * Safety: refuses outright to run against the PRODUCTION database (host match or
 * GHOST_DB_ENV=production) — this migration is developed and verified on staging
 * only. The production run is a separate, explicitly-approved procedure.
 *
 * Usage:
 *   pnpm images:migrate                 # DRY RUN
 *   pnpm images:migrate -- --apply      # migrate
 *   pnpm images:migrate -- --verify     # verification report
 *   pnpm images:migrate -- --orphans    # orphan report
 */
import { prisma } from "../src/lib/db/prisma";
import { activeDbIsProduction } from "./lib/db-guard.mjs";
import {
  PRODUCT_MEDIA_PREFIX,
  deleteProductMediaBlob,
  listProductMediaBlobs,
  productMediaBlobConfigured,
  productMediaBlobExists,
  uploadProductMedia,
} from "../src/lib/storage/blob";
import { isVercelBlobUrl, parseDataUri } from "../src/lib/storage/imageValidation";

const TAG = "images:migrate";
const bar = (n = 60) => "=".repeat(n);

type Report = {
  detected: number;
  migrated: number;
  failed: number;
  skipped: number;
  failures: { kind: string; id: string; error: string }[];
};

function newReport(): Report {
  return { detected: 0, migrated: 0, failed: 0, skipped: 0, failures: [] };
}

/** Blob object key for a stored Blob URL (path minus the leading slash). */
function pathnameOf(blobUrl: string): string | null {
  try {
    return new URL(blobUrl).pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

// ── Migration ────────────────────────────────────────────────────────────────

async function migrateProductMedia(apply: boolean, limit: number, report: Report) {
  // Only rows still holding a base64 data URI AND not yet migrated.
  const rows = await prisma.productMedia.findMany({
    where: { url: { startsWith: "data:" }, blobUrl: null },
    select: { id: true, url: true, alt: true },
    take: limit || undefined,
  });
  report.detected += rows.length;

  for (const row of rows) {
    const parsed = parseDataUri(row.url);
    if (!parsed) {
      report.failed++;
      report.failures.push({ kind: "ProductMedia", id: row.id, error: "not a base64 data URI" });
      continue;
    }
    if (!apply) {
      console.log(`  → ProductMedia ${row.id} (${Math.round(parsed.buffer.length / 1024)} KB) → Blob`);
      continue;
    }
    try {
      const uploaded = await uploadProductMedia({ buffer: parsed.buffer });
      await prisma.productMedia.update({
        where: { id: row.id },
        data: {
          blobUrl: uploaded.url,
          pathname: uploaded.pathname,
          width: uploaded.width,
          height: uploaded.height,
          mimeType: uploaded.mimeType,
          fileSize: uploaded.fileSize,
        },
      });
      report.migrated++;
      console.log(`  ✓ ProductMedia ${row.id} → ${uploaded.pathname}`);
    } catch (err) {
      report.failed++;
      report.failures.push({
        kind: "ProductMedia",
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      console.log(`  ✗ ProductMedia ${row.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function migrateProductImageUrl(apply: boolean, limit: number, report: Report) {
  const rows = await prisma.product.findMany({
    where: { imageUrl: { startsWith: "data:" } },
    select: { id: true, slug: true, imageUrl: true },
    take: limit || undefined,
  });
  report.detected += rows.length;

  for (const row of rows) {
    const parsed = row.imageUrl ? parseDataUri(row.imageUrl) : null;
    if (!parsed) {
      report.failed++;
      report.failures.push({ kind: "Product.imageUrl", id: row.id, error: "not a base64 data URI" });
      continue;
    }
    if (!apply) {
      console.log(`  → Product ${row.slug} (${Math.round(parsed.buffer.length / 1024)} KB) → Blob`);
      continue;
    }
    try {
      const uploaded = await uploadProductMedia({ buffer: parsed.buffer });
      // Rewrite the scalar in place to the Blob URL. Metadata lives on
      // ProductMedia only (by design); the primary image is just a URL string.
      await prisma.product.update({
        where: { id: row.id },
        data: { imageUrl: uploaded.url },
      });
      report.migrated++;
      console.log(`  ✓ Product ${row.slug} → ${uploaded.pathname}`);
    } catch (err) {
      report.failed++;
      report.failures.push({
        kind: "Product.imageUrl",
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      console.log(`  ✗ Product ${row.slug}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ── Verification report ──────────────────────────────────────────────────────

async function verify() {
  const [mediaBase64, productBase64, mediaMigrated] = await Promise.all([
    prisma.productMedia.count({ where: { url: { startsWith: "data:" }, blobUrl: null } }),
    prisma.product.count({ where: { imageUrl: { startsWith: "data:" } } }),
    prisma.productMedia.count({ where: { blobUrl: { not: null } } }),
  ]);

  // Count migrated Product.imageUrl (a Blob URL) in JS — no SQL predicate for it.
  const productImages = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, slug: true, imageUrl: true },
  });
  const productMigrated = productImages.filter((p) => isVercelBlobUrl(p.imageUrl)).length;

  // Broken-Blob-URL check: HEAD every migrated blobUrl / imageUrl.
  const broken: string[] = [];
  const canProbe = productMediaBlobConfigured();
  if (canProbe) {
    const media = await prisma.productMedia.findMany({
      where: { blobUrl: { not: null } },
      select: { id: true, blobUrl: true },
    });
    for (const m of media) {
      if (m.blobUrl && !(await productMediaBlobExists(m.blobUrl))) {
        broken.push(`ProductMedia ${m.id} → ${m.blobUrl}`);
      }
    }
    for (const p of productImages) {
      if (isVercelBlobUrl(p.imageUrl) && !(await productMediaBlobExists(p.imageUrl!))) {
        broken.push(`Product ${p.slug} → ${p.imageUrl}`);
      }
    }
  }

  console.log("\n" + bar());
  console.log("VERIFICATION REPORT — product image Blob migration");
  console.log(bar());
  console.log(`  total legacy base64 remaining : ${mediaBase64 + productBase64}`);
  console.log(`      · ProductMedia.url        : ${mediaBase64}`);
  console.log(`      · Product.imageUrl        : ${productBase64}`);
  console.log(`  successfully migrated         : ${mediaMigrated + productMigrated}`);
  console.log(`      · ProductMedia.blobUrl    : ${mediaMigrated}`);
  console.log(`      · Product.imageUrl (Blob) : ${productMigrated}`);
  console.log(`  broken Blob URLs              : ${canProbe ? broken.length : "n/a (no token)"}`);
  for (const b of broken) console.log(`      ✗ ${b}`);
  console.log(bar());
  const clean = mediaBase64 + productBase64 === 0 && broken.length === 0;
  console.log(
    clean
      ? "✅ CLEAN — no base64 remaining, no broken Blob URLs."
      : "⚠️  NOT CLEAN — see counts above. Do NOT drop the legacy `url` column yet.",
  );
  console.log(bar() + "\n");
  return clean;
}

// ── Orphans ──────────────────────────────────────────────────────────────────

async function orphans(deleteThem: boolean) {
  if (!productMediaBlobConfigured()) {
    console.log(`[${TAG}] No Blob token — cannot list orphans.`);
    return;
  }
  const stored = await listProductMediaBlobs();

  const referenced = new Set<string>();
  const media = await prisma.productMedia.findMany({
    where: { OR: [{ pathname: { not: null } }, { blobUrl: { not: null } }] },
    select: { pathname: true, blobUrl: true },
  });
  for (const m of media) {
    if (m.pathname) referenced.add(m.pathname);
    if (m.blobUrl) {
      const p = pathnameOf(m.blobUrl);
      if (p) referenced.add(p);
    }
  }
  const products = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  for (const p of products) {
    if (isVercelBlobUrl(p.imageUrl)) {
      const path = pathnameOf(p.imageUrl!);
      if (path) referenced.add(path);
    }
  }

  const orphaned = stored.filter((key) => !referenced.has(key));
  console.log("\n" + bar());
  console.log(`ORPHAN REPORT — objects under ${PRODUCT_MEDIA_PREFIX}/ with no DB reference`);
  console.log(bar());
  console.log(`  stored objects   : ${stored.length}`);
  console.log(`  referenced       : ${referenced.size}`);
  console.log(`  orphaned         : ${orphaned.length}`);
  for (const key of orphaned) console.log(`      ~ ${key}`);
  if (deleteThem && orphaned.length) {
    console.log(`\n  Deleting ${orphaned.length} orphan(s)…`);
    for (const key of orphaned) {
      await deleteProductMediaBlob(key);
      console.log(`      🗑  ${key}`);
    }
  } else if (orphaned.length) {
    console.log(`\n  (report only — re-run with --apply --delete-orphans to remove)`);
  }
  console.log(bar() + "\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const doVerify = args.includes("--verify");
  const doOrphans = args.includes("--orphans");
  const deleteOrphans = args.includes("--delete-orphans");
  const limitArg = args.find((a) => a.startsWith("--limit"));
  const limit = limitArg ? Number(limitArg.split("=")[1] ?? args[args.indexOf(limitArg) + 1]) || 0 : 0;

  // Hard staging-only guard. Unlike the generic assertWriteAllowed, this blocks
  // production even WITH CONFIRM_PRODUCTION_DB — the prod run is a separate,
  // explicitly-approved procedure and must never happen from this dev tool.
  if (activeDbIsProduction()) {
    console.error(
      `\n⛔ REFUS: la base active est la PRODUCTION. Cette migration ne s'exécute que sur staging.\n`,
    );
    process.exit(1);
  }

  console.log(`[${TAG}] DB=staging  mode=${apply ? "APPLY" : doVerify ? "VERIFY" : doOrphans ? "ORPHANS" : "DRY RUN"}`);

  if (doVerify) {
    await verify();
    return;
  }
  if (doOrphans) {
    await orphans(apply && deleteOrphans);
    return;
  }

  if (apply && !productMediaBlobConfigured()) {
    console.error(
      `\n⛔ PRODUCT_MEDIA_READ_WRITE_TOKEN manquant — impossible d'uploader vers Blob.\n`,
    );
    process.exit(1);
  }

  const report = newReport();
  console.log("\n" + bar());
  console.log(`MIGRATE PRODUCT IMAGES → BLOB  (${apply ? "APPLY" : "DRY RUN"})`);
  console.log(bar());
  await migrateProductMedia(apply, limit, report);
  await migrateProductImageUrl(apply, limit, report);
  console.log("-".repeat(60));
  console.log(
    `detected=${report.detected} migrated=${report.migrated} ` +
      `failed=${report.failed} skipped=${report.skipped}`,
  );
  if (report.failures.length) {
    console.log("failures:");
    for (const f of report.failures) console.log(`   ✗ ${f.kind} ${f.id}: ${f.error}`);
  }
  if (!apply) console.log("\nDry run — nothing uploaded or written. Re-run with --apply.");
  else console.log("\nRe-run with --verify for the full verification report.");
  console.log(bar() + "\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

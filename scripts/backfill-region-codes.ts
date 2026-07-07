/**
 * One-off backfill: normalizes the free-text `Product.region` values that
 * predate the region system (e.g. "Maroc / Global", "MENA") into the fixed
 * region-code table (GLOBAL, EU, MA, FR, US, UK, TR, SA, UAE — see
 * src/lib/regions.ts).
 *
 * Mapping is best-effort and conservative: anything it can't confidently
 * place is set to "" (unknown/incomplete) rather than guessed, per the
 * region system's "never guess" rule. Those slugs are printed at the end so
 * an admin can set them via the new region picker.
 *
 * Run with: npx tsx scripts/backfill-region-codes.ts
 * Safe to re-run: already-normalized rows (region already a valid code, or
 * already "") are left untouched.
 */
import { PrismaClient } from "@prisma/client";
import { isRegionCode } from "../src/lib/regions";

const prisma = new PrismaClient();

function mapLegacyRegion(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  if (isRegionCode(value)) return value; // already normalized

  const lower = raw.trim().toLowerCase();
  const hasGlobal = lower.includes("global");
  const hasMaroc = lower.includes("maroc") || lower.includes("morocco");
  const hasEu = lower.includes(" eu") || lower.endsWith("eu") || lower.includes("europe");

  if (hasGlobal) return "GLOBAL";
  if (hasMaroc && hasEu) return "EU";
  if (hasMaroc) return "MA";
  if (hasEu) return "EU";
  return null; // unrecognized (e.g. "MENA") — leave unknown, flag for admin
}

async function main() {
  const rows = await prisma.product.findMany({
    select: { id: true, slug: true, name: true, region: true },
  });

  const unresolved: { slug: string; name: string; region: string }[] = [];
  let updated = 0;
  let alreadyOk = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const current = row.region.trim();
      if (isRegionCode(current) || current === "") {
        alreadyOk++;
        continue;
      }
      const mapped = mapLegacyRegion(current);
      if (mapped) {
        await tx.product.update({ where: { id: row.id }, data: { region: mapped } });
        console.log(`  ${row.slug}: "${current}" -> "${mapped}"`);
        updated++;
      } else {
        await tx.product.update({ where: { id: row.id }, data: { region: "" } });
        unresolved.push({ slug: row.slug, name: row.name, region: current });
      }
    }
  });

  console.log(`\nBackfill complete: ${updated} mapped, ${alreadyOk} already normalized, ${unresolved.length} unresolved.`);
  if (unresolved.length > 0) {
    console.log("\nUnresolved — set manually in admin (now marked incomplete):");
    for (const item of unresolved) {
      console.log(`  - ${item.slug} ("${item.name}") was: "${item.region}"`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// One-off, idempotent data fix: correct the footer payment-badge spelling
// "Virement Banquaire" -> "Virement bancaire" in the store settings row.
//
// The label lives in DB-stored StoreSettings (footer.paymentBadges), not in
// source, so it must be patched in the database. Safe to run multiple times.
//
// Usage (loads DATABASE_URL from .env):
//   npx tsx -r dotenv/config scripts/fix-footer-badge-spelling.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const record = await prisma.storeSetting.findUnique({ where: { id: "default" } });
  if (!record) {
    console.log("No store settings row found — nothing to fix.");
    return;
  }

  const value = record.value as Record<string, unknown>;
  const footer = (value.footer ?? {}) as Record<string, unknown>;
  const badges = Array.isArray(footer.paymentBadges) ? footer.paymentBadges : [];

  let changed = 0;
  const fixedBadges = badges.map((badge) => {
    if (badge && typeof badge === "object" && typeof (badge as { label?: unknown }).label === "string") {
      const label = (badge as { label: string }).label;
      const fixed = label.replace(/Banquaire/gi, "bancaire");
      if (fixed !== label) {
        changed += 1;
        return { ...(badge as object), label: fixed };
      }
    }
    return badge;
  });

  if (changed === 0) {
    console.log("No 'Banquaire' misspelling found — settings already correct.");
    return;
  }

  const nextValue = {
    ...value,
    footer: { ...footer, paymentBadges: fixedBadges },
  };

  await prisma.storeSetting.update({
    where: { id: "default" },
    data: { value: nextValue },
  });
  console.log(`Fixed ${changed} footer payment badge label(s).`);
}

main()
  .catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

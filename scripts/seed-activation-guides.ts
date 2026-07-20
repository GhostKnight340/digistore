/**
 * Content seed: publishes ghost.ma's activation-guide library — the platforms
 * currently sold (Steam, PlayStation, Xbox, Nintendo, Valorant) plus the popular
 * platforms Moroccan customers commonly buy elsewhere (Netflix, Spotify, Roblox,
 * Fortnite, Google Play, Apple, Amazon, Discord, Razer Gold, Twitch, PUBG Mobile,
 * Free Fire, League of Legends, Minecraft).
 *
 * The copy is ORIGINAL (written for ghost.ma, not copied from any third-party
 * source) and conveys each platform's standard, factual redemption flow.
 *
 * SAFE BY DESIGN:
 *   - Touches ONLY the `Guide` table. No product/pricing/inventory data.
 *   - Upserts by slug, so it is safe to re-run (authoritative for these guides).
 *   - Links a matching product + brand category only when they exist at run time,
 *     and cross-links sibling guides by family (shared icon).
 *   - Goes through the shared production write-guard: prod requires
 *     CONFIRM_PRODUCTION_DB=true.
 *
 * Run:
 *   npm run seed:activation-guides                             # local/dev DB
 *   CONFIRM_PRODUCTION_DB=true npm run seed:activation-guides  # prod (deliberate)
 *   npm run seed:activation-guides -- --dry-run
 *
 * Safe to re-run.
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertWriteAllowed } from "./lib/db-guard.mjs";
import {
  normalizeGuideBlocks,
  normalizeGuideFaq,
  normalizeGuideNavigatorTip,
} from "../src/lib/guide";

import {
  ACTIVATION_GUIDE_SPECS as SPECS,
  buildActivationBlocks as buildBlocks,
  type ActivationGuideSpec as Spec,
} from "../src/lib/guides/activationLibrary";

const prisma = new PrismaClient();

async function main() {
  assertWriteAllowed("seed:activation-guides");
  const dryRun = process.argv.includes("--dry-run");

  // Echo the target DB host (creds redacted) so a run is never ambiguous about
  // WHICH database it writes to — dev vs staging vs production all differ.
  const dbHost =
    (process.env.DATABASE_URL || "").match(/@([^/?]+)/)?.[1]?.replace(/-pooler\b/, "") ?? "(unknown)";
  console.log(`→ Base de données cible : ${dbHost}\n`);

  // Match related products by keyword against the ACTUAL catalog, so links
  // resolve whatever database this runs against (dev/staging/prod all differ).
  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const keywordsOf = (s: Spec) => [s.platform, ...s.aliases].map(norm).filter((k) => k.length >= 4);
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, brand: true, category: true, slug: true },
    }),
    prisma.category.findMany({ select: { id: true, slug: true, name: true } }),
  ]);
  const productHay = products.map((p) => ({
    id: p.id,
    hay: norm(`${p.name} ${p.brand ?? ""} ${p.category} ${p.slug}`),
  }));
  const categoryHay = categories.map((c) => ({ id: c.id, hay: norm(`${c.id} ${c.slug} ${c.name}`) }));
  const matchProducts = (s: Spec): string[] =>
    productHay.filter((p) => keywordsOf(s).some((k) => p.hay.includes(k))).map((p) => p.id).slice(0, 3);
  const matchCategory = (s: Spec): string | null =>
    categoryHay.find((c) => keywordsOf(s).some((k) => c.hay.includes(k)))?.id ?? null;
  const now = new Date();

  for (const [index, s] of SPECS.entries()) {
    const content = normalizeGuideBlocks(buildBlocks(s));
    const faq = normalizeGuideFaq(s.faq.map(([question, answer], i) => ({ id: `${s.slug}-faq-${i + 1}`, question, answer })));
    const navigatorTip = normalizeGuideNavigatorTip({ enabled: true, ...s.tip });
    const relatedProductIds = matchProducts(s);
    const categoryId = matchCategory(s);

    const data = {
      title: s.title,
      summary: s.summary,
      platform: s.platform,
      categoryId,
      icon: s.icon,
      content: content as unknown as object,
      faq: faq as unknown as object,
      navigatorTip: navigatorTip as unknown as object,
      relatedProductIds,
      aliases: s.aliases,
      published: true,
      featured: Boolean(s.featured),
      sortOrder: index + 1,
      publishedAt: now,
      scheduledAt: null,
      archivedAt: null,
      seoTitle: s.seoTitle,
      seoDescription: s.seoDescription,
    };

    if (dryRun) {
      console.log(
        `↳ [dry-run] ${s.slug} — ${content.length} blocs, ${faq.length} FAQ, ${relatedProductIds.length} produit(s), ${s.platform}`,
      );
      continue;
    }
    await prisma.guide.upsert({ where: { slug: s.slug }, create: { slug: s.slug, ...data }, update: data });
    console.log(`✔ ${s.slug} publié (${relatedProductIds.length} produit(s) liés)`);
  }

  if (dryRun) {
    console.log(`\nDry-run terminé — ${SPECS.length} guides, aucune écriture.`);
    return;
  }

  // Cross-link siblings that share a family (icon), up to 4 each.
  const rows = await prisma.guide.findMany({
    where: { slug: { in: SPECS.map((s) => s.slug) } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  const familyBySlug = new Map(SPECS.map((s) => [s.slug, s.icon]));
  for (const s of SPECS) {
    const relatedGuideIds = SPECS.filter((o) => o.slug !== s.slug && familyBySlug.get(o.slug) === s.icon)
      .slice(0, 4)
      .map((o) => idBySlug.get(o.slug))
      .filter((id): id is string => Boolean(id));
    await prisma.guide.update({ where: { slug: s.slug }, data: { relatedGuideIds } });
  }
  console.log(`\n${SPECS.length} guides d'activation publiés et cross-liés.`);
}

const isEntrypoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
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

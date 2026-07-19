import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GuideContent from "@/components/guides/GuideContent";
import GuideIcon from "@/components/guides/GuideIcon";
import GuideCard from "@/components/guides/GuideCard";
import GuideMetaStrip from "@/components/guides/GuideMetaStrip";
import GuideToc from "@/components/guides/GuideToc";
import GuideSectionHeading from "@/components/guides/GuideSectionHeading";
import { guideAccent, guideAccentVars } from "@/lib/guides/platformAccent";
import GuideReadingProgress from "@/components/guides/GuideReadingProgress";
import GuideHelpful from "@/components/guides/GuideHelpful";
import GuidePrintButton from "@/components/guides/GuidePrintButton";
import GuideCopyLink from "@/components/guides/GuideCopyLink";
import GuideAccordion from "@/components/guides/GuideAccordion";
import {
  GuideMetaChips,
  GuideRequirements,
  GuideStepCards,
} from "@/components/guides/GuideArticleSections";
import CategoryFaq from "@/components/category/CategoryFaq";
import NavigatorTip from "@/components/category/NavigatorTip";
import ProductCard from "@/components/ProductCard";
import ShareButton from "@/components/ShareButton";
import { getGuideBySlug } from "@/lib/db/guides";
import { getCurrentCustomer, isAdminCustomer } from "@/lib/auth";
import { getPublicParentCards } from "@/lib/db/catalog";
import { getPublicPaymentMethods } from "@/lib/db/paymentMethods";
import { guideHref } from "@/lib/guide";
import { buildToc, countSteps, estimateReadingMinutes } from "@/lib/guideMeta";
import { absoluteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) {
    return { title: "Guide introuvable - ghost.ma", robots: { index: false, follow: true } };
  }
  const title = guide.seoTitle || `${guide.title} - Guide ghost.ma`;
  const description = guide.seoDescription || guide.summary || undefined;
  const image = guide.socialImageUrl || guide.heroImageUrl || undefined;
  const canonical = guideHref(guide.slug);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: absoluteUrl(canonical),
      title,
      description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;

  // `?preview=1` lets an ADMIN review a hidden/draft guide. Non-admins get the
  // normal public gate, so the flag can never leak a masked guide.
  const wantsPreview = preview === "1";
  const viewer = wantsPreview ? await getCurrentCustomer() : null;
  const isAdminPreview = wantsPreview && isAdminCustomer(viewer);

  const guide = await getGuideBySlug(slug, { preview: isAdminPreview });
  if (!guide) notFound();

  // Resolve any product-recommendation blocks (visibility-filtered) + payment
  // methods for payment blocks. Related products were already resolved.
  const productBlockIds = guide.content
    .filter((b): b is Extract<typeof b, { type: "product" }> => b.type === "product")
    .map((b) => b.productId);
  const [productCards, paymentConfig] = await Promise.all([
    getPublicParentCards(productBlockIds),
    getPublicPaymentMethods().catch(() => ({ methods: [] as { name: string }[] })),
  ]);

  const canonical = guideHref(guide.slug);
  const updatedLabel = DATE_FMT.format(new Date(guide.updatedAt));
  const minutes = estimateReadingMinutes(guide.content);

  // Guides authored with the structured article model render the new template
  // (requirements → steps → dépannage). Older free-form guides keep rendering
  // their content blocks, so nothing regresses.
  const useStructured = guide.steps.length > 0;
  // The "Avant de commencer" amber callout reuses the guide's first warning
  // block rather than introducing another field.
  const introWarning = guide.content.find(
    (b): b is Extract<typeof b, { type: "warning" }> => b.type === "warning",
  )?.text;

  const toc = useStructured
    ? [
        guide.requirements.length > 0 || introWarning
          ? { id: "avant-de-commencer", text: "Avant de commencer" }
          : null,
        guide.steps.length > 0 ? { id: "les-etapes", text: "Les étapes" } : null,
        guide.troubleshooting.length > 0 ? { id: "depannage", text: "Dépannage" } : null,
        guide.faq.length > 0 ? { id: "faq", text: "Questions fréquentes" } : null,
      ].filter((i): i is { id: string; text: string } => i !== null)
    : buildToc(guide.content);

  // "Récemment mis à jour" badge — 30-day window, from the real updatedAt.
  const daysSinceUpdate =
    (Date.now() - new Date(guide.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const recentlyUpdated = daysSinceUpdate <= 30;
  const verifiedLabel =
    guide.verifiedAt && guide.verifiedBy
      ? `Vérifié le ${DATE_FMT.format(new Date(guide.verifiedAt))} par ${guide.verifiedBy}`
      : null;

  // The CTA is gated on `hasSellableProduct`, which uses the SAME coverage rule
  // as the admin (a product card can render while every variant is out of
  // stock). `relatedProducts` only supplies the link target, so the CTA is never
  // empty, broken, or shown for something that can't actually be bought.
  const sellableProducts = guide.hasSellableProduct ? guide.relatedProducts : [];
  const firstProduct = sellableProducts[0];
  const productCtaHref =
    sellableProducts.length === 1 && firstProduct
      ? firstProduct.href ?? `/products/${firstProduct.id}`
      : "#produits-associes";
  const productCtaLabel =
    sellableProducts.length === 1 && firstProduct
      ? guide.platform
        ? `Acheter une carte ${guide.platform}`
        : `Acheter ${firstProduct.name}`
      : guide.platform
        ? `Voir les produits ${guide.platform}`
        : "Voir les produits associés";

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Guides", item: absoluteUrl("/guides") },
      { "@type": "ListItem", position: 3, name: guide.title, item: absoluteUrl(canonical) },
    ],
  };
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.summary || undefined,
    datePublished: guide.publishedAt || guide.updatedAt,
    dateModified: guide.updatedAt,
    image: guide.socialImageUrl || guide.heroImageUrl || undefined,
    mainEntityOfPage: absoluteUrl(canonical),
  };
  // FAQ schema derives ONLY from the visible FAQ items actually rendered below.
  const faqLd =
    guide.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: guide.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  // Platform identity: one accent pair, exposed as CSS custom properties and
  // consumed by the .guide-* rules in globals.css. Unmapped platforms fall back
  // to Ghost.ma blue, so nothing depends on this resolving.
  const accent = guideAccent(guide.platform, guide.vendor);

  // Guide articles run wider than the site container: the two-column reading
  // layout needs ~820px of measure plus a 320px rail. Scoped here on purpose —
  // `container-page` stays as-is for every other page.
  return (
    <div
      className="guide-article mx-auto w-full max-w-[1280px] px-4 pt-6 pb-20 sm:px-6 sm:py-10 lg:px-8"
      style={guideAccentVars(accent)}
    >
      <GuideReadingProgress />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}

      {isAdminPreview && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300 print:hidden">
          Aperçu admin — ce guide n&apos;est pas forcément visible publiquement.
        </div>
      )}

      {/* Breadcrumb + official-site CTA (design: sticky header row) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <nav aria-label="Fil d'Ariane" className="text-xs text-faint">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/guides" className="hover:text-white">Guides</Link>
            </li>
            {guide.categoryName ? (
              <>
                <li aria-hidden>/</li>
                <li className="text-muted">{guide.categoryName}</li>
              </>
            ) : null}
            <li aria-hidden>/</li>
            <li className="text-muted">{guide.title}</li>
          </ol>
        </nav>
        {guide.officialUrl && (
          <a
            href={guide.officialUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-primary hidden items-center gap-2 sm:inline-flex print:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M14 4h6v6" />
              <path d="M20 4 10 14" />
              <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
            </svg>
            Ouvrir {guide.platform || "le site officiel"}
          </a>
        )}
      </div>

      {/* Hero */}
      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          {recentlyUpdated && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
              Récemment mis à jour
            </span>
          )}
          {verifiedLabel && <span className="text-xs text-faint">{verifiedLabel}</span>}
        </div>

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="flex items-center gap-3.5">
              <span className="guide-platform-tile grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl border">
                <GuideIcon icon={guide.icon} className="h-7 w-7" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="guide-platform-label text-[11.5px] font-semibold uppercase tracking-[0.14em]">
                  {guide.platform || "Guide"}
                </span>
                {guide.vendor && (
                  <span className="text-[11.5px] uppercase tracking-[0.14em] text-faint">
                    {guide.vendor}
                  </span>
                )}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-[38px] sm:leading-tight">
              {guide.title}
            </h1>
            {guide.summary ? (
              <p className="mt-3 text-base leading-relaxed text-muted">{guide.summary}</p>
            ) : null}

            <GuideMetaChips
              difficulty={guide.difficulty}
              durationMinutes={guide.durationMinutes}
              estimatedMinutes={minutes}
              regions={guide.supportedRegions}
              devices={guide.supportedDevices}
            />

            {/* Action hierarchy: one filled primary, one platform-tinted
                secondary, then quiet tertiary utilities — so the row no longer
                reads as four equally important buttons. */}
            <div className="mt-5 flex flex-wrap items-center gap-2 print:hidden">
              {guide.officialUrl && (
                <a
                  href={guide.officialUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="btn-primary inline-flex items-center gap-2"
                >
                  Ouvrir le site officiel {guide.platform}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <path d="M14 4h6v6" />
                    <path d="M20 4 10 14" />
                    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
                  </svg>
                </a>
              )}
              {guide.officialUrl && (
                <span className="guide-action-secondary">
                  <GuideCopyLink url={guide.officialUrl} slug={guide.slug} />
                </span>
              )}
              <span className="guide-actions-quiet flex items-center gap-1">
                <ShareButton url={canonical} title={guide.title} text={guide.summary || undefined} />
                <GuidePrintButton slug={guide.slug} />
              </span>
            </div>

            {/* Product CTA — only when an associated product is genuinely
                purchasable right now (same rule as admin coverage). Carries a
                commerce (emerald) tint so it never competes with the blue
                activation CTA above. */}
            {sellableProducts.length > 0 && (
              <div className="mt-4 print:hidden">
                <Link
                  href={productCtaHref}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-2 text-sm font-medium text-emerald-300 transition hover:border-emerald-500/45 hover:bg-emerald-500/[0.12]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <path d="M3 5h2l1.6 9.3a2 2 0 0 0 2 1.7h7.7a2 2 0 0 0 2-1.6L20 8H6.2" />
                    <circle cx="9.5" cy="19.5" r="1.3" />
                    <circle cx="17" cy="19.5" r="1.3" />
                  </svg>
                  {productCtaLabel}
                  <span aria-hidden>→</span>
                </Link>
              </div>
            )}
          </div>

          {/* Product artwork — rendered only when a real image exists. */}
          {guide.heroImageUrl && (
            <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={guide.heroImageUrl} alt="" className="h-full w-full object-cover" decoding="async" />
            </div>
          )}
        </div>
      </header>

      {/* Two-column: article · sticky rail (TOC + help). Below lg the rail
          collapses and the in-flow support block below takes over. */}
      <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,820px)_320px] xl:justify-center xl:gap-x-12">
        <article className="min-w-0">
        {useStructured ? (
          <>
            <GuideRequirements requirements={guide.requirements} warning={introWarning} />
            <GuideStepCards steps={guide.steps} />
          </>
        ) : (
          <div className="mt-2">
            <GuideContent
              blocks={guide.content}
              productCards={productCards}
              paymentMethods={paymentConfig.methods}
            />
          </div>
        )}

        {guide.navigatorTip.enabled && guide.navigatorTip.message ? (
          <div className="mt-8">
            <NavigatorTip tip={guide.navigatorTip} />
          </div>
        ) : null}

        {guide.troubleshooting.length > 0 && (
          <section id="depannage" className="mt-12 scroll-mt-24">
            <GuideSectionHeading
              eyebrow="Si ça bloque"
              title="Dépannage"
              icon="wrench"
              description="Les erreurs les plus courantes, et quoi faire."
            />
            <div className="mt-4">
              <GuideAccordion
                items={guide.troubleshooting}
                slug={guide.slug}
                event="guide_troubleshooting_open"
              />
            </div>
          </section>
        )}

        {guide.faq.length > 0 && (
          <section id="faq" className="mt-12 scroll-mt-24">
            <GuideSectionHeading
              eyebrow="Bon à savoir"
              title="Questions fréquentes"
              icon="question"
            />
            <div className="mt-4">
              <GuideAccordion items={guide.faq} slug={guide.slug} event="guide_faq_open" />
            </div>
          </section>
        )}

        <GuideHelpful slug={guide.slug} />

        {guide.relatedProducts.length > 0 && (
          <section id="produits-associes" className="mt-12 scroll-mt-24 print:hidden">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Produits associés
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-[18px] min-[390px]:grid-cols-2 sm:grid-cols-3">
              {guide.relatedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}

        {guide.relatedGuides.length > 0 && (
          <section className="mt-12 print:hidden">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Guides associés
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {guide.relatedGuides.map((related) => (
                <GuideCard key={related.slug} guide={related} />
              ))}
            </div>
          </section>
        )}

        {/* On small screens the right rail is hidden, so keep a support block. */}
        <section className="mt-12 rounded-2xl border border-border bg-card p-6 text-center lg:hidden print:hidden">
          <h2 className="text-lg font-semibold text-white">Besoin d&apos;aide ?</h2>
          <p className="mt-1 text-sm text-muted">
            Notre support répond à vos questions avant et après l&apos;achat.
          </p>
          <Link href="/support" className="btn-primary mt-4">
            Contacter le support
          </Link>
          <Link
            href="/support"
            className="mt-4 block text-[11.5px] text-faint transition hover:text-muted"
          >
            Signaler une information incorrecte
          </Link>
        </section>
        </article>

        {/* Right rail — TOC + help. Sticky under the header, capped to the
            viewport so long guides scroll inside it, with bottom room so the
            card never runs under the floating chat widget. */}
        <aside className="hidden lg:block print:hidden">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-5 overflow-y-auto pb-24">
            <GuideToc items={toc} slug={guide.slug} />

            <div className="rounded-2xl border border-border bg-surface2/70 p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <path d="M21 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <h2 className="text-[15px] font-semibold text-white">Besoin d&apos;aide ?</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Notre équipe répond avant et après l&apos;achat.
              </p>
              <div className="mt-4 space-y-2">
                <Link href="/support" className="btn-primary w-full justify-center">
                  Contacter le support
                </Link>
                {guide.officialUrl && (
                  <span className="guide-action-secondary block">
                    <a
                      href={guide.officialUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn-ghost w-full justify-center gap-1.5 text-[13px]"
                    >
                      Page d&apos;activation officielle
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                        <path d="M14 4h6v6" />
                        <path d="M20 4 10 14" />
                        <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
                      </svg>
                    </a>
                  </span>
                )}
                <Link
                  href="/contact"
                  className="block rounded-xl px-3 py-2 text-center text-[13px] font-medium text-muted transition hover:bg-surface2 hover:text-white"
                >
                  Ouvrir un ticket
                </Link>
              </div>
              <Link
                href="/support"
                className="mt-4 block text-center text-[11.5px] text-faint transition hover:text-muted"
              >
                Signaler une information incorrecte
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

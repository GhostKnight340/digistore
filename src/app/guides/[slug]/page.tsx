import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GuideContent from "@/components/guides/GuideContent";
import GuideIcon from "@/components/guides/GuideIcon";
import GuideCard from "@/components/guides/GuideCard";
import GuideMetaStrip from "@/components/guides/GuideMetaStrip";
import GuideToc from "@/components/guides/GuideToc";
import GuideReadingProgress from "@/components/guides/GuideReadingProgress";
import GuideHelpful from "@/components/guides/GuideHelpful";
import GuidePrintButton from "@/components/guides/GuidePrintButton";
import CategoryFaq from "@/components/category/CategoryFaq";
import NavigatorTip from "@/components/category/NavigatorTip";
import ProductCard from "@/components/ProductCard";
import ShareButton from "@/components/ShareButton";
import { getGuideBySlug } from "@/lib/db/guides";
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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
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
  const steps = countSteps(guide.content);
  const minutes = estimateReadingMinutes(guide.content);
  const toc = buildToc(guide.content);

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

  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
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

      <nav aria-label="Fil d'Ariane" className="pt-4 text-xs text-faint">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-white">Accueil</Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/guides" className="hover:text-white">Guides</Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-muted">{guide.title}</li>
        </ol>
      </nav>

      <div className="mx-auto mt-6 grid max-w-5xl grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,1fr)_216px]">
        <article className="min-w-0 max-w-3xl">
        <header>
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface2 text-accent">
              <GuideIcon icon={guide.icon} className="h-6 w-6" />
            </span>
            {guide.platform ? (
              <span className="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-wide text-faint">
                {guide.platform}
              </span>
            ) : null}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {guide.title}
          </h1>
          {guide.summary ? (
            <p className="mt-3 text-base leading-relaxed text-muted">{guide.summary}</p>
          ) : null}
          <GuideMetaStrip
            minutes={minutes}
            steps={steps}
            platform=""
            updatedLabel={updatedLabel}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
            <ShareButton
              url={canonical}
              title={guide.title}
              text={guide.summary || undefined}
            />
            <GuidePrintButton slug={guide.slug} />
          </div>
        </header>

        {guide.heroImageUrl ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={guide.heroImageUrl} alt="" className="w-full" decoding="async" />
          </div>
        ) : null}

        <div className="mt-8">
          <GuideContent
            blocks={guide.content}
            productCards={productCards}
            paymentMethods={paymentConfig.methods}
          />
        </div>

        {guide.navigatorTip.enabled && guide.navigatorTip.message ? (
          <div className="mt-8">
            <NavigatorTip tip={guide.navigatorTip} />
          </div>
        ) : null}

        {guide.faq.length > 0 && (
          <CategoryFaq
            title="Questions fréquentes"
            items={guide.faq.map((item, i) => ({
              ...item,
              active: true,
              sortOrder: i,
            }))}
            analytics={{ event: "guide_faq_open", params: { guide: guide.slug } }}
          />
        )}

        <GuideHelpful slug={guide.slug} />

        {guide.relatedProducts.length > 0 && (
          <section className="mt-12 print:hidden">
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

        <section className="mt-12 rounded-2xl border border-border bg-card p-6 text-center print:hidden">
          <h2 className="text-lg font-semibold text-white">Besoin d&apos;aide ?</h2>
          <p className="mt-1 text-sm text-muted">
            Notre support répond à vos questions avant et après l&apos;achat.
          </p>
          <Link href="/support" className="btn-primary mt-4">
            Contacter le support
          </Link>
        </section>
        </article>

        <GuideToc items={toc} slug={guide.slug} />
      </div>
    </div>
  );
}

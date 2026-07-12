import Link from "next/link";
import type { Category } from "@/lib/types";
import { isValidCtaUrl, type CategoryLanding } from "@/lib/categoryLanding";
import { resolveBrandColor } from "@/lib/brandAssets";

/**
 * Compact, commerce-oriented category hero. Deliberately restrained (not a tall
 * campaign banner): title + short subtitle + optional artwork + up to two CTAs.
 * Preserves the page background and subtle blue atmosphere; the image sits in a
 * fixed-aspect box to avoid layout shift. Renders the category name as the page
 * <h1>.
 */
export default function CategoryHero({
  category,
  landing,
}: {
  category: Category;
  landing: CategoryLanding;
}) {
  const accent = resolveBrandColor(category.slug ?? category.id, category.accentColor);

  // Primary CTA: scroll to the product section by default, or an explicit
  // internal/external destination when configured and valid.
  const primaryHref =
    landing.primaryCtaMode === "url" && isValidCtaUrl(landing.primaryCtaUrl)
      ? landing.primaryCtaUrl
      : "#products";
  const primaryLabel = landing.primaryCtaLabel || "Voir les produits";

  const secondaryValid =
    Boolean(landing.secondaryCtaLabel) && isValidCtaUrl(landing.secondaryCtaUrl);

  return (
    <section
      className="relative py-8 sm:py-12"
      style={{ ["--brand" as string]: accent }}
    >
      <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <div className="min-w-0">
          <span className="chip">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
            {category.name}
          </span>
          <h1 className="mt-4 max-w-xl text-[clamp(1.9rem,7vw,2.75rem)] font-semibold leading-[1.08] tracking-tight text-text sm:mt-5">
            {category.name}
          </h1>
          {landing.heroSubtitle && (
            <p className="mt-3 max-w-lg text-base leading-relaxed text-muted sm:mt-4 sm:text-lg">
              {landing.heroSubtitle}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="btn-primary h-11 w-full px-6 text-[15px] sm:w-auto"
            >
              {primaryLabel}
            </Link>
            {secondaryValid && (
              <Link
                href={landing.secondaryCtaUrl}
                className="btn-ghost h-11 w-full px-6 text-[15px] sm:w-auto"
              >
                {landing.secondaryCtaLabel}
              </Link>
            )}
          </div>
        </div>

        {landing.heroImageUrl && (
          <div className="relative order-first lg:order-none">
            <div className="relative overflow-hidden rounded-[18px] border border-border bg-surface">
              {/* Fixed 16/9 box keeps the aspect ratio and prevents CLS while the
                  image loads. Decorative — the copy carries the meaning. */}
              <div className="aspect-[16/9] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={landing.heroImageUrl}
                  alt=""
                  width={880}
                  height={495}
                  className="h-full w-full object-cover"
                  fetchPriority="high"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

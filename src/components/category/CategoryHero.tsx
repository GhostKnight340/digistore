import Link from "next/link";
import type { Category } from "@/lib/types";
import { isValidCtaUrl, type CategoryLanding } from "@/lib/categoryLanding";
import { resolveBrandColor, BRAND_LOGO_SRC, canonicalBrandKey } from "@/lib/brandAssets";

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

  // Hero visual on the right: an admin-uploaded hero image (or the category's
  // cover image) wins; otherwise fall back to a branded panel — the brand logo
  // on a brand-tinted gradient — so the hero never looks unfinished. Only truly
  // logo-less, image-less categories render text-only.
  const heroImage = landing.heroImageUrl || category.coverImageUrl || null;
  const brandLogo = BRAND_LOGO_SRC[canonicalBrandKey(category.slug ?? category.id)] ?? null;
  const hasVisual = Boolean(heroImage || brandLogo);

  return (
    <section
      className="relative py-8 sm:py-12"
      style={{ ["--brand" as string]: accent }}
    >
      <div
        className={`grid items-center gap-8 lg:gap-12 ${
          hasVisual ? "lg:grid-cols-[1.1fr_0.9fr]" : ""
        }`}
      >
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

        {hasVisual && (
          <div className="relative order-first lg:order-none">
            {heroImage ? (
              // Fixed aspect box prevents CLS while the image loads. Decorative.
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[18px] border border-border bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt=""
                  width={880}
                  height={495}
                  className="h-full w-full object-cover"
                  fetchPriority="high"
                  decoding="async"
                />
              </div>
            ) : (
              // Branded default: brand logo on a brand-tinted gradient panel.
              <div
                className="relative aspect-[16/10] w-full overflow-hidden rounded-[18px] border border-border"
                style={{
                  background:
                    "linear-gradient(150deg, color-mix(in srgb, var(--brand) 26%, #121319), #0d1017)",
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(60% 60% at 68% 32%, color-mix(in srgb, var(--brand) 34%, transparent), transparent 70%)",
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={brandLogo!}
                  alt=""
                  className="absolute inset-0 m-auto h-[44%] w-[44%] object-contain drop-shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import {
  approvedReviews,
  reviewStats,
  type DemoReview,
} from "@/lib/trustContent";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { trackEvent } from "@/lib/analytics";

/**
 * Premium customer reviews section. Reads seeded/real reviews from the trust
 * CMS (`settings.trust.reviews`) — the data shape (verified flag, moderation
 * status, region, product, date) mirrors a future `Review` row, so demo
 * reviews swap for real, admin-moderated ones with no code change.
 *
 * Supports the launch-ready subset of the roadmap here (overall rating, average
 * stars, verified badge, sort, star filter, pagination); moderation, photos and
 * post-order review requests are handled server-side later.
 *
 * Not a testimonial slider: a calm, filterable grid. Fires a PII-free
 * `review_interaction` event on sort/filter/expand.
 */

type SortKey = "recent" | "top";

const PAGE_SIZE = 4;

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FMT.format(date);
}

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const rounded = Math.round(rating);
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`Note : ${rating.toFixed(1)} sur 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill={i < rounded ? "#f5b301" : "none"}
          stroke={i < rounded ? "#f5b301" : "#3a3d48"}
          strokeWidth={1.5}
          aria-hidden
        >
          <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#5BC98C]/30 bg-[#5BC98C]/10 px-2 py-0.5 text-[11px] font-medium text-[#5BC98C]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Achat vérifié
    </span>
  );
}

function ReviewCard({ review }: { review: DemoReview }) {
  return (
    <article className="flex flex-col rounded-[16px] border border-border bg-surface2 p-5">
      <div className="flex items-center justify-between gap-3">
        <Stars rating={review.rating} />
        {review.verified && <VerifiedBadge />}
      </div>
      <p className="mt-3 flex-1 text-[14px] leading-relaxed text-text">
        “{review.text}”
      </p>
      {review.productImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={review.productImage}
          alt={review.product}
          className="mt-3 h-28 w-full rounded-[10px] border border-border object-cover"
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
            {review.name.slice(0, 1).toUpperCase()}
          </span>
          {review.name}
          <span className="text-faint">· {review.region}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className="truncate">{review.product}</span>
          <span aria-hidden className="text-faint">
            •
          </span>
          <span className="text-faint">{formatDate(review.date)}</span>
        </div>
      </div>
    </article>
  );
}

export default function CustomerReviews({ heading }: { heading?: string }) {
  const { settings } = useStoreSettings();
  const content = settings.trust.reviews;
  const all = useMemo(() => approvedReviews(content), [content]);
  const stats = useMemo(() => reviewStats(content), [content]);

  const [sort, setSort] = useState<SortKey>("recent");
  const [minStars, setMinStars] = useState(0);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const { ref } = useInViewOnce<HTMLElement>(() =>
    trackEvent("trust_section_viewed", { section: "reviews" }),
  );

  const filtered = useMemo(() => {
    const list = all.filter((r) => r.rating >= minStars);
    return [...list].sort((a, b) => {
      if (sort === "top" && b.rating !== a.rating) return b.rating - a.rating;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [all, sort, minStars]);

  if (all.length === 0) return null;

  const shown = filtered.slice(0, visible);

  const onSort = (key: SortKey) => {
    setSort(key);
    setVisible(PAGE_SIZE);
    trackEvent("review_interaction", { action: "sort", value: key });
  };
  const onFilter = (value: number) => {
    setMinStars(value);
    setVisible(PAGE_SIZE);
    trackEvent("review_interaction", { action: "filter", value });
  };

  return (
    <section ref={ref} className="mt-16">
      <div className="flex flex-col gap-6 rounded-[20px] border border-border bg-gradient-to-b from-surface to-surface/40 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-text">
              {heading ?? "Avis de nos clients"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              L&apos;expérience de clients ayant acheté sur ghost.ma.
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-[14px] border border-border bg-surface2 px-4 py-3">
            <div className="text-center">
              <div className="text-[26px] font-bold leading-none text-white">
                {stats.average.toFixed(1)}
              </div>
              <div className="mt-1 text-[11px] text-faint">sur 5</div>
            </div>
            <div className="border-l border-border pl-4">
              <Stars rating={stats.average} />
              <div className="mt-1 text-[12px] text-muted">
                {stats.count} avis vérifiés
              </div>
            </div>
          </div>
        </div>

        {/* Controls: sort + star filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex rounded-[10px] border border-border bg-surface2 p-0.5">
            {(
              [
                { key: "recent", label: "Récents" },
                { key: "top", label: "Mieux notés" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onSort(option.key)}
                aria-pressed={sort === option.key}
                className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition ${
                  sort === option.key
                    ? "bg-accent text-white"
                    : "text-muted hover:text-text"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {[
            { value: 0, label: "Tous" },
            { value: 5, label: "5 ★" },
            { value: 4, label: "4 ★ et +" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onFilter(option.value)}
              aria-pressed={minStars === option.value}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
                minStars === option.value
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="text-sm text-muted">Aucun avis pour ce filtre.</p>
        ) : (
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          {visible < filtered.length && (
            <button
              type="button"
              onClick={() => {
                setVisible((v) => v + PAGE_SIZE);
                trackEvent("review_interaction", { action: "load_more" });
              }}
              className="btn-ghost h-10 px-5 text-sm"
            >
              Voir plus d&apos;avis
            </button>
          )}
          {content.isDemo && (
            <p className="text-center text-[11.5px] leading-relaxed text-faint">
              Avis de démonstration — ils seront remplacés par de vrais avis
              vérifiés de clients après le lancement.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  getReviews,
  sortReviews,
  summarizeReviews,
  type Review,
  type ReviewSort,
} from "@/lib/reviews";
import { getRegion } from "@/lib/regions";
import { trackEvent } from "@/lib/analytics";

/**
 * Premium customer reviews section. Not a testimonial slider — a static,
 * scannable grid with an overall-rating header (average, stars, verified
 * badge, count) and sortable, paginated cards. The seed data is clearly a
 * placeholder (see `SEED_REVIEWS`); the component already supports the shape of
 * real verified reviews (product, region, date, first name, text, optional
 * photo) so it needs no change when the live pipeline lands.
 */

const PAGE_SIZE = 4;

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = value >= star ? 1 : value >= star - 0.5 ? 0.5 : 0;
        return (
          <svg
            key={star}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className="shrink-0"
          >
            <defs>
              <linearGradient id={`star-${star}-${fill}`}>
                <stop offset={`${fill * 100}%`} stopColor="#f5b544" />
                <stop offset={`${fill * 100}%`} stopColor="#2c2f3a" />
              </linearGradient>
            </defs>
            <path
              d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.06 1.1-6.47L2.6 9.9l6.5-.95L12 2.5z"
              fill={`url(#star-${star}-${fill})`}
            />
          </svg>
        );
      })}
    </span>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const region = review.region ? getRegion(review.region) : null;
  const date = new Date(review.date).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
  });

  return (
    <article className="flex flex-col rounded-[16px] border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold uppercase text-accent">
            {review.reviewerFirstName.slice(0, 1)}
          </span>
          <div>
            <div className="text-[14px] font-semibold text-text">
              {review.reviewerFirstName}
            </div>
            {review.verifiedPurchase && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-[#5BC98C]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-3 w-3" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Achat vérifié
              </span>
            )}
          </div>
        </div>
        <Stars value={review.rating} />
      </div>

      <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-muted">
        {review.text}
      </p>

      {review.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={review.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="mt-3 h-32 w-full rounded-[10px] border border-border object-cover"
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-[12px] text-faint">
        <span className="font-medium text-muted">{review.productName}</span>
        {region && region.kind !== "unknown" && (
          <>
            <span aria-hidden>·</span>
            <span>{region.name}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>{date}</span>
      </div>
    </article>
  );
}

export default function CustomerReviews({
  title = "Ce que disent nos clients",
  subtitle = "Des avis d'acheteurs au Maroc. Après le lancement, ils seront remplacés par des avis vérifiés issus de commandes réelles.",
  reviews = getReviews(),
  className = "mt-16",
}: {
  title?: string;
  subtitle?: string;
  reviews?: Review[];
  className?: string;
}) {
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const summary = useMemo(() => summarizeReviews(reviews), [reviews]);
  const sorted = useMemo(() => sortReviews(reviews, sort), [reviews, sort]);

  if (summary.count === 0) return null;

  const onSort = (next: ReviewSort) => {
    setSort(next);
    setVisible(PAGE_SIZE);
    trackEvent("trust_review_sort", { sort: next });
  };

  const onShowMore = () => {
    setVisible((v) => v + PAGE_SIZE);
    trackEvent("trust_review_show_more");
  };

  const sortLabels: Record<ReviewSort, string> = {
    recent: "Plus récents",
    highest: "Mieux notés",
    lowest: "Moins bien notés",
  };

  return (
    <section className={className} aria-labelledby="reviews-title">
      <div className="flex flex-col gap-1">
        <h2 id="reviews-title" className="text-2xl font-semibold tracking-tight text-text">
          {title}
        </h2>
        <p className="max-w-xl text-sm text-muted">{subtitle}</p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(220px,280px)_1fr] lg:items-start">
        {/* Overall rating summary */}
        <div className="rounded-[16px] border border-border bg-gradient-to-b from-surface2 to-surface p-6">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold leading-none text-text">
              {summary.average.toFixed(1)}
            </span>
            <span className="pb-1 text-sm text-faint">/ 5</span>
          </div>
          <div className="mt-2">
            <Stars value={summary.average} size={18} />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Basé sur {summary.count} avis
          </p>

          <dl className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.distribution[star - 1];
              const pct = summary.count ? (count / summary.count) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-[11.5px] text-faint">
                  <dt className="w-6 shrink-0 text-right">{star}★</dt>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-[#f5b544]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <dd className="w-5 shrink-0">{count}</dd>
                </div>
              );
            })}
          </dl>
        </div>

        {/* Cards + sort */}
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium uppercase tracking-wide text-faint">
              Trier :
            </span>
            {(Object.keys(sortLabels) as ReviewSort[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onSort(key)}
                aria-pressed={sort === key}
                className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition ${
                  sort === key
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                {sortLabels[key]}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {sorted.slice(0, visible).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>

          {visible < sorted.length && (
            <div className="mt-5 flex justify-center">
              <button type="button" onClick={onShowMore} className="btn-ghost h-10 px-5 text-[13.5px]">
                Voir plus d&apos;avis
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

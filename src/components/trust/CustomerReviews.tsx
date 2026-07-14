"use client";

import { useMemo, useRef, useState } from "react";
import Stars from "@/components/trust/Stars";
import TrackSectionView from "@/components/analytics/TrackSectionView";
import { trackEvent } from "@/lib/analytics";
import {
  clampRating,
  reviewSummary,
  type ReviewSetting,
} from "@/lib/trust/content";

type SortKey = "recent" | "top";

/**
 * Premium customer reviews section. The `reviews` passed in are already
 * moderated (approved only) server-side; this component owns the presentational
 * concerns that benefit from interactivity — sorting, pagination ("voir plus")
 * and PII-free interaction tracking. Deliberately NOT a testimonial slider.
 *
 * Architecture: everything future-facing (moderation, verified badge, photos,
 * more filters, review-request-after-order) is modelled in `ReviewSetting`, so
 * swapping the seeded demo reviews for a real verified-review source needs no
 * change here.
 */
const PAGE_SIZE = 4;

export default function CustomerReviews({
  reviews,
  title,
  subtitle,
  className = "mt-16",
}: {
  reviews: ReviewSetting[];
  title: string;
  subtitle?: string;
  className?: string;
}) {
  const [sort, setSort] = useState<SortKey>("recent");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const interacted = useRef(false);

  const summary = useMemo(() => reviewSummary(reviews), [reviews]);
  const sorted = useMemo(() => {
    const copy = [...reviews];
    if (sort === "top") {
      copy.sort((a, b) => clampRating(b.rating) - clampRating(a.rating));
    } else {
      copy.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }
    return copy;
  }, [reviews, sort]);

  if (reviews.length === 0) return null;

  const shown = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  const flagInteraction = (action: string, params: Record<string, string | number> = {}) => {
    trackEvent("review_interaction", { action, ...params });
    if (!interacted.current) interacted.current = true;
  };

  return (
    <section className={className} aria-labelledby="reviews-heading">
      <TrackSectionView event="trust_section_viewed" params={{ section: "reviews" }} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2
            id="reviews-heading"
            className="text-2xl font-semibold tracking-tight text-text sm:text-[27px]"
          >
            {title}
          </h2>
          {subtitle && <p className="mt-1.5 text-sm text-muted sm:text-[15px]">{subtitle}</p>}
        </div>

        {/* Overall rating summary */}
        <div className="flex items-center gap-4 rounded-[16px] border border-border bg-surface px-5 py-4">
          <div className="text-center">
            <div className="text-3xl font-bold leading-none text-text">
              {summary.average.toFixed(1).replace(".", ",")}
            </div>
            <Stars
              value={summary.average}
              size={14}
              className="mt-1.5"
              label={`Note moyenne ${summary.average} sur 5`}
            />
          </div>
          <div className="border-l border-border pl-4 text-[13px] text-muted">
            <p className="font-medium text-text">{summary.count} avis</p>
            <p className="mt-0.5 flex items-center gap-1">
              <VerifiedIcon className="h-3.5 w-3.5 text-accent" />
              Achats vérifiés
            </p>
          </div>
        </div>
      </div>

      {/* Sort controls */}
      <div className="mt-6 flex items-center gap-2" role="group" aria-label="Trier les avis">
        {(
          [
            { key: "recent", label: "Plus récents" },
            { key: "top", label: "Mieux notés" },
          ] as const
        ).map((option) => {
          const active = sort === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSort(option.key);
                setVisibleCount(PAGE_SIZE);
                flagInteraction("sort", { sort: option.key });
              }}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                active
                  ? "border-accent bg-accent/10 text-white"
                  : "border-border text-muted hover:border-border-strong hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-[18px] sm:grid-cols-2">
        {shown.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setVisibleCount((c) => c + PAGE_SIZE);
              flagInteraction("load_more");
            }}
            className="btn-ghost h-11 px-6 text-sm"
          >
            Voir plus d&apos;avis
          </button>
        </div>
      )}
    </section>
  );
}

function ReviewCard({ review }: { review: ReviewSetting }) {
  const rating = clampRating(review.rating);
  return (
    <article className="flex flex-col rounded-[16px] border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent"
          >
            {review.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold text-text">{review.name}</p>
            {review.region && (
              <p className="text-[12px] text-faint">{review.region}</p>
            )}
          </div>
        </div>
        {review.verified && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
            <VerifiedIcon className="h-3 w-3" />
            Vérifié
          </span>
        )}
      </div>

      <Stars value={rating} size={15} className="mt-3.5" label={`${rating} sur 5`} />

      <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-muted">{review.text}</p>

      {review.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={review.imageUrl}
          alt=""
          className="mt-3.5 h-28 w-full rounded-[12px] border border-border object-cover"
          loading="lazy"
          decoding="async"
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-3 text-[12px] text-faint">
        {review.product && <span className="font-medium text-muted">{review.product}</span>}
        {review.product && review.date && <span aria-hidden>·</span>}
        {review.date && <time dateTime={review.date}>{formatDate(review.date)}</time>}
      </div>
    </article>
  );
}

function formatDate(iso: string): string {
  // Deterministic FR formatting without pulling in a date lib or relying on the
  // server locale. Falls back to the raw value if it isn't a YYYY-MM-DD string.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const months = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
  const [, y, m, d] = match;
  const monthIndex = Number(m) - 1;
  const month = months[monthIndex] ?? m;
  return `${Number(d)} ${month} ${y}`;
}

function VerifiedIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 2.5l2.3 1.7 2.85-.2 1 2.7 2.55 1.3-.9 2.7.9 2.7-2.55 1.3-1 2.7-2.85-.2L12 21.5l-2.3-1.7-2.85.2-1-2.7-2.55-1.3.9-2.7-.9-2.7 2.55-1.3 1-2.7 2.85.2L12 2.5z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="m8.5 12 2.4 2.4 4.6-4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

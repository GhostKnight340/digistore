"use client";

import { useMemo } from "react";
import { useTrackOnView } from "@/hooks/useTrackOnView";
import { trackEvent } from "@/lib/analytics";
import { TRUST_EVENTS } from "@/lib/trust/content";
import {
  getReviews,
  type CustomerReview,
  type ReviewSummary,
} from "@/lib/trust/reviews";

/**
 * Customer reviews section — premium card grid (not a testimonial slider) with
 * an overall rating header, average stars, verified-purchase badges, and per-card
 * product / region / date / first name.
 *
 * ⚠️ Uses seeded demo reviews (`getReviews()`), architected to be replaced by
 * real verified reviews after launch — see `src/lib/trust/reviews.ts`. The
 * component only depends on the returned shape, so moderation, filtering,
 * sorting, pagination and photo reviews can be added without changing it.
 */
export default function CustomerReviews({
  title = "Ce que disent nos clients",
  className = "",
  limit = 6,
}: {
  title?: string;
  className?: string;
  limit?: number;
}) {
  const { reviews, summary } = useMemo(
    () => getReviews({ sort: "recent", pageSize: limit }),
    [limit],
  );
  const ref = useTrackOnView<HTMLElement>(TRUST_EVENTS.reviewsViewed, {
    count: summary.count,
    average: summary.average,
  });

  if (reviews.length === 0) return null;

  return (
    <section ref={ref} className={`mt-16 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-text">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Avis de clients ayant acheté sur Ghost.ma.
          </p>
        </div>
        <RatingSummary summary={summary} />
      </div>

      <div className="mt-8 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>

      {/* Placeholder note: demo reviews until verified ones are collected. */}
      <p className="mt-6 text-center text-[12px] text-faint">
        Les avis affichés sont des exemples de démonstration, remplacés par des
        avis vérifiés après le lancement.
      </p>
    </section>
  );
}

function RatingSummary({ summary }: { summary: ReviewSummary }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border bg-surface2 px-4 py-3">
      <div className="text-3xl font-semibold leading-none text-text">
        {summary.average.toFixed(1)}
      </div>
      <div>
        <Stars value={summary.average} />
        <div className="mt-1 text-[12.5px] text-muted">
          {summary.count} avis vérifiés
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: CustomerReview }) {
  const onInteract = () => {
    trackEvent(TRUST_EVENTS.reviewInteraction, { review_id: review.id });
  };
  return (
    <article
      className="flex h-full flex-col rounded-[14px] border border-border bg-surface2 p-5"
      onMouseEnter={onInteract}
    >
      <div className="flex items-center justify-between gap-3">
        <Stars value={review.rating} />
        {review.verified && <VerifiedBadge />}
      </div>
      {review.productImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={review.productImage}
          alt=""
          className="mt-3 h-32 w-full rounded-[10px] object-cover"
          loading="lazy"
          decoding="async"
        />
      )}
      <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-muted">
        {review.text}
      </p>
      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="text-[13.5px] font-semibold text-text">
          {review.firstName}
          <span className="font-normal text-muted"> · {review.region}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[12px] text-faint">
          <span className="truncate">{review.product}</span>
          <span className="shrink-0">{formatDate(review.date)}</span>
        </div>
      </div>
    </article>
  );
}

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${value} sur 5 étoiles`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill={star <= rounded ? "#F7B14A" : "none"}
          stroke={star <= rounded ? "#F7B14A" : "#3a3d48"}
          strokeWidth={1.6}
          strokeLinejoin="round"
          aria-hidden
        >
          <polygon points="12 3 14.6 8.6 20.6 9.3 16.1 13.4 17.4 19.3 12 16.3 6.6 19.3 7.9 13.4 3.4 9.3 9.4 8.6" />
        </svg>
      ))}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#5BC98C]/30 bg-[#5BC98C]/10 px-2 py-0.5 text-[11px] font-medium text-[#7BD6A2]">
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
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Achat vérifié
    </span>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

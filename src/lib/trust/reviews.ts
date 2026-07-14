/**
 * Customer reviews — data model + seeded demo content.
 *
 * ⚠️ PLACEHOLDER DATA: `SEED_REVIEWS` is clearly-labelled demo content designed
 * to be replaced by real, verified reviews after launch. The architecture below
 * is built for that transition:
 *
 *  - `CustomerReview` carries a `verified` flag (real reviews come from
 *    completed orders), a `status` field for future moderation (approve/hide),
 *    and optional `productImage` for photo reviews.
 *  - `getReviews()` is the single read used by the UI. Today it returns the
 *    approved seed set; later it becomes a DB query (Prisma `Review` model) with
 *    the SAME return shape — filtering, sorting and pagination already flow
 *    through `ReviewQuery`, so the component never changes.
 *  - Review requests after completed orders, admin approve/hide, and customer
 *    photo uploads all map onto these fields without a schema redesign.
 */

export type ReviewStatus = "approved" | "pending" | "hidden";

export type CustomerReview = {
  id: string;
  /** First name only — never a full name, for privacy. */
  firstName: string;
  /** Region label, e.g. "Casablanca", "Maroc". */
  region: string;
  /** Product purchased, as displayed. */
  product: string;
  /** ISO date (yyyy-mm-dd) — formatted for display by the component. */
  date: string;
  /** 1–5 stars. */
  rating: number;
  text: string;
  /** True for reviews tied to a completed, verified order. */
  verified: boolean;
  /** Moderation state — only "approved" is ever shown to customers. */
  status: ReviewStatus;
  /** Optional customer/product photo URL (future photo reviews). */
  productImage?: string;
};

export type ReviewSort = "recent" | "top";

export type ReviewQuery = {
  /** Optional minimum star rating (future filtering UI). */
  minRating?: number;
  /** Future filter: only verified-purchase reviews. */
  verifiedOnly?: boolean;
  sort?: ReviewSort;
  /** 1-based page (future pagination). */
  page?: number;
  pageSize?: number;
};

/**
 * SEED DATA — replace with real verified reviews after launch. Ratings are
 * deliberately realistic (a mix, not all 5★) and text is specific rather than
 * generic testimonial filler.
 */
export const SEED_REVIEWS: CustomerReview[] = [
  {
    id: "seed-1",
    firstName: "Yassine",
    region: "Casablanca",
    product: "Carte Steam Wallet",
    date: "2026-06-28",
    rating: 5,
    text: "Code reçu en quelques minutes après la confirmation du virement. La région était bien indiquée, tout a marché du premier coup.",
    verified: true,
    status: "approved",
  },
  {
    id: "seed-2",
    firstName: "Salma",
    region: "Rabat",
    product: "PlayStation Store",
    date: "2026-06-21",
    rating: 5,
    text: "J'avais peur de me tromper de région mais le Navigator m'a prévenue avant de payer. Support très réactif sur WhatsApp.",
    verified: true,
    status: "approved",
  },
  {
    id: "seed-3",
    firstName: "Mehdi",
    region: "Marrakech",
    product: "Netflix",
    date: "2026-06-15",
    rating: 4,
    text: "Livraison rapide et prix transparent. J'aurais aimé plus de moyens de paiement mais le virement a bien fonctionné.",
    verified: true,
    status: "approved",
  },
  {
    id: "seed-4",
    firstName: "Imane",
    region: "Tanger",
    product: "Xbox Game Pass",
    date: "2026-06-09",
    rating: 5,
    text: "Deuxième achat, toujours aussi simple. Paiement en USDT confirmé vite, code envoyé directement par e-mail.",
    verified: true,
    status: "approved",
  },
  {
    id: "seed-5",
    firstName: "Omar",
    region: "Fès",
    product: "Carte Steam Wallet",
    date: "2026-05-30",
    rating: 5,
    text: "Acheté pour un ami, tout s'est bien passé. Les instructions étaient claires et j'ai reçu une facture par e-mail.",
    verified: true,
    status: "approved",
  },
  {
    id: "seed-6",
    firstName: "Hajar",
    region: "Agadir",
    product: "PlayStation Plus",
    date: "2026-05-22",
    rating: 4,
    text: "Bon service, code fonctionnel. Vérification du paiement un peu longue le week-end mais l'équipe m'a tenue informée.",
    verified: true,
    status: "approved",
  },
];

/** Aggregate rating summary for the header (average + count + distribution). */
export type ReviewSummary = {
  count: number;
  average: number;
  /** Count per star, index 0 = 1★ … index 4 = 5★. */
  distribution: [number, number, number, number, number];
};

export function summarizeReviews(reviews: CustomerReview[]): ReviewSummary {
  const visible = reviews.filter((r) => r.status === "approved");
  const count = visible.length;
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const review of visible) {
    total += review.rating;
    const bucket = Math.min(5, Math.max(1, Math.round(review.rating))) - 1;
    distribution[bucket] += 1;
  }
  const average = count === 0 ? 0 : Math.round((total / count) * 10) / 10;
  return { count, average, distribution };
}

/**
 * Single read used by the UI. Today: filters the approved seed set and applies
 * sort/pagination in memory. Later: swap the body for a Prisma query with the
 * same signature — callers are unaffected.
 */
export function getReviews(query: ReviewQuery = {}): {
  reviews: CustomerReview[];
  summary: ReviewSummary;
  total: number;
} {
  const { minRating, verifiedOnly, sort = "recent", page = 1, pageSize } = query;

  let list = SEED_REVIEWS.filter((r) => r.status === "approved");
  const summary = summarizeReviews(list);

  if (typeof minRating === "number") {
    list = list.filter((r) => r.rating >= minRating);
  }
  if (verifiedOnly) {
    list = list.filter((r) => r.verified);
  }

  list = [...list].sort((a, b) =>
    sort === "top" ? b.rating - a.rating : b.date.localeCompare(a.date),
  );

  const total = list.length;
  if (pageSize && pageSize > 0) {
    const start = (Math.max(1, page) - 1) * pageSize;
    list = list.slice(start, start + pageSize);
  }

  return { reviews: list, summary, total };
}

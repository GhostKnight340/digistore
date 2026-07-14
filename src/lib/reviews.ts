/**
 * Customer reviews architecture.
 *
 * This module is deliberately shaped for real, verified reviews after launch
 * while shipping clearly-labelled seed data now. The `Review` type already
 * carries everything the future pipeline needs — moderation status, verified
 * purchase flag, product/region/date, an optional photo — so moving to a
 * database table (or admin moderation UI) is a matter of swapping the data
 * source in `getReviews`, not reshaping callers.
 *
 * PLACEHOLDER: `SEED_REVIEWS` are demonstration reviews, not real customers.
 * They exist only to show the section design and must be replaced by verified
 * reviews collected after completed orders (review-request flow) before launch.
 */

export type ReviewStatus = "approved" | "pending" | "hidden";

export interface Review {
  id: string;
  /** First name only — never store or display full customer identity. */
  reviewerFirstName: string;
  /** Product the review is about, as shown to the customer. */
  productName: string;
  /** Region code the purchase targeted (e.g. "MA", "EU"), optional. */
  region?: string;
  /** ISO date (YYYY-MM-DD) of the review. */
  date: string;
  rating: number; // 1..5
  text: string;
  /** True once tied to a real completed order — drives the verified badge. */
  verifiedPurchase: boolean;
  /** Moderation state. Only "approved" is ever shown to customers. */
  status: ReviewStatus;
  /** Optional customer-supplied product photo URL (future review-request flow). */
  imageUrl?: string;
}

export interface ReviewSummary {
  count: number;
  average: number; // rounded to 1 decimal
  /** Count per star, index 0 = 1★ … index 4 = 5★. */
  distribution: [number, number, number, number, number];
}

export type ReviewSort = "recent" | "highest" | "lowest";

/**
 * Seeded demonstration reviews. CLEARLY placeholder — replace with verified
 * reviews after launch. Kept small and realistic so the section reads as a
 * finished design rather than filler.
 */
export const SEED_REVIEWS: Review[] = [
  {
    id: "seed-1",
    reviewerFirstName: "Yassine",
    productName: "Carte Steam 50 MAD",
    region: "MA",
    date: "2026-06-28",
    rating: 5,
    text: "Code reçu quelques minutes après la confirmation du paiement. Simple et fiable, exactement ce que je cherchais.",
    verifiedPurchase: true,
    status: "approved",
  },
  {
    id: "seed-2",
    reviewerFirstName: "Salma",
    productName: "PlayStation Store 100 MAD",
    region: "MA",
    date: "2026-06-21",
    rating: 5,
    text: "Le support m'a confirmé la bonne région avant l'achat. Livraison rapide et code valide du premier coup.",
    verifiedPurchase: true,
    status: "approved",
  },
  {
    id: "seed-3",
    reviewerFirstName: "Omar",
    productName: "Carte Xbox 100 MAD",
    region: "EU",
    date: "2026-06-15",
    rating: 4,
    text: "Bon prix et paiement par virement sans souci. J'aurais aimé encore un peu plus rapide, mais rien à redire sur le code.",
    verifiedPurchase: true,
    status: "approved",
  },
  {
    id: "seed-4",
    reviewerFirstName: "Imane",
    productName: "Abonnement Netflix",
    region: "MA",
    date: "2026-06-09",
    rating: 5,
    text: "Première fois que j'achète un produit numérique en ligne au Maroc en confiance. Instructions claires, tout a marché.",
    verifiedPurchase: true,
    status: "approved",
  },
  {
    id: "seed-5",
    reviewerFirstName: "Mehdi",
    productName: "Carte Steam 100 MAD",
    region: "MA",
    date: "2026-05-30",
    rating: 5,
    text: "Paiement en USDT accepté, livraison nickel. Je recommande pour les gamers au Maroc.",
    verifiedPurchase: true,
    status: "approved",
  },
];

/** Only reviews a customer is allowed to see. */
export function publishedReviews(reviews: Review[]): Review[] {
  return reviews.filter((review) => review.status === "approved");
}

export function summarizeReviews(reviews: Review[]): ReviewSummary {
  const published = publishedReviews(reviews);
  const count = published.length;
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const review of published) {
    const star = Math.min(5, Math.max(1, Math.round(review.rating)));
    distribution[star - 1] += 1;
    total += star;
  }
  const average = count === 0 ? 0 : Math.round((total / count) * 10) / 10;
  return { count, average, distribution };
}

export function sortReviews(reviews: Review[], sort: ReviewSort): Review[] {
  const copy = [...reviews];
  switch (sort) {
    case "highest":
      return copy.sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date));
    case "lowest":
      return copy.sort((a, b) => a.rating - b.rating || b.date.localeCompare(a.date));
    case "recent":
    default:
      return copy.sort((a, b) => b.date.localeCompare(a.date));
  }
}

/**
 * Single accessor for approved reviews. Today it returns the seed data; after
 * launch this is where the database/moderation query goes (with filtering,
 * sorting and pagination applied server-side). Kept synchronous for now so the
 * homepage renders without an extra round-trip; switching to `async` later only
 * touches this function and its (already awaited-friendly) callers.
 */
export function getReviews(): Review[] {
  return publishedReviews(SEED_REVIEWS);
}

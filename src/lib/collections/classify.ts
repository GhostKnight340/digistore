/**
 * Pure classifier that assigns a real catalogue product to curated collections
 * using STRUCTURED metadata (category, brand, name, and region codes) — never
 * inventing products and never inferring region from title text. Client-safe
 * (no DB, no `server-only`) so it is unit-testable and reusable by the seed
 * script. Matching is accent/case-insensitive via `normalizeSearch`.
 *
 * A product may legitimately belong to more than one thematic collection (e.g.
 * a Steam Wallet card is both "Gaming" and "Cartes cadeaux") — that mirrors the
 * real catalogue and the requested collection definitions. Regional membership
 * is decided purely from the product's structured region codes.
 */
import { normalizeSearch } from "@/lib/search/text";

/** The minimal shape the classifier needs — all from structured columns. */
export interface ClassifiableProduct {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  /** Category id/key. */
  category: string;
  /** Human category name. */
  categoryName: string;
  /** Distinct region codes across the product + its active variants (structured). */
  regions: string[];
}

// Keyword tables. Written naturally; normalized on use. These match against the
// product's name + brand + category, which are structured fields — not free
// marketing copy.
export const GAMING_KEYWORDS = [
  "steam", "playstation", "play station", "psn", "xbox", "nintendo", "switch",
  "eshop", "roblox", "valorant", "free fire", "freefire", "pubg", "fortnite",
  "call of duty", "warzone", "mobile legends", "genshin", "riot", "epic games",
  "league of legends", "minecraft", "gaming", "jeu video", "jeux video", "gamer",
];

export const GIFTCARD_KEYWORDS = [
  "google play", "googleplay", "apple", "itunes", "app store", "appstore",
  "amazon", "razer", "razer gold", "gift card", "carte cadeau", "steam wallet",
  "playstation store", "xbox gift", "nintendo eshop", "visa", "mastercard",
  "netflix", "prepaid", "ecard", "recharge",
];

export const SUBSCRIPTION_KEYWORDS = [
  "netflix", "spotify", "discord nitro", "nitro", "crunchyroll", "game pass",
  "playstation plus", "ps plus", "playstation now", "nintendo switch online",
  "youtube premium", "youtube", "deezer", "shahid", "osn", "prime video",
  "amazon prime", "disney", "hbo", "apple music", "abonnement", "subscription",
];

export const SOFTWARE_KEYWORDS = [
  "windows", "office", "microsoft 365", "office 365", "antivirus", "norton",
  "mcafee", "kaspersky", "eset", "bitdefender", "avast", "adobe",
  "creative cloud", "autocad", "vpn", "nordvpn", "expressvpn", "logiciel",
  "software", "licence", "license", "product key", "cle produit",
];

/** Region codes that count as Europe / EUR-compatible (structured). */
export const EUROPE_REGIONS = new Set(["EU", "FR"]);

function haystack(product: ClassifiableProduct): string {
  return normalizeSearch(
    [product.name, product.brand ?? "", product.categoryName, product.category]
      .filter(Boolean)
      .join(" "),
  );
}

/** True when any keyword (normalized) appears in the product's structured text. */
export function matchesKeywords(
  product: ClassifiableProduct,
  keywords: string[],
): boolean {
  const hay = haystack(product);
  if (!hay) return false;
  return keywords.some((keyword) => {
    const needle = normalizeSearch(keyword);
    return needle.length > 0 && hay.includes(needle);
  });
}

export function isGaming(product: ClassifiableProduct): boolean {
  return matchesKeywords(product, GAMING_KEYWORDS);
}
export function isGiftCard(product: ClassifiableProduct): boolean {
  return matchesKeywords(product, GIFTCARD_KEYWORDS);
}
export function isSubscription(product: ClassifiableProduct): boolean {
  return matchesKeywords(product, SUBSCRIPTION_KEYWORDS);
}
export function isSoftware(product: ClassifiableProduct): boolean {
  return matchesKeywords(product, SOFTWARE_KEYWORDS);
}

// ── Regional membership — structured region codes only ───────────────────────
export function inEurope(product: ClassifiableProduct): boolean {
  return product.regions.some((region) => EUROPE_REGIONS.has(region));
}
export function inUnitedStates(product: ClassifiableProduct): boolean {
  return product.regions.includes("US");
}
/** Only products EXPLICITLY marked GLOBAL — never assumed from a missing region. */
export function isGlobal(product: ClassifiableProduct): boolean {
  return product.regions.includes("GLOBAL");
}

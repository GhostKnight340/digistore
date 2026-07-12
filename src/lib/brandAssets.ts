/**
 * Shared brand identity for the homepage brand quick-nav and the per-brand card
 * colors. Colors come from the supplied `colors.json`; keys are category
 * ids/slugs (with common aliases folded to a canonical brand key). Client-safe —
 * no server-only imports — so both server and client components can use it.
 */

export const BRAND_COLORS: Record<string, string> = {
  steam: "#66C0F4",
  playstation: "#0070D1",
  xbox: "#107C10",
  "google-play": "#00F076",
  itunes: "#FB5BC5",
  apple: "#A2AAAD",
  pubg: "#F2A900",
  netflix: "#E50914",
  "free-fire": "#FFB300",
  nintendo: "#E60012",
  roblox: "#E2231A",
};

/** Official brand logos served from `public/marques/`. */
export const BRAND_LOGO_SRC: Record<string, string> = {
  steam: "/marques/steam.svg",
  playstation: "/marques/playstation.svg",
  xbox: "/marques/xbox.svg",
  "google-play": "/marques/google-play.svg",
  itunes: "/marques/itunes.svg",
  apple: "/marques/apple.svg",
  pubg: "/marques/pubg.svg",
  netflix: "/marques/netflix.svg",
  "free-fire": "/marques/free-fire.png",
};

/** Common category slug aliases → canonical brand key. */
export const BRAND_ALIASES: Record<string, string> = {
  psn: "playstation",
  "playstation-store": "playstation",
  "playstation-plus": "playstation",
  "ps-plus": "playstation",
  "xbox-game-pass": "xbox",
  "xbox-live": "xbox",
  "steam-wallet": "steam",
  "app-store": "apple",
  "google-play-store": "google-play",
  googleplay: "google-play",
  "pubg-mobile": "pubg",
  freefire: "free-fire",
  "free-fire-ff": "free-fire",
  "garena-free-fire": "free-fire",
};

const STORE_BLUE = "#3e7bfa";

/** Fold a category id/slug to its canonical brand key. */
export function canonicalBrandKey(idOrSlug: string): string {
  const key = idOrSlug.toLowerCase();
  return BRAND_ALIASES[key] ?? key;
}

/**
 * Resolve the accent color for a brand. A custom (non-default) admin accent
 * always wins; otherwise fall back to the brand's own color, then the store
 * blue. Keeps tiles and cards colored consistently even before an admin sets
 * a per-category color.
 */
export function resolveBrandColor(
  idOrSlug: string,
  accentColor?: string | null,
): string {
  const custom =
    accentColor && accentColor.toLowerCase() !== STORE_BLUE ? accentColor : null;
  return custom ?? BRAND_COLORS[canonicalBrandKey(idOrSlug)] ?? accentColor ?? STORE_BLUE;
}

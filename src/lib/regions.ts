// Single source of truth for the store's region taxonomy. Every surface
// (catalogue, product detail, cart, checkout, admin) reads from this table —
// adding a region means adding one row here, nothing else changes.

export const REGION_CODES = ["GLOBAL", "EU", "MA", "FR", "US", "UK", "TR", "SA", "UAE"] as const;

export type RegionCode = (typeof REGION_CODES)[number];

export type RegionKind = "global" | "region" | "country" | "unknown";

export interface RegionInfo {
  code: string;
  name: string;
  kind: RegionKind;
  restricted: boolean;
}

export const REGION_TABLE: Record<RegionCode, RegionInfo> = {
  GLOBAL: { code: "GLOBAL", name: "Global", kind: "global", restricted: false },
  EU: { code: "EU", name: "Europe", kind: "region", restricted: false },
  MA: { code: "MA", name: "Maroc", kind: "country", restricted: true },
  FR: { code: "FR", name: "France", kind: "country", restricted: true },
  US: { code: "US", name: "États-Unis", kind: "country", restricted: true },
  UK: { code: "UK", name: "Royaume-Uni", kind: "country", restricted: true },
  TR: { code: "TR", name: "Turquie", kind: "country", restricted: true },
  SA: { code: "SA", name: "Arabie Saoudite", kind: "country", restricted: true },
  UAE: { code: "UAE", name: "Émirats A.U.", kind: "country", restricted: true },
};

export const UNKNOWN_REGION: RegionInfo = {
  code: "",
  name: "Région ?",
  kind: "unknown",
  restricted: false,
};

export function isRegionCode(value: string | null | undefined): value is RegionCode {
  return !!value && (REGION_CODES as readonly string[]).includes(value);
}

export function getRegion(code: string | null | undefined): RegionInfo {
  if (isRegionCode(code)) return REGION_TABLE[code];
  return UNKNOWN_REGION;
}

/**
 * Copy for the note row in the product-detail region panel and the cart's
 * restricted-item reminder line.
 */
export function regionNoteCopy(code: string | null | undefined): string {
  const region = getRegion(code);
  if (region.kind === "unknown") {
    return "Région non renseignée — à compléter avant la mise en vente.";
  }
  if (!region.restricted) {
    return "Aucune restriction de région — activable partout dans le monde, sur n'importe quel compte.";
  }
  return `Ce produit nécessite un compte de la région ${region.name} pour être activé.`;
}

export const REGION_LIST: RegionInfo[] = REGION_CODES.map((code) => REGION_TABLE[code]);

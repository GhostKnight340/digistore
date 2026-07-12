/**
 * Category landing-page content model + normalizer.
 *
 * All rich landing content for a category lives in a single `Category.landing`
 * JSON column (see prisma/schema.prisma). This module is the single source of
 * truth for its shape and is intentionally client-safe (no `server-only`) so
 * both the admin editor and the storefront use the exact same types and the
 * same defensive normalization — mirroring how `mergeStoreSettings` treats the
 * store-settings blob.
 *
 * Every section is optional. `normalizeCategoryLanding` coerces arbitrary
 * persisted/legacy JSON into a fully-populated, safe object so callers never
 * have to null-check. `hasLandingContent` decides whether any landing section
 * should render at all (so a content-less category stays a plain grid).
 */

export type NavigatorTipType =
  | "information"
  | "compatibility"
  | "warning"
  | "security";

export const NAVIGATOR_TIP_TYPES: NavigatorTipType[] = [
  "information",
  "compatibility",
  "warning",
  "security",
];

export type PrimaryCtaMode = "products" | "url";

/** Approved icon keys for quick-info items. No arbitrary SVG/HTML is ever
 * accepted — the admin picks from these and the storefront renders a matching
 * inline SVG from `categoryIcons`. Keep in sync with that component's map. */
export const APPROVED_INFO_ICONS = [
  "bolt",
  "shield",
  "globe",
  "support",
  "lock",
  "check",
  "card",
  "sparkle",
] as const;
export type InfoIconKey = (typeof APPROVED_INFO_ICONS)[number];

export interface CategoryInfoItem {
  id: string;
  icon: InfoIconKey;
  title: string;
  description: string;
  active: boolean;
  sortOrder: number;
}

export interface CategoryFaqItem {
  id: string;
  question: string;
  answer: string;
  active: boolean;
  sortOrder: number;
}

export interface NavigatorTip {
  enabled: boolean;
  title: string;
  message: string;
  type: NavigatorTipType;
  ctaLabel: string;
  ctaUrl: string;
}

export interface CategorySeo {
  title: string;
  description: string;
  imageUrl: string;
}

export interface CategoryLanding {
  heroSubtitle: string;
  heroImageUrl: string;
  primaryCtaLabel: string;
  primaryCtaMode: PrimaryCtaMode;
  primaryCtaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  introText: string;
  infoItems: CategoryInfoItem[];
  navigatorTip: NavigatorTip;
  faqItems: CategoryFaqItem[];
  relatedCategoryIds: string[];
  seo: CategorySeo;
}

export const MAX_INFO_ITEMS = 4;

// Text length caps — defensive, applied on normalize so persisted content can
// never blow out the layout regardless of how it was written.
const LIMITS = {
  heroSubtitle: 200,
  ctaLabel: 40,
  url: 500,
  introText: 4000,
  infoTitle: 60,
  infoDescription: 120,
  tipTitle: 80,
  tipMessage: 400,
  question: 200,
  answer: 2000,
  seoTitle: 70,
  seoDescription: 200,
} as const;

export function defaultCategoryLanding(): CategoryLanding {
  return {
    heroSubtitle: "",
    heroImageUrl: "",
    primaryCtaLabel: "",
    primaryCtaMode: "products",
    primaryCtaUrl: "",
    secondaryCtaLabel: "",
    secondaryCtaUrl: "",
    introText: "",
    infoItems: [],
    navigatorTip: {
      enabled: false,
      title: "",
      message: "",
      type: "information",
      ctaLabel: "",
      ctaUrl: "",
    },
    faqItems: [],
    relatedCategoryIds: [],
    seo: { title: "", description: "", imageUrl: "" },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function int(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

/**
 * A CTA destination is usable only when it is a safe internal path, in-page
 * anchor, or a http(s)/mailto/tel URL. Anything else (javascript:, data:, empty)
 * is treated as absent so the caller hides the button. Mirrors the `safeHref`
 * idea used by the legal-page sanitizer.
 */
export function isValidCtaUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  if (url.startsWith("/") || url.startsWith("#")) return true;
  return /^(https?:|mailto:|tel:)/i.test(url);
}

function icon(value: unknown): InfoIconKey {
  return (APPROVED_INFO_ICONS as readonly string[]).includes(value as string)
    ? (value as InfoIconKey)
    : "bolt";
}

function tipType(value: unknown): NavigatorTipType {
  return NAVIGATOR_TIP_TYPES.includes(value as NavigatorTipType)
    ? (value as NavigatorTipType)
    : "information";
}

export function normalizeCategoryLanding(value: unknown): CategoryLanding {
  const base = defaultCategoryLanding();
  if (!isObject(value)) return base;

  const rawInfo = Array.isArray(value.infoItems) ? value.infoItems : [];
  const infoItems: CategoryInfoItem[] = rawInfo
    .filter(isObject)
    .map((item, index) => ({
      id: str(item.id, 60) || `info-${index}`,
      icon: icon(item.icon),
      title: str(item.title, LIMITS.infoTitle),
      description: str(item.description, LIMITS.infoDescription),
      active: bool(item.active, true),
      sortOrder: int(item.sortOrder, index),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, MAX_INFO_ITEMS);

  const rawFaq = Array.isArray(value.faqItems) ? value.faqItems : [];
  const seenQuestions = new Set<string>();
  const faqItems: CategoryFaqItem[] = rawFaq
    .filter(isObject)
    .map((item, index) => ({
      id: str(item.id, 60) || `faq-${index}`,
      question: str(item.question, LIMITS.question),
      answer: str(item.answer, LIMITS.answer),
      active: bool(item.active, true),
      sortOrder: int(item.sortOrder, index),
    }))
    .filter((item) => {
      // Drop blank and duplicate-question rows (case-insensitive) so the same
      // question never appears twice within a category.
      if (!item.question || !item.answer) return false;
      const key = item.question.toLowerCase();
      if (seenQuestions.has(key)) return false;
      seenQuestions.add(key);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const rawRelated = Array.isArray(value.relatedCategoryIds)
    ? value.relatedCategoryIds
    : [];
  const relatedCategoryIds = Array.from(
    new Set(
      rawRelated.filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const rawTip = isObject(value.navigatorTip) ? value.navigatorTip : {};

  return {
    heroSubtitle: str(value.heroSubtitle, LIMITS.heroSubtitle),
    heroImageUrl: str(value.heroImageUrl, LIMITS.url),
    primaryCtaLabel: str(value.primaryCtaLabel, LIMITS.ctaLabel),
    primaryCtaMode: value.primaryCtaMode === "url" ? "url" : "products",
    primaryCtaUrl: str(value.primaryCtaUrl, LIMITS.url),
    secondaryCtaLabel: str(value.secondaryCtaLabel, LIMITS.ctaLabel),
    secondaryCtaUrl: str(value.secondaryCtaUrl, LIMITS.url),
    introText: str(value.introText, LIMITS.introText),
    infoItems,
    navigatorTip: {
      enabled: bool(rawTip.enabled, false),
      title: str(rawTip.title, LIMITS.tipTitle),
      message: str(rawTip.message, LIMITS.tipMessage),
      type: tipType(rawTip.type),
      ctaLabel: str(rawTip.ctaLabel, LIMITS.ctaLabel),
      ctaUrl: str(rawTip.ctaUrl, LIMITS.url),
    },
    faqItems,
    relatedCategoryIds,
    seo: {
      title: str(isObject(value.seo) ? value.seo.title : "", LIMITS.seoTitle),
      description: str(
        isObject(value.seo) ? value.seo.description : "",
        LIMITS.seoDescription,
      ),
      imageUrl: str(isObject(value.seo) ? value.seo.imageUrl : "", LIMITS.url),
    },
  };
}

/** Active info items, ordered — what the storefront actually renders. */
export function visibleInfoItems(landing: CategoryLanding): CategoryInfoItem[] {
  return landing.infoItems.filter((item) => item.active && item.title);
}

/** Active, non-empty FAQ items, ordered — what the storefront + JSON-LD render. */
export function visibleFaqItems(landing: CategoryLanding): CategoryFaqItem[] {
  return landing.faqItems.filter(
    (item) => item.active && item.question && item.answer,
  );
}

/** Whether the hero section has anything worth rendering. */
export function hasHero(landing: CategoryLanding): boolean {
  return Boolean(
    landing.heroSubtitle || landing.heroImageUrl || landing.primaryCtaLabel,
  );
}

/**
 * True when at least one landing section is populated. When false, the category
 * page renders exactly as the plain product grid it was before — no empty
 * placeholders.
 */
export function hasLandingContent(landing: CategoryLanding): boolean {
  return Boolean(
    hasHero(landing) ||
      landing.introText ||
      visibleInfoItems(landing).length > 0 ||
      (landing.navigatorTip.enabled && landing.navigatorTip.message) ||
      visibleFaqItems(landing).length > 0 ||
      landing.relatedCategoryIds.length > 0,
  );
}

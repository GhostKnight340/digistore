/**
 * Guide content model + normalizer.
 *
 * A Guide is a customer-education page (e.g. "Comment activer une carte Steam")
 * served at /guides/<slug>. Its structured body, FAQ, and Navigator tip live in
 * three JSON columns on the `Guide` model (see prisma/schema.prisma). This module
 * is the single source of truth for their shapes and is intentionally client-safe
 * (no `server-only`) so the admin editor, the storefront renderer, the public
 * search, and the tests all share the exact same types and the same defensive
 * normalization — mirroring `normalizeCategoryLanding`.
 *
 * Body content is a bounded list of TYPED blocks — never arbitrary HTML. Rich
 * text inside paragraph/warning blocks is stored as Markdown/limited HTML and is
 * only ever emitted through `normalizeLegalHtml` (the shared allowlist sanitizer)
 * at render time, so unsafe HTML can never reach the page. This is deliberately
 * not a general-purpose page builder.
 */

import {
  NAVIGATOR_TIP_TYPES,
  type NavigatorTipType,
} from "./categoryLanding";

export type { NavigatorTipType };
export { NAVIGATOR_TIP_TYPES };

/** Namespace prefix for the public guide pages. */
export const GUIDE_URL_PREFIX = "/guides";

/**
 * Canonical link for a guide. Single source of truth so every link site (index,
 * search, related-guides, sitemap, breadcrumbs) stays consistent.
 */
export function guideHref(slug: string): string {
  return `${GUIDE_URL_PREFIX}/${slug}`;
}

/** URL-safe slug: strip accents, lowercase, collapse to hyphens, cap length. */
export function slugifyGuide(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Approved icon KEYS for a guide's hero glyph. No arbitrary SVG/HTML is ever
 * accepted — the admin picks from these and the storefront renders a matching
 * inline SVG (see src/components/guides/GuideIcon.tsx).
 */
export const APPROVED_GUIDE_ICONS = [
  "book", // generic guide (default)
  "gaming", // console / games
  "gift", // gift card
  "subscription", // streaming / recurring
  "card", // payment / cards
  "globe", // region / global
  "shield", // security / account safety
  "sparkle", // new / precommande
  "support", // help / how-to
] as const;
export type GuideIconKey = (typeof APPROVED_GUIDE_ICONS)[number];
export const DEFAULT_GUIDE_ICON: GuideIconKey = "book";

/** Coerce arbitrary persisted/admin input to a known guide icon key, or "". */
export function normalizeGuideIcon(value: unknown): GuideIconKey | "" {
  if (typeof value !== "string") return "";
  const key = value.trim().toLowerCase();
  return (APPROVED_GUIDE_ICONS as readonly string[]).includes(key)
    ? (key as GuideIconKey)
    : "";
}

// ── Content blocks ──────────────────────────────────────────────────────────

export const GUIDE_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "steps",
  "list",
  "image",
  "warning",
  "tip",
  "payment",
  "product",
  "cta",
] as const;
export type GuideBlockType = (typeof GUIDE_BLOCK_TYPES)[number];

export type GuideBlock =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "steps"; items: string[] }
  | { id: string; type: "list"; items: string[] }
  | { id: string; type: "image"; url: string; alt: string; caption: string }
  | { id: string; type: "warning"; text: string }
  | {
      id: string;
      type: "tip";
      title: string;
      message: string;
      tipType: NavigatorTipType;
    }
  | { id: string; type: "payment"; title: string; note: string }
  | { id: string; type: "product"; productId: string }
  | { id: string; type: "cta"; label: string; url: string };

export interface GuideFaqItem {
  id: string;
  question: string;
  answer: string;
}

// ── Article template model (design handoff) ─────────────────────────────────

/** Difficulty levels shown as the hero chip. "" = unset → no chip rendered. */
export const GUIDE_DIFFICULTIES = ["facile", "moyen", "avance"] as const;
export type GuideDifficulty = (typeof GUIDE_DIFFICULTIES)[number];

/** French labels for the difficulty chip. */
export const GUIDE_DIFFICULTY_LABELS: Record<GuideDifficulty, string> = {
  facile: "Facile",
  moyen: "Moyen",
  avance: "Avancé",
};

export function normalizeGuideDifficulty(value: unknown): GuideDifficulty | "" {
  if (typeof value !== "string") return "";
  const key = value.trim().toLowerCase();
  return (GUIDE_DIFFICULTIES as readonly string[]).includes(key)
    ? (key as GuideDifficulty)
    : "";
}

/**
 * One numbered step card. `screenshotUrl` stays empty until a real capture
 * exists — the design gates the screenshot block on it, so an empty value
 * simply renders no image rather than a placeholder.
 */
export interface GuideStep {
  id: string;
  title: string;
  description: string;
  /** Optional green tip callout. */
  tip: string;
  /** Optional red warning callout. */
  warning: string;
  /** Optional step screenshot. */
  screenshotUrl: string;
}

export interface GuideTroubleshootingItem {
  id: string;
  question: string;
  answer: string;
}

export interface GuideNavigatorTip {
  enabled: boolean;
  title: string;
  message: string;
  type: NavigatorTipType;
  ctaLabel: string;
  ctaUrl: string;
}

/** The full editable/renderable guide document (columns joined for callers). */
export interface GuideDoc {
  content: GuideBlock[];
  faq: GuideFaqItem[];
  navigatorTip: GuideNavigatorTip;
}

// Defensive length caps applied on normalize so persisted content can never blow
// out the layout regardless of how it was written.
const LIMITS = {
  heading: 120,
  paragraph: 4000,
  stepItem: 400,
  listItem: 400,
  imageUrl: 500,
  alt: 160,
  caption: 200,
  warning: 600,
  tipTitle: 80,
  tipMessage: 400,
  paymentTitle: 80,
  paymentNote: 400,
  ctaLabel: 40,
  url: 500,
  question: 200,
  answer: 2000,
  id: 60,
  // Article-template fields
  stepTitle: 160,
  stepDescription: 800,
  stepCallout: 400,
  label: 60,
} as const;

const MAX_BLOCKS = 60;
const MAX_STEP_ITEMS = 30;
const MAX_FAQ_ITEMS = 30;

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

function tipType(value: unknown): NavigatorTipType {
  return NAVIGATOR_TIP_TYPES.includes(value as NavigatorTipType)
    ? (value as NavigatorTipType)
    : "information";
}

function strList(value: unknown, max: number, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => str(item, max))
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * A CTA destination is usable only when it is a safe internal path, in-page
 * anchor, or a http(s)/mailto/tel URL. Anything else (javascript:, data:, empty)
 * is treated as absent. Mirrors `isValidCtaUrl` in categoryLanding.
 */
export function isValidGuideUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  if (url.startsWith("/") || url.startsWith("#")) return true;
  return /^(https?:|mailto:|tel:)/i.test(url);
}

/** Coerce arbitrary persisted/admin JSON into a safe, ordered block list. */
export function normalizeGuideBlocks(value: unknown): GuideBlock[] {
  const raw = Array.isArray(value) ? value : [];
  const out: GuideBlock[] = [];
  raw.forEach((entry, index) => {
    if (!isObject(entry)) return;
    const type = entry.type;
    const id = str(entry.id, LIMITS.id) || `block-${index}`;
    switch (type) {
      case "heading": {
        const text = str(entry.text, LIMITS.heading);
        if (text) out.push({ id, type, text });
        break;
      }
      case "paragraph": {
        const text = str(entry.text, LIMITS.paragraph);
        if (text) out.push({ id, type, text });
        break;
      }
      case "steps": {
        const items = strList(entry.items, LIMITS.stepItem, MAX_STEP_ITEMS);
        if (items.length) out.push({ id, type, items });
        break;
      }
      case "list": {
        const items = strList(entry.items, LIMITS.listItem, MAX_STEP_ITEMS);
        if (items.length) out.push({ id, type, items });
        break;
      }
      case "image": {
        const url = str(entry.url, LIMITS.imageUrl);
        if (url) {
          out.push({
            id,
            type,
            url,
            alt: str(entry.alt, LIMITS.alt),
            caption: str(entry.caption, LIMITS.caption),
          });
        }
        break;
      }
      case "warning": {
        const text = str(entry.text, LIMITS.warning);
        if (text) out.push({ id, type, text });
        break;
      }
      case "tip": {
        const message = str(entry.message, LIMITS.tipMessage);
        if (message) {
          out.push({
            id,
            type,
            title: str(entry.title, LIMITS.tipTitle),
            message,
            tipType: tipType(entry.tipType),
          });
        }
        break;
      }
      case "payment": {
        out.push({
          id,
          type,
          title: str(entry.title, LIMITS.paymentTitle) || "Moyens de paiement",
          note: str(entry.note, LIMITS.paymentNote),
        });
        break;
      }
      case "product": {
        const productId = str(entry.productId, LIMITS.id);
        if (productId) out.push({ id, type, productId });
        break;
      }
      case "cta": {
        const label = str(entry.label, LIMITS.ctaLabel);
        const url = str(entry.url, LIMITS.url);
        if (label && isValidGuideUrl(url)) out.push({ id, type, label, url });
        break;
      }
      default:
        break;
    }
  });
  return out.slice(0, MAX_BLOCKS);
}

/** Coerce persisted FAQ JSON into safe, de-duplicated, non-empty items. */
export function normalizeGuideFaq(value: unknown): GuideFaqItem[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: GuideFaqItem[] = [];
  raw.forEach((entry, index) => {
    if (!isObject(entry)) return;
    const question = str(entry.question, LIMITS.question);
    const answer = str(entry.answer, LIMITS.answer);
    if (!question || !answer) return;
    const key = question.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: str(entry.id, LIMITS.id) || `faq-${index}`, question, answer });
  });
  return out.slice(0, MAX_FAQ_ITEMS);
}

/** Coerce persisted/admin JSON into safe, ordered step cards. */
export function normalizeGuideSteps(value: unknown): GuideStep[] {
  const raw = Array.isArray(value) ? value : [];
  const out: GuideStep[] = [];
  raw.forEach((entry, index) => {
    if (!isObject(entry)) return;
    const title = str(entry.title, LIMITS.stepTitle);
    const description = str(entry.description, LIMITS.stepDescription);
    // A step with no title AND no description carries no meaning — drop it.
    if (!title && !description) return;
    out.push({
      id: str(entry.id, LIMITS.id) || `step-${index}`,
      title,
      description,
      tip: str(entry.tip, LIMITS.stepCallout),
      warning: str(entry.warning, LIMITS.stepCallout),
      // Only http(s) or internal paths — never javascript:/data: URLs.
      screenshotUrl: isValidGuideUrl(str(entry.screenshotUrl, LIMITS.imageUrl))
        ? str(entry.screenshotUrl, LIMITS.imageUrl)
        : "",
    });
  });
  return out.slice(0, MAX_STEP_ITEMS);
}

/** Coerce persisted/admin JSON into safe troubleshooting Q&A entries. */
export function normalizeGuideTroubleshooting(
  value: unknown,
): GuideTroubleshootingItem[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: GuideTroubleshootingItem[] = [];
  raw.forEach((entry, index) => {
    if (!isObject(entry)) return;
    const question = str(entry.question, LIMITS.question);
    const answer = str(entry.answer, LIMITS.answer);
    if (!question || !answer) return;
    const key = question.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: str(entry.id, LIMITS.id) || `trouble-${index}`, question, answer });
  });
  return out.slice(0, MAX_FAQ_ITEMS);
}

/** Trim/cap free-text label lists (requirements, regions, devices). */
export function normalizeGuideLabels(value: unknown, maxItems = 12): string[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const label = typeof entry === "string" ? entry.trim().slice(0, LIMITS.label) : "";
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.slice(0, maxItems);
}

export function defaultGuideNavigatorTip(): GuideNavigatorTip {
  return {
    enabled: false,
    title: "",
    message: "",
    type: "information",
    ctaLabel: "",
    ctaUrl: "",
  };
}

export function normalizeGuideNavigatorTip(value: unknown): GuideNavigatorTip {
  const raw = isObject(value) ? value : {};
  return {
    enabled: bool(raw.enabled, false),
    title: str(raw.title, LIMITS.tipTitle),
    message: str(raw.message, LIMITS.tipMessage),
    type: tipType(raw.type),
    ctaLabel: str(raw.ctaLabel, LIMITS.ctaLabel),
    ctaUrl: str(raw.ctaUrl, LIMITS.url),
  };
}

/** Trim, lowercase, drop empties, and de-duplicate search aliases on one record. */
export function normalizeGuideAliases(aliases: unknown): string[] {
  const raw = Array.isArray(aliases) ? aliases : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const value = typeof entry === "string" ? entry.trim().toLowerCase() : "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.slice(0, 40);
}

/** Whether a guide document has any renderable body/FAQ content. */
export function hasGuideContent(doc: GuideDoc): boolean {
  return Boolean(
    doc.content.length > 0 ||
      doc.faq.length > 0 ||
      (doc.navigatorTip.enabled && doc.navigatorTip.message),
  );
}

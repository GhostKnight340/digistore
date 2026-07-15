/**
 * Feedback & Suggestions — shared model, labels, validation, and safe page-context
 * capture. Pure and client-safe (no DB, no `server-only`) so the public form, the
 * server action, the admin UI, and the tests all share one source of truth.
 *
 * Feedback is deliberately SEPARATE from support: none of its types map to
 * order/payment/refund/delivery issues, and an item only enters the support queue
 * if an admin explicitly converts it.
 */

// ── Types ────────────────────────────────────────────────────────────────────

// Feedback is only for suggesting features/products and UI/UX improvements — NOT
// for bug reports or problems (those belong in support). No "bug" type here.
export const FEEDBACK_TYPES = [
  { value: "suggestion", label: "Suggestion" },
  { value: "product_request", label: "Demande de produit" },
  { value: "site_experience", label: "Expérience du site (UX/UI)" },
  { value: "catalogue", label: "Catalogue" },
  { value: "other", label: "Autre" },
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["value"];

export function feedbackTypeLabel(value: string): string {
  return FEEDBACK_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function isFeedbackType(value: string): value is FeedbackType {
  return FEEDBACK_TYPES.some((t) => t.value === value);
}

// ── Status ───────────────────────────────────────────────────────────────────

export const FEEDBACK_STATUSES = [
  { value: "new", label: "Nouveau" },
  { value: "reviewing", label: "En cours d’examen" },
  { value: "planned", label: "Planifié" },
  { value: "implemented", label: "Implémenté" },
  { value: "declined", label: "Non retenu" },
  { value: "closed", label: "Fermé" },
] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]["value"];

export function feedbackStatusLabel(value: string): string {
  return FEEDBACK_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return FEEDBACK_STATUSES.some((s) => s.value === value);
}

// ── Priority ─────────────────────────────────────────────────────────────────

export const FEEDBACK_PRIORITIES = [
  { value: "low", label: "Faible" },
  { value: "medium", label: "Moyenne" },
  { value: "high", label: "Élevée" },
  { value: "critical", label: "Critique" },
] as const;

export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number]["value"];

export function feedbackPriorityLabel(value: string): string {
  return FEEDBACK_PRIORITIES.find((p) => p.value === value)?.label ?? value;
}

export function isFeedbackPriority(value: string): value is FeedbackPriority {
  return FEEDBACK_PRIORITIES.some((p) => p.value === value);
}

// ── Reference ────────────────────────────────────────────────────────────────

export const FEEDBACK_REF_PREFIX = "FB-";

/** Human-readable reference derived from the row's autoincrement seq. */
export function formatFeedbackReference(seq: number): string {
  return `${FEEDBACK_REF_PREFIX}${String(seq).padStart(6, "0")}`;
}

/** Parse "FB-000123" (or "123") back to a seq number, or null. */
export function parseFeedbackReference(value: string): number | null {
  const m = value.trim().toUpperCase().match(/^(?:FB-)?0*(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Validation ───────────────────────────────────────────────────────────────

export const FEEDBACK_LIMITS = {
  subjectMax: 120,
  // No minimum — the message is optional (the subject already carries the idea).
  messageMin: 0,
  messageMax: 2000,
  nameMax: 80,
  emailMax: 160,
} as const;

export interface FeedbackValidationInput {
  type: string;
  /** The single feedback field — what the customer typed. */
  message: string;
  contactAllowed: boolean;
  /** Resolved email that will be used (account email for logged-in, guest email otherwise). */
  effectiveEmail: string;
}

/** Returns the first validation error message, or null when valid. */
export function validateFeedback(input: FeedbackValidationInput): string | null {
  if (!isFeedbackType(input.type)) return "Type de retour invalide.";
  // A single field: the customer just types their feedback. Required, no minimum
  // length; only the maximum is enforced.
  const message = input.message.trim();
  if (!message) return "Votre retour ne peut pas être vide.";
  if (message.length > FEEDBACK_LIMITS.messageMax)
    return `Votre retour ne peut pas dépasser ${FEEDBACK_LIMITS.messageMax} caractères.`;
  // If they asked to be contacted, a valid email is required.
  if (input.contactAllowed && !isValidEmail(input.effectiveEmail)) {
    return "Une adresse e-mail valide est requise pour être recontacté.";
  }
  return null;
}

/**
 * Derive a short one-line title from the feedback text — used only for the admin
 * list column and the detail heading. The full typed text is always kept as the
 * message. Not shown to the customer.
 */
export function deriveFeedbackTitle(message: string): string {
  const firstLine = message.split(/\r?\n/)[0].trim();
  return (firstLine || message.trim()).slice(0, FEEDBACK_LIMITS.subjectMax);
}

export function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

/**
 * Heuristic: does this feedback actually look like an order/payment/support issue
 * that belongs in the support queue? Used only to show a helpful redirect notice
 * — never to block submission.
 */
const SUPPORT_KEYWORDS = [
  "commande",
  "order",
  "paiement",
  "payment",
  "payé",
  "remboursement",
  "refund",
  "livraison",
  "delivery",
  "non reçu",
  "pas reçu",
  "code invalide",
  "carte ne marche",
  "compte bloqué",
  "connexion impossible",
];

export function looksLikeSupportIssue(subject: string, message: string): boolean {
  const hay = `${subject} ${message}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return SUPPORT_KEYWORDS.some((k) =>
    hay.includes(k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()),
  );
}

// ── Safe page-context capture (client) ───────────────────────────────────────

export interface FeedbackPageContext {
  relatedUrl: string;
  relatedRoute: string;
  pageTitle: string;
  deviceType: string;
  viewport: string;
  browserSummary: string;
}

/**
 * Capture non-sensitive page context. The query string is STRIPPED entirely
 * (no auth tokens, payment ids, preview params, or personal data leak through a
 * URL). Safe to call only in the browser.
 */
export function capturePageContext(): FeedbackPageContext {
  if (typeof window === "undefined") {
    return {
      relatedUrl: "",
      relatedRoute: "",
      pageTitle: "",
      deviceType: "",
      viewport: "",
      browserSummary: "",
    };
  }
  const { origin, pathname } = window.location;
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  return {
    // origin + pathname only — never the query string / hash.
    relatedUrl: `${origin}${pathname}`,
    relatedRoute: pathname,
    pageTitle: (document.title || "").slice(0, 200),
    deviceType: width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop",
    viewport: `${width}×${height}`,
    browserSummary: summarizeUserAgent(navigator.userAgent),
  };
}

/** Compact, non-fingerprinting browser + OS summary from the UA string. */
export function summarizeUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navigateur";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return [browser, os].filter(Boolean).join(" · ").slice(0, 80);
}

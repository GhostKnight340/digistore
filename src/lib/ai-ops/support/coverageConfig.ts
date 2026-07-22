/**
 * Coverage activation config — PURE (no DB). Validates the activation form,
 * resolves the schedule from the chosen duration, and builds the confirmation
 * summary shown before the admin commits. Keeping this pure lets the same
 * validation run in the server action and be unit-tested directly.
 */

export const COVERAGE_CHANNELS = ["support_tickets"] as const;
export type CoverageChannel = (typeof COVERAGE_CHANNELS)[number];

export const AUTOMATION_MODES = ["draft_only", "auto_reply"] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const NOTIFY_MODES = [
  "urgent_only",
  "approvals_and_urgent",
  "periodic_and_urgent",
  "all_escalations",
  "silent_until_end",
] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];

export const DURATIONS = ["until_manual", "1h", "2h", "4h", "until_time", "custom"] as const;
export type DurationChoice = (typeof DURATIONS)[number];

const HOURS: Partial<Record<DurationChoice, number>> = { "1h": 1, "2h": 2, "4h": 4 };

/** Raw input from the activation form (all optional-ish; validated below). */
export interface CoverageConfigInput {
  duration: DurationChoice;
  startAt?: string | null;
  endAt?: string | null;
  channels?: string[];
  languages?: string[];
  categories?: string[];
  automationMode?: string;
  confidenceThreshold?: string;
  notifyMode?: string;
  escalationBehavior?: string;
  allowAutoReply?: boolean;
  fallbackMessage?: string | null;
}

/** The normalized, storable config the session row is created from. */
export interface CoverageConfig {
  scheduledStartAt: Date;
  scheduledEndAt: Date | null;
  channels: string[];
  languages: string[];
  categories: string[];
  automationMode: AutomationMode;
  draftOnly: boolean;
  allowAutoReply: boolean;
  confidenceThreshold: ConfidenceLevel;
  notifyMode: NotifyMode;
  escalationBehavior: string;
  fallbackMessage: string | null;
}

export type ConfigResult = { ok: true; value: CoverageConfig } | { ok: false; error: string };

function cleanList(value: unknown, allowed?: readonly string[], cap = 40): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const s = v.trim().slice(0, 64);
    if (!s) continue;
    if (allowed && !allowed.includes(s)) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Resolve the concrete start/end instants from the duration choice. */
export function resolveSchedule(
  input: CoverageConfigInput,
  now: Date,
): { start: Date; end: Date | null } | { error: string } {
  const start = parseDate(input.startAt) ?? now;
  const hours = HOURS[input.duration];
  if (hours) return { start, end: new Date(start.getTime() + hours * 3_600_000) };
  if (input.duration === "until_manual") return { start, end: null };
  // until_time / custom both need an explicit end.
  const end = parseDate(input.endAt);
  if (!end) return { error: "Une heure de fin est requise pour cette durée." };
  if (end.getTime() <= start.getTime()) return { error: "L'heure de fin doit être après le début." };
  return { start, end };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], dflt: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : dflt;
}

/**
 * Validate + normalize an activation request. Enforces the safety invariants:
 * at least one covered channel, and auto-send only when it was EXPLICITLY
 * enabled (allowAutoReply) — otherwise the mode is forced to draft-only.
 */
export function validateCoverageConfig(input: CoverageConfigInput, now: Date): ConfigResult {
  const schedule = resolveSchedule(input, now);
  if ("error" in schedule) return { ok: false, error: schedule.error };

  const channels = cleanList(input.channels, COVERAGE_CHANNELS);
  if (channels.length === 0) return { ok: false, error: "Sélectionnez au moins un canal couvert." };

  const requestedMode = oneOf(input.automationMode, AUTOMATION_MODES, "draft_only");
  // Auto-send is only real when the admin explicitly ticked allowAutoReply.
  const allowAutoReply = requestedMode === "auto_reply" && input.allowAutoReply === true;
  const automationMode: AutomationMode = allowAutoReply ? "auto_reply" : "draft_only";

  return {
    ok: true,
    value: {
      scheduledStartAt: schedule.start,
      scheduledEndAt: schedule.end,
      channels,
      languages: cleanList(input.languages),
      categories: cleanList(input.categories),
      automationMode,
      draftOnly: automationMode === "draft_only",
      allowAutoReply,
      confidenceThreshold: oneOf(input.confidenceThreshold, CONFIDENCE_LEVELS, "high"),
      notifyMode: oneOf(input.notifyMode, NOTIFY_MODES, "approvals_and_urgent"),
      escalationBehavior: typeof input.escalationBehavior === "string" ? input.escalationBehavior.slice(0, 40) : "notify",
      fallbackMessage: typeof input.fallbackMessage === "string" ? input.fallbackMessage.trim().slice(0, 600) || null : null,
    },
  };
}

/** Format an instant as HH:MM in the given IANA timezone (for the summary). */
function timeLabel(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
}

/**
 * The confirmation bullets shown before activation (spec's confirmation summary).
 * Always states clearly whether replies may be sent automatically and that
 * sensitive cases are escalated.
 */
export function summarizeCoverage(config: CoverageConfig, timeZone: string): string[] {
  const until = config.scheduledEndAt
    ? `jusqu'à ${timeLabel(config.scheduledEndAt, timeZone)}`
    : "jusqu'à désactivation manuelle";
  const bullets: string[] = [
    `La couverture support IA gérera les messages support du site web ${until}.`,
  ];
  if (config.automationMode === "auto_reply") {
    bullets.push(
      `Les questions à faible risque (statut de commande/paiement) dont la confiance est « ${config.confidenceThreshold} » ou plus pourront recevoir une réponse automatique.`,
    );
  } else {
    bullets.push("L'assistant préparera uniquement des brouillons ; aucune réponse ne sera envoyée automatiquement.");
  }
  bullets.push(
    "Les remboursements, la confirmation de paiement, le remplacement de code et les cas de sécurité de compte seront escaladés.",
  );
  bullets.push("Vous ne serez notifié que lorsque votre attention est requise.");
  return bullets;
}

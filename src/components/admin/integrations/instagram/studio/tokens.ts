import type { StudioFormat, StudioStatus } from "@/lib/composio/instagram/types";

/**
 * Design tokens for the Instagram Content Studio, transcribed from the design
 * handoff. Kept as plain values (not Tailwind classes) so the studio reproduces
 * the prototype's exact hex/spacing without fighting the admin's token set.
 */
export const C = {
  appBg: "#070809",
  card: "#0F1015",
  inset: "#0A0B0E",
  surface: "#121319",
  menu: "#15161b",
  borderCard: "rgba(255,255,255,0.07)",
  borderInput: "rgba(255,255,255,0.09)",
  borderSubtle: "rgba(255,255,255,0.06)",
  text: "#F3F4F7",
  text2: "#C7CBD3",
  dim: "#9A9FAB",
  dim2: "#8A909C",
  muted: "#646A77",
  faint: "#5a606d",
  faint2: "#4d525d",
  accent: "#3E7BFA",
  accentText: "#7FA6FF",
  accentTextBright: "#EAF0FF",
  ai: "#7C5CFC",
  aiText: "#B9A3FF",
  warn: "#E8A838",
  warnText: "#E8B85C",
  warnText2: "#D9B87A",
  success: "#2EA067",
  successText: "#5BC98C",
  danger: "#E5484D",
  dangerText: "#F0908F",
} as const;

export interface FormatMeta {
  label: string;
  hint: string;
  accept: string;
  multiple: boolean;
  maxFiles: number;
  minFiles: number;
  ratio: string;
  /** Whether this format can be selected/authored (drafts). */
  available: boolean;
  /** Whether it can actually be pushed to Instagram today (vs. draft-only). */
  publishable: boolean;
  unavailableReason?: string;
  /** Shown under the composer when a format is authorable but not publishable. */
  draftOnlyReason?: string;
}

/**
 * Format capabilities. "Publication" (single image) is the only format wired to
 * a real publish path today. "Carrousel" is authorable (multi-image drafts) but
 * NOT publishable yet — the Composio carousel publish flow is unconfirmed, so we
 * don't offer publish/schedule for it rather than promise something that would
 * fail. Reel/Story stay fully gated (video pipeline / Meta permission). All
 * gating follows the handoff's "disabled, not hidden, with a reason" rule.
 */
export const FORMAT_META: Record<StudioFormat, FormatMeta> = {
  post: {
    label: "Publication",
    available: true,
    publishable: true,
    hint: "JPG/PNG · jusqu’à 8 Mo",
    accept: "image/jpeg,image/png",
    multiple: false,
    maxFiles: 1,
    minFiles: 1,
    ratio: "1:1 / 4:5",
  },
  carousel: {
    label: "Carrousel",
    available: true,
    publishable: false,
    hint: "2–10 images · JPG/PNG",
    accept: "image/jpeg,image/png",
    multiple: true,
    maxFiles: 10,
    minFiles: 2,
    ratio: "1:1 / 4:5",
    draftOnlyReason:
      "Les carrousels peuvent être préparés et enregistrés comme brouillons. La publication automatique arrivera prochainement.",
  },
  reel: {
    label: "Reel",
    available: false,
    publishable: false,
    hint: "Vidéo · 3–90s · max 500 Mo",
    accept: "video/*",
    multiple: false,
    maxFiles: 1,
    minFiles: 1,
    ratio: "9:16",
    unavailableReason: "Bientôt disponible dans Ghost.ma.",
  },
  story: {
    label: "Story",
    available: false,
    publishable: false,
    hint: "Image/vidéo · 15s max",
    accept: "image/*,video/*",
    multiple: false,
    maxFiles: 1,
    minFiles: 1,
    ratio: "9:16",
    unavailableReason:
      "Non disponible avec la connexion actuelle. Les autorisations Stories ne sont pas encore accordées par Meta.",
  },
};

export const STATUS_META: Record<StudioStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Brouillon", color: "#9A9FAB", bg: "rgba(255,255,255,0.06)" },
  scheduled: { label: "Programmé", color: "#7FA6FF", bg: "rgba(62,123,250,0.14)" },
  publishing: { label: "Publication en cours", color: "#7FA6FF", bg: "rgba(62,123,250,0.14)" },
  published: { label: "Publié", color: "#5BC98C", bg: "rgba(46,160,103,0.14)" },
  failed: { label: "Échec", color: "#F0908F", bg: "rgba(229,72,77,0.12)" },
  cancelled: { label: "Annulé", color: "#646A77", bg: "rgba(255,255,255,0.05)" },
};

export const FORMAT_LABEL: Record<StudioFormat, string> = {
  post: "Publication",
  carousel: "Carrousel",
  reel: "Reel",
  story: "Story",
};

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

export function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

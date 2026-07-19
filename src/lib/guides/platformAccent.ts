/**
 * Per-guide platform accent — the one knob that gives an activation guide the
 * identity of the product being activated.
 *
 * A guide already stores a free-text `platform` ("Steam", "PlayStation
 * Store"…). We map that to two hexes and expose them as CSS custom properties
 * on the article root; every tint downstream is
 * `color-mix(in srgb, var(--guide-accent) N%, transparent)` — the same
 * technique `.cathero` uses for category brands. No schema change, and an
 * unmapped platform simply falls back to Ghost.ma blue.
 *
 * Rules that keep this from turning into a colourful page:
 *  - the accent only ever tints borders, glows, icons and eyebrows;
 *  - primary CTAs stay Ghost.ma blue on every guide (see the `.btn-primary`
 *    rule in globals.css — it is deliberately not accent-aware);
 *  - semantic colours (green/amber/red) always win over the platform accent,
 *    because they carry meaning the brand colour must not overwrite.
 */

export type GuideAccent = {
  /** Primary platform hue — icon container, eyebrows, step rail, TOC marker. */
  accent: string;
  /** Second stop, used only for the hero glow and the icon gradient. */
  accent2: string;
};

/** Ghost.ma blue — the fallback, and the accent for unbranded guides. */
const GHOST_BLUE: GuideAccent = { accent: "#3e7bfa", accent2: "#5e92ff" };

/**
 * Keyed by a normalized platform name. Keys are matched as substrings, so
 * "PlayStation Store" and "PS Store" both resolve via "playstation"/"ps".
 * Hues are the platform's own, pulled toward blue-dark so they sit calmly on
 * #0a0b0d — these are tint sources, never fills.
 */
const ACCENTS: Array<[pattern: RegExp, accent: GuideAccent]> = [
  [/steam/, { accent: "#66c0f4", accent2: "#2de1c2" }],
  [/playstation|\bps[45n]?\b/, { accent: "#4f7cff", accent2: "#7aa2ff" }],
  [/xbox/, { accent: "#57c353", accent2: "#8fe07c" }],
  [/nintendo|switch/, { accent: "#f0555f", accent2: "#ff8a80" }],
  [/netflix/, { accent: "#e5484d", accent2: "#ff7b7b" }],
  [/spotify/, { accent: "#3fd47f", accent2: "#7ff0ab" }],
  [/valorant|riot/, { accent: "#ff5561", accent2: "#ff8f80" }],
  [/roblox/, { accent: "#e8515d", accent2: "#b9bfcc" }],
  [/apple|itunes|app store/, { accent: "#b7bfcf", accent2: "#8fa0bd" }],
  [/google play|google/, { accent: "#5b9bff", accent2: "#5fd08a" }],
];

/** Resolve the accent for a guide from its authored platform/vendor text. */
export function guideAccent(platform?: string | null, vendor?: string | null): GuideAccent {
  const haystack = `${platform ?? ""} ${vendor ?? ""}`.toLowerCase();
  if (!haystack.trim()) return GHOST_BLUE;
  for (const [pattern, accent] of ACCENTS) {
    if (pattern.test(haystack)) return accent;
  }
  return GHOST_BLUE;
}

/**
 * The custom properties to spread onto the article root. Typed as a plain
 * record so it can be handed straight to a `style` prop.
 */
export function guideAccentVars(accent: GuideAccent): React.CSSProperties {
  return {
    "--guide-accent": accent.accent,
    "--guide-accent-2": accent.accent2,
  } as React.CSSProperties;
}

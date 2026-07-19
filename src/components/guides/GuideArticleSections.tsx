import { GUIDE_DIFFICULTY_LABELS, type GuideDifficulty, type GuideStep } from "@/lib/guide";
import GuideSectionHeading from "./GuideSectionHeading";

/**
 * Server-rendered article sections from the Activation Guides design handoff:
 * the hero meta chips, the "Ce qu'il vous faut" requirements checklist, and the
 * numbered step cards.
 *
 * Every chip is conditional on its field actually being authored — an
 * un-authored guide renders fewer chips rather than a guessed value. Step
 * screenshots render only when a real URL exists (the design gates them behind
 * a per-step flag), so nothing ships as a placeholder.
 */

const chipIcon = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-3.5 w-3.5",
  "aria-hidden": true,
};

/** Difficulty dot colour — green/amber/red by level. */
const DIFFICULTY_DOT: Record<GuideDifficulty, string> = {
  facile: "bg-emerald-400",
  moyen: "bg-amber-400",
  avance: "bg-red-400",
};

/**
 * Chip tones. Each meta fact gets its own hue so the row reads as four distinct
 * facts rather than four identical pills — tinted border + icon only, never a
 * saturated fill, so they stay quiet against the near-black canvas.
 */
const CHIP_TONE = {
  green: "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200/80",
  blue: "border-sky-500/25 bg-sky-500/[0.07] text-sky-200/80",
  amber: "border-amber-500/25 bg-amber-500/[0.07] text-amber-200/80",
  violet: "border-violet-500/25 bg-violet-500/[0.07] text-violet-200/80",
} as const;

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: keyof typeof CHIP_TONE;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Hero meta chips: difficulté · durée · régions · appareils. */
export function GuideMetaChips({
  difficulty,
  durationMinutes,
  estimatedMinutes,
  regions,
  devices,
}: {
  difficulty: GuideDifficulty | "";
  durationMinutes: number | null;
  /** Derived fallback, rendered with "≈" so it reads as an estimate. */
  estimatedMinutes: number;
  regions: string[];
  devices: string[];
}) {
  const duration = durationMinutes ?? estimatedMinutes;
  const durationLabel = durationMinutes ? `~${duration} min` : `≈ ${duration} min`;

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {difficulty && (
        <Chip tone="green">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY_DOT[difficulty]}`} />
          Difficulté <strong className="font-semibold text-white">{GUIDE_DIFFICULTY_LABELS[difficulty]}</strong>
        </Chip>
      )}
      <Chip tone="blue">
        <svg {...chipIcon}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        Durée <strong className="font-semibold text-white">{durationLabel}</strong>
      </Chip>
      {regions.length > 0 && (
        <Chip tone="amber">
          <svg {...chipIcon}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z" />
          </svg>
          Régions <strong className="font-semibold text-white">{regions.join(" · ")}</strong>
        </Chip>
      )}
      {devices.length > 0 && (
        <Chip tone="violet">
          <svg {...chipIcon}>
            <rect x="3" y="5" width="13" height="10" rx="1.6" />
            <path d="M3 19h18" />
            <rect x="18" y="9" width="3.4" height="6" rx="1" />
          </svg>
          Appareils <strong className="font-semibold text-white">{devices.join(" · ")}</strong>
        </Chip>
      )}
    </div>
  );
}

/** "Avant de commencer" — requirements checklist + optional amber warning. */
export function GuideRequirements({
  requirements,
  warning,
}: {
  requirements: string[];
  warning?: string;
}) {
  if (requirements.length === 0 && !warning) return null;
  return (
    <section id="avant-de-commencer" className="scroll-mt-24">
      <GuideSectionHeading eyebrow="Préparation" title="Avant de commencer" icon="checklist" />
      {requirements.length > 0 && (
        <div className="guide-accent-card mt-4 overflow-hidden rounded-2xl border bg-card">
          {/* Requirements read as a satisfied checklist: one green column of
              ticks, each in its own tinted well so the list stops being a wall
              of identical rows. */}
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            </span>
            <h3 className="text-sm font-semibold text-white">Ce qu&apos;il vous faut</h3>
            <span className="ml-auto text-[11.5px] font-medium text-faint">
              {requirements.length} éléments
            </span>
          </div>
          <ul className="space-y-1 p-3">
            {requirements.map((req) => (
              <li
                key={req}
                className="flex gap-3 rounded-lg px-2.5 py-2 transition hover:bg-emerald-500/[0.045]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden
                >
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
                <span className="text-[14.5px] leading-relaxed text-muted">{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {warning && (
        <div
          role="note"
          /* NB: this used to read border-warning/bg-warning/text-warning, but
             `warning` is not a colour in tailwind.config.ts — every one of those
             classes was a no-op, so the page's most important callout rendered
             as a plain card with a default grey border. Amber, explicitly. */
          className="mt-3 flex gap-3 rounded-xl border border-amber-500/40 border-l-2 border-l-amber-400 bg-amber-500/10 p-4"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden>
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400">
              À vérifier
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#f6d9ad]">{warning}</p>
          </div>
        </div>
      )}
    </section>
  );
}

/** "Les étapes" — numbered step cards with optional screenshot/tip/warning. */
export function GuideStepCards({ steps }: { steps: GuideStep[] }) {
  if (steps.length === 0) return null;
  return (
    <section id="les-etapes" className="mt-12 scroll-mt-24">
      <GuideSectionHeading
        eyebrow={`${steps.length} étapes`}
        title="Les étapes"
        icon="steps"
        description="Suivez-les dans l'ordre — chaque étape prend moins d'une minute."
      />
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => {
          // 0 → 1 across the list; drives the rail and badge intensity so the
          // sequence reads as progress rather than N identical cards.
          const progress = steps.length > 1 ? index / (steps.length - 1) : 0;
          const isFinal = steps.length > 2 && index === steps.length - 1;
          return (
          <li
            key={step.id}
            style={{ "--step-progress": progress } as React.CSSProperties}
            className={`guide-step relative overflow-hidden rounded-2xl border bg-card p-5 pl-6 ${
              isFinal ? "guide-step-final" : ""
            }`}
          >
            {/* Connector to the next card — desktop only, hidden on the last. */}
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className="guide-step-link absolute bottom-0 left-[30px] hidden h-3 w-px translate-y-full sm:block"
              />
            )}
            <div className="flex gap-3.5">
              <span className="guide-step-badge grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] border text-[13.5px] font-bold">
                {isFinal ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15.5px] font-semibold text-white">{step.title}</h3>
                {step.description && (
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                    {step.description}
                  </p>
                )}

                {/* Only renders once a real capture is uploaded. */}
                {step.screenshotUrl && (
                  <figure className="mt-3.5 overflow-hidden rounded-[10px] border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={step.screenshotUrl}
                      alt={`Capture d'écran : ${step.title}`}
                      className="w-full"
                      loading="lazy"
                      decoding="async"
                    />
                  </figure>
                )}

                {step.warning && (
                  <div className="mt-3 flex gap-2.5 rounded-[9px] border border-red-500/25 bg-red-500/[0.08] px-3.5 py-2.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden>
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                    </svg>
                    <p className="text-[13px] leading-relaxed text-red-300">{step.warning}</p>
                  </div>
                )}

                {/* Tips are informational, so they take the cyan/blue slot —
                    green is reserved for "done / verified / satisfied". */}
                {step.tip && (
                  <div className="mt-3 flex gap-2.5 rounded-[9px] border border-sky-500/25 bg-sky-500/[0.08] px-3.5 py-2.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden>
                      <path d="M9 18h6" />
                      <path d="M10 21h4" />
                      <path d="M12 3a6 6 0 0 0-3.5 10.9c.3.3.5.7.5 1.1h6c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3z" />
                    </svg>
                    <p className="text-[13px] leading-relaxed text-sky-200">{step.tip}</p>
                  </div>
                )}
              </div>
            </div>
          </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Section heading for the guide article — an accent eyebrow (a short rule plus
 * a platform-coloured label) above the H2, and a small icon tile that gives
 * each major section its own silhouette.
 *
 * The eyebrow is what creates the vertical rhythm between "Avant de commencer",
 * "Les étapes", "Dépannage" and "Questions fréquentes": the sections keep the
 * same type scale and spacing, but stop looking interchangeable.
 */

export type GuideSectionIcon = "checklist" | "steps" | "wrench" | "question";

const ICONS: Record<GuideSectionIcon, React.ReactNode> = {
  checklist: (
    <>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="m3.5 6 1.4 1.4L7.5 4.8" />
      <path d="m3.5 12 1.4 1.4 2.6-2.6" />
      <path d="m3.5 18 1.4 1.4 2.6-2.6" />
    </>
  ),
  steps: (
    <>
      <path d="M4 19h4v-4H4z" />
      <path d="M10 15h4v-4h-4z" />
      <path d="M16 11h4V7h-4z" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.1 2.1 0 0 1-3-3z" />
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.5" />
      <path d="M12 17h.01" />
    </>
  ),
};

export default function GuideSectionHeading({
  eyebrow,
  title,
  description,
  icon,
}: {
  /** Short uppercase label, e.g. "Préparation". */
  eyebrow: string;
  title: string;
  description?: string;
  icon: GuideSectionIcon;
}) {
  return (
    <div>
      <p className="guide-eyebrow flex items-center gap-2.5">
        <span className="guide-eyebrow-text text-[11px] font-semibold uppercase tracking-[0.16em]">
          {eyebrow}
        </span>
      </p>
      <div className="mt-2.5 flex items-center gap-3">
        <span
          className="guide-section-tile grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border"
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
          >
            {ICONS[icon]}
          </svg>
        </span>
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
      </div>
      {description && <p className="mt-2 text-sm text-muted">{description}</p>}
    </div>
  );
}

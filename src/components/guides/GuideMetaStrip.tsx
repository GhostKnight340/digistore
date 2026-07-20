/**
 * A compact facts strip under the guide title. Every value here is honestly
 * derived from the guide itself — an estimated reading time (always "≈"), the
 * real number of activation steps, the platform, and the last-updated date. No
 * invented difficulty, region, or view-count badges (that data doesn't exist).
 */

function MetaPill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
      <span className="text-faint" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-3.5 w-3.5",
  "aria-hidden": true,
};

export default function GuideMetaStrip({
  minutes,
  steps,
  platform,
  updatedLabel,
}: {
  minutes: number;
  steps: number;
  platform: string;
  updatedLabel: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 print:hidden">
      <MetaPill
        icon={
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        }
      >
        ≈ {minutes} min
      </MetaPill>
      {steps > 0 && (
        <MetaPill
          icon={
            <svg {...iconProps}>
              <path d="M8 6h12" />
              <path d="M8 12h12" />
              <path d="M8 18h12" />
              <circle cx="4" cy="6" r="1" fill="currentColor" />
              <circle cx="4" cy="12" r="1" fill="currentColor" />
              <circle cx="4" cy="18" r="1" fill="currentColor" />
            </svg>
          }
        >
          {steps} étape{steps === 1 ? "" : "s"}
        </MetaPill>
      )}
      {platform && (
        <MetaPill
          icon={
            <svg {...iconProps}>
              <rect x="2" y="7" width="20" height="10" rx="4" />
              <line x1="7" y1="11" x2="7" y2="13" />
              <line x1="6" y1="12" x2="8" y2="12" />
            </svg>
          }
        >
          {platform}
        </MetaPill>
      )}
      <MetaPill
        icon={
          <svg {...iconProps}>
            <path d="M20 12a8 8 0 1 1-2.3-5.6" />
            <path d="M20 4v3.5h-3.5" />
          </svg>
        }
      >
        Mis à jour le {updatedLabel}
      </MetaPill>
    </div>
  );
}

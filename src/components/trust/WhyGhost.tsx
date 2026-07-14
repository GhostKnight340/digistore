import { WHY_GHOST_ITEMS, type TrustIconKey, type WhyGhostItem } from "@/lib/trust";
import TrackView from "@/components/analytics/TrackView";

/**
 * "Pourquoi ghost.ma" — premium reasons-to-buy grid. Server component (no
 * interactivity), reusable on the homepage, collection pages and campaign
 * pages. Icons are restrained line marks in the site's accent-soft chip idiom
 * (same as TrustStrip), never large colorful badges.
 */

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-[22px] w-[22px]",
  "aria-hidden": true as const,
};

const ICONS: Record<TrustIconKey, React.ReactNode> = {
  official: (
    <svg {...iconProps}>
      <path d="M12 3 4 6v5c0 4.5 3.2 7.6 8 9 4.8-1.4 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 11.5 2 2 4-4" />
    </svg>
  ),
  payment: (
    <svg {...iconProps}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </svg>
  ),
  region: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17" />
      <path d="M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </svg>
  ),
  delivery: (
    <svg {...iconProps}>
      <polygon points="13 2 4 13 11 13 10 22 20 10 13 10 13 2" />
    </svg>
  ),
  support: (
    <svg {...iconProps}>
      <path d="M4 17v-5a8 8 0 0 1 16 0v5" />
      <path d="M20 17a2 2 0 0 1-2 2h-1v-5h3zM4 17a2 2 0 0 0 2 2h1v-5H4z" />
    </svg>
  ),
  secure: (
    <svg {...iconProps}>
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <path d="M12 14.5v2.5" />
    </svg>
  ),
};

export default function WhyGhost({
  title = "Pourquoi choisir ghost.ma",
  subtitle = "Des avantages concrets, pas des promesses. Voici ce qui rend chaque achat serein.",
  items = WHY_GHOST_ITEMS,
  analyticsEvent = "trust_why_view",
  className = "mt-16",
}: {
  title?: string;
  subtitle?: string;
  items?: WhyGhostItem[];
  analyticsEvent?: string | null;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={className} aria-labelledby="why-ghost-title">
      {analyticsEvent ? <TrackView event={analyticsEvent} /> : null}
      <div>
        <h2
          id="why-ghost-title"
          className="text-2xl font-semibold tracking-tight text-text"
        >
          {title}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted">{subtitle}</p>
      </div>
      <div className="mt-8 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-[16px] border border-border bg-surface p-6 transition-colors hover:border-border-strong"
          >
            <span className="mb-4 grid h-11 w-11 place-items-center rounded-[12px] bg-accent-soft text-accent">
              {ICONS[item.icon]}
            </span>
            <h3 className="text-[15.5px] font-semibold text-text">{item.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

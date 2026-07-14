import TrackSectionView from "@/components/analytics/TrackSectionView";
import { visibleWhyGhost, type WhyGhostIcon, type WhyGhostItemSetting } from "@/lib/trust/content";

/**
 * Premium "Why Ghost.ma" section: concrete advantages, each with a restrained
 * blue icon, short title and concise explanation. Server component — reads its
 * items from the store settings (passed as props) so it stays admin-editable
 * and adds no client JS beyond the one-shot view tracker.
 */
export default function WhyGhost({
  items,
  title,
  subtitle,
  className = "mt-16",
}: {
  items: WhyGhostItemSetting[];
  title: string;
  subtitle?: string;
  className?: string;
}) {
  const visible = visibleWhyGhost(items);
  if (visible.length === 0) return null;

  return (
    <section className={className} aria-labelledby="why-ghost-heading">
      <TrackSectionView event="trust_section_viewed" params={{ section: "why_ghost" }} />
      <div className="max-w-2xl">
        <h2
          id="why-ghost-heading"
          className="text-2xl font-semibold tracking-tight text-text sm:text-[27px]"
        >
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-sm text-muted sm:text-[15px]">{subtitle}</p>}
      </div>
      <div className="mt-8 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <article
            key={item.id}
            className="group rounded-[16px] border border-border bg-surface p-6 transition-colors hover:border-border-strong"
          >
            <span className="grid h-11 w-11 place-items-center rounded-[12px] border border-accent/25 bg-accent-soft text-accent">
              <WhyGhostGlyph icon={item.icon} />
            </span>
            <h3 className="mt-5 text-[15.5px] font-semibold text-text">{item.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-[22px] w-[22px]",
  "aria-hidden": true as const,
};

function WhyGhostGlyph({ icon }: { icon: WhyGhostIcon }) {
  switch (icon) {
    case "official":
      // Badge / seal
      return (
        <svg {...iconProps}>
          <path d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "payment":
      return (
        <svg {...iconProps}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M2.5 10h19" />
        </svg>
      );
    case "region":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="10" r="3" />
          <path d="M12 21c-4.5-4-7-7-7-10a7 7 0 0 1 14 0c0 3-2.5 6-7 10z" />
        </svg>
      );
    case "delivery":
      return (
        <svg {...iconProps}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "support":
      return (
        <svg {...iconProps}>
          <path d="M4 18v-6a8 8 0 0 1 16 0v6" />
          <path d="M20 18a2 2 0 0 1-2 2h-1v-5h3zM4 18a2 2 0 0 0 2 2h1v-5H4z" />
        </svg>
      );
    case "secure":
    default:
      return (
        <svg {...iconProps}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
  }
}

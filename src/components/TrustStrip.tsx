"use client";

import { useStoreSettings } from "@/context/StoreSettingsContext";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
  "aria-hidden": true as const,
};

const icons = [
  <svg key="bolt" {...iconProps}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>,
  <svg key="lock" {...iconProps}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>,
  <svg key="save" {...iconProps}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>,
  <svg key="support" {...iconProps}>
    <path d="M4 18v-6a8 8 0 0 1 16 0v6" />
    <path d="M20 18a2 2 0 0 1-2 2h-1v-5h3zM4 18a2 2 0 0 0 2 2h1v-5H4z" />
  </svg>,
];

export default function TrustStrip() {
  const { settings } = useStoreSettings();
  const items = settings.trustItems.filter((item) => item.enabled);

  if (!settings.homepage.showWhyChooseUs || items.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="rounded-[20px] border border-border bg-gradient-to-b from-surface to-surface/40 px-6 py-10 sm:px-11 sm:py-12">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-text">
          {settings.homepage.whyChooseUsTitle}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted">
          {settings.homepage.whyChooseUsSubtitle}
        </p>
        <div className="mt-10 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => (
            <article
              key={item.id}
              className="rounded-[14px] border border-border bg-surface2 p-6"
            >
              <span className="mb-[18px] grid h-[42px] w-[42px] place-items-center rounded-[11px] bg-accent-soft text-accent">
                {icons[index % icons.length]}
              </span>
              <h3 className="text-[15.5px] font-semibold text-text">
                {item.title}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

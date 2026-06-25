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
  // Prix clairs en MAD — tag/price icon
  <svg key="tag" {...iconProps}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>,
  // Vérification manuelle — shield with checkmark
  <svg key="shield" {...iconProps}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>,
  // Codes conservés — archive/bookmark
  <svg key="archive" {...iconProps}>
    <rect x="3" y="3" width="18" height="4" rx="1" />
    <path d="M4 7v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7" />
    <path d="M10 12h4" />
  </svg>,
  // Support local — headphones
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
          Pourquoi choisir Karta&nbsp;?
        </h2>
        <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted">
          Une boutique pensée pour les clients marocains.
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

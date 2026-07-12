import type { StatItemSetting } from "@/lib/storeSettings";

/**
 * Compact trust-stat row shown under the hero — big figure + caption per tile
 * (e.g. "24/7 · Livraison digitale"). Presentational; the items come from
 * `settings.statItems`. Renders nothing when no item is enabled.
 */
export default function StatStrip({ items }: { items: StatItemSetting[] }) {
  const enabled = items.filter((item) => item.enabled);
  if (enabled.length === 0) return null;

  return (
    <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-[16px] border border-border bg-surface/60">
      {enabled.map((item) => (
        <div key={item.id} className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="font-mono text-xl font-semibold tracking-tight text-text sm:text-2xl">
            {item.value}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted sm:text-xs">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

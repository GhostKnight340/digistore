"use client";

import Link from "next/link";
import RegionBadge from "@/components/RegionBadge";
import { trackEvent } from "@/lib/analytics";

/**
 * Region filter for a collection page. Reuses the catalogue region-chip idiom but
 * stays scoped to the collection: chips are `<Link>`s to the same collection URL
 * with `?region=` (server re-renders the filtered subset, so Back/Forward work
 * and a filter can NEVER show products outside the collection). Fires a PII-free
 * `filter_collection` event on click.
 */
export default function CollectionRegionFilter({
  base,
  slug,
  regions,
  selected,
  totalCount,
}: {
  /** Collection page path, e.g. /collections/gaming. */
  base: string;
  slug: string;
  /** Distinct region codes present in the collection, with per-region counts. */
  regions: { code: string; count: number }[];
  selected?: string;
  totalCount: number;
}) {
  if (regions.length < 2) return null;

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
      active ? "border-accent bg-accent/15 text-white" : "border-border text-muted hover:text-white"
    }`;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="mr-1 font-mono text-xs uppercase tracking-wide text-faint">Région</span>
      <Link
        href={`${base}#products`}
        className={chip(!selected)}
        onClick={() => trackEvent("filter_collection", { collection_slug: slug, region: "all" })}
      >
        Tous
        <span className="font-mono text-[11px] text-faint">{totalCount}</span>
      </Link>
      {regions.map((region) => (
        <Link
          key={region.code}
          href={`${base}?region=${encodeURIComponent(region.code)}#products`}
          className={chip(selected === region.code)}
          onClick={() =>
            trackEvent("filter_collection", { collection_slug: slug, region: region.code })
          }
        >
          <RegionBadge
            code={region.code}
            variant="chip"
            size="micro"
            className="!h-auto !border-0 !bg-transparent !p-0"
          />
          <span className="font-mono text-[11px] text-faint">{region.count}</span>
        </Link>
      ))}
    </div>
  );
}

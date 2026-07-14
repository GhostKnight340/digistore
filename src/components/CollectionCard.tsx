"use client";

import Link from "next/link";
import CollectionIcon from "@/components/CollectionIcon";
import { trackEvent } from "@/lib/analytics";
import { collectionHref } from "@/lib/collectionUrl";
import type { HomepageCollectionCard } from "@/lib/types";

const DEFAULT_ACCENT = "#3e7bfa";

/**
 * Compact collection card for the homepage "Explorer les collections" section
 * and the /collections index. A single whole-card link (no nested links) with a
 * visible focus ring, an approved icon (or a restrained banner image when one is
 * configured), the collection title, short description, eligible product count,
 * and a CTA. Never renders the collection's product cards. Fires a PII-free
 * `select_collection` event on click.
 */
export default function CollectionCard({
  card,
  source = "homepage",
}: {
  card: HomepageCollectionCard;
  /** Analytics context: where the card was clicked. */
  source?: string;
}) {
  const accent = card.accentColor || DEFAULT_ACCENT;
  const countLabel = `${card.productCount} produit${card.productCount === 1 ? "" : "s"}`;

  return (
    <Link
      href={collectionHref(card.slug)}
      style={{ ["--brand" as string]: accent }}
      onClick={() =>
        trackEvent("select_collection", { collection_slug: card.slug, source })
      }
      className="group flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-[var(--brand)] hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50"
    >
      {/* Image-forward when a picture is configured (the artwork IS the
          identity — no redundant icon chip); icon-led otherwise. */}
      {card.imageUrl ? (
        <div className="aspect-[4/3] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.imageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col p-[18px]">
        <div className="flex items-center gap-3">
          {card.imageUrl ? null : (
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border"
              style={{
                color: accent,
                borderColor: `color-mix(in srgb, ${accent} 34%, transparent)`,
                background: `color-mix(in srgb, ${accent} 12%, transparent)`,
              }}
            >
              <CollectionIcon name={card.icon} className="h-[20px] w-[20px]" />
            </span>
          )}
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-medium text-text">
            {card.title}
          </h3>
        </div>

        {card.shortDescription ? (
          <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {card.shortDescription}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2 pt-1">
          <span className="font-mono text-xs uppercase tracking-wide text-faint">
            {countLabel}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[13px] font-medium transition group-hover:gap-1.5"
            style={{ color: accent }}
          >
            {card.ctaLabel.trim() || "Explorer"}
            <span aria-hidden>→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

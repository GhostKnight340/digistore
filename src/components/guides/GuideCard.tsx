import Link from "next/link";
import { guideHref } from "@/lib/guide";
import type { GuideIndexItem } from "@/lib/types";
import GuideIcon from "./GuideIcon";

/**
 * Compact guide card for the /guides index, /search guides section, and
 * related-guides lists. Server component (a plain Link). Matches the dark
 * premium card system used by collection/product cards.
 */
export default function GuideCard({ guide }: { guide: GuideIndexItem }) {
  return (
    <Link
      href={guideHref(guide.slug)}
      className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-accent/60 hover:bg-surface"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface2 text-accent">
          {guide.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={guide.heroImageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <GuideIcon icon={guide.icon} className="h-5 w-5" />
          )}
        </span>
        {guide.platform ? (
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-faint">
            {guide.platform}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-white transition group-hover:text-accent">
          {guide.title}
        </h3>
        {guide.summary ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted">{guide.summary}</p>
        ) : null}
      </div>
      <span className="text-xs font-medium text-accent">Lire le guide →</span>
    </Link>
  );
}

"use client";

import Link from "next/link";
import type { GuideIndexItem } from "@/lib/types";
import GuideIcon from "./GuideIcon";
import GuideCard from "./GuideCard";

/**
 * Zero-results state for an active search/filter. Never a dead end: it explains
 * what happened, offers a one-click reset, surfaces a few popular guides as a
 * fallback, and routes to human support. Distinct from the catalog-level
 * "Bientôt disponible" state (which means there are no guides at all).
 */
export default function HelpCenterEmpty({
  query,
  popular,
  onReset,
}: {
  query: string;
  popular: GuideIndexItem[];
  onReset: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="card flex flex-col items-center px-6 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface2 text-faint">
          <GuideIcon icon="support" className="h-7 w-7" />
        </span>
        <p className="mt-4 text-lg font-semibold text-white">Aucun guide trouvé</p>
        <p className="mt-1 max-w-md text-sm text-muted">
          {query.trim()
            ? `Rien ne correspond à « ${query.trim()} » pour le moment.`
            : "Aucun guide ne correspond à ce filtre."}{" "}
          Essayez un autre terme ou parcourez tous les guides.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onReset} className="btn-ghost">
            Réinitialiser la recherche
          </button>
          <Link href="/support" className="btn-primary">
            Contacter le support
          </Link>
        </div>
      </div>

      {popular.length > 0 && (
        <section aria-label="Guides suggérés">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint">
            Guides populaires
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popular.slice(0, 3).map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

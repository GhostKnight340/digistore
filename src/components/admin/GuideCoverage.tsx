"use client";

import {
  coverageSummaryLabel,
  type GuideCoverageSummary,
  type ProductCoverage,
} from "@/lib/guides/coverage";

/**
 * Product-coverage display for the admin Guides list and editor.
 *
 * Two pieces: a one-line compact summary that lives inside a guide row, and an
 * expandable details panel. Red is reserved strictly for genuine unavailability
 * — an empty guide reads as "Aucun produit lié" in neutral grey, never red, and
 * planning-only "produits attendus" use a neutral/amber treatment because they
 * are documentation, not broken state.
 *
 * Stock wording is rendered ONLY when `stockStatus` is non-null, which the
 * coverage layer already suppresses whenever the global inventory system is off.
 */

function Dot({ tone }: { tone: "green" | "red" | "neutral" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-400"
      : tone === "red"
        ? "bg-red-400"
        : "bg-faint";
  return <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

/** Compact "Produits liés : 6 disponibles · 2 indisponibles" line for a row. */
export function CoverageSummaryLine({ coverage }: { coverage: GuideCoverageSummary }) {
  const { counts } = coverage;
  if (counts.linked === 0 && counts.expected === 0) {
    return (
      <span className="text-xs text-faint">Aucun produit lié</span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-faint">Produits liés :</span>
      <span className="inline-flex items-center gap-1.5 text-emerald-400">
        <Dot tone="green" />
        {counts.available} disponible{counts.available === 1 ? "" : "s"}
      </span>
      {counts.unavailable > 0 && (
        <span className="inline-flex items-center gap-1.5 text-red-400">
          <Dot tone="red" />
          {counts.unavailable} indisponible{counts.unavailable === 1 ? "" : "s"}
        </span>
      )}
      {counts.expected > 0 && (
        <span
          className="inline-flex items-center gap-1.5 text-muted"
          title="Produits attendus : référence de planification, aucun produit n'est créé."
        >
          <Dot tone="neutral" />
          {counts.expected} attendu{counts.expected === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

function StatusBadge({ item }: { item: ProductCoverage }) {
  const ok = item.status === "available";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/30 bg-red-500/10 text-red-400"
      }`}
      title={item.reasonHint ?? undefined}
    >
      <Dot tone={ok ? "green" : "red"} />
      {ok ? "Disponible" : "Indisponible"}
    </span>
  );
}

function CoverageRow({ item }: { item: ProductCoverage }) {
  const meta = [
    item.variantName,
    item.region,
    // Inventory-dependent: null whenever the inventory system is disabled.
    item.stockStatus === "in_stock"
      ? "En stock"
      : item.stockStatus === "out_of_stock"
        ? "Rupture"
        : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {item.adminHref ? (
            <a
              href={item.adminHref}
              className="truncate text-sm font-medium text-white hover:text-accent"
            >
              {item.name}
            </a>
          ) : (
            <span className="truncate text-sm font-medium text-muted">{item.name}</span>
          )}
          {item.variantId === null && item.status === "available" && (
            <span
              className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-faint"
              title="Le guide couvre toutes les déclinaisons de ce produit."
            >
              Famille
            </span>
          )}
        </div>
        {meta.length > 0 && (
          <p className="mt-0.5 truncate text-[11px] text-faint">{meta.join(" · ")}</p>
        )}
        {item.reasonLabel && (
          <p className="mt-0.5 text-[11px] text-red-400" title={item.reasonHint ?? undefined}>
            {item.reasonLabel}
          </p>
        )}
      </div>
      <StatusBadge item={item} />
    </li>
  );
}

/**
 * Full breakdown: available products, unavailable products with reasons, and the
 * planning-only expected list. Rendered inside an expandable area so the guide
 * row stays compact.
 */
export function CoverageDetails({ coverage }: { coverage: GuideCoverageSummary }) {
  const { available, unavailable, expected } = coverage;

  if (available.length === 0 && unavailable.length === 0 && expected.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
        Aucun produit associé à ce guide. Ajoutez-en depuis l&apos;éditeur, section
        «&nbsp;Produits concernés&nbsp;».
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {available.length > 0 && (
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
            Produits disponibles ({available.length})
          </h4>
          <ul className="space-y-1.5">
            {available.map((item) => (
              <CoverageRow key={`${item.productId}-${item.variantId ?? "all"}`} item={item} />
            ))}
          </ul>
        </section>
      )}

      {unavailable.length > 0 && (
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-red-400">
            Produits manquants ou indisponibles ({unavailable.length})
          </h4>
          <ul className="space-y-1.5">
            {unavailable.map((item) => (
              <CoverageRow key={`${item.productId}-${item.variantId ?? "all"}`} item={item} />
            ))}
          </ul>
        </section>
      )}

      {expected.length > 0 && (
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Produits attendus ({expected.length})
          </h4>
          <ul className="flex flex-wrap gap-1.5">
            {expected.map((entry) => (
              <li
                key={entry.label}
                className="rounded-full border border-dashed border-border bg-surface px-2.5 py-1 text-[11px] text-muted"
              >
                {entry.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">
            Référence de planification uniquement — aucun produit n&apos;est créé dans le
            catalogue.
          </p>
        </section>
      )}
    </div>
  );
}

export { coverageSummaryLabel };

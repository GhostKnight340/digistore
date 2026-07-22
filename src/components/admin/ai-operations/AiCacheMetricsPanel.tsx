"use client";

/**
 * Prompt-caching metrics (spec: aggregated cache metrics in the AI Operations
 * usage interface). Read-only summary of Anthropic prompt-cache activity over a
 * time range, with a clear split between "enabled", "created", "hit" and "no
 * activity" so a cache-enabled request is never mislabeled a hit.
 *
 * Reuses the operations design kit so it is visually part of the same admin.
 */

import { MetricTile, OpsCard } from "@/components/admin/operations/shared";
import type { CacheMetricGroup, CacheMetrics } from "@/lib/ai-ops/cacheMetrics";

function usd(n: number): string {
  const s = Math.abs(n) < 1 ? n.toFixed(4) : n.toFixed(2);
  return `$${s}`;
}
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function AiCacheMetricsPanel({ metrics }: { metrics: CacheMetrics }) {
  const o = metrics.overall;
  const hasData = o.cacheEnabledRequests > 0;
  const netTone = o.netSavingsUsd > 0 ? "good" : o.netSavingsUsd < 0 ? "warn" : "neutral";

  return (
    <OpsCard
      title="Prompt caching (Anthropic)"
      headerRight={<span className="text-xs text-faint">{metrics.rangeDays} derniers jours</span>}
    >
      {!hasData ? (
        <p className="text-sm text-muted">
          Aucune activité de cache sur la période. Le cache ne s&apos;applique qu&apos;aux modules Anthropic dont le
          préfixe dépasse le minimum du modèle.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricTile label="Requêtes avec cache activé" value={o.cacheEnabledRequests} />
            <MetricTile label="Taux de lecture (hits)" value={pct(o.hitRate)} hint={`${o.cacheHitRequests} lecture(s)`} />
            <MetricTile label="Écritures de cache" value={o.cacheWriteRequests} hint={`${o.noCacheActivityRequests} sans activité`} />
            <MetricTile label="Économie nette estimée" value={usd(o.netSavingsUsd)} tone={netTone} />
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricTile label="Jetons lus (cache)" value={tokens(o.cacheReadTokens)} />
            <MetricTile label="Jetons écrits (cache)" value={tokens(o.cacheCreationTokens)} />
            <MetricTile label="Jetons non-cachés" value={tokens(o.uncachedInputTokens)} />
            <MetricTile
              label="Économie / surcoût"
              value={usd(o.estimatedSavedUsd)}
              hint={`surcoût écritures ${usd(o.estimatedWriteCostUsd)}`}
            />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <GroupTable title="Par module" groups={metrics.byModule} />
            <GroupTable title="Par modèle" groups={metrics.byModel} />
            <GroupTable title="Par provider" groups={metrics.byProvider} />
          </div>
        </div>
      )}
    </OpsCard>
  );
}

function GroupTable({ title, groups }: { title: string; groups: CacheMetricGroup[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {groups.length === 0 ? (
        <p className="text-xs text-muted">—</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {groups.map((g) => (
            <li key={g.key} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-white" title={g.key}>
                {g.key}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                <span title="taux de lecture">{pct(g.hitRate)}</span>
                <span
                  title="économie nette estimée"
                  className={g.netSavingsUsd > 0 ? "text-emerald-300" : g.netSavingsUsd < 0 ? "text-amber-300" : ""}
                >
                  {usd(g.netSavingsUsd)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

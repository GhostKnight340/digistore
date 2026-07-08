"use client";

// ⚠️ LANGUAGE: THIS PAGE IS INTENTIONALLY IN ENGLISH.
// The rest of the admin UI is French, but the "Provider API" dashboard is kept
// in English by the owner's explicit request. Do NOT translate this file back
// to French. If you touch it, keep all user-facing strings in English.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { isInventoryEnabled } from "@/lib/storeSettings";
import {
  getReloadlyOverviewAction,
  testReloadlyConnectionAction,
  getReloadlyMetricsAction,
  getReloadlyMappingsAction,
  getReloadlyProviderOrdersAction,
  searchReloadlyCatalogAction,
  testReloadlyAvailabilityAction,
} from "@/app/actions/suppliers";
import type {
  ReloadlyOverviewDTO,
  ReloadlyHealthDTO,
  ReloadlyMetricsDTO,
  ReloadlyMappingDTO,
  ReloadlyMappingStatus,
  ReloadlyProviderOrderDTO,
  ReloadlyCatalogPageDTO,
  ReloadlyAvailabilityDTO,
  SupplierTimeRange,
} from "@/lib/dto";

const RANGES: { id: SupplierTimeRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

const MAPPING_FILTERS: { id: "all" | ReloadlyMappingStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "linked", label: "Linked" },
  { id: "unlinked", label: "Unlinked" },
  { id: "incomplete", label: "Error" },
  { id: "disabled", label: "Disabled" },
];

const STATUS_META: Record<ReloadlyMappingStatus, { label: string; cls: string }> = {
  linked: { label: "Linked", cls: "border-green-500/40 text-green-400" },
  unlinked: { label: "Unlinked", cls: "border-border-strong text-muted" },
  incomplete: { label: "Error", cls: "border-amber-500/40 text-amber-400" },
  disabled: { label: "Disabled", cls: "border-border-strong text-faint" },
};

export default function SuppliersPanel() {
  const [overview, setOverview] = useState<ReloadlyOverviewDTO | null>(null);
  const [health, setHealth] = useState<ReloadlyHealthDTO | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      setHealth(await testReloadlyConnectionAction());
    } catch {
      setHealth(null);
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    getReloadlyOverviewAction().then(setOverview).catch(() => setOverview(null));
    // One health check on mount (single cheap read, not continuous polling).
    runTest();
  }, [runTest]);

  const sandbox = overview?.environment === "sandbox";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Provider API</h2>
        <p className="mt-1 text-sm text-muted">
          Status, mappings and orders for the Reloadly gift-card provider.
        </p>
        <p className="mt-1 text-xs text-faint">
          This page is intentionally in English (the rest of the admin is French). Keep it in English.
        </p>
      </div>

      {sandbox && <SandboxBanner />}

      <ProviderCard overview={overview} health={health} testing={testing} onTest={runTest} />

      <MetricsSection />

      <MappingSection />

      <CatalogSection />

      <ProviderOrdersSection />

      <RoutingSection />

      <Phase2Notice sandbox={sandbox} />
    </div>
  );
}

// ─── Sandbox banner ───────────────────────────────────────────────────────────

function SandboxBanner() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 px-5 py-4">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/25 text-amber-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-amber-300">Sandbox Mode</p>
        <p className="mt-1 text-sm text-amber-100/90">
          Provider orders placed in this environment are tests and do not deliver real gift cards.
        </p>
      </div>
    </div>
  );
}

// ─── Provider overview card ─────────────────────────────────────────────────────

function ProviderCard({
  overview,
  health,
  testing,
  onTest,
}: {
  overview: ReloadlyOverviewDTO | null;
  health: ReloadlyHealthDTO | null;
  testing: boolean;
  onTest: () => void;
}) {
  const env = overview?.environment ?? "sandbox";
  const connection = !overview
    ? { label: "…", cls: "text-muted" }
    : !overview.configured
      ? { label: "Not configured", cls: "text-red-400" }
      : health?.ok
        ? { label: "Connected", cls: "text-green-400" }
        : health
          ? { label: "Connection error", cls: "text-red-400" }
          : { label: "Checking…", cls: "text-muted" };
  const auth = !health
    ? { label: "…", cls: "text-muted" }
    : health.authWorking
      ? { label: "Working", cls: "text-green-400" }
      : { label: "Failed", cls: "text-red-400" };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 font-black text-accent">
            R
          </span>
          <div>
            <h3 className="text-base font-semibold text-white">Reloadly</h3>
            <p className="text-xs text-muted">Gift Cards API</p>
          </div>
        </div>
        <span
          className={`rounded-full border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide ${
            env === "sandbox"
              ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
              : "border-green-500/60 bg-green-500/15 text-green-300"
          }`}
        >
          {env === "sandbox" ? "Sandbox" : "Live"}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Connection"><span className={connection.cls}>{connection.label}</span></Field>
        <Field label="Authentication"><span className={auth.cls}>{auth.label}</span></Field>
        <Field label="Wallet balance">
          {health?.balance
            ? `${health.balance.amount.toLocaleString("en-US")} ${health.balance.currency}`
            : health && health.ok
              ? "Unavailable"
              : "—"}
        </Field>
        <Field label="Last checked">
          {health ? formatDate(health.checkedAt) : "—"}
        </Field>
        <Field label="Webhook">Not applicable</Field>
        <Field label="Automatic fulfillment">
          {overview?.automaticFulfillment ? "Enabled" : "Disabled (manual)"}
        </Field>
      </dl>

      {health?.error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
          {health.error}
        </p>
      )}

      <button
        type="button"
        onClick={onTest}
        disabled={testing}
        className="btn-ghost mt-5 w-full sm:w-auto"
      >
        {testing ? "Testing…" : "Test connection"}
      </button>
      <p className="mt-2 text-xs text-faint">
        Read-only test — no order is placed.
      </p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-white">{children}</dd>
    </div>
  );
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function MetricsSection() {
  const [range, setRange] = useState<SupplierTimeRange>("7d");
  const [metrics, setMetrics] = useState<ReloadlyMetricsDTO | null>(null);

  useEffect(() => {
    getReloadlyMetricsAction(range).then(setMetrics).catch(() => setMetrics(null));
  }, [range]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">Metrics</h3>
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-lg px-3 py-1.5 transition ${
                range === r.id ? "bg-accent/15 font-medium text-white" : "text-muted hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Linked products" value={metrics?.linkedProducts} />
        <Metric label="Unlinked products" value={metrics?.unlinkedProducts} />
        <Metric label="Provider orders" value={metrics?.providerOrders} hint="successful" />
      </div>
      <p className="text-xs text-faint">
        Failed, pending and success-rate metrics arrive with the provider attempt log (phase 2).
      </p>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value ?? "—"}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

// ─── Product mapping ────────────────────────────────────────────────────────────

function MappingSection() {
  const [mappings, setMappings] = useState<ReloadlyMappingDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"all" | ReloadlyMappingStatus>("all");

  useEffect(() => {
    getReloadlyMappingsAction()
      .then(setMappings)
      .catch(() => setMappings([]))
      .finally(() => setLoaded(true));
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? mappings : mappings.filter((m) => m.status === filter)),
    [mappings, filter],
  );

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Product mapping</h3>
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 text-xs">
        {MAPPING_FILTERS.map((f) => {
          const count = f.id === "all" ? mappings.length : mappings.filter((m) => m.status === f.id).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                filter === f.id ? "bg-accent/15 font-medium text-white" : "text-muted hover:text-white"
              }`}
            >
              {f.label}
              <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] font-bold text-faint">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {!loaded ? (
        <p className="card p-5 text-sm text-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="card p-5 text-sm text-muted">No variant in this category.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => (
            <MappingRow key={m.variantId} mapping={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function MappingRow({ mapping }: { mapping: ReloadlyMappingDTO }) {
  const [check, setCheck] = useState<ReloadlyAvailabilityDTO | null>(null);
  const [checking, setChecking] = useState(false);
  const meta = STATUS_META[mapping.status];

  async function testAvailability() {
    if (mapping.reloadlyProductId == null) return;
    setChecking(true);
    try {
      setCheck(
        await testReloadlyAvailabilityAction(mapping.reloadlyProductId, {
          faceValue: mapping.faceValue,
          currency: mapping.faceCurrency,
          countryCode: mapping.reloadlyCountryCode,
        }),
      );
    } catch {
      setCheck(null);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">
            {mapping.productName} <span className="text-muted">· {mapping.variantName}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[10px] text-accent">
              {mapping.region}
            </span>
            <span>{formatMAD(mapping.priceMad)}</span>
            {mapping.reloadlyProductId != null && (
              <span className="font-mono">
                Reloadly #{mapping.reloadlyProductId}
                {mapping.reloadlyCountryCode ? ` · ${mapping.reloadlyCountryCode}` : ""}
              </span>
            )}
          </p>
        </div>
        <span className={`chip ${meta.cls}`}>{meta.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {mapping.reloadlyProductId != null && (
          <button
            type="button"
            onClick={testAvailability}
            disabled={checking}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-white disabled:opacity-50"
          >
            {checking ? "Checking…" : "Test availability"}
          </button>
        )}
        <Link
          href="?tab=products"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-white"
        >
          Edit mapping
        </Link>
      </div>

      {check && (
        <div
          className={`mt-3 rounded-xl border px-4 py-2.5 text-xs ${
            check.error
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : check.ok
                ? "border-green-500/30 bg-green-500/10 text-green-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-100"
          }`}
        >
          {check.error ? (
            check.error
          ) : check.ok ? (
            <>Available — {check.productName} ({check.currency}, {check.country}).</>
          ) : (
            <>
              <p className="font-semibold">Mismatches:</p>
              <ul className="mt-1 list-disc pl-4">
                {check.issues.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Catalog explorer ────────────────────────────────────────────────────────────

function CatalogSection() {
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ReloadlyCatalogPageDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError("");
      const res = await searchReloadlyCatalogAction({
        page: nextPage,
        size: 20,
        countryCode: country || undefined,
        query: query || undefined,
      });
      if (res.ok) {
        setData(res.data);
        setPage(nextPage);
      } else {
        setError(res.error);
        setData(null);
      }
      setLoading(false);
    },
    [country, query],
  );

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Provider catalog</h3>
      <div className="card p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input sm:w-32"
            placeholder="Country (e.g. FR)"
            value={country}
            maxLength={2}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
          />
          <input
            className="input flex-1"
            placeholder="Name / brand (e.g. Steam)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(0)}
          />
          <button
            type="button"
            onClick={() => search(0)}
            disabled={loading}
            className="btn-primary sm:w-auto"
          >
            {loading ? "…" : "Search"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          The name filter applies to the current page’s results (Reloadly’s API only filters by
          country).
        </p>

        {error && (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
            {error}
          </p>
        )}

        {data && (
          <div className="mt-4 space-y-2">
            {data.products.length === 0 ? (
              <p className="text-sm text-muted">No product for these criteria.</p>
            ) : (
              data.products.map((p) => (
                <div key={p.productId} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{p.productName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="font-mono">#{p.productId}</span> · {p.countryName} ({p.country})
                        {" · "}
                        {p.currency}
                      </p>
                    </div>
                    {p.mapped && <span className="chip border-green-500/40 text-green-400">Linked</span>}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {p.denominationType === "FIXED"
                      ? `Values: ${p.fixedDenominations.join(", ") || "—"}`
                      : `Range: ${p.minDenomination ?? "?"} – ${p.maxDenomination ?? "?"}`}
                  </p>
                </div>
              ))
            )}

            {data.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-muted">
                <button
                  type="button"
                  disabled={page <= 0 || loading}
                  onClick={() => search(page - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {page + 1} / {data.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= data.totalPages - 1 || loading}
                  onClick={() => search(page + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Provider order history ──────────────────────────────────────────────────────

function ProviderOrdersSection() {
  const [orders, setOrders] = useState<ReloadlyProviderOrderDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState<ReloadlyProviderOrderDTO | null>(null);

  useEffect(() => {
    getReloadlyProviderOrdersAction()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Provider orders</h3>
      {!loaded ? (
        <p className="card p-5 text-sm text-muted">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="card p-5 text-sm text-muted">No Reloadly order recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.deliveredCodeId} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link
                  href={`/admin/orders/${o.orderId}`}
                  className="font-mono text-sm font-semibold text-accent hover:text-accent-hover"
                >
                  {o.publicOrderNumber}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {o.productName} · {formatDate(o.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="chip border-green-500/40 text-green-400">Successful</span>
                <button
                  type="button"
                  onClick={() => setDetail(o)}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-white"
                >
                  Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && <ProviderOrderDrawer order={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

function ProviderOrderDrawer({
  order,
  onClose,
}: {
  order: ReloadlyProviderOrderDTO;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-base p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Provider transaction</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-white">
            ✕
          </button>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <Row label="Ghost order">
            <Link href={`/admin/orders/${order.orderId}`} className="font-mono text-accent">
              {order.publicOrderNumber}
            </Link>
          </Row>
          <Row label="Provider">Reloadly</Row>
          <Row label="Environment">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                order.environment === "sandbox"
                  ? "border-amber-500/50 text-amber-300"
                  : "border-green-500/50 text-green-300"
              }`}
            >
              {order.environment === "sandbox" ? "Sandbox" : "Live"}
            </span>
          </Row>
          <Row label="Ghost product">{order.productName}</Row>
          <Row label="Reloadly transaction">
            <span className="font-mono">{order.reloadlyTransactionId ?? "—"}</span>
          </Row>
          <Row label="Created">{formatDate(order.createdAt)}</Row>
        </dl>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-wide text-faint">Steps</p>
          <ol className="mt-2 space-y-2 text-sm">
            {["Request created", "Sent to provider", "Processing", "Completed"].map((step) => (
              <li key={step} className="flex items-center gap-2 text-green-300">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20 text-[10px]">
                  ✓
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-faint">
          Full lifecycle tracking (live status, attempts, reconciliation) arrives with the provider
          attempt log. The delivered code is never shown here.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="text-right text-white">{children}</dd>
    </div>
  );
}

// ─── Fulfillment routing visibility ──────────────────────────────────────────────

function RoutingSection() {
  const [mappings, setMappings] = useState<ReloadlyMappingDTO[]>([]);
  const { settings } = useStoreSettings();
  const inventoryOn = isInventoryEnabled(settings);

  useEffect(() => {
    getReloadlyMappingsAction().then(setMappings).catch(() => setMappings([]));
  }, []);

  const linked = mappings.filter((m) => m.status === "linked");

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Fulfillment routing</h3>
      <div className="card p-5">
        <p className="text-sm text-muted">
          Each variant has <strong className="text-white">a single source</strong> (
          {inventoryOn ? "local inventory, manual entry, or Reloadly" : "manual entry or Reloadly"}).
          There is no automatic fallback — the current architecture does not support it.
        </p>
        {linked.length > 0 && (
          <ul className="mt-4 space-y-2">
            {linked.map((m) => (
              <li
                key={m.variantId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
              >
                <span className="text-white">
                  {m.productName} <span className="text-muted">· {m.variantName}</span>
                </span>
                <span className="text-xs text-muted">
                  Source: <span className="font-medium text-accent">Reloadly</span> · Fallback: none
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Phase 2 notice ──────────────────────────────────────────────────────────────

function Phase2Notice({ sandbox }: { sandbox: boolean }) {
  return (
    <section className="card border-dashed p-5">
      <h3 className="text-sm font-semibold text-white">Coming soon</h3>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        <li>
          • <strong className="text-white">Sandbox tests</strong> — run a test order
          {sandbox ? "" : " (Sandbox environment only)"}
        </li>
        <li>• <strong className="text-white">Attention required</strong> — fulfillment failure queue</li>
        <li>• <strong className="text-white">Retry</strong> — safe re-run (no double purchase)</li>
        <li>• Failure / pending / success-rate metrics and provider Discord events</li>
      </ul>
      <p className="mt-2 text-xs text-faint">
        These features require the provider attempt log (phase 2, additive migration).
      </p>
    </section>
  );
}

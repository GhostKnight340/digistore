/**
 * Supplier management persistence: operational state rows, the outcome-only
 * call log, and the aggregates behind the /admin/suppliers pages.
 *
 * Static supplier metadata (name, logo, credentials env-var names,
 * capabilities) lives in src/lib/suppliers/registry.ts — this module only
 * touches the `Supplier` / `SupplierLog` tables and never sees credentials
 * or provider payloads.
 */
import "server-only";
import { ensureDatabaseReady, prisma } from "./prisma";
import {
  SUPPLIER_SLUGS,
  getSupplierProvider,
  isSupplierSlug,
  type SupplierSlug,
} from "@/lib/suppliers/registry";
import type {
  SupplierCardDTO,
  SupplierDetailDTO,
  SupplierHealthLevel,
  SupplierLogFilters,
  SupplierLogsPageDTO,
  SupplierStatsDTO,
} from "@/lib/dto";

const LOGS_PAGE_SIZE = 25;
/** Failures inside this window put an otherwise-working supplier in "warning". */
const RECENT_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

type SupplierRow = NonNullable<Awaited<ReturnType<typeof prisma.supplier.findUnique>>>;

/** Lazily creates the state row so the registry is the only list of suppliers. */
async function ensureSupplierRow(slug: SupplierSlug): Promise<SupplierRow> {
  return prisma.supplier.upsert({
    where: { id: slug },
    create: { id: slug },
    update: {},
  });
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Health verdict from state alone (no live API call — the list page must be
 * fast). "healthy" needs a working recent signal and no fresher failure.
 */
function healthFor(row: SupplierRow, configured: boolean, enabled: boolean): SupplierHealthLevel {
  if (!configured) return "unconfigured";
  if (!enabled) return "disabled";
  const lastSuccess = row.lastSuccessAt?.getTime() ?? 0;
  const lastFailure = row.lastFailureAt?.getTime() ?? 0;
  if (!lastSuccess && !lastFailure) return "warning"; // configured, never checked
  if (lastFailure > lastSuccess) return "offline";
  if (lastFailure && Date.now() - lastFailure < RECENT_FAILURE_WINDOW_MS) return "warning";
  return "healthy";
}

async function toCard(slug: SupplierSlug, row: SupplierRow): Promise<SupplierCardDTO> {
  const provider = getSupplierProvider(slug);
  const configured = provider.isConfigured();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [ok, failed] = await Promise.all([
    prisma.supplierLog.count({
      where: { supplierId: slug, requestType: "purchase", ok: true, createdAt: { gte: since } },
    }),
    prisma.supplierLog.count({
      where: { supplierId: slug, requestType: "purchase", ok: false, createdAt: { gte: since } },
    }),
  ]);
  return {
    slug,
    name: provider.name,
    description: provider.description,
    accentColor: provider.accentColor,
    initials: provider.initials,
    enabled: row.enabled,
    configured,
    environment: provider.environment(),
    supportsBalance: provider.supportsBalance,
    health: healthFor(row, configured, row.enabled),
    balance:
      row.balanceAmount != null && row.balanceCurrency && row.balanceUpdatedAt
        ? {
            amount: row.balanceAmount,
            currency: row.balanceCurrency,
            updatedAt: row.balanceUpdatedAt.toISOString(),
          }
        : null,
    lastSuccessAt: iso(row.lastSuccessAt),
    lastFailureAt: iso(row.lastFailureAt),
    lastFailureMessage: row.lastFailureMessage,
    lastCheckedAt: iso(row.lastCheckedAt),
    lastSyncAt: iso(row.lastSyncAt),
    recentPurchases: { ok, failed },
  };
}

export async function listSupplierCards(): Promise<SupplierCardDTO[]> {
  await ensureDatabaseReady();
  const cards: SupplierCardDTO[] = [];
  for (const slug of SUPPLIER_SLUGS) {
    const row = await ensureSupplierRow(slug);
    cards.push(await toCard(slug, row));
  }
  return cards;
}

async function supplierStats(slug: SupplierSlug): Promise<SupplierStatsDTO> {
  const [purchasesOk, purchasesFailed, avg, totalDelivered] = await Promise.all([
    prisma.supplierLog.count({ where: { supplierId: slug, requestType: "purchase", ok: true } }),
    prisma.supplierLog.count({ where: { supplierId: slug, requestType: "purchase", ok: false } }),
    prisma.supplierLog.aggregate({
      where: { supplierId: slug, requestType: "purchase", responseTimeMs: { not: null } },
      _avg: { responseTimeMs: true },
    }),
    prisma.deliveredCode.count({ where: { source: slug } }),
  ]);
  const total = purchasesOk + purchasesFailed;
  return {
    purchasesOk,
    purchasesFailed,
    successRatePct: total > 0 ? Math.round((purchasesOk / total) * 1000) / 10 : null,
    avgResponseMs: avg._avg.responseTimeMs != null ? Math.round(avg._avg.responseTimeMs) : null,
    totalDelivered,
  };
}

export async function getSupplierDetail(slugRaw: string): Promise<SupplierDetailDTO | null> {
  await ensureDatabaseReady();
  if (!isSupplierSlug(slugRaw)) return null;
  const slug = slugRaw;
  const provider = getSupplierProvider(slug);
  const row = await ensureSupplierRow(slug);
  const card = await toCard(slug, row);
  return {
    ...card,
    credentials: provider.credentialEnvVars.map((name) => ({
      name,
      set: Boolean(process.env[name]),
    })),
    stats: await supplierStats(slug),
  };
}

export async function setSupplierEnabled(
  slugRaw: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await ensureDatabaseReady();
  if (!isSupplierSlug(slugRaw)) return { ok: false, error: "Fournisseur inconnu." };
  await ensureSupplierRow(slugRaw);
  await prisma.supplier.update({ where: { id: slugRaw }, data: { enabled } });
  return { ok: true };
}

/** deliverOrder gate: a missing row defaults to enabled (registry supplier). */
export async function isSupplierEnabled(slug: SupplierSlug): Promise<boolean> {
  const row = await prisma.supplier.findUnique({ where: { id: slug }, select: { enabled: true } });
  return row?.enabled ?? true;
}

/**
 * Records one supplier API outcome and rolls the supplier's health state
 * forward. Best-effort by design — callers `void` this; a logging failure
 * must never break a delivery or an admin action.
 */
export async function recordSupplierLog(input: {
  slug: SupplierSlug;
  requestType: "purchase" | "health_check" | "balance" | "status_poll";
  ok: boolean;
  responseTimeMs?: number | null;
  orderId?: string | null;
  productName?: string | null;
  providerRef?: string | null;
  /** Admin-safe message only — never a raw stack trace or payload. */
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await ensureSupplierRow(input.slug);
    const now = new Date();
    await prisma.$transaction([
      prisma.supplierLog.create({
        data: {
          supplierId: input.slug,
          requestType: input.requestType,
          ok: input.ok,
          responseTimeMs: input.responseTimeMs ?? null,
          orderId: input.orderId ?? null,
          productName: input.productName ?? null,
          providerRef: input.providerRef ?? null,
          errorMessage: input.errorMessage ?? null,
        },
      }),
      prisma.supplier.update({
        where: { id: input.slug },
        data: input.ok
          ? { lastSuccessAt: now }
          : { lastFailureAt: now, lastFailureMessage: input.errorMessage ?? null },
      }),
    ]);
  } catch (error) {
    console.error("[suppliers:log]", error);
  }
}

/**
 * Records that a health check ran. Pass `outcome` to also persist the result —
 * the scheduled health job does, so the ops dashboard can distinguish "checked
 * and healthy" from "checked and failing" without re-probing the API.
 * Omitting it preserves the original behaviour (timestamp only).
 */
export async function recordSupplierCheck(
  slug: SupplierSlug,
  outcome?: {
    ok: boolean;
    message?: string | null;
    latencyMs?: number | null;
    planName?: string | null;
    planExpiresAt?: Date | null;
    subscriptionActive?: boolean | null;
  },
): Promise<void> {
  try {
    await ensureSupplierRow(slug);
    const now = new Date();
    await prisma.supplier.update({
      where: { id: slug },
      data: {
        lastCheckedAt: now,
        ...(outcome
          ? {
              ...(outcome.ok
                ? { lastSuccessAt: now, lastFailureMessage: null }
                : { lastFailureAt: now, lastFailureMessage: outcome.message ?? null }),
              ...(outcome.latencyMs != null ? { lastLatencyMs: outcome.latencyMs } : {}),
              ...(outcome.planName !== undefined ? { planName: outcome.planName } : {}),
              ...(outcome.planExpiresAt !== undefined
                ? { planExpiresAt: outcome.planExpiresAt }
                : {}),
              ...(outcome.subscriptionActive !== undefined
                ? { subscriptionActive: outcome.subscriptionActive }
                : {}),
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("[suppliers:check]", error);
  }
}

export async function recordSupplierBalance(
  slug: SupplierSlug,
  balance: { amount: string; currency: string },
): Promise<void> {
  try {
    await ensureSupplierRow(slug);
    await prisma.supplier.update({
      where: { id: slug },
      data: {
        balanceAmount: balance.amount,
        balanceCurrency: balance.currency,
        balanceUpdatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[suppliers:balance]", error);
  }
}

export async function listSupplierLogs(
  slugRaw: string,
  filters: SupplierLogFilters,
): Promise<SupplierLogsPageDTO> {
  await ensureDatabaseReady();
  const page = Math.max(1, filters.page ?? 1);
  if (!isSupplierSlug(slugRaw)) return { rows: [], total: 0, page, pageSize: LOGS_PAGE_SIZE };

  const where = {
    supplierId: slugRaw,
    ...(filters.result === "ok" ? { ok: true } : filters.result === "failed" ? { ok: false } : {}),
    ...(filters.requestType ? { requestType: filters.requestType } : {}),
    ...(filters.product
      ? { productName: { contains: filters.product, mode: "insensitive" as const } }
      : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00Z`) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.supplierLog.count({ where }),
    prisma.supplierLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LOGS_PAGE_SIZE,
      take: LOGS_PAGE_SIZE,
    }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      requestType: row.requestType,
      ok: row.ok,
      responseTimeMs: row.responseTimeMs,
      orderId: row.orderId,
      // Public numbers are sequence-derived per order (a count query each) —
      // too heavy for a log table. The row links to /admin/orders/{id}, which
      // shows the public number itself.
      publicOrderNumber: null,
      productName: row.productName,
      providerRef: row.providerRef,
      errorMessage: row.errorMessage,
    })),
    total,
    page,
    pageSize: LOGS_PAGE_SIZE,
  };
}

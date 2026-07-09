import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { publicOrderReference } from "./orders";
import { getReloadlyEnvironment } from "@/lib/reloadly/config";
import { reloadlyCountryToRegion } from "@/lib/regions";
import type {
  ReloadlyMappingDTO,
  ReloadlyMappingStatus,
  ReloadlyMetricsDTO,
  ReloadlyProviderOrderDTO,
  SupplierEnvironment,
  SupplierTimeRange,
} from "@/lib/dto";

function rangeStart(range: SupplierTimeRange): Date {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function variantLabel(v: { name: string; faceValue: number | null; faceCurrency: string }): string {
  return v.faceValue != null ? `${v.faceValue} ${v.faceCurrency}` : v.name;
}

function mappingStatus(v: {
  active: boolean;
  stockControl: string;
  reloadlyProductId: number | null;
  reloadlyCountryCode: string | null;
}): ReloadlyMappingStatus {
  if (!v.active) return "disabled";
  if (v.stockControl !== "reloadly") return "unlinked";
  if (v.reloadlyProductId == null || !v.reloadlyCountryCode) return "incomplete";
  return "linked";
}

/** All variants with their Reloadly-mapping status (for the mapping table). */
export async function getReloadlyMappings(): Promise<ReloadlyMappingDTO[]> {
  await ensureDatabaseReady();
  const variants = await prisma.productVariant.findMany({
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      priceMad: true,
      faceValue: true,
      faceCurrency: true,
      active: true,
      region: true,
      stockControl: true,
      reloadlyProductId: true,
      reloadlyCountryCode: true,
      product: { select: { slug: true, name: true, region: true } },
    },
  });

  return variants.map((v) => {
    // Ghost region label (what customers see) vs the region implied by the
    // Reloadly card's origin country. They can legitimately differ (e.g. a FR
    // card that works EU-wide, labelled EU) — so this is an INFO flag, not an
    // error. It just makes an unintended label↔card mismatch visible.
    const region = v.region || v.product.region;
    const reloadlyRegion = reloadlyCountryToRegion(v.reloadlyCountryCode);
    const regionMismatch =
      v.stockControl === "reloadly" &&
      v.reloadlyProductId != null &&
      !!region &&
      !!reloadlyRegion &&
      region !== reloadlyRegion;
    return {
      variantId: v.id,
      productSlug: v.product.slug,
      productName: v.product.name,
      variantName: variantLabel(v),
      region,
      priceMad: v.priceMad,
      faceValue: v.faceValue,
      faceCurrency: v.faceCurrency,
      reloadlyProductId: v.reloadlyProductId,
      reloadlyCountryCode: v.reloadlyCountryCode,
      reloadlyRegion: reloadlyRegion || null,
      regionMismatch,
      status: mappingStatus(v),
    };
  });
}

/** Reloadly-eligible line items on an order (for the pre-delivery mismatch check). */
export async function getReloadlyDeliveryTargets(orderId: string): Promise<
  {
    orderItemId: string;
    reloadlyProductId: number;
    countryCode: string | null;
    faceValue: number | null;
    faceCurrency: string;
  }[]
> {
  await ensureDatabaseReady();
  const items = await prisma.orderItem.findMany({
    where: {
      orderId,
      variant: { stockControl: "reloadly", reloadlyProductId: { not: null } },
    },
    select: {
      id: true,
      variant: {
        select: {
          reloadlyProductId: true,
          reloadlyCountryCode: true,
          faceValue: true,
          faceCurrency: true,
        },
      },
    },
  });
  return items
    .filter((it) => it.variant?.reloadlyProductId != null)
    .map((it) => ({
      orderItemId: it.id,
      reloadlyProductId: it.variant!.reloadlyProductId!,
      countryCode: it.variant!.reloadlyCountryCode,
      faceValue: it.variant!.faceValue,
      faceCurrency: it.variant!.faceCurrency,
    }));
}

/** Reloadly product ids currently referenced by any variant (catalog cross-ref). */
export async function getMappedReloadlyProductIds(): Promise<number[]> {
  await ensureDatabaseReady();
  const rows = await prisma.productVariant.findMany({
    where: { reloadlyProductId: { not: null } },
    select: { reloadlyProductId: true },
    distinct: ["reloadlyProductId"],
  });
  return rows
    .map((r) => r.reloadlyProductId)
    .filter((id): id is number => id != null);
}

export async function getReloadlyMetrics(range: SupplierTimeRange): Promise<ReloadlyMetricsDTO> {
  await ensureDatabaseReady();
  const [linkedProducts, activeVariants, providerOrders] = await Promise.all([
    prisma.productVariant.count({
      where: { stockControl: "reloadly", reloadlyProductId: { not: null }, active: true },
    }),
    prisma.productVariant.count({ where: { active: true } }),
    prisma.deliveredCode.count({
      where: { source: "reloadly", deliveredAt: { gte: rangeStart(range) } },
    }),
  ]);
  return {
    linkedProducts,
    unlinkedProducts: Math.max(0, activeVariants - linkedProducts),
    providerOrders,
    range,
  };
}

/**
 * Successful Reloadly-sourced deliveries (the only provider orders persisted
 * today — failed/pending attempts leave no trace until the attempt log lands).
 * Never returns the delivered code itself.
 */
export async function getReloadlyProviderOrders(
  range?: SupplierTimeRange,
): Promise<ReloadlyProviderOrderDTO[]> {
  await ensureDatabaseReady();
  const environment = getReloadlyEnvironment() as SupplierEnvironment;
  const rows = await prisma.deliveredCode.findMany({
    where: {
      source: "reloadly",
      ...(range ? { deliveredAt: { gte: rangeStart(range) } } : {}),
    },
    orderBy: { deliveredAt: "desc" },
    take: 200,
    select: {
      id: true,
      orderId: true,
      reloadlyTransactionId: true,
      deliveredAt: true,
      product: { select: { name: true } },
      order: { select: { id: true, createdAt: true } },
    },
  });

  return Promise.all(
    rows.map(async (r) => {
      const reference = await publicOrderReference(r.order);
      return {
        deliveredCodeId: r.id,
        orderId: r.orderId,
        publicOrderNumber: reference.number,
        productName: r.product.name,
        reloadlyTransactionId: r.reloadlyTransactionId,
        environment,
        status: "successful" as const,
        createdAt: r.deliveredAt.toISOString(),
      };
    }),
  );
}

import "server-only";

import { prisma, ensureDatabaseReady } from "./prisma";
import { publicOrderReference } from "./orders";
import { getStoreSettings } from "./catalog";
import { isInventoryEnabled } from "@/lib/storeSettings";
import { isVariantAvailable } from "@/lib/search/stock";
import { formatRefundNumber } from "@/lib/refunds/status";
import { refundNextAction, statusesForQueueTab, type RefundQueueTab } from "@/lib/refunds/status";
import type {
  RefundReason,
  RefundResolutionType,
  RefundSource,
  RefundStatus,
} from "@/lib/types";

/**
 * Refund workflow — admin read models (queue list, case detail, counts) and the
 * factual eligibility SIGNALS. The signals are facts only; nothing here decides
 * a case — an admin always confirms (see src/lib/db/refunds.ts transitions).
 */

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// ── Queue list ───────────────────────────────────────────────────────────────
export type RefundQueueItem = {
  id: string;
  number: string;
  status: RefundStatus;
  source: RefundSource;
  reason: RefundReason;
  requestedAmountMad: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  orderId: string;
  orderNumber: string;
  paymentMethod: string;
  productSummary: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  lastEventType: string | null;
  ageHours: number;
  assignedAdminName: string | null;
  legacy: boolean;
  resolutionType: RefundResolutionType | null;
  nextAction: string;
};

export type RefundQueueFilters = {
  tab?: RefundQueueTab;
  reason?: RefundReason | null;
  paymentMethod?: string | null;
  q?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  pageSize?: number;
};

export type RefundQueueResult = {
  items: RefundQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<RefundQueueTab, number>;
};

const DEFAULT_PAGE_SIZE = 20;

function productSummaryFromItems(
  items: { quantity: number; product: { name: string }; variant: { name: string } | null }[],
): string {
  if (!items.length) return "—";
  return items
    .map((i) => {
      const label = i.variant ? `${i.product.name} · ${i.variant.name}` : i.product.name;
      return i.quantity > 1 ? `${label} ×${i.quantity}` : label;
    })
    .join(", ");
}

export async function listRefundRequests(
  filters: RefundQueueFilters,
): Promise<RefundQueueResult> {
  await ensureDatabaseReady();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const tab = filters.tab ?? "all";

  const where: Record<string, unknown> = {};
  const tabStatuses = statusesForQueueTab(tab);
  if (tabStatuses.length) where.status = { in: tabStatuses };
  if (filters.reason) where.reason = filters.reason;

  const and: Record<string, unknown>[] = [];

  if (filters.paymentMethod) {
    and.push({ order: { paymentMethod: filters.paymentMethod } });
  }
  if (filters.dateFrom) and.push({ createdAt: { gte: new Date(filters.dateFrom) } });
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    and.push({ createdAt: { lte: to } });
  }

  const q = filters.q?.trim();
  if (q) {
    const or: Record<string, unknown>[] = [
      { customerName: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q } },
    ];
    // RF-000012 / bare number → match the refund seq.
    const rfMatch = q.match(/^rf-?0*(\d+)$/i) ?? q.match(/^0*(\d+)$/);
    if (rfMatch) or.push({ seq: Number(rfMatch[1]) });
    // #000008 / a bare number → the order at that public sequence.
    const orderSeqMatch = q.match(/^#?0*(\d+)$/);
    if (orderSeqMatch) {
      const orderRow = await prisma.order.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: Number(orderSeqMatch[1]) - 1,
        take: 1,
        select: { id: true },
      });
      if (orderRow[0]) or.push({ orderId: orderRow[0].id });
    }
    and.push({ OR: or });
  }

  if (and.length) where.AND = and;

  const [total, rows, grouped] = await Promise.all([
    prisma.refundRequest.count({ where }),
    prisma.refundRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        seq: true,
        status: true,
        source: true,
        reason: true,
        requestedAmountMad: true,
        currency: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        orderId: true,
        legacy: true,
        assignedAdminName: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            createdAt: true,
            paymentMethod: true,
            items: {
              select: {
                quantity: true,
                product: { select: { name: true } },
                variant: { select: { name: true } },
              },
            },
          },
        },
        resolution: { select: { type: true } },
        events: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, type: true } },
      },
    }),
    prisma.refundRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const now = Date.now();
  const items: RefundQueueItem[] = await Promise.all(
    rows.map(async (r) => {
      const orderRef = await publicOrderReference({ id: r.orderId, createdAt: r.order.createdAt });
      const lastEvent = r.events[0];
      const lastActivity = lastEvent && lastEvent.createdAt > r.updatedAt ? lastEvent.createdAt : r.updatedAt;
      return {
        id: r.id,
        number: formatRefundNumber(r.seq),
        status: r.status as RefundStatus,
        source: r.source as RefundSource,
        reason: r.reason as RefundReason,
        requestedAmountMad: r.requestedAmountMad,
        currency: r.currency,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        customerPhone: r.customerPhone,
        orderId: r.orderId,
        orderNumber: orderRef.number,
        paymentMethod: r.order.paymentMethod,
        productSummary: productSummaryFromItems(r.order.items),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        lastActivityAt: lastActivity.toISOString(),
        lastEventType: lastEvent?.type ?? null,
        ageHours: Math.round((now - r.createdAt.getTime()) / 3_600_000),
        assignedAdminName: r.assignedAdminName,
        legacy: r.legacy,
        resolutionType: (r.resolution?.type as RefundResolutionType | undefined) ?? null,
        nextAction: refundNextAction(r.status),
      };
    }),
  );

  const byStatus: Record<string, number> = {};
  for (const g of grouped) byStatus[g.status] = g._count._all;
  const counts = buildTabCounts(byStatus);

  return { items, total, page, pageSize, counts };
}

function buildTabCounts(byStatus: Record<string, number>): Record<RefundQueueTab, number> {
  const sum = (statuses: RefundStatus[]) =>
    statuses.reduce((acc, s) => acc + (byStatus[s] ?? 0), 0);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return {
    new: sum(statusesForQueueTab("new")),
    review: sum(statusesForQueueTab("review")),
    info_required: sum(statusesForQueueTab("info_required")),
    responded: sum(statusesForQueueTab("responded")),
    awaiting_customer: sum(statusesForQueueTab("awaiting_customer")),
    choice_received: sum(statusesForQueueTab("choice_received")),
    to_process: sum(statusesForQueueTab("to_process")),
    completed: sum(statusesForQueueTab("completed")),
    not_eligible: sum(statusesForQueueTab("not_eligible")),
    all: total,
  };
}

// ── Same-value replacement variants ──────────────────────────────────────────
export type ReplacementVariant = {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  region: string | null;
  faceValue: number | null;
  faceCurrency: string;
  priceMad: number;
  imageUrl: string | null;
  available: boolean;
};

/**
 * Currently-purchasable variants priced EXACTLY at the approved amount (same
 * currency). Applies the live catalogue availability rules and the global
 * inventory toggle — an out-of-stock or force-hidden variant is excluded. The
 * originally-purchased variant is excluded unless the admin opted to keep it.
 */
export async function listReplacementVariants(
  amountMad: number,
  opts: { excludeVariantId?: string | null; allowSameVariant?: boolean } = {},
): Promise<ReplacementVariant[]> {
  await ensureDatabaseReady();
  const settings = await getStoreSettings();
  const stockOpts = {
    inventoryEnabled: settings.inventoryEnabled,
    inventoryMode: settings.inventoryMode,
  };
  const inventoryOn = isInventoryEnabled(stockOpts);

  const variants = await prisma.productVariant.findMany({
    where: { active: true, priceMad: amountMad, product: { active: true } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      priceMad: true,
      faceValue: true,
      faceCurrency: true,
      region: true,
      stockMode: true,
      _count: { select: { digitalCodes: { where: { status: "unused" } } } },
      product: {
        select: { id: true, slug: true, name: true, region: true, imageUrl: true },
      },
    },
  });

  const result: ReplacementVariant[] = [];
  for (const v of variants) {
    if (!opts.allowSameVariant && opts.excludeVariantId && v.id === opts.excludeVariantId) continue;
    const available = isVariantAvailable(v.stockMode, v._count.digitalCodes, stockOpts);
    // When inventory is off, availability is active-only (already filtered).
    if (inventoryOn && !available) continue;
    const rawImage = v.product.imageUrl;
    result.push({
      variantId: v.id,
      productId: v.product.id,
      productSlug: v.product.slug,
      productName: v.product.name,
      variantName: v.name,
      region: v.region || v.product.region || null,
      faceValue: v.faceValue,
      faceCurrency: v.faceCurrency,
      priceMad: v.priceMad,
      imageUrl: rawImage && rawImage.startsWith("data:")
        ? `/api/product-image/${encodeURIComponent(v.product.slug)}`
        : rawImage,
      available: true,
    });
  }
  return result;
}

/** Just the queue-tab counts (for the nav badge / control-center insights). */
export async function getRefundQueueCounts(): Promise<Record<RefundQueueTab, number>> {
  await ensureDatabaseReady();
  const grouped = await prisma.refundRequest.groupBy({ by: ["status"], _count: { _all: true } });
  const byStatus: Record<string, number> = {};
  for (const g of grouped) byStatus[g.status] = g._count._all;
  return buildTabCounts(byStatus);
}

// ── Case detail ──────────────────────────────────────────────────────────────
export type RefundEligibilitySignals = {
  codeDelivered: boolean;
  paymentConfirmed: boolean;
  possibleDuplicatePayment: boolean;
  supplierValidationAvailable: boolean;
  hasPaymentProof: boolean;
  previousRefundRequests: number;
};

export type RefundCaseDetail = {
  id: string;
  number: string;
  seq: number;
  status: RefundStatus;
  source: RefundSource;
  reason: RefundReason;
  description: string;
  requestedAmountMad: number;
  currency: string;
  eligibilityDecision: string | null;
  rejectionReason: string | null;
  offeredResolutions: RefundResolutionType[];
  allowSameVariantReplacement: boolean;
  legacy: boolean;
  assignedAdminName: string | null;
  supportRating: string | null;
  supportComment: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  customerChoiceAt: string | null;
  processedAt: string | null;
  closedAt: string | null;
  ageHours: number;
  customer: {
    id: string | null;
    name: string;
    email: string;
    phone: string | null;
    isGuest: boolean;
    totalOrders: number;
    previousRefundRequests: number;
  };
  order: {
    id: string;
    number: string;
    status: string;
    paymentMethod: string;
    totalMad: number;
    createdAt: string;
    paymentConfirmedAt: string | null;
    hasPaymentProof: boolean;
    paymentProof: { fileName: string; mimeType: string } | null;
    deliveredAt: string | null;
    items: {
      productName: string;
      variantName: string | null;
      region: string | null;
      quantity: number;
      unitPriceMad: number;
    }[];
    delivered: boolean;
    supplierReferences: string[];
  };
  eligibility: RefundEligibilitySignals;
  attachments: {
    id: string;
    uploadedBy: string;
    url: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }[];
  messages: {
    id: string;
    channel: string;
    templateKey: string | null;
    subject: string | null;
    body: string;
    sentByName: string | null;
    deliveryResult: string | null;
    createdAt: string;
  }[];
  events: {
    id: string;
    type: string;
    actorType: string;
    actorName: string | null;
    metadata: unknown;
    createdAt: string;
  }[];
  notes: { id: string; authorName: string; body: string; createdAt: string }[];
  resolution: {
    type: RefundResolutionType;
    amountMad: number;
    currency: string;
    selectedVariantId: string | null;
    replacementLabel: string | null;
    originalPaymentMethod: string | null;
    transactionReference: string | null;
    proofUrl: string | null;
    processingNote: string | null;
    selectedByCustomer: boolean;
    processedByName: string | null;
    selectedAt: string | null;
    processedAt: string | null;
  } | null;
};

export async function getRefundCaseDetail(id: string): Promise<RefundCaseDetail | null> {
  await ensureDatabaseReady();
  const r = await prisma.refundRequest.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      status: true,
      source: true,
      reason: true,
      description: true,
      requestedAmountMad: true,
      currency: true,
      eligibilityDecision: true,
      rejectionReason: true,
      offeredResolutions: true,
      allowSameVariantReplacement: true,
      legacy: true,
      assignedAdminName: true,
      supportRating: true,
      supportComment: true,
      customerId: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      createdAt: true,
      updatedAt: true,
      reviewedAt: true,
      approvedAt: true,
      customerChoiceAt: true,
      processedAt: true,
      closedAt: true,
      order: {
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          totalMad: true,
          createdAt: true,
          paymentConfirmedAt: true,
          paymentProof: { select: { fileName: true, mimeType: true } },
          deliveredCodes: { select: { deliveredAt: true } },
          supplierFulfillments: {
            select: { providerOrderId: true, supplier: true, status: true },
          },
          items: {
            select: {
              quantity: true,
              unitPriceMad: true,
              product: { select: { name: true, region: true } },
              variant: { select: { name: true, region: true } },
            },
          },
        },
      },
      attachments: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" } },
      resolution: true,
    },
  });
  if (!r) return null;

  const orderRef = await publicOrderReference({ id: r.order.id, createdAt: r.order.createdAt });

  // Factual signals — never a decision.
  const delivered = r.order.deliveredCodes.length > 0;
  const deliveredAt = r.order.deliveredCodes
    .map((c) => c.deliveredAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const paymentConfirmed = !!r.order.paymentConfirmedAt || ["payment_confirmed", "delivered"].includes(r.order.status);
  const supplierReferences = r.order.supplierFulfillments
    .map((s) => (s.providerOrderId ? `${s.supplier} · ${s.providerOrderId}` : null))
    .filter((x): x is string => !!x);

  const [totalOrders, previousRefundRequests, duplicatePaymentCount] = await Promise.all([
    r.customerId
      ? prisma.order.count({ where: { customerId: r.customerId } })
      : prisma.order.count({ where: { customerEmail: r.customerEmail } }),
    prisma.refundRequest.count({
      where: {
        id: { not: r.id },
        OR: [
          ...(r.customerId ? [{ customerId: r.customerId }] : []),
          { customerEmail: r.customerEmail },
        ],
      },
    }),
    prisma.order.count({
      where: {
        id: { not: r.order.id },
        customerEmail: r.customerEmail,
        totalMad: r.order.totalMad,
        createdAt: {
          gte: new Date(r.order.createdAt.getTime() - 24 * 3_600_000),
          lte: new Date(r.order.createdAt.getTime() + 24 * 3_600_000),
        },
      },
    }),
  ]);

  const eligibility: RefundEligibilitySignals = {
    codeDelivered: delivered,
    paymentConfirmed,
    possibleDuplicatePayment: duplicatePaymentCount > 0,
    supplierValidationAvailable: supplierReferences.length > 0,
    hasPaymentProof: !!r.order.paymentProof,
    previousRefundRequests,
  };

  return {
    id: r.id,
    number: formatRefundNumber(r.seq),
    seq: r.seq,
    status: r.status as RefundStatus,
    source: r.source as RefundSource,
    reason: r.reason as RefundReason,
    description: r.description,
    requestedAmountMad: r.requestedAmountMad,
    currency: r.currency,
    eligibilityDecision: r.eligibilityDecision,
    rejectionReason: r.rejectionReason,
    offeredResolutions: r.offeredResolutions as RefundResolutionType[],
    allowSameVariantReplacement: r.allowSameVariantReplacement,
    legacy: r.legacy,
    assignedAdminName: r.assignedAdminName,
    supportRating: r.supportRating,
    supportComment: r.supportComment,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    reviewedAt: iso(r.reviewedAt),
    approvedAt: iso(r.approvedAt),
    customerChoiceAt: iso(r.customerChoiceAt),
    processedAt: iso(r.processedAt),
    closedAt: iso(r.closedAt),
    ageHours: Math.round((Date.now() - r.createdAt.getTime()) / 3_600_000),
    customer: {
      id: r.customerId,
      name: r.customerName,
      email: r.customerEmail,
      phone: r.customerPhone,
      isGuest: !r.customerId,
      totalOrders,
      previousRefundRequests,
    },
    order: {
      id: r.order.id,
      number: orderRef.number,
      status: r.order.status,
      paymentMethod: r.order.paymentMethod,
      totalMad: r.order.totalMad,
      createdAt: r.order.createdAt.toISOString(),
      paymentConfirmedAt: iso(r.order.paymentConfirmedAt),
      hasPaymentProof: !!r.order.paymentProof,
      paymentProof: r.order.paymentProof
        ? { fileName: r.order.paymentProof.fileName, mimeType: r.order.paymentProof.mimeType }
        : null,
      deliveredAt: iso(deliveredAt ?? null),
      items: r.order.items.map((i) => ({
        productName: i.product.name,
        variantName: i.variant?.name ?? null,
        region: i.variant?.region ?? i.product.region ?? null,
        quantity: i.quantity,
        unitPriceMad: i.unitPriceMad,
      })),
      delivered,
      supplierReferences,
    },
    eligibility,
    attachments: r.attachments.map((a) => ({
      id: a.id,
      uploadedBy: a.uploadedBy,
      url: a.url,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      createdAt: a.createdAt.toISOString(),
    })),
    messages: r.messages.map((m) => ({
      id: m.id,
      channel: m.channel,
      templateKey: m.templateKey,
      subject: m.subject,
      body: m.body,
      sentByName: m.sentByName,
      deliveryResult: m.deliveryResult,
      createdAt: m.createdAt.toISOString(),
    })),
    events: r.events.map((e) => ({
      id: e.id,
      type: e.type,
      actorType: e.actorType,
      actorName: e.actorName,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    })),
    notes: r.notes.map((n) => ({
      id: n.id,
      authorName: n.authorName,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
    })),
    resolution: r.resolution
      ? {
          type: r.resolution.type as RefundResolutionType,
          amountMad: r.resolution.amountMad,
          currency: r.resolution.currency,
          selectedVariantId: r.resolution.selectedVariantId,
          replacementLabel: r.resolution.replacementLabel,
          originalPaymentMethod: r.resolution.originalPaymentMethod,
          transactionReference: r.resolution.transactionReference,
          proofUrl: r.resolution.proofUrl,
          processingNote: r.resolution.processingNote,
          selectedByCustomer: r.resolution.selectedByCustomer,
          processedByName: r.resolution.processedByName,
          selectedAt: iso(r.resolution.selectedAt),
          processedAt: iso(r.resolution.processedAt),
        }
      : null,
  };
}

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import { resolveCartLines } from "./promoResolve";
import { publicOrderReference } from "./orders";
import {
  normalizePromoCode,
  validatePromoConfig,
  computeEligibility,
  computeDiscount,
  computeGhostCredit,
  allocateDiscount,
  evaluatePromoStatus,
  validateRedeemability,
  rewardKind,
  isGhostCreditReward,
  type EligibilityLine,
  type PromoConfigInput,
} from "@/lib/promo/engine";
import { promoRewardTypeLabel, promoValueLabel } from "@/lib/promo/labels";
import type {
  ActionResult,
  AdminPromoCodeDTO,
  AdminPromoCodeSummaryDTO,
  AdminPromoCodeDetailDTO,
  PromoScopeOptionDTO,
  PromoValidationResultDTO,
  PromoPreviewDTO,
  SavePromoCodeInput,
  PromoOrderUsageDTO,
} from "@/lib/dto";
import type { PromoRewardType, OrderStatus } from "@/lib/types";

type Tx = Prisma.TransactionClient;

// Order statuses that represent real captured revenue for this code.
const REVENUE_STATUSES = ["payment_confirmed", "delivered"];
// Redemption statuses that consume a "use".
const CONSUMING_REDEMPTION_STATUSES = ["reserved", "finalized"];

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function decToNum(value: Prisma.Decimal | number | null): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value.toString());
}

const promoInclude = {
  products: { select: { productId: true } },
  categories: { select: { categoryId: true } },
} satisfies Prisma.PromoCodeInclude;

type PromoRow = Prisma.PromoCodeGetPayload<{ include: typeof promoInclude }>;

function buildPromoDTO(row: PromoRow, now: Date): AdminPromoCodeDTO {
  return {
    id: row.id,
    code: row.code,
    internalName: row.internalName,
    description: row.description,
    active: row.active,
    rewardType: row.rewardType as PromoRewardType,
    percentValue: decToNum(row.percentValue),
    fixedAmountMad: row.fixedAmountMad,
    maxDiscountMad: row.maxDiscountMad,
    maxCreditMad: row.maxCreditMad,
    creditExpiresInDays: row.creditExpiresInDays,
    creditExpiresAt: iso(row.creditExpiresAt),
    startAt: iso(row.startAt),
    endAt: iso(row.endAt),
    maxTotalUses: row.maxTotalUses,
    maxUsesPerCustomer: row.maxUsesPerCustomer,
    firstOrderOnly: row.firstOrderOnly,
    loggedInOnly: row.loggedInOnly,
    minSubtotalMad: row.minSubtotalMad,
    maxSubtotalMad: row.maxSubtotalMad,
    productIds: row.products.map((p) => p.productId),
    categoryIds: row.categories.map((c) => c.categoryId),
    archivedAt: iso(row.archivedAt),
    reservedUses: row.reservedUses,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: evaluatePromoStatus(
      {
        active: row.active,
        archivedAt: row.archivedAt,
        startAt: row.startAt,
        endAt: row.endAt,
        maxTotalUses: row.maxTotalUses,
        reservedUses: row.reservedUses,
      },
      now,
    ),
  };
}

function scopeLabel(productCount: number, categoryCount: number): string {
  if (productCount === 0 && categoryCount === 0) return "Tous les produits";
  const parts: string[] = [];
  if (productCount > 0) parts.push(`${productCount} produit${productCount > 1 ? "s" : ""}`);
  if (categoryCount > 0) parts.push(`${categoryCount} catégorie${categoryCount > 1 ? "s" : ""}`);
  return parts.join(" + ");
}

// ── Admin: options for the product/category multi-selects ────────────────────

export async function getPromoScopeOptions(): Promise<{
  products: PromoScopeOptionDTO[];
  categories: PromoScopeOptionDTO[];
}> {
  await ensureDatabaseReady();
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, categoryRecord: { select: { name: true } } },
    }),
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  return {
    products: products.map((p) => ({ id: p.id, name: p.name, meta: p.categoryRecord?.name ?? "" })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  };
}

// ── Admin: list + detail ─────────────────────────────────────────────────────

export async function listPromoCodes(): Promise<AdminPromoCodeSummaryDTO[]> {
  await ensureDatabaseReady();
  const now = new Date();
  const rows = await prisma.promoCode.findMany({
    orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
    include: {
      products: { select: { productId: true } },
      categories: { select: { categoryId: true } },
      _count: { select: { redemptions: { where: { status: { in: CONSUMING_REDEMPTION_STATUSES } } } } },
    },
  });
  return rows.map((row) => {
    const dto = buildPromoDTO(row, now);
    return {
      id: row.id,
      code: row.code,
      internalName: row.internalName,
      rewardType: dto.rewardType,
      rewardTypeLabel: promoRewardTypeLabel(row.rewardType),
      valueLabel: promoValueLabel({
        rewardType: row.rewardType,
        percentValue: dto.percentValue,
        fixedAmountMad: row.fixedAmountMad,
        maxDiscountMad: row.maxDiscountMad,
        maxCreditMad: row.maxCreditMad,
      }),
      status: dto.status,
      startAt: dto.startAt,
      endAt: dto.endAt,
      usedCount: row._count.redemptions,
      maxTotalUses: row.maxTotalUses,
      scopeLabel: scopeLabel(row.products.length, row.categories.length),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function getPromoCodeDetail(id: string): Promise<AdminPromoCodeDetailDTO | null> {
  await ensureDatabaseReady();
  const now = new Date();
  const row = await prisma.promoCode.findUnique({ where: { id }, include: promoInclude });
  if (!row) return null;
  const promo = buildPromoDTO(row, now);

  const [redemptions, snapshots, creditTxns, events] = await Promise.all([
    prisma.promoRedemption.findMany({
      where: { promoCodeId: id },
      orderBy: { createdAt: "desc" },
      select: {
        orderId: true,
        status: true,
        customerId: true,
        customerEmail: true,
        order: { select: { id: true, status: true, totalMad: true, discountMad: true, createdAt: true } },
      },
    }),
    prisma.orderPromotionSnapshot.findMany({
      where: { promoCodeId: id },
      select: { orderId: true, eligibleSubtotalMad: true, discountMad: true, expectedCreditMad: true, order: { select: { status: true } } },
    }),
    prisma.ghostCreditTransaction.findMany({
      where: { promoCodeId: id, direction: "credit", status: "active" },
      select: { amountMad: true, rewardType: true },
    }),
    prisma.promoCodeEvent.findMany({
      where: { promoCodeId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, type: true, note: true, createdBy: true, createdAt: true },
    }),
  ]);

  const consuming = redemptions.filter((r) => CONSUMING_REDEMPTION_STATUSES.includes(r.status));
  const uniqueCustomers = new Set(consuming.map((r) => r.customerId ?? r.customerEmail.toLowerCase())).size;

  // Immediate discount actually granted = discount on orders that reached revenue.
  let totalImmediateDiscountMad = 0;
  let revenueMad = 0;
  let eligibleSubtotalGeneratedMad = 0;
  for (const snap of snapshots) {
    if (REVENUE_STATUSES.includes(snap.order.status)) {
      totalImmediateDiscountMad += snap.discountMad;
      eligibleSubtotalGeneratedMad += snap.eligibleSubtotalMad;
    }
  }
  for (const r of redemptions) {
    if (REVENUE_STATUSES.includes(r.order.status)) revenueMad += r.order.totalMad;
  }

  let totalFixedCreditMad = 0;
  let totalPercentCreditMad = 0;
  for (const txn of creditTxns) {
    if (txn.rewardType === "FIXED_GHOST_CREDIT") totalFixedCreditMad += txn.amountMad;
    else if (txn.rewardType === "PERCENT_GHOST_CREDIT") totalPercentCreditMad += txn.amountMad;
  }
  const totalCreditGrantedMad = totalFixedCreditMad + totalPercentCreditMad;
  const successfulOrders = redemptions.filter(
    (r) => r.status === "finalized" && REVENUE_STATUSES.includes(r.order.status),
  ).length;

  const orders: PromoOrderUsageDTO[] = await Promise.all(
    redemptions.slice(0, 50).map(async (r) => {
      const ref = await publicOrderReference({ id: r.order.id, createdAt: r.order.createdAt });
      const snap = snapshots.find((s) => s.orderId === r.orderId);
      return {
        orderId: r.order.id,
        publicOrderNumber: ref.number,
        status: r.order.status as OrderStatus,
        redemptionStatus: r.status,
        totalMad: r.order.totalMad,
        discountMad: r.order.discountMad,
        expectedCreditMad: snap?.expectedCreditMad ?? 0,
        createdAt: r.order.createdAt.toISOString(),
      };
    }),
  );

  return {
    promo,
    totalUses: consuming.length,
    uniqueCustomers,
    remainingUses: row.maxTotalUses == null ? null : Math.max(0, row.maxTotalUses - row.reservedUses),
    totalImmediateDiscountMad,
    totalFixedCreditMad,
    totalPercentCreditMad,
    totalCreditGrantedMad,
    averageCreditPerOrderMad: successfulOrders > 0 ? Math.round(totalCreditGrantedMad / successfulOrders) : 0,
    revenueMad,
    eligibleSubtotalGeneratedMad,
    orders,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      note: e.note,
      createdBy: e.createdBy,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

// ── Admin: create / update / duplicate / archive / delete ────────────────────

function sanitizeSaveInput(input: SavePromoCodeInput): {
  ok: boolean;
  error?: string;
  data?: Prisma.PromoCodeUncheckedCreateInput;
  productIds: string[];
  categoryIds: string[];
} {
  const code = normalizePromoCode(input.code ?? "");
  const configCheck = validatePromoConfig(input as PromoConfigInput);
  if (!configCheck.ok) return { ok: false, error: configCheck.error, productIds: [], categoryIds: [] };

  const credit = isGhostCreditReward(input.rewardType);
  const data: Prisma.PromoCodeUncheckedCreateInput = {
    code,
    internalName: input.internalName.trim(),
    description: input.description?.trim() ?? "",
    active: input.active,
    rewardType: input.rewardType,
    // Only persist the fields relevant to the chosen reward type; null the rest.
    percentValue:
      input.rewardType === "PERCENT_DISCOUNT" || input.rewardType === "PERCENT_GHOST_CREDIT"
        ? input.percentValue ?? null
        : null,
    fixedAmountMad:
      input.rewardType === "FIXED_DISCOUNT" || input.rewardType === "FIXED_GHOST_CREDIT"
        ? input.fixedAmountMad ?? null
        : null,
    maxDiscountMad: input.rewardType === "PERCENT_DISCOUNT" ? input.maxDiscountMad ?? null : null,
    maxCreditMad: input.rewardType === "PERCENT_GHOST_CREDIT" ? input.maxCreditMad ?? null : null,
    creditExpiresInDays: credit ? input.creditExpiresInDays ?? null : null,
    creditExpiresAt: credit && input.creditExpiresAt ? new Date(input.creditExpiresAt) : null,
    startAt: input.startAt ? new Date(input.startAt) : null,
    endAt: input.endAt ? new Date(input.endAt) : null,
    maxTotalUses: input.maxTotalUses ?? null,
    maxUsesPerCustomer: input.maxUsesPerCustomer ?? null,
    firstOrderOnly: input.firstOrderOnly ?? false,
    // Ghost Credit codes always require login (credit must attach to a real
    // account) — force the flag on so the stored config is honest.
    loggedInOnly: credit ? true : input.loggedInOnly ?? false,
    minSubtotalMad: input.minSubtotalMad ?? null,
    maxSubtotalMad: input.maxSubtotalMad ?? null,
  };
  return {
    ok: true,
    data,
    productIds: [...new Set(input.productIds ?? [])],
    categoryIds: [...new Set(input.categoryIds ?? [])],
  };
}

export async function savePromoCode(
  input: SavePromoCodeInput,
  actor: string | null,
): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const sanitized = sanitizeSaveInput(input);
  if (!sanitized.ok || !sanitized.data) return { ok: false, error: sanitized.error };
  const data = sanitized.data;

  // Uniqueness (case-insensitive; codes are stored uppercase already).
  const clash = await prisma.promoCode.findFirst({
    where: { code: sanitized.data.code, id: input.id ? { not: input.id } : undefined },
    select: { id: true },
  });
  if (clash) return { ok: false, error: "Ce code promo existe déjà." };

  // Guard against archived/inactive product or category relations.
  if (sanitized.productIds.length > 0) {
    const activeCount = await prisma.product.count({
      where: { id: { in: sanitized.productIds }, active: true },
    });
    if (activeCount !== sanitized.productIds.length) {
      return { ok: false, error: "Un ou plusieurs produits sélectionnés sont inactifs ou introuvables." };
    }
  }
  if (sanitized.categoryIds.length > 0) {
    const activeCount = await prisma.category.count({
      where: { id: { in: sanitized.categoryIds }, active: true },
    });
    if (activeCount !== sanitized.categoryIds.length) {
      return { ok: false, error: "Une ou plusieurs catégories sélectionnées sont inactives ou introuvables." };
    }
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      let promoId: string;
      if (input.id) {
        await tx.promoCode.update({ where: { id: input.id }, data });
        await tx.promoCodeProduct.deleteMany({ where: { promoCodeId: input.id } });
        await tx.promoCodeCategory.deleteMany({ where: { promoCodeId: input.id } });
        promoId = input.id;
        await tx.promoCodeEvent.create({ data: { promoCodeId: promoId, type: "updated", createdBy: actor } });
      } else {
        const created = await tx.promoCode.create({ data: { ...data, createdBy: actor } });
        promoId = created.id;
        await tx.promoCodeEvent.create({ data: { promoCodeId: promoId, type: "created", createdBy: actor } });
      }
      if (sanitized.productIds.length > 0) {
        await tx.promoCodeProduct.createMany({
          data: sanitized.productIds.map((productId) => ({ promoCodeId: promoId, productId })),
          skipDuplicates: true,
        });
      }
      if (sanitized.categoryIds.length > 0) {
        await tx.promoCodeCategory.createMany({
          data: sanitized.categoryIds.map((categoryId) => ({ promoCodeId: promoId, categoryId })),
          skipDuplicates: true,
        });
      }
      return promoId;
    });
    return { ok: true, id };
  } catch (error) {
    console.error("[savePromoCode]", error);
    return { ok: false, error: "Impossible d'enregistrer le code promo." };
  }
}

export async function setPromoActive(id: string, active: boolean, actor: string | null): Promise<ActionResult> {
  await ensureDatabaseReady();
  const promo = await prisma.promoCode.findUnique({ where: { id }, select: { archivedAt: true } });
  if (!promo) return { ok: false, error: "Code promo introuvable." };
  if (promo.archivedAt) return { ok: false, error: "Ce code est archivé." };
  await prisma.$transaction([
    prisma.promoCode.update({ where: { id }, data: { active } }),
    prisma.promoCodeEvent.create({
      data: { promoCodeId: id, type: active ? "activated" : "deactivated", createdBy: actor },
    }),
  ]);
  return { ok: true };
}

export async function archivePromoCode(id: string, archived: boolean, actor: string | null): Promise<ActionResult> {
  await ensureDatabaseReady();
  await prisma.$transaction([
    prisma.promoCode.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null, active: archived ? false : undefined },
    }),
    prisma.promoCodeEvent.create({
      data: { promoCodeId: id, type: archived ? "archived" : "unarchived", createdBy: actor },
    }),
  ]);
  return { ok: true };
}

export async function duplicatePromoCode(id: string, actor: string | null): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const source = await prisma.promoCode.findUnique({ where: { id }, include: promoInclude });
  if (!source) return { ok: false, error: "Code promo introuvable." };

  // Find a unique "<CODE>-COPY" (or -COPY2, …).
  const base = `${source.code}-COPY`;
  let newCode = base;
  for (let n = 2; ; n++) {
    const exists = await prisma.promoCode.findUnique({ where: { code: newCode }, select: { id: true } });
    if (!exists) break;
    newCode = `${base}${n}`;
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const copy = await tx.promoCode.create({
        data: {
          code: newCode,
          internalName: `${source.internalName} (copie)`,
          description: source.description,
          active: false, // copies start disabled/draft
          rewardType: source.rewardType,
          percentValue: source.percentValue,
          fixedAmountMad: source.fixedAmountMad,
          maxDiscountMad: source.maxDiscountMad,
          maxCreditMad: source.maxCreditMad,
          creditExpiresInDays: source.creditExpiresInDays,
          creditExpiresAt: source.creditExpiresAt,
          startAt: source.startAt,
          endAt: source.endAt,
          maxTotalUses: source.maxTotalUses,
          maxUsesPerCustomer: source.maxUsesPerCustomer,
          firstOrderOnly: source.firstOrderOnly,
          loggedInOnly: source.loggedInOnly,
          minSubtotalMad: source.minSubtotalMad,
          maxSubtotalMad: source.maxSubtotalMad,
          createdBy: actor,
        },
      });
      if (source.products.length > 0) {
        await tx.promoCodeProduct.createMany({
          data: source.products.map((p) => ({ promoCodeId: copy.id, productId: p.productId })),
        });
      }
      if (source.categories.length > 0) {
        await tx.promoCodeCategory.createMany({
          data: source.categories.map((c) => ({ promoCodeId: copy.id, categoryId: c.categoryId })),
        });
      }
      await tx.promoCodeEvent.create({
        data: { promoCodeId: copy.id, type: "duplicated", note: `Copié depuis ${source.code}`, createdBy: actor },
      });
      return copy;
    });
    return { ok: true, id: created.id };
  } catch (error) {
    console.error("[duplicatePromoCode]", error);
    return { ok: false, error: "Impossible de dupliquer le code promo." };
  }
}

/** Delete an unused DRAFT code only (never one with redemptions/history). */
export async function deletePromoCode(id: string): Promise<ActionResult> {
  await ensureDatabaseReady();
  const usage = await prisma.promoRedemption.count({ where: { promoCodeId: id } });
  if (usage > 0) {
    return { ok: false, error: "Ce code a déjà été utilisé et ne peut pas être supprimé. Archivez-le plutôt." };
  }
  await prisma.promoCode.delete({ where: { id } });
  return { ok: true };
}

// ── Shared evaluation core (checkout preview + in-tx reservation) ─────────────

interface UsageContext {
  isFirstOrder: boolean;
  customerUses: number;
}

async function loadUsageContext(
  client: Tx | typeof prisma,
  promoId: string,
  customerId: string | null,
  customerEmail: string,
  excludeOrderId?: string,
): Promise<UsageContext> {
  const email = customerEmail.trim().toLowerCase();
  const [priorOrders, customerUses] = await Promise.all([
    client.order.count({
      where: {
        // Exclude the order being created so a legitimate first order is not
        // counted against its own first-order-only check.
        id: excludeOrderId ? { not: excludeOrderId } : undefined,
        AND: [
          customerId ? { OR: [{ customerId }, { customerEmail: email }] } : { customerEmail: email },
        ],
        status: { notIn: ["cancelled", "rejected"] },
      },
    }),
    client.promoRedemption.count({
      where: {
        promoCodeId: promoId,
        status: { in: CONSUMING_REDEMPTION_STATUSES },
        OR: [customerId ? { customerId } : { customerEmail: email }, { customerEmail: email }],
      },
    }),
  ]);
  return { isFirstOrder: priorOrders === 0, customerUses };
}

function toEligibilityLines(
  lines: { lineKey: string; productId: string; categoryId: string | null; unitPriceMad: number; quantity: number }[],
): EligibilityLine[] {
  return lines.map((l) => ({
    lineId: l.lineKey,
    productId: l.productId,
    categoryId: l.categoryId,
    unitPriceMad: l.unitPriceMad,
    quantity: l.quantity,
  }));
}

interface EvaluatedPromo {
  ok: boolean;
  error?: string;
  requiresLogin?: boolean;
  promoRow?: PromoRow;
  eligibleLineKeys?: string[];
  eligibleSubtotalMad?: number;
  discountMad?: number;
  creditMad?: number;
}

/** Core evaluation shared by the checkout preview and the in-tx reservation. */
async function evaluateResolved(
  client: Tx | typeof prisma,
  rawCode: string,
  lines: { lineKey: string; productId: string; categoryId: string | null; unitPriceMad: number; quantity: number }[],
  ctx: { isLoggedIn: boolean; customerId: string | null; customerEmail: string; now: Date; excludeOrderId?: string },
): Promise<EvaluatedPromo> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { ok: false, error: "Veuillez saisir un code promo." };

  const promoRow = await client.promoCode.findUnique({ where: { code }, include: promoInclude });
  if (!promoRow) return { ok: false, error: "Code promo invalide." };

  const eligibility = computeEligibility(toEligibilityLines(lines), {
    productIds: promoRow.products.map((p) => p.productId),
    categoryIds: promoRow.categories.map((c) => c.categoryId),
  });

  const usage = await loadUsageContext(client, promoRow.id, ctx.customerId, ctx.customerEmail, ctx.excludeOrderId);
  const redeemable = validateRedeemability(
    {
      rewardType: promoRow.rewardType as PromoRewardType,
      active: promoRow.active,
      archivedAt: promoRow.archivedAt,
      startAt: promoRow.startAt,
      endAt: promoRow.endAt,
      maxTotalUses: promoRow.maxTotalUses,
      reservedUses: promoRow.reservedUses,
      maxUsesPerCustomer: promoRow.maxUsesPerCustomer,
      firstOrderOnly: promoRow.firstOrderOnly,
      loggedInOnly: promoRow.loggedInOnly,
      minSubtotalMad: promoRow.minSubtotalMad,
      maxSubtotalMad: promoRow.maxSubtotalMad,
    },
    {
      now: ctx.now,
      isLoggedIn: ctx.isLoggedIn,
      isFirstOrder: usage.isFirstOrder,
      customerUses: usage.customerUses,
      eligibleSubtotalMad: eligibility.eligibleSubtotalMad,
    },
  );
  if (!redeemable.ok) {
    return {
      ok: false,
      error: redeemable.error,
      requiresLogin: isGhostCreditReward(promoRow.rewardType as PromoRewardType) && !ctx.isLoggedIn,
    };
  }

  const rewardConfig = {
    rewardType: promoRow.rewardType as PromoRewardType,
    percentValue: decToNum(promoRow.percentValue),
    fixedAmountMad: promoRow.fixedAmountMad,
    maxDiscountMad: promoRow.maxDiscountMad,
    maxCreditMad: promoRow.maxCreditMad,
  };
  const discountMad = computeDiscount(rewardConfig, eligibility.eligibleSubtotalMad);
  const creditMad = computeGhostCredit(rewardConfig, eligibility.eligibleSubtotalMad);

  return {
    ok: true,
    promoRow,
    eligibleLineKeys: eligibility.eligibleLineIds,
    eligibleSubtotalMad: eligibility.eligibleSubtotalMad,
    discountMad,
    creditMad,
  };
}

/** Checkout: validate a code against a cart and return a customer-facing preview. */
export async function evaluatePromoForItems(
  rawCode: string,
  items: { productId: string; quantity: number }[],
  ctx: { isLoggedIn: boolean; customerId: string | null; customerEmail: string },
): Promise<PromoValidationResultDTO> {
  await ensureDatabaseReady();
  const lines = await resolveCartLines(items);
  if (lines.length === 0) return { ok: false, error: "Votre panier est vide." };

  const result = await evaluateResolved(prisma, rawCode, lines, {
    isLoggedIn: ctx.isLoggedIn,
    customerId: ctx.customerId,
    customerEmail: ctx.customerEmail,
    now: new Date(),
  });
  if (!result.ok || !result.promoRow) {
    return { ok: false, error: result.error, requiresLogin: result.requiresLogin };
  }

  const preview: PromoPreviewDTO = {
    code: result.promoRow.code,
    rewardType: result.promoRow.rewardType as PromoRewardType,
    rewardKind: rewardKind(result.promoRow.rewardType as PromoRewardType),
    eligibleSubtotalMad: result.eligibleSubtotalMad ?? 0,
    eligibleLineCount: result.eligibleLineKeys?.length ?? 0,
    eligibleLineKeys: result.eligibleLineKeys ?? [],
    discountMad: result.discountMad ?? 0,
    creditMad: result.creditMad ?? 0,
    percentValue: decToNum(result.promoRow.percentValue),
    maxCreditMad: result.promoRow.maxCreditMad,
  };
  return { ok: true, preview };
}

// ── Order creation: atomic reservation + snapshot ────────────────────────────

export interface ReservePromoParams {
  rawCode: string;
  orderId: string;
  lines: {
    lineKey: string;
    productId: string;
    categoryId: string | null;
    unitPriceMad: number;
    quantity: number;
  }[];
  /** Map from lineKey (slug/variant id) to the created OrderItem id. */
  lineKeyToOrderItemId: Map<string, string>;
  isLoggedIn: boolean;
  customerId: string | null;
  customerEmail: string;
  now: Date;
}

export interface ReservePromoResult {
  ok: boolean;
  error?: string;
  discountMad: number;
  expectedCreditMad: number;
}

/**
 * Re-validate the promo inside the order transaction, atomically claim a usage
 * slot (race-safe conditional increment on reservedUses — this decides the
 * "final available use"), and persist the immutable OrderPromotionSnapshot +
 * a reserved PromoRedemption. Throws on a genuine failure so the whole order
 * rolls back (the customer is never charged a wrong total).
 */
export async function reservePromoInTx(tx: Tx, params: ReservePromoParams): Promise<ReservePromoResult> {
  const result = await evaluateResolved(tx, params.rawCode, params.lines, {
    isLoggedIn: params.isLoggedIn,
    customerId: params.customerId,
    customerEmail: params.customerEmail,
    now: params.now,
    excludeOrderId: params.orderId,
  });
  if (!result.ok || !result.promoRow) {
    return { ok: false, error: result.error, discountMad: 0, expectedCreditMad: 0 };
  }
  const promo = result.promoRow;

  // Atomic "final available use" guard: only succeeds if under the total limit.
  const claim = await tx.promoCode.updateMany({
    where: {
      id: promo.id,
      OR: [{ maxTotalUses: null }, { reservedUses: { lt: promo.maxTotalUses ?? 0 } }],
    },
    data: { reservedUses: { increment: 1 } },
  });
  if (claim.count !== 1) {
    return { ok: false, error: "Ce code promo a atteint sa limite d'utilisation.", discountMad: 0, expectedCreditMad: 0 };
  }

  const rewardType = promo.rewardType as PromoRewardType;
  const eligibleSubtotalMad = result.eligibleSubtotalMad ?? 0;
  const discountMad = result.discountMad ?? 0;
  const expectedCreditMad = result.creditMad ?? 0;

  // Per-line allocation (whole MAD, sums exactly to discountMad) → orderItem ids.
  const eligibleLines = params.lines.filter((l) => result.eligibleLineKeys?.includes(l.lineKey));
  const allocations = allocateDiscount(
    discountMad,
    eligibleLines.map((l) => ({
      lineId: l.lineKey,
      productId: l.productId,
      categoryId: l.categoryId,
      unitPriceMad: l.unitPriceMad,
      quantity: l.quantity,
    })),
  );
  const eligibleOrderItemIds = eligibleLines
    .map((l) => params.lineKeyToOrderItemId.get(l.lineKey))
    .filter((v): v is string => Boolean(v));
  const lineAllocations = allocations
    .map((a) => ({ orderItemId: params.lineKeyToOrderItemId.get(a.lineId) ?? null, discountMad: a.discountMad }))
    .filter((a) => a.orderItemId);

  const creditExpiresAt = isGhostCreditReward(rewardType)
    ? promo.creditExpiresAt ??
      (promo.creditExpiresInDays != null
        ? new Date(params.now.getTime() + promo.creditExpiresInDays * 24 * 60 * 60 * 1000)
        : null)
    : null;

  await tx.orderPromotionSnapshot.create({
    data: {
      orderId: params.orderId,
      promoCodeId: promo.id,
      code: promo.code,
      rewardType,
      configuredPercent: promo.percentValue,
      configuredFixedMad: promo.fixedAmountMad,
      maxDiscountMad: promo.maxDiscountMad,
      maxCreditMad: promo.maxCreditMad,
      eligibleSubtotalMad,
      discountMad,
      expectedCreditMad,
      creditExpiresAt,
      eligibleLineItemIds: eligibleOrderItemIds,
      lineAllocations,
      validationContext: {
        isLoggedIn: params.isLoggedIn,
        customerEmail: params.customerEmail.trim().toLowerCase(),
        evaluatedAt: params.now.toISOString(),
      },
    },
  });

  await tx.promoRedemption.create({
    data: {
      promoCodeId: promo.id,
      orderId: params.orderId,
      customerId: params.customerId,
      customerEmail: params.customerEmail.trim().toLowerCase(),
      status: "reserved",
    },
  });

  return { ok: true, discountMad, expectedCreditMad };
}

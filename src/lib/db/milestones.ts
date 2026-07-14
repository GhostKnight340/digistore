import "server-only";

import { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import { grantCreditTx, debitCreditTx, ghostCreditInactivityDays } from "./ghostCredit";
import { milestoneGrantKey, milestoneReversalKey } from "@/lib/promo/ledgerMath";
import {
  milestonesToGrant,
  milestonesToReverse,
  computeMilestoneProgress,
  type MilestoneRule,
} from "@/lib/promo/milestones";
import type {
  ActionResult,
  AdminMilestoneDTO,
  AdminMilestoneDetailDTO,
  SaveMilestoneInput,
  MilestoneProgressDTO,
} from "@/lib/dto";

type Tx = Prisma.TransactionClient;

// Orders whose value counts toward qualifying lifetime spend: paid + completed.
const REVENUE_STATUSES = ["payment_confirmed", "delivered"];

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Qualifying lifetime spend for milestones = Σ over the customer's paid+completed
 * orders of (final external payable + Ghost Credit redeemed) — i.e. the order
 * value AFTER immediate promo discounts but INCLUDING Ghost Credit the customer
 * spent (they completed a real purchase). Refunded/cancelled/rejected/pending
 * orders are excluded (not in REVENUE_STATUSES), so a refund reduces this sum.
 * `Order.totalMad` is the discounted external payable; `ghostCreditAppliedMad`
 * is the credit redeemed — their sum equals subtotal − discount.
 */
export async function computeQualifyingSpend(client: Tx | typeof prisma, customerId: string): Promise<number> {
  const agg = await client.order.aggregate({
    where: { customerId, status: { in: REVENUE_STATUSES } },
    _sum: { totalMad: true, ghostCreditAppliedMad: true },
  });
  return (agg._sum.totalMad ?? 0) + (agg._sum.ghostCreditAppliedMad ?? 0);
}

const milestoneRuleSelect = {
  id: true,
  thresholdMad: true,
  rewardMad: true,
  active: true,
  archivedAt: true,
  startsAt: true,
  endsAt: true,
} satisfies Prisma.SpendingMilestoneSelect;

// ── Grant on order completion ────────────────────────────────────────────────

/**
 * Evaluate + grant any spending milestones a paid+completed order newly crosses.
 * Idempotent: `SpendingMilestoneGrant` is unique per (milestone, customer) and
 * each reward has a unique ledger key, so duplicate webhooks / concurrent orders
 * / retries can never double-award. Each milestone reward resets the inactivity
 * timer (qualifying reward). Best-effort; safe to call from every completion path.
 */
export async function grantMilestonesForCompletedOrder(orderId: string): Promise<void> {
  const inactivityDays = await ghostCreditInactivityDays();
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { customerId: true, status: true },
      });
      if (!order?.customerId || !REVENUE_STATUSES.includes(order.status)) return;
      const customerId = order.customerId;

      const [spend, milestones, grantedRows] = await Promise.all([
        computeQualifyingSpend(tx, customerId),
        tx.spendingMilestone.findMany({ where: { archivedAt: null }, select: milestoneRuleSelect }),
        tx.spendingMilestoneGrant.findMany({ where: { customerId }, select: { milestoneId: true } }),
      ]);
      // Once ever per customer/milestone (includes previously reversed grants).
      const alreadyIds = new Set(grantedRows.map((g) => g.milestoneId));
      const now = new Date();
      const toGrant = milestonesToGrant(milestones as MilestoneRule[], spend, alreadyIds, now);

      for (const m of toGrant) {
        try {
          await tx.spendingMilestoneGrant.create({
            data: {
              milestoneId: m.id,
              customerId,
              orderId,
              thresholdMad: m.thresholdMad,
              rewardMad: m.rewardMad,
              qualifyingSpendMad: spend,
              status: "granted",
            },
          });
        } catch (error) {
          // Concurrent order finalizing for the same customer already granted it.
          if (isUniqueViolation(error)) continue;
          throw error;
        }
        await grantCreditTx(tx, {
          customerId,
          amountMad: m.rewardMad,
          reason: "spending_milestone_reward",
          idempotencyKey: milestoneGrantKey(m.id, customerId),
          orderId,
          milestoneId: m.id,
          thresholdMad: m.thresholdMad,
          qualifyingSpendMad: spend,
          resetsExpiration: true,
          inactivityDays,
          earnedAt: now,
          source: "system",
          note: `Palier de dépenses ${m.thresholdMad} DH`,
        });
      }
    });
  } catch (error) {
    console.error("[milestones] grant failed", orderId, error);
  }
}

// ── Reverse on refund ────────────────────────────────────────────────────────

/**
 * After a refund reduces qualifying spend, reverse granted milestones whose
 * threshold now exceeds it — HIGHEST threshold first. Appends a reversal debit
 * (never edits history), marks the grant reversed, and freezes the wallet if the
 * reward was already spent (no negative balance). Idempotent per (milestone,
 * customer).
 */
export async function reverseMilestonesForOrder(orderId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
      if (!order?.customerId) return;
      const customerId = order.customerId;

      const spend = await computeQualifyingSpend(tx, customerId);
      const granted = await tx.spendingMilestoneGrant.findMany({
        where: { customerId, status: "granted" },
        select: { id: true, milestoneId: true, thresholdMad: true, rewardMad: true },
      });
      const toReverse = milestonesToReverse(
        granted.map((g) => ({ milestoneId: g.milestoneId, thresholdMad: g.thresholdMad })),
        spend,
      );

      for (const r of toReverse) {
        const grant = granted.find((g) => g.milestoneId === r.milestoneId);
        if (!grant) continue;
        const debit = await debitCreditTx(tx, {
          customerId,
          amountMad: grant.rewardMad,
          reason: "milestone_reversal",
          idempotencyKey: milestoneReversalKey(r.milestoneId, customerId),
          orderId,
          milestoneId: r.milestoneId,
          thresholdMad: r.thresholdMad,
          source: "system",
          note: `Reprise palier ${r.thresholdMad} DH (remboursement)`,
          allowNegative: false,
        });
        await tx.spendingMilestoneGrant.updateMany({
          where: { id: grant.id, status: "granted" },
          data: { status: "reversed", reversedAt: new Date() },
        });
        if (debit.wouldGoNegative) {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              walletFrozen: true,
              walletFrozenReason: `Reprise palier ${r.thresholdMad} DH (commande ${orderId}) : récompense déjà dépensée — révision requise.`,
            },
          });
        }
      }
    });
  } catch (error) {
    console.error("[milestones] reverse failed", orderId, error);
  }
}

// ── Customer progress (account page) ─────────────────────────────────────────

export async function getMilestoneProgressForCustomer(customerId: string): Promise<MilestoneProgressDTO> {
  await ensureDatabaseReady();
  const now = new Date();
  const [spend, milestones, grants] = await Promise.all([
    computeQualifyingSpend(prisma, customerId),
    prisma.spendingMilestone.findMany({
      where: { archivedAt: null },
      orderBy: [{ thresholdMad: "asc" }],
      select: { ...milestoneRuleSelect, publicTitle: true, publicDescription: true, displayOrder: true },
    }),
    prisma.spendingMilestoneGrant.findMany({
      where: { customerId, status: "granted" },
      select: { milestoneId: true },
    }),
  ]);
  const unlocked = new Set(grants.map((g) => g.milestoneId));
  const progress = computeMilestoneProgress(milestones as MilestoneRule[], spend, unlocked, now);

  const liveMilestones = (milestones as (MilestoneRule & { publicTitle: string })[]).filter(
    (m) => m.active && !m.archivedAt && (!m.startsAt || new Date(m.startsAt) <= now) && (!m.endsAt || new Date(m.endsAt) >= now),
  );

  return {
    qualifyingSpendMad: spend,
    next: progress.next,
    allUnlocked: progress.allUnlocked,
    track: liveMilestones
      .sort((a, b) => a.thresholdMad - b.thresholdMad)
      .map((m) => ({
        id: m.id,
        title: m.publicTitle,
        thresholdMad: m.thresholdMad,
        rewardMad: m.rewardMad,
        state: unlocked.has(m.id)
          ? "unlocked"
          : progress.next?.id === m.id
            ? "current"
            : "locked",
      })),
  };
}

// ── Admin CRUD + reporting ───────────────────────────────────────────────────

function buildAdminDTO(row: {
  id: string;
  internalName: string;
  publicTitle: string;
  publicDescription: string;
  thresholdMad: number;
  rewardMad: number;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  displayOrder: number;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
}): AdminMilestoneDTO {
  return {
    id: row.id,
    internalName: row.internalName,
    publicTitle: row.publicTitle,
    publicDescription: row.publicDescription,
    thresholdMad: row.thresholdMad,
    rewardMad: row.rewardMad,
    active: row.active,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    displayOrder: row.displayOrder,
    version: row.version,
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMilestones(): Promise<AdminMilestoneDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.spendingMilestone.findMany({
    orderBy: [{ archivedAt: "asc" }, { displayOrder: "asc" }, { thresholdMad: "asc" }],
  });
  return rows.map(buildAdminDTO);
}

export async function getMilestoneDetail(id: string): Promise<AdminMilestoneDetailDTO | null> {
  await ensureDatabaseReady();
  const row = await prisma.spendingMilestone.findUnique({ where: { id } });
  if (!row) return null;
  const [grantsGranted, grantsReversed, creditAgg] = await Promise.all([
    prisma.spendingMilestoneGrant.count({ where: { milestoneId: id, status: "granted" } }),
    prisma.spendingMilestoneGrant.count({ where: { milestoneId: id, status: "reversed" } }),
    prisma.ghostCreditTransaction.aggregate({
      where: { milestoneId: id, direction: "credit", status: "active", reason: "spending_milestone_reward" },
      _sum: { amountMad: true },
    }),
  ]);
  return {
    milestone: buildAdminDTO(row),
    customersUnlocked: grantsGranted,
    reversedCount: grantsReversed,
    totalRewardGrantedMad: creditAgg._sum.amountMad ?? 0,
  };
}

function validateMilestoneInput(input: SaveMilestoneInput): string | null {
  if (!input.internalName?.trim()) return "Le nom interne est requis.";
  if (!input.publicTitle?.trim()) return "Le titre client est requis.";
  if (!Number.isFinite(input.thresholdMad) || input.thresholdMad <= 0) return "Le seuil doit être supérieur à 0.";
  if (!Number.isFinite(input.rewardMad) || input.rewardMad <= 0) return "La récompense doit être supérieure à 0.";
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    return "La date de fin doit être postérieure à la date de début.";
  }
  return null;
}

/**
 * Create or update a milestone. Editing the THRESHOLD or REWARD of a milestone
 * that already has grants archives the old row and creates a NEW one (new id,
 * version+1), so historical grants stay linked to the exact version that
 * produced them. Other edits (titles, dates, order, active) update in place.
 */
export async function saveMilestone(
  input: SaveMilestoneInput,
  actor: string | null,
): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const error = validateMilestoneInput(input);
  if (error) return { ok: false, error };

  const thresholdMad = Math.round(input.thresholdMad);
  const rewardMad = Math.round(input.rewardMad);
  const data = {
    internalName: input.internalName.trim(),
    publicTitle: input.publicTitle.trim(),
    publicDescription: input.publicDescription?.trim() ?? "",
    thresholdMad,
    rewardMad,
    active: input.active,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    displayOrder: input.displayOrder ?? 0,
  };

  try {
    if (!input.id) {
      const created = await prisma.spendingMilestone.create({ data: { ...data, createdBy: actor } });
      return { ok: true, id: created.id };
    }

    const existing = await prisma.spendingMilestone.findUnique({
      where: { id: input.id },
      select: { thresholdMad: true, rewardMad: true, version: true },
    });
    if (!existing) return { ok: false, error: "Palier introuvable." };

    const amountChanged = existing.thresholdMad !== thresholdMad || existing.rewardMad !== rewardMad;
    const hasGrants = amountChanged
      ? (await prisma.spendingMilestoneGrant.count({ where: { milestoneId: input.id } })) > 0
      : false;

    if (amountChanged && hasGrants) {
      // Versioned change: archive old, create new so historical grants are safe.
      const newId = await prisma.$transaction(async (tx) => {
        await tx.spendingMilestone.update({
          where: { id: input.id },
          data: { archivedAt: new Date(), active: false },
        });
        const created = await tx.spendingMilestone.create({
          data: { ...data, version: existing.version + 1, createdBy: actor },
        });
        return created.id;
      });
      return { ok: true, id: newId };
    }

    await prisma.spendingMilestone.update({ where: { id: input.id }, data });
    return { ok: true, id: input.id };
  } catch (e) {
    console.error("[saveMilestone]", e);
    return { ok: false, error: "Impossible d'enregistrer le palier." };
  }
}

export async function setMilestoneActive(id: string, active: boolean): Promise<ActionResult> {
  await ensureDatabaseReady();
  const m = await prisma.spendingMilestone.findUnique({ where: { id }, select: { archivedAt: true } });
  if (!m) return { ok: false, error: "Palier introuvable." };
  if (m.archivedAt) return { ok: false, error: "Ce palier est archivé." };
  await prisma.spendingMilestone.update({ where: { id }, data: { active } });
  return { ok: true };
}

export async function archiveMilestone(id: string, archived: boolean): Promise<ActionResult> {
  await ensureDatabaseReady();
  await prisma.spendingMilestone.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null, active: archived ? false : undefined },
  });
  return { ok: true };
}

export async function duplicateMilestone(id: string, actor: string | null): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const src = await prisma.spendingMilestone.findUnique({ where: { id } });
  if (!src) return { ok: false, error: "Palier introuvable." };
  const created = await prisma.spendingMilestone.create({
    data: {
      internalName: `${src.internalName} (copie)`,
      publicTitle: src.publicTitle,
      publicDescription: src.publicDescription,
      thresholdMad: src.thresholdMad,
      rewardMad: src.rewardMad,
      active: false,
      startsAt: src.startsAt,
      endsAt: src.endsAt,
      displayOrder: src.displayOrder + 1,
      createdBy: actor,
    },
  });
  return { ok: true, id: created.id };
}

export async function reorderMilestones(orderedIds: string[]): Promise<ActionResult> {
  await ensureDatabaseReady();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.spendingMilestone.update({ where: { id }, data: { displayOrder: index } }),
    ),
  );
  return { ok: true };
}

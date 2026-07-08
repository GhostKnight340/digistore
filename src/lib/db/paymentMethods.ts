import "server-only";

import type { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { describeOrderPaymentMethod } from "@/lib/paymentMethod";
import type {
  PaymentMethodDTO,
  PaymentMethodDetails,
  PaymentMethodType,
  SaveMethodInput,
  SupportConfigDTO,
  PaymentConfigDTO,
  ActionResult,
} from "@/lib/dto";

type PaymentMethodRow = {
  id: string;
  type: string;
  name: string;
  subtitle: string;
  customerNote: string;
  status: string;
  visible: boolean;
  sortOrder: number;
  logoUrl: string | null;
  initials: string;
  accentColor: string;
  logoType: string;
  details: unknown;
  proofRequired: boolean;
  internalNote: string;
  minAmount: number | null;
  maxAmount: number | null;
  regions: string[];
  archivedAt: Date | null;
  updatedAt: Date;
};

function rowToMethod(row: PaymentMethodRow): PaymentMethodDTO {
  return {
    id: row.id,
    type: row.type as PaymentMethodType,
    name: row.name,
    subtitle: row.subtitle,
    customerNote: row.customerNote,
    status: row.status as PaymentMethodDTO["status"],
    visible: row.visible,
    sortOrder: row.sortOrder,
    logoUrl: row.logoUrl,
    initials: row.initials,
    accentColor: row.accentColor,
    logoType: row.logoType as PaymentMethodDTO["logoType"],
    details: (row.details as PaymentMethodDetails) ?? {},
    proofRequired: row.proofRequired,
    internalNote: row.internalNote,
    minAmount: row.minAmount,
    maxAmount: row.maxAmount,
    regions: row.regions,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToSupport(row: {
  id: string;
  whatsappNumber: string;
  supportEmail: string;
  instructions: string;
} | null): SupportConfigDTO {
  return row
    ? {
        id: row.id,
        whatsappNumber: row.whatsappNumber,
        supportEmail: row.supportEmail,
        instructions: row.instructions,
      }
    : {
        id: "",
        whatsappNumber: "+212 600 000 000",
        supportEmail: "support@ghost.ma",
        instructions: "",
      };
}

async function ensureSupportDefaults(): Promise<void> {
  await ensureDatabaseReady();
  const support = await prisma.supportConfig.findFirst();
  if (!support) {
    await prisma.supportConfig.create({
      data: {
        whatsappNumber: "+212 600 000 000",
        supportEmail: "support@ghost.ma",
        instructions: "",
      },
    });
  }
}

function isUsable(row: PaymentMethodRow): boolean {
  return row.status === "active" && row.visible && !row.archivedAt;
}

/** Methods a customer should see at checkout: active + visible + not archived. */
export async function getPublicPaymentMethods(): Promise<PaymentConfigDTO> {
  await ensureDatabaseReady();
  const [methods, support] = await Promise.all([
    prisma.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.supportConfig.findFirst(),
  ]);
  return {
    methods: methods.filter(isUsable).map(rowToMethod),
    support: rowToSupport(support),
  };
}

/** All payment methods as DTOs (incl. archived), for order-side resolution. */
export async function getAllPaymentMethodDTOs(): Promise<PaymentMethodDTO[]> {
  await ensureDatabaseReady();
  const methods = await prisma.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } });
  return methods.map(rowToMethod);
}

/**
 * Friendly payment-method label + selected bank name for an order. Used by
 * Discord notifications and the admin order detail so both new bank-transfer
 * orders and legacy per-bank orders read cleanly.
 */
export async function resolveOrderPaymentSummary(order: {
  paymentMethod: string;
  bankAccountId?: string | null;
}): Promise<{ label: string; bankName: string | null }> {
  const methods = await getAllPaymentMethodDTOs();
  return describeOrderPaymentMethod(order, methods);
}

/** Every method (incl. inactive/hidden/archived), for the admin table. */
export async function getAdminPaymentMethods(): Promise<PaymentConfigDTO> {
  await ensureSupportDefaults();

  const [methods, support] = await Promise.all([
    timeAdmin(
      "admin.paymentMethods",
      "paymentMethod.findMany",
      () => prisma.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } }),
      (rows) => rows.length,
    ),
    timeAdmin(
      "admin.paymentMethods",
      "supportConfig.findFirst",
      () => prisma.supportConfig.findFirst(),
      (row) => (row ? 1 : 0),
    ),
  ]);

  return {
    methods: methods.map(rowToMethod),
    support: rowToSupport(support),
  };
}

export async function createPaymentMethod(
  data: SaveMethodInput,
): Promise<ActionResult & { id?: string }> {
  try {
    const count = await prisma.paymentMethod.count();
    const method = await prisma.paymentMethod.create({
      data: { ...data, details: data.details as Prisma.InputJsonValue, sortOrder: count },
    });
    return { ok: true, id: method.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Ajout impossible." };
  }
}

export async function updatePaymentMethod(
  id: string,
  data: Partial<SaveMethodInput>,
): Promise<ActionResult> {
  try {
    await prisma.paymentMethod.update({
      where: { id },
      data: { ...data, details: data.details as Prisma.InputJsonValue | undefined },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Mise à jour impossible." };
  }
}

export async function reorderPaymentMethods(ids: string[]): Promise<ActionResult> {
  try {
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.paymentMethod.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Réorganisation impossible." };
  }
}

export async function archivePaymentMethod(id: string): Promise<ActionResult> {
  try {
    await prisma.paymentMethod.update({
      where: { id },
      data: { archivedAt: new Date(), visible: false },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Archivage impossible." };
  }
}

export async function restorePaymentMethod(id: string): Promise<ActionResult> {
  try {
    await prisma.paymentMethod.update({ where: { id }, data: { archivedAt: null } });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Restauration impossible." };
  }
}

export async function deletePaymentMethod(id: string): Promise<ActionResult> {
  try {
    const referenced = await prisma.order.count({ where: { paymentMethod: id } });
    if (referenced > 0) {
      return {
        ok: false,
        error: "Des commandes utilisent cette méthode. Archivez-la plutôt que de la supprimer.",
      };
    }
    await prisma.paymentMethod.delete({ where: { id } });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Suppression impossible." };
  }
}

export async function updateSupportConfig(data: {
  whatsappNumber: string;
  supportEmail: string;
  instructions: string;
}): Promise<ActionResult> {
  try {
    const existing = await prisma.supportConfig.findFirst();
    if (existing) {
      await prisma.supportConfig.update({ where: { id: existing.id }, data });
    } else {
      await prisma.supportConfig.create({ data });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Mise à jour impossible." };
  }
}

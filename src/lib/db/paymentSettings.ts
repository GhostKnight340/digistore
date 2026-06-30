import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import type {
  BankDTO,
  CryptoWalletDTO,
  PaymentMethodConfigDTO,
  SupportConfigDTO,
  PaymentConfigDTO,
  ActionResult,
} from "@/lib/dto";

const DEFAULT_METHODS: PaymentMethodConfigDTO[] = [
  {
    method: "bank",
    enabled: true,
    proofRequired: true,
    paypalEmail: "",
    cardMessage: "",
    instructions: "Veuillez effectuer le virement et importer le justificatif.",
  },
  {
    method: "usdt",
    enabled: true,
    proofRequired: true,
    paypalEmail: "",
    cardMessage: "",
    instructions: "Envoyez exactement le montant indiqué et importez la capture d’écran.",
  },
  {
    method: "paypal",
    enabled: true,
    proofRequired: false,
    paypalEmail: "",
    cardMessage: "",
    instructions: "Effectuez le paiement PayPal et cliquez sur le bouton ci-dessous.",
  },
  {
    method: "card",
    enabled: false,
    proofRequired: false,
    paypalEmail: "",
    cardMessage: "Paiement par carte bientôt disponible.",
    instructions: "",
  },
];

let defaultsPromise: Promise<void> | null = null;

async function ensureDefaults(): Promise<void> {
  defaultsPromise ??= runEnsureDefaults();
  return defaultsPromise;
}

async function runEnsureDefaults(): Promise<void> {
  await ensureDatabaseReady();
  const count = await prisma.paymentMethodConfig.count();
  if (count === 0) {
    await prisma.paymentMethodConfig.createMany({
      data: DEFAULT_METHODS,
      skipDuplicates: true,
    });
  }

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

function rowToMethod(row: {
  method: string;
  enabled: boolean;
  proofRequired: boolean;
  paypalEmail: string;
  cardMessage: string;
  instructions: string;
}): PaymentMethodConfigDTO {
  return {
    method: row.method,
    enabled: row.enabled,
    proofRequired: row.proofRequired,
    paypalEmail: row.paypalEmail,
    cardMessage: row.cardMessage,
    instructions: row.instructions,
  };
}

function rowToBank(row: {
  id: string;
  name: string;
  accountHolder: string;
  accountNumber: string;
  rib: string;
  iban: string;
  swift: string;
  instructions: string;
  enabled: boolean;
  sortOrder: number;
}): BankDTO {
  return {
    id: row.id,
    name: row.name,
    accountHolder: row.accountHolder,
    accountNumber: row.accountNumber,
    rib: row.rib,
    iban: row.iban,
    swift: row.swift,
    instructions: row.instructions,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  };
}

function rowToWallet(row: {
  id: string;
  coin: string;
  network: string;
  address: string;
  label: string;
  instructions: string;
  enabled: boolean;
}): CryptoWalletDTO {
  return {
    id: row.id,
    coin: row.coin,
    network: row.network,
    address: row.address,
    label: row.label,
    instructions: row.instructions,
    enabled: row.enabled,
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

export async function getPaymentConfig(): Promise<PaymentConfigDTO> {
  await ensureDefaults();

  const [methods, banks, wallets, support] = await Promise.all([
    prisma.paymentMethodConfig.findMany({ orderBy: { method: "asc" } }),
    prisma.bank.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.cryptoWallet.findMany({ where: { enabled: true } }),
    prisma.supportConfig.findFirst(),
  ]);

  const methodsMap: Record<string, PaymentMethodConfigDTO> = {};
  for (const method of methods) methodsMap[method.method] = rowToMethod(method);

  return {
    methods: methodsMap,
    banks: banks.map(rowToBank),
    wallets: wallets.map(rowToWallet),
    support: rowToSupport(support),
  };
}

export async function getAdminPaymentConfig(): Promise<PaymentConfigDTO> {
  await ensureDefaults();

  const [methods, banks, wallets, support] = await Promise.all([
    timeAdmin(
      "admin.paymentSettings",
      "paymentMethodConfig.findMany",
      () => prisma.paymentMethodConfig.findMany({ orderBy: { method: "asc" } }),
      (rows) => rows.length,
    ),
    timeAdmin(
      "admin.paymentSettings",
      "bank.findMany",
      () => prisma.bank.findMany({ orderBy: { sortOrder: "asc" } }),
      (rows) => rows.length,
    ),
    timeAdmin(
      "admin.paymentSettings",
      "cryptoWallet.findMany",
      () => prisma.cryptoWallet.findMany(),
      (rows) => rows.length,
    ),
    timeAdmin(
      "admin.paymentSettings",
      "supportConfig.findFirst",
      () => prisma.supportConfig.findFirst(),
      (row) => (row ? 1 : 0),
    ),
  ]);

  const methodsMap: Record<string, PaymentMethodConfigDTO> = {};
  for (const method of methods) methodsMap[method.method] = rowToMethod(method);

  return {
    methods: methodsMap,
    banks: banks.map(rowToBank),
    wallets: wallets.map(rowToWallet),
    support: rowToSupport(support),
  };
}

export async function updateMethodConfig(
  method: string,
  data: Partial<{
    enabled: boolean;
    proofRequired: boolean;
    paypalEmail: string;
    cardMessage: string;
    instructions: string;
  }>,
): Promise<ActionResult> {
  try {
    await prisma.paymentMethodConfig.upsert({
      where: { method },
      update: data,
      create: {
        method,
        enabled: data.enabled ?? true,
        proofRequired: data.proofRequired ?? true,
        paypalEmail: data.paypalEmail ?? "",
        cardMessage: data.cardMessage ?? "",
        instructions: data.instructions ?? "",
      },
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Mise à jour impossible.",
    };
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
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Mise à jour impossible.",
    };
  }
}

export async function addBank(data: {
  name: string;
  accountHolder: string;
  accountNumber: string;
  rib: string;
  iban: string;
  swift: string;
  instructions: string;
}): Promise<ActionResult & { id?: string }> {
  try {
    const count = await prisma.bank.count();
    const bank = await prisma.bank.create({
      data: { ...data, enabled: true, sortOrder: count },
    });
    return { ok: true, id: bank.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ajout impossible.",
    };
  }
}

export async function updateBank(
  id: string,
  data: Partial<{
    name: string;
    accountHolder: string;
    accountNumber: string;
    rib: string;
    iban: string;
    swift: string;
    instructions: string;
    enabled: boolean;
    sortOrder: number;
  }>,
): Promise<ActionResult> {
  try {
    await prisma.bank.update({ where: { id }, data });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Mise à jour impossible.",
    };
  }
}

export async function deleteBank(id: string): Promise<ActionResult> {
  try {
    await prisma.bank.delete({ where: { id } });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Suppression impossible.",
    };
  }
}

export async function addWallet(data: {
  network: string;
  address: string;
  label: string;
  instructions: string;
}): Promise<ActionResult & { id?: string }> {
  try {
    const wallet = await prisma.cryptoWallet.create({
      data: { ...data, coin: "USDT", enabled: true },
    });
    return { ok: true, id: wallet.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ajout impossible.",
    };
  }
}

export async function updateWallet(
  id: string,
  data: Partial<{
    network: string;
    address: string;
    label: string;
    instructions: string;
    enabled: boolean;
  }>,
): Promise<ActionResult> {
  try {
    await prisma.cryptoWallet.update({ where: { id }, data });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Mise à jour impossible.",
    };
  }
}

export async function deleteWallet(id: string): Promise<ActionResult> {
  try {
    await prisma.cryptoWallet.delete({ where: { id } });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Suppression impossible.",
    };
  }
}

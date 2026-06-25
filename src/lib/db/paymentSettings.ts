import "server-only";

import { prisma } from "@/lib/prisma";
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
    instructions: "Veuillez effectuer le virement et télécharger le justificatif.",
  },
  {
    method: "usdt",
    enabled: true,
    proofRequired: true,
    paypalEmail: "",
    cardMessage: "",
    instructions: "Envoyez exactement le montant indiqué et téléchargez la capture d'écran.",
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

async function ensureDefaults() {
  const count = await prisma.paymentMethodConfig.count();
  if (count === 0) {
    await prisma.paymentMethodConfig.createMany({
      data: DEFAULT_METHODS.map((m) => ({ ...m })),
    });
  }

  const support = await prisma.supportConfig.findFirst();
  if (!support) {
    await prisma.supportConfig.create({
      data: {
        whatsappNumber: "+212 600 000 000",
        supportEmail: "support@karta.ma",
        instructions: "",
      },
    });
  }
}

export async function getPaymentConfig(): Promise<PaymentConfigDTO> {
  await ensureDefaults();

  const [methods, banks, wallets, support] = await Promise.all([
    prisma.paymentMethodConfig.findMany({ orderBy: { method: "asc" } }),
    prisma.bank.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
    prisma.cryptoWallet.findMany({ where: { enabled: true } }),
    prisma.supportConfig.findFirst(),
  ]);

  const methodsMap: Record<string, PaymentMethodConfigDTO> = {};
  for (const m of methods) {
    methodsMap[m.method] = {
      method: m.method,
      enabled: m.enabled,
      proofRequired: m.proofRequired,
      paypalEmail: m.paypalEmail,
      cardMessage: m.cardMessage,
      instructions: m.instructions,
    };
  }

  return {
    methods: methodsMap,
    banks: banks.map((b) => ({
      id: b.id,
      name: b.name,
      accountHolder: b.accountHolder,
      accountNumber: b.accountNumber,
      rib: b.rib,
      iban: b.iban,
      swift: b.swift,
      instructions: b.instructions,
      enabled: b.enabled,
      sortOrder: b.sortOrder,
    })),
    wallets: wallets.map((w) => ({
      id: w.id,
      coin: w.coin,
      network: w.network,
      address: w.address,
      label: w.label,
      instructions: w.instructions,
      enabled: w.enabled,
    })),
    support: support
      ? {
          id: support.id,
          whatsappNumber: support.whatsappNumber,
          supportEmail: support.supportEmail,
          instructions: support.instructions,
        }
      : {
          id: "",
          whatsappNumber: "+212 600 000 000",
          supportEmail: "support@karta.ma",
          instructions: "",
        },
  };
}

export async function getAdminPaymentConfig(): Promise<PaymentConfigDTO> {
  await ensureDefaults();

  const [methods, allBanks, allWallets, support] = await Promise.all([
    prisma.paymentMethodConfig.findMany({ orderBy: { method: "asc" } }),
    prisma.bank.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.cryptoWallet.findMany(),
    prisma.supportConfig.findFirst(),
  ]);

  const toBank = (b: typeof allBanks[number]): BankDTO => ({
    id: b.id,
    name: b.name,
    accountHolder: b.accountHolder,
    accountNumber: b.accountNumber,
    rib: b.rib,
    iban: b.iban,
    swift: b.swift,
    instructions: b.instructions,
    enabled: b.enabled,
    sortOrder: b.sortOrder,
  });

  const toWallet = (w: typeof allWallets[number]): CryptoWalletDTO => ({
    id: w.id,
    coin: w.coin,
    network: w.network,
    address: w.address,
    label: w.label,
    instructions: w.instructions,
    enabled: w.enabled,
  });

  const supportDTO: SupportConfigDTO = support
    ? {
        id: support.id,
        whatsappNumber: support.whatsappNumber,
        supportEmail: support.supportEmail,
        instructions: support.instructions,
      }
    : { id: "", whatsappNumber: "+212 600 000 000", supportEmail: "support@karta.ma", instructions: "" };

  const methodsMap: Record<string, PaymentMethodConfigDTO> = {};
  for (const m of methods) {
    methodsMap[m.method] = {
      method: m.method,
      enabled: m.enabled,
      proofRequired: m.proofRequired,
      paypalEmail: m.paypalEmail,
      cardMessage: m.cardMessage,
      instructions: m.instructions,
    };
  }

  return {
    methods: methodsMap,
    banks: allBanks.map(toBank),
    wallets: allWallets.map(toWallet),
    support: supportDTO,
  };
}

// ─── Method config ────────────────────────────────────────────────────────────

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
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

// ─── Support config ───────────────────────────────────────────────────────────

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
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

// ─── Banks ────────────────────────────────────────────────────────────────────

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
      data: { ...data, sortOrder: count },
    });
    return { ok: true, id: bank.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Add failed." };
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
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

export async function deleteBank(id: string): Promise<ActionResult> {
  try {
    await prisma.bank.delete({ where: { id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

// ─── Crypto wallets ───────────────────────────────────────────────────────────

export async function addWallet(data: {
  network: string;
  address: string;
  label: string;
  instructions: string;
}): Promise<ActionResult & { id?: string }> {
  try {
    const wallet = await prisma.cryptoWallet.create({
      data: { ...data, coin: "USDT" },
    });
    return { ok: true, id: wallet.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Add failed." };
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
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

export async function deleteWallet(id: string): Promise<ActionResult> {
  try {
    await prisma.cryptoWallet.delete({ where: { id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

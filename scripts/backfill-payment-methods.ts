/**
 * One-off backfill: copies the legacy Bank / CryptoWallet / PaymentMethodConfig
 * rows (plus any per-method branding stored in the `paymentDisplay` map inside
 * the singleton StoreSetting row) into the new generic PaymentMethod table.
 *
 * Run this AFTER applying migration `20260706100000_add_payment_method` and
 * BEFORE applying `20260706120000_drop_legacy_payment_tables` — it reads the
 * legacy tables with raw SQL since they're no longer part of the Prisma schema.
 *
 * Run with: npx tsx scripts/backfill-payment-methods.ts
 *
 * Safe to re-run: it aborts immediately if PaymentMethod already has any rows,
 * and the insert itself is one transaction, so a mid-run failure leaves the
 * table empty (not partially populated) rather than something a re-run would
 * mistake for "already done".
 *
 * Full production sequencing (backup, staged migrations, verification,
 * rollback): see docs/payment-methods-migration-runbook.md — do not run this
 * against production outside that runbook's step 2.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type LegacyBank = {
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
};

type LegacyWallet = {
  id: string;
  network: string;
  address: string;
  label: string;
  instructions: string;
  enabled: boolean;
};

type LegacyMethodConfig = {
  method: string;
  enabled: boolean;
  proofRequired: boolean;
  paypalEmail: string;
  cardMessage: string;
  instructions: string;
};

type PaymentDisplaySetting = {
  displayName?: string;
  subtitle?: string;
  logoType?: "image" | "initials" | "generated";
  logoUrl?: string;
  iconUrl?: string;
  initials?: string;
  accentColor?: string;
};

function mapLogoType(logoType: PaymentDisplaySetting["logoType"] | undefined): "initials" | "image" | "icon" {
  if (logoType === "image") return "image";
  return "initials";
}

function bankDisplayKey(id: string) {
  return `bank:${id}`;
}
function walletDisplayKey(id: string) {
  return `wallet:${id}`;
}
function methodDisplayKey(method: string) {
  return `method:${method}`;
}

async function main() {
  const existing = await prisma.paymentMethod.count();
  if (existing > 0) {
    console.log(`PaymentMethod already has ${existing} row(s) — skipping backfill (assumed already run).`);
    return;
  }

  const [banks, wallets, methodConfigs, storeSetting] = await Promise.all([
    prisma.$queryRawUnsafe<LegacyBank[]>(`SELECT * FROM "Bank" ORDER BY "sortOrder" ASC`),
    prisma.$queryRawUnsafe<LegacyWallet[]>(`SELECT * FROM "CryptoWallet"`),
    prisma.$queryRawUnsafe<LegacyMethodConfig[]>(`SELECT * FROM "PaymentMethodConfig"`),
    prisma.storeSetting.findUnique({ where: { id: "default" } }),
  ]);

  const paymentDisplay: Record<string, PaymentDisplaySetting> =
    (storeSetting?.value as { paymentDisplay?: Record<string, PaymentDisplaySetting> } | null)
      ?.paymentDisplay ?? {};

  const methodByKey: Record<string, LegacyMethodConfig> = {};
  for (const m of methodConfigs) methodByKey[m.method] = m;

  let sortOrder = 0;
  const rows: Parameters<typeof prisma.paymentMethod.create>[0]["data"][] = [];

  for (const bank of banks) {
    const display = paymentDisplay[bankDisplayKey(bank.id)];
    rows.push({
      type: "bank",
      name: display?.displayName?.trim() || bank.name,
      subtitle: display?.subtitle?.trim() || "Virement bancaire",
      status: bank.enabled ? "active" : "inactive",
      visible: true,
      sortOrder: sortOrder++,
      logoUrl: display?.logoType !== "initials" ? display?.logoUrl ?? null : null,
      initials: display?.initials?.trim() || bank.name.slice(0, 2).toUpperCase(),
      accentColor: display?.accentColor?.trim() || "#3e7bfa",
      logoType: mapLogoType(display?.logoType),
      details: {
        accountHolder: bank.accountHolder,
        accountNumber: bank.accountNumber,
        rib: bank.rib,
        iban: bank.iban,
        swift: bank.swift,
        instructions: bank.instructions || methodByKey.bank?.instructions || "",
      },
      proofRequired: methodByKey.bank?.proofRequired ?? true,
    });
  }

  for (const wallet of wallets) {
    const display = paymentDisplay[walletDisplayKey(wallet.id)] ?? paymentDisplay[methodDisplayKey("usdt")];
    rows.push({
      type: "crypto",
      name: display?.displayName?.trim() || wallet.label || `USDT ${wallet.network}`,
      subtitle: display?.subtitle?.trim() || wallet.network,
      status: wallet.enabled ? "active" : "inactive",
      visible: true,
      sortOrder: sortOrder++,
      logoUrl: display?.logoType !== "initials" ? display?.logoUrl ?? null : null,
      initials: display?.initials?.trim() || wallet.network.slice(0, 2).toUpperCase(),
      accentColor: display?.accentColor?.trim() || "#22c55e",
      logoType: mapLogoType(display?.logoType),
      details: {
        walletAddress: wallet.address,
        network: wallet.network,
        instructions: wallet.instructions || methodByKey.usdt?.instructions || "",
      },
      proofRequired: methodByKey.usdt?.proofRequired ?? true,
    });
  }

  if (methodByKey.paypal) {
    const cfg = methodByKey.paypal;
    const display = paymentDisplay[methodDisplayKey("paypal")];
    rows.push({
      type: "paypal",
      name: display?.displayName?.trim() || "PayPal",
      subtitle: display?.subtitle?.trim() || "PayPal ou envoi manuel",
      status: cfg.enabled ? "active" : "inactive",
      visible: true,
      sortOrder: sortOrder++,
      logoUrl: display?.logoType !== "initials" ? display?.logoUrl ?? null : null,
      initials: display?.initials?.trim() || "P",
      accentColor: display?.accentColor?.trim() || "#3e7bfa",
      logoType: mapLogoType(display?.logoType),
      details: { email: cfg.paypalEmail, instructions: cfg.instructions },
      proofRequired: cfg.proofRequired,
    });
  }

  if (methodByKey.card) {
    const cfg = methodByKey.card;
    const display = paymentDisplay[methodDisplayKey("card")];
    rows.push({
      type: "card",
      name: display?.displayName?.trim() || "Carte bancaire",
      subtitle: display?.subtitle?.trim() || "Disponible prochainement",
      status: cfg.enabled ? "active" : "inactive",
      visible: true,
      sortOrder: sortOrder++,
      logoUrl: display?.logoType !== "initials" ? display?.logoUrl ?? null : null,
      initials: display?.initials?.trim() || "CB",
      accentColor: display?.accentColor?.trim() || "#8b5cf6",
      logoType: mapLogoType(display?.logoType),
      details: { comingSoon: !cfg.enabled, statusNote: cfg.cardMessage, instructions: "" },
      proofRequired: false,
    });
  }

  // All-or-nothing: if any row fails to insert, the transaction rolls back and
  // PaymentMethod is left at 0 rows, so re-running the script is safe (the
  // count-guard above only skips when a *complete* prior run has committed).
  await prisma.$transaction(async (tx) => {
    for (const data of rows) {
      await tx.paymentMethod.create({ data });
    }
  });

  console.log(`Backfilled ${rows.length} payment method(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

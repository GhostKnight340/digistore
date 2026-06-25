import "server-only";

import { getDb, newId, nowIso, toBool, fromBool } from "./sqlite";
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

function ensureDefaults(): void {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as n FROM PaymentMethodConfig").get() as { n: number }).n;
  if (count === 0) {
    const ts = nowIso();
    const stmt = db.prepare(
      `INSERT INTO PaymentMethodConfig (id, method, enabled, proofRequired, paypalEmail, cardMessage, instructions, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const m of DEFAULT_METHODS) {
      stmt.run(newId(), m.method, fromBool(m.enabled), fromBool(m.proofRequired), m.paypalEmail, m.cardMessage, m.instructions, ts);
    }
  }

  const support = db.prepare("SELECT id FROM SupportConfig LIMIT 1").get();
  if (!support) {
    db.prepare(
      `INSERT INTO SupportConfig (id, whatsappNumber, supportEmail, instructions, updatedAt)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(newId(), "+212 600 000 000", "support@karta.ma", "", nowIso());
  }
}

function rowToMethod(r: Record<string, unknown>): PaymentMethodConfigDTO {
  return {
    method: r.method as string,
    enabled: toBool(r.enabled),
    proofRequired: toBool(r.proofRequired),
    paypalEmail: (r.paypalEmail as string) ?? "",
    cardMessage: (r.cardMessage as string) ?? "",
    instructions: (r.instructions as string) ?? "",
  };
}

function rowToBank(r: Record<string, unknown>): BankDTO {
  return {
    id: r.id as string,
    name: r.name as string,
    accountHolder: r.accountHolder as string,
    accountNumber: (r.accountNumber as string) ?? "",
    rib: (r.rib as string) ?? "",
    iban: (r.iban as string) ?? "",
    swift: (r.swift as string) ?? "",
    instructions: (r.instructions as string) ?? "",
    enabled: toBool(r.enabled),
    sortOrder: r.sortOrder as number,
  };
}

function rowToWallet(r: Record<string, unknown>): CryptoWalletDTO {
  return {
    id: r.id as string,
    coin: (r.coin as string) ?? "USDT",
    network: r.network as string,
    address: r.address as string,
    label: (r.label as string) ?? "",
    instructions: (r.instructions as string) ?? "",
    enabled: toBool(r.enabled),
  };
}

export async function getPaymentConfig(): Promise<PaymentConfigDTO> {
  ensureDefaults();
  const db = getDb();

  const methods = db.prepare("SELECT * FROM PaymentMethodConfig ORDER BY method ASC").all();
  const banks = db.prepare("SELECT * FROM Bank WHERE enabled = 1 ORDER BY sortOrder ASC").all();
  const wallets = db.prepare("SELECT * FROM CryptoWallet WHERE enabled = 1").all();
  const support = db.prepare("SELECT * FROM SupportConfig LIMIT 1").get();

  const methodsMap: Record<string, PaymentMethodConfigDTO> = {};
  for (const m of methods) methodsMap[m.method as string] = rowToMethod(m);

  const supportDTO: SupportConfigDTO = support
    ? {
        id: support.id as string,
        whatsappNumber: support.whatsappNumber as string,
        supportEmail: support.supportEmail as string,
        instructions: (support.instructions as string) ?? "",
      }
    : { id: "", whatsappNumber: "+212 600 000 000", supportEmail: "support@karta.ma", instructions: "" };

  return { methods: methodsMap, banks: banks.map(rowToBank), wallets: wallets.map(rowToWallet), support: supportDTO };
}

export async function getAdminPaymentConfig(): Promise<PaymentConfigDTO> {
  ensureDefaults();
  const db = getDb();

  const methods = db.prepare("SELECT * FROM PaymentMethodConfig ORDER BY method ASC").all();
  const banks = db.prepare("SELECT * FROM Bank ORDER BY sortOrder ASC").all();
  const wallets = db.prepare("SELECT * FROM CryptoWallet").all();
  const support = db.prepare("SELECT * FROM SupportConfig LIMIT 1").get();

  const methodsMap: Record<string, PaymentMethodConfigDTO> = {};
  for (const m of methods) methodsMap[m.method as string] = rowToMethod(m);

  const supportDTO: SupportConfigDTO = support
    ? {
        id: support.id as string,
        whatsappNumber: support.whatsappNumber as string,
        supportEmail: support.supportEmail as string,
        instructions: (support.instructions as string) ?? "",
      }
    : { id: "", whatsappNumber: "+212 600 000 000", supportEmail: "support@karta.ma", instructions: "" };

  return { methods: methodsMap, banks: banks.map(rowToBank), wallets: wallets.map(rowToWallet), support: supportDTO };
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
    const db = getDb();
    const ts = nowIso();
    const existing = db.prepare("SELECT id FROM PaymentMethodConfig WHERE method = ?").get(method);
    if (existing) {
      const sets: string[] = ["updatedAt = ?"];
      const vals: unknown[] = [ts];
      if (data.enabled !== undefined) { sets.push("enabled = ?"); vals.push(fromBool(data.enabled)); }
      if (data.proofRequired !== undefined) { sets.push("proofRequired = ?"); vals.push(fromBool(data.proofRequired)); }
      if (data.paypalEmail !== undefined) { sets.push("paypalEmail = ?"); vals.push(data.paypalEmail); }
      if (data.cardMessage !== undefined) { sets.push("cardMessage = ?"); vals.push(data.cardMessage); }
      if (data.instructions !== undefined) { sets.push("instructions = ?"); vals.push(data.instructions); }
      vals.push(method);
      db.prepare(`UPDATE PaymentMethodConfig SET ${sets.join(", ")} WHERE method = ?`).run(...vals);
    } else {
      db.prepare(
        `INSERT INTO PaymentMethodConfig (id, method, enabled, proofRequired, paypalEmail, cardMessage, instructions, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(), method,
        fromBool(data.enabled ?? true),
        fromBool(data.proofRequired ?? true),
        data.paypalEmail ?? "",
        data.cardMessage ?? "",
        data.instructions ?? "",
        ts,
      );
    }
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
    const db = getDb();
    const ts = nowIso();
    const existing = db.prepare("SELECT id FROM SupportConfig LIMIT 1").get();
    if (existing) {
      db.prepare(
        "UPDATE SupportConfig SET whatsappNumber = ?, supportEmail = ?, instructions = ?, updatedAt = ? WHERE id = ?",
      ).run(data.whatsappNumber, data.supportEmail, data.instructions, ts, existing.id as string);
    } else {
      db.prepare(
        "INSERT INTO SupportConfig (id, whatsappNumber, supportEmail, instructions, updatedAt) VALUES (?, ?, ?, ?, ?)",
      ).run(newId(), data.whatsappNumber, data.supportEmail, data.instructions, ts);
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
    const db = getDb();
    const id = newId();
    const count = (db.prepare("SELECT COUNT(*) as n FROM Bank").get() as { n: number }).n;
    db.prepare(
      `INSERT INTO Bank (id, name, accountHolder, accountNumber, rib, iban, swift, instructions, enabled, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(id, data.name, data.accountHolder, data.accountNumber, data.rib, data.iban, data.swift, data.instructions, count, nowIso(), nowIso());
    return { ok: true, id };
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
    const db = getDb();
    const sets: string[] = ["updatedAt = ?"];
    const vals: unknown[] = [nowIso()];
    if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
    if (data.accountHolder !== undefined) { sets.push("accountHolder = ?"); vals.push(data.accountHolder); }
    if (data.accountNumber !== undefined) { sets.push("accountNumber = ?"); vals.push(data.accountNumber); }
    if (data.rib !== undefined) { sets.push("rib = ?"); vals.push(data.rib); }
    if (data.iban !== undefined) { sets.push("iban = ?"); vals.push(data.iban); }
    if (data.swift !== undefined) { sets.push("swift = ?"); vals.push(data.swift); }
    if (data.instructions !== undefined) { sets.push("instructions = ?"); vals.push(data.instructions); }
    if (data.enabled !== undefined) { sets.push("enabled = ?"); vals.push(fromBool(data.enabled)); }
    if (data.sortOrder !== undefined) { sets.push("sortOrder = ?"); vals.push(data.sortOrder); }
    vals.push(id);
    db.prepare(`UPDATE Bank SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

export async function deleteBank(id: string): Promise<ActionResult> {
  try {
    getDb().prepare("DELETE FROM Bank WHERE id = ?").run(id);
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
    const db = getDb();
    const id = newId();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO CryptoWallet (id, coin, network, address, label, instructions, enabled, createdAt, updatedAt)
       VALUES (?, 'USDT', ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, data.network, data.address, data.label, data.instructions, ts, ts);
    return { ok: true, id };
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
    const db = getDb();
    const sets: string[] = ["updatedAt = ?"];
    const vals: unknown[] = [nowIso()];
    if (data.network !== undefined) { sets.push("network = ?"); vals.push(data.network); }
    if (data.address !== undefined) { sets.push("address = ?"); vals.push(data.address); }
    if (data.label !== undefined) { sets.push("label = ?"); vals.push(data.label); }
    if (data.instructions !== undefined) { sets.push("instructions = ?"); vals.push(data.instructions); }
    if (data.enabled !== undefined) { sets.push("enabled = ?"); vals.push(fromBool(data.enabled)); }
    vals.push(id);
    db.prepare(`UPDATE CryptoWallet SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

export async function deleteWallet(id: string): Promise<ActionResult> {
  try {
    getDb().prepare("DELETE FROM CryptoWallet WHERE id = ?").run(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

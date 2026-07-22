/**
 * Admin Email Composer — typed content modules.
 *
 * The composed e-mail body is a validated array of discriminated module records,
 * NOT free HTML. This file owns the module TYPES, their server-side VALIDATION
 * (the same code path validates client input and stored drafts), the safe
 * personalization-variable substitution, and the pure credit-behavior resolution.
 *
 * Pure and dependency-free (no "server-only", no Prisma) so it is unit-testable
 * and importable by both the server actions and the renderer.
 */

export type ModuleAlign = "left" | "center" | "right" | "justify";
export type NoticeStyle = "info" | "success" | "warning" | "error";
export type ButtonStyle = "primary" | "secondary";
export type CreditBehavior = "display" | "grant";

export type TextModule = {
  type: "text";
  id: string;
  heading?: string;
  body: string;
  align?: ModuleAlign;
};

export type CreditModule = {
  type: "credit";
  id: string;
  amountMad: number;
  title: string;
  description: string;
  /** ISO date string or null. Optional display-only expiry. */
  expiresAt?: string | null;
  /** Optional internal reason (audit; never rendered to the customer). */
  reason?: string;
  buttonLabel?: string;
  /** "display" = message only; "grant" = actually credit the account. */
  behavior: CreditBehavior;
};

export type ButtonModule = {
  type: "button";
  id: string;
  label: string;
  url: string;
  style?: ButtonStyle;
  align?: ModuleAlign;
};

/** Snapshot of a customer order (captured server-side when added). */
export type OrderModule = {
  type: "order";
  id: string;
  orderId: string;
  /** The customer this order belongs to — enforced again at send time. */
  customerId: string;
  orderNumber: string;
  status: string;
  productSummary: string;
  totalMad: number;
  orderUrl: string;
};

export type PaymentModule = {
  type: "payment";
  id: string;
  methodId: string;
  methodName: string;
  /** Pre-resolved, safe instruction lines (from the live PaymentMethod). */
  lines: string[];
};

export type CouponModule = {
  type: "coupon";
  id: string;
  promoCodeId: string;
  code: string;
  valueLabel: string;
  expiresAt?: string | null;
  conditions?: string;
};

export type DividerModule = { type: "divider"; id: string };

export type NoticeModule = {
  type: "notice";
  id: string;
  style: NoticeStyle;
  heading?: string;
  body: string;
};

export type ProductModule = {
  type: "product";
  id: string;
  productId: string;
  name: string;
  region: string;
  priceMad: number;
  imageUrl?: string | null;
  productUrl: string;
};

export type SignatureModule = {
  type: "signature";
  id: string;
  name: string;
  title?: string;
  text?: string;
};

export type EmailModule =
  | TextModule
  | CreditModule
  | ButtonModule
  | OrderModule
  | PaymentModule
  | CouponModule
  | DividerModule
  | NoticeModule
  | ProductModule
  | SignatureModule;

export type EmailModuleType = EmailModule["type"];

export const MODULE_TYPES: EmailModuleType[] = [
  "text",
  "credit",
  "button",
  "order",
  "payment",
  "coupon",
  "divider",
  "notice",
  "product",
  "signature",
];

export const MODULE_LABELS: Record<EmailModuleType, string> = {
  text: "Texte",
  credit: "Crédit Ghost",
  button: "Bouton",
  order: "Commande",
  payment: "Instructions de paiement",
  coupon: "Code promo",
  divider: "Séparateur",
  notice: "Encadré",
  product: "Produit",
  signature: "Signature",
};

// ── Safe-URL validation ──────────────────────────────────────────────────────

const UNSAFE_URL_SCHEMES = /^(javascript|data|vbscript|file):/i;

/**
 * Accept only http(s) / mailto absolute URLs and site-relative paths. Rejects
 * javascript:, data:, vbscript:, file: and anything else. Used for the button
 * module and any admin-supplied link.
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (UNSAFE_URL_SCHEMES.test(trimmed)) return false;
  if (trimmed.startsWith("/")) return true; // site-relative
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^mailto:/i.test(trimmed)) return true;
  return false;
}

// ── Validation ───────────────────────────────────────────────────────────────

const MAX_MODULES = 40;
const MAX_TEXT = 8000;
const MAX_SHORT = 300;

function str(value: unknown, max = MAX_SHORT): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function optStr(value: unknown, max = MAX_SHORT): string | undefined {
  const s = str(value, max);
  return s ? s : undefined;
}

function align(value: unknown): ModuleAlign | undefined {
  return value === "left" || value === "center" || value === "right" || value === "justify" ? value : undefined;
}

function intMad(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n);
}

export type ModuleValidationError = { index: number; type: string; message: string };

export type ModuleValidationResult = {
  ok: boolean;
  modules: EmailModule[];
  errors: ModuleValidationError[];
};

/**
 * Validate + normalize an untrusted module array (client input or stored draft).
 * Unknown fields are dropped; over-long strings are clamped; invalid modules are
 * reported and excluded. Returns ok=false when any module is invalid so the
 * caller can refuse to send.
 */
export function validateModules(raw: unknown): ModuleValidationResult {
  const errors: ModuleValidationError[] = [];
  const modules: EmailModule[] = [];
  if (!Array.isArray(raw)) {
    return { ok: false, modules: [], errors: [{ index: -1, type: "root", message: "Modules invalides." }] };
  }
  if (raw.length > MAX_MODULES) {
    errors.push({ index: -1, type: "root", message: `Trop de modules (max ${MAX_MODULES}).` });
  }
  raw.slice(0, MAX_MODULES).forEach((item, index) => {
    const m = item as Record<string, unknown>;
    const type = m?.type as EmailModuleType;
    const id = str(m?.id, 64) || `m_${index}`;
    const fail = (message: string) => errors.push({ index, type: String(type ?? "?"), message });

    switch (type) {
      case "text": {
        const body = str(m.body, MAX_TEXT).trim();
        if (!body && !optStr(m.heading)) return fail("Le module texte est vide.");
        modules.push({ type, id, heading: optStr(m.heading), body, align: align(m.align) });
        break;
      }
      case "credit": {
        const amountMad = intMad(m.amountMad);
        if (!Number.isFinite(amountMad) || amountMad <= 0) return fail("Montant de crédit invalide.");
        if (amountMad > 100000) return fail("Montant de crédit hors limites.");
        const behavior: CreditBehavior = m.behavior === "grant" ? "grant" : "display";
        modules.push({
          type,
          id,
          amountMad,
          title: str(m.title) || "Crédit Ghost offert",
          description: str(m.description, 2000),
          expiresAt: typeof m.expiresAt === "string" && m.expiresAt ? m.expiresAt : null,
          reason: optStr(m.reason, 500),
          buttonLabel: optStr(m.buttonLabel) || "Voir mon solde",
          behavior,
        });
        break;
      }
      case "button": {
        const url = str(m.url, 2000).trim();
        const label = str(m.label).trim();
        if (!label) return fail("Le bouton doit avoir un libellé.");
        if (!isSafeUrl(url)) return fail("URL de bouton invalide ou non autorisée.");
        modules.push({
          type,
          id,
          label,
          url,
          style: m.style === "secondary" ? "secondary" : "primary",
          align: align(m.align),
        });
        break;
      }
      case "order": {
        const orderId = str(m.orderId, 64);
        const customerId = str(m.customerId, 64);
        if (!orderId || !customerId) return fail("Commande invalide.");
        const url = str(m.orderUrl, 2000);
        if (url && !isSafeUrl(url)) return fail("Lien de commande invalide.");
        modules.push({
          type,
          id,
          orderId,
          customerId,
          orderNumber: str(m.orderNumber),
          status: str(m.status),
          productSummary: str(m.productSummary, 1000),
          totalMad: intMad(m.totalMad) || 0,
          orderUrl: url,
        });
        break;
      }
      case "payment": {
        const methodId = str(m.methodId, 64);
        if (!methodId) return fail("Mode de paiement invalide.");
        const lines = Array.isArray(m.lines)
          ? m.lines.map((l) => str(l, 500)).filter(Boolean).slice(0, 20)
          : [];
        modules.push({ type, id, methodId, methodName: str(m.methodName), lines });
        break;
      }
      case "coupon": {
        const promoCodeId = str(m.promoCodeId, 64);
        const code = str(m.code, 64);
        if (!promoCodeId || !code) return fail("Code promo invalide.");
        modules.push({
          type,
          id,
          promoCodeId,
          code,
          valueLabel: str(m.valueLabel),
          expiresAt: typeof m.expiresAt === "string" && m.expiresAt ? m.expiresAt : null,
          conditions: optStr(m.conditions, 500),
        });
        break;
      }
      case "divider":
        modules.push({ type, id });
        break;
      case "notice": {
        const style: NoticeStyle =
          m.style === "success" || m.style === "warning" || m.style === "error" ? m.style : "info";
        const body = str(m.body, MAX_TEXT).trim();
        if (!body && !optStr(m.heading)) return fail("L'encadré est vide.");
        modules.push({ type, id, style, heading: optStr(m.heading), body });
        break;
      }
      case "product": {
        const productId = str(m.productId, 64);
        if (!productId) return fail("Produit invalide.");
        const url = str(m.productUrl, 2000);
        if (url && !isSafeUrl(url)) return fail("Lien de produit invalide.");
        modules.push({
          type,
          id,
          productId,
          name: str(m.name),
          region: str(m.region),
          priceMad: intMad(m.priceMad) || 0,
          imageUrl: typeof m.imageUrl === "string" ? m.imageUrl.slice(0, 2000) : null,
          productUrl: url,
        });
        break;
      }
      case "signature": {
        const name = str(m.name);
        if (!name) return fail("La signature doit avoir un nom.");
        modules.push({ type, id, name, title: optStr(m.title), text: optStr(m.text, 500) });
        break;
      }
      default:
        fail(`Type de module inconnu : ${String(type)}`);
    }
  });

  return { ok: errors.length === 0, modules, errors };
}

// ── Personalization variables ────────────────────────────────────────────────

/**
 * The safe personalization variables an admin may use in the subject, preheader
 * and text/notice bodies. Substitution is a plain string replace — NEVER template
 * execution — so no arbitrary code can run.
 */
export const SUPPORTED_VARIABLES = [
  "customer.name",
  "customer.email",
  "customer.creditBalance",
  "order.number",
  "order.status",
  "order.total",
  "store.name",
  "support.email",
] as const;

export type SupportedVariable = (typeof SUPPORTED_VARIABLES)[number];

export type VariableMap = Partial<Record<SupportedVariable, string>>;

const VARIABLE_TOKEN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;

/** Replace `{{var}}` tokens using the provided map. Unknown/empty → "". */
export function substituteVariables(text: string, vars: VariableMap): string {
  return text.replace(VARIABLE_TOKEN, (_, name: string) => {
    const value = (vars as Record<string, string | undefined>)[name];
    return value ?? "";
  });
}

/** All `{{var}}` tokens referenced in a string. */
export function extractVariables(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  VARIABLE_TOKEN.lastIndex = 0;
  while ((match = VARIABLE_TOKEN.exec(text)) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Variables referenced anywhere in the composed content that are NOT resolvable
 * for a given recipient (unknown token, or a supported token with no value).
 * Drives the pre-send "missing variable" validation warning.
 */
export function findMissingVariables(texts: string[], vars: VariableMap): string[] {
  const missing = new Set<string>();
  for (const text of texts) {
    for (const token of extractVariables(text)) {
      if (!(SUPPORTED_VARIABLES as readonly string[]).includes(token)) {
        missing.add(token);
        continue;
      }
      const value = (vars as Record<string, string | undefined>)[token];
      if (value === undefined || value === "") missing.add(token);
    }
  }
  return [...missing];
}

/** Every free-text field of a module that may contain variables (for warnings). */
export function moduleTextFields(module: EmailModule): string[] {
  switch (module.type) {
    case "text":
      return [module.heading ?? "", module.body];
    case "notice":
      return [module.heading ?? "", module.body];
    case "credit":
      return [module.title, module.description];
    case "button":
      return [module.label];
    case "signature":
      return [module.name, module.title ?? "", module.text ?? ""];
    default:
      return [];
  }
}

// ── Credit-behavior resolution (pure, testable) ──────────────────────────────

export type RecipientKind = "customer" | "manual";

export type ResolvedCredit = {
  /** Effective behavior after applying the safety rules. */
  behavior: CreditBehavior;
  amountMad: number;
  /** none | granted-intent | blocked_no_account | display_only */
  creditStatus: "none" | "grant" | "blocked_no_account" | "display_only";
  /** Human-readable note for the admin (French). */
  note?: string;
};

/**
 * Resolve what a credit module actually does for a specific recipient. The rules:
 *
 *   • A manual recipient with no linked account can NEVER receive account credit.
 *     A "grant" request is downgraded to display-only and flagged.
 *   • An existing customer with "grant" grants the credit.
 *   • "display" always stays display-only.
 *
 * This is the single source of truth used by both the pre-send summary and the
 * actual send, so what the admin is warned about is exactly what happens.
 */
export function resolveCreditForRecipient(
  module: CreditModule,
  recipient: { kind: RecipientKind; hasAccount: boolean },
): ResolvedCredit {
  if (module.behavior !== "grant") {
    return { behavior: "display", amountMad: module.amountMad, creditStatus: "display_only" };
  }
  if (recipient.kind === "manual" || !recipient.hasAccount) {
    return {
      behavior: "display",
      amountMad: module.amountMad,
      creditStatus: "blocked_no_account",
      note: "Crédit non appliqué : cette adresse n'est pas liée à un compte client.",
    };
  }
  return { behavior: "grant", amountMad: module.amountMad, creditStatus: "grant" };
}

/** The single credit module in a composition (only one is allowed). */
export function findCreditModule(modules: EmailModule[]): CreditModule | null {
  return (modules.find((m) => m.type === "credit") as CreditModule | undefined) ?? null;
}

/**
 * Deterministic Ghost Credit idempotency key for a recipient's grant. It is
 * derived ONLY from the recipient row id, which is stable across retries (the
 * recipient row is reused, never recreated), so a retried send can never grant
 * credit a second time — the ledger's unique idempotencyKey collapses it to a
 * no-op. This is the composer half of the exactly-once guarantee.
 */
export function recipientCreditKey(recipientId: string): string {
  return `admin-email-credit:${recipientId}`;
}

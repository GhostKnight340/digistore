import "server-only";

import { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "@/lib/db/prisma";
import { normalizeSearch, ALIAS_GROUPS } from "@/lib/search/text";
import { getStoreSettings } from "@/lib/db/catalog";
import { getPublicPaymentMethods } from "@/lib/db/paymentMethods";
import { resolveFooterPaymentBadges } from "@/lib/footerConfig";
import { grantCreditTx, ghostCreditInactivityDays } from "@/lib/db/ghostCredit";
import { writeAuditLog } from "@/lib/db/adminAudit";
import { sendRenderedEmail } from "@/lib/email/send-email";
import { absoluteAppUrl, customerOrderRedirectPath, formatPublicOrderNumber } from "@/lib/orderNumber";
import { renderComposedEmail, type ComposedShellContext } from "./renderComposedEmail";
import {
  validateModules,
  resolveCreditForRecipient,
  findCreditModule,
  recipientCreditKey,
  type EmailModule,
  type VariableMap,
} from "./composerModules";

/** Max recipients per real send (bounded batch protection — see docs/summary). */
export const MAX_RECIPIENTS = 100;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ── Payloads / DTOs ──────────────────────────────────────────────────────────

export type RecipientInput = {
  customerId?: string | null;
  email: string;
  name?: string;
};

export type ComposePayload = {
  templateKey: string;
  recipientMode: "existing" | "manual";
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  recipients: RecipientInput[];
  modules: unknown; // validated server-side
};

export type CustomerSearchResult = {
  id: string;
  name: string;
  email: string;
  status: string;
  emailVerified: boolean;
  creditBalanceMad: number;
  orderCount: number;
};

// ── Shell + variables ────────────────────────────────────────────────────────

async function buildShellContext(): Promise<ComposedShellContext> {
  const settings = await getStoreSettings();
  const supportEmail = process.env.SUPPORT_EMAIL || settings.footer.contactEmail;
  const paymentBadges = resolveFooterPaymentBadges(
    settings,
    (await getPublicPaymentMethods()).methods,
  );
  return {
    settings,
    supportEmail,
    currentYear: String(new Date().getFullYear()),
    paymentBadges,
  };
}

type RecipientContext = {
  input: RecipientInput;
  kind: "customer" | "manual";
  customerId: string | null;
  name: string;
  email: string;
  creditBalanceMad: number;
  hasAccount: boolean;
};

function buildVariableMap(
  ctx: RecipientContext,
  shell: ComposedShellContext,
  modules: EmailModule[],
): VariableMap {
  const vars: VariableMap = {
    "customer.name": ctx.name || "",
    "customer.email": ctx.email,
    "customer.creditBalance": `${ctx.creditBalanceMad} DH`,
    "store.name": shell.settings.branding.siteName,
    "support.email": shell.supportEmail,
  };
  // Order variables come from an order module that belongs to THIS recipient.
  const orderModule = modules.find(
    (m): m is Extract<EmailModule, { type: "order" }> =>
      m.type === "order" && m.customerId === ctx.customerId,
  );
  if (orderModule) {
    vars["order.number"] = orderModule.orderNumber;
    vars["order.status"] = orderModule.status;
    vars["order.total"] = `${orderModule.totalMad} DH`;
  }
  return vars;
}

// ── Customer search (composer selector) ──────────────────────────────────────

export async function searchCustomersForComposer(query: string): Promise<CustomerSearchResult[]> {
  await ensureDatabaseReady();
  const q = query.trim();
  if (!q) return [];

  const or: Array<Record<string, unknown>> = [
    { name: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
    { id: q },
  ];
  // Order-number search → owning customer.
  const seqMatch = q.match(/^#?(\d+)$/);
  if (seqMatch) {
    const seq = Number(seqMatch[1]);
    if (seq > 0) {
      const order = await prisma.order.findMany({
        orderBy: { createdAt: "asc" },
        skip: seq - 1,
        take: 1,
        select: { customerId: true },
      });
      const cid = order[0]?.customerId;
      if (cid) or.push({ id: cid });
    }
  }

  const rows = await prisma.customer.findMany({
    where: { role: "CUSTOMER", OR: or as never },
    take: 20,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      emailVerified: true,
      ghostCreditBalanceMad: true,
      _count: { select: { orders: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    status: r.status,
    emailVerified: r.emailVerified,
    creditBalanceMad: r.ghostCreditBalanceMad,
    orderCount: r._count.orders,
  }));
}

/** Which of the given emails already map to an existing account (dedupe/link UI). */
export async function matchExistingAccounts(
  emails: string[],
): Promise<Record<string, { id: string; name: string; status: string }>> {
  await ensureDatabaseReady();
  const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))].slice(0, MAX_RECIPIENTS);
  if (!normalized.length) return {};
  const rows = await prisma.customer.findMany({
    where: { email: { in: normalized } },
    select: { id: true, name: true, email: true, status: true },
  });
  const map: Record<string, { id: string; name: string; status: string }> = {};
  for (const r of rows) map[r.email.toLowerCase()] = { id: r.id, name: r.name, status: r.status };
  return map;
}

// ── Reference-module resolution (snapshot at add time) ───────────────────────

export async function resolveOrderModule(
  customerId: string,
  orderId: string,
): Promise<Extract<EmailModule, { type: "order" }> | null> {
  await ensureDatabaseReady();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      status: true,
      totalMad: true,
      createdAt: true,
      items: { select: { quantity: true, product: { select: { name: true } } } },
    },
  });
  // Ownership guard: never attach an order that is not this customer's.
  if (!order || order.customerId !== customerId) return null;

  const earlier = await prisma.order.count({
    where: {
      OR: [
        { createdAt: { lt: order.createdAt } },
        { createdAt: order.createdAt, id: { lt: order.id } },
      ],
    },
  });
  const productSummary = order.items
    .map((i) => `${i.quantity}× ${i.product?.name ?? "Produit"}`)
    .join(", ");

  return {
    type: "order",
    id: `order_${order.id}`,
    orderId: order.id,
    customerId,
    orderNumber: formatPublicOrderNumber(earlier + 1),
    status: order.status,
    productSummary,
    totalMad: order.totalMad,
    orderUrl: absoluteAppUrl(customerOrderRedirectPath(order.status, order.id)),
  };
}

export async function listPaymentMethodRefs(): Promise<
  { id: string; name: string; lines: string[] }[]
> {
  const { methods } = await getPublicPaymentMethods();
  return methods.map((m) => ({ id: m.id, name: m.name, lines: paymentLines(m) }));
}

function paymentLines(m: { type: string; details: unknown; customerNote?: string }): string[] {
  const d = (m.details ?? {}) as Record<string, string | number | undefined>;
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value) lines.push(`${label} : ${value}`);
  };
  switch (m.type) {
    case "bank":
      add("Banque", d.bankName);
      add("Titulaire", d.accountHolder);
      add("RIB", d.rib);
      add("IBAN", d.iban);
      break;
    case "crypto":
      add("Réseau", d.network);
      add("Adresse", d.walletAddress);
      break;
    case "paypal":
      add("PayPal", d.email || d.meLink);
      break;
    default:
      break;
  }
  if (m.customerNote) lines.push(String(m.customerNote));
  return lines.slice(0, 20);
}

export async function listCouponRefs(): Promise<
  { id: string; code: string; valueLabel: string; expiresAt: string | null; conditions: string }[]
> {
  await ensureDatabaseReady();
  const rows = await prisma.promoCode.findMany({
    where: { active: true, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      code: true,
      rewardType: true,
      percentValue: true,
      fixedAmountMad: true,
      endAt: true,
      minSubtotalMad: true,
    },
  });
  return rows.map((r) => {
    let valueLabel = "";
    if (r.rewardType === "PERCENT_DISCOUNT" && r.percentValue) valueLabel = `-${r.percentValue}%`;
    else if (r.rewardType === "FIXED_DISCOUNT" && r.fixedAmountMad) valueLabel = `-${r.fixedAmountMad} DH`;
    else if (r.rewardType === "FIXED_GHOST_CREDIT" && r.fixedAmountMad)
      valueLabel = `${r.fixedAmountMad} DH de crédit Ghost`;
    else if (r.rewardType === "PERCENT_GHOST_CREDIT" && r.percentValue)
      valueLabel = `${r.percentValue}% en crédit Ghost`;
    return {
      id: r.id,
      code: r.code,
      valueLabel,
      expiresAt: r.endAt ? r.endAt.toISOString() : null,
      conditions: r.minSubtotalMad ? `Dès ${r.minSubtotalMad} DH d'achat` : "",
    };
  });
}

/**
 * Expand a query into the terms the storefront would also match: the query
 * itself plus every canonical/alias in any alias group it touches (so "psn"
 * finds "PlayStation"). Reuses the single shared alias table.
 */
function expandProductQueryTerms(query: string): string[] {
  const norm = normalizeSearch(query);
  if (!norm) return [];
  const terms = new Set<string>([norm]);
  for (const group of ALIAS_GROUPS) {
    const all = [group.canonical, ...group.aliases].map(normalizeSearch);
    if (all.some((t) => t && (t === norm || t.includes(norm) || norm.includes(t)))) {
      all.forEach((t) => t && terms.add(t));
    }
  }
  return [...terms];
}

export async function searchProductsForComposer(
  query: string,
): Promise<{ id: string; name: string; region: string; priceMad: number; imageUrl: string | null; productUrl: string }[]> {
  await ensureDatabaseReady();
  const q = query.trim();
  const terms = expandProductQueryTerms(q);
  const where: Prisma.ProductWhereInput = q
    ? {
        active: true,
        OR: terms.flatMap((t) => [
          { name: { contains: t, mode: "insensitive" as const } },
          { brand: { contains: t, mode: "insensitive" as const } },
          { category: { contains: t, mode: "insensitive" as const } },
          { slug: { contains: t.replace(/\s+/g, "-"), mode: "insensitive" as const } },
          { searchAliases: { has: t } },
        ]),
      }
    : { active: true };
  const rows = await prisma.product.findMany({
    where,
    take: 20,
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true, region: true, priceMad: true, imageUrl: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    priceMad: r.priceMad,
    imageUrl: r.imageUrl,
    productUrl: absoluteAppUrl(`/product/${r.slug}`),
  }));
}

// ── Order-module ownership guard ─────────────────────────────────────────────

/**
 * Re-validate every order module server-side against the live DB, independent of
 * the client snapshot: the order must still exist AND belong to the customerId
 * declared on the module. This blocks a hand-crafted payload from inserting
 * another customer's order (the UI already validates at add time; this is the
 * authoritative server-side check at send/preview time).
 */
async function validateOrderModules(
  modules: EmailModule[],
): Promise<{ ok: boolean; error?: string }> {
  const orderModules = modules.filter(
    (m): m is Extract<EmailModule, { type: "order" }> => m.type === "order",
  );
  if (!orderModules.length) return { ok: true };
  for (const m of orderModules) {
    const order = await prisma.order.findUnique({
      where: { id: m.orderId },
      select: { customerId: true },
    });
    if (!order || !order.customerId || order.customerId !== m.customerId) {
      return { ok: false, error: "Une commande attachée n'appartient pas au client indiqué." };
    }
  }
  return { ok: true };
}

// ── Recipient resolution ─────────────────────────────────────────────────────

async function resolveRecipients(payload: ComposePayload): Promise<{
  contexts: RecipientContext[];
  error?: string;
}> {
  const seen = new Set<string>();
  const inputs: RecipientInput[] = [];
  for (const r of payload.recipients) {
    const email = normalizeEmail(r.email);
    if (!email || !isValidEmail(email)) return { contexts: [], error: `Adresse e-mail invalide : ${r.email}` };
    if (seen.has(email)) continue;
    seen.add(email);
    inputs.push({ ...r, email });
  }
  if (!inputs.length) return { contexts: [], error: "Aucun destinataire." };
  if (inputs.length > MAX_RECIPIENTS)
    return { contexts: [], error: `Trop de destinataires (max ${MAX_RECIPIENTS}).` };

  // Resolve accounts: explicit customerId (existing mode) or email match (manual).
  const byId = new Map<string, { id: string; name: string; email: string; ghostCreditBalanceMad: number }>();
  const ids = inputs.map((r) => r.customerId).filter((v): v is string => Boolean(v));
  if (ids.length) {
    const rows = await prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, ghostCreditBalanceMad: true },
    });
    for (const row of rows) byId.set(row.id, row);
  }
  const emailMatches = await matchExistingAccountsFull(inputs.map((r) => r.email));

  const contexts: RecipientContext[] = inputs.map((input) => {
    const account = input.customerId ? byId.get(input.customerId) : emailMatches.get(input.email);
    if (account) {
      return {
        input,
        kind: "customer",
        customerId: account.id,
        name: input.name?.trim() || account.name,
        email: account.email.toLowerCase(),
        creditBalanceMad: account.ghostCreditBalanceMad,
        hasAccount: true,
      };
    }
    return {
      input,
      kind: "manual",
      customerId: null,
      name: input.name?.trim() || "",
      email: input.email,
      creditBalanceMad: 0,
      hasAccount: false,
    };
  });
  return { contexts };
}

async function matchExistingAccountsFull(
  emails: string[],
): Promise<Map<string, { id: string; name: string; email: string; ghostCreditBalanceMad: number }>> {
  const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  const map = new Map<string, { id: string; name: string; email: string; ghostCreditBalanceMad: number }>();
  if (!normalized.length) return map;
  const rows = await prisma.customer.findMany({
    where: { email: { in: normalized } },
    select: { id: true, name: true, email: true, ghostCreditBalanceMad: true },
  });
  for (const r of rows) map.set(r.email.toLowerCase(), r);
  return map;
}

// ── Preview ──────────────────────────────────────────────────────────────────

export type PreviewResult = {
  ok: boolean;
  error?: string;
  subject?: string;
  preheader?: string;
  html?: string;
  text?: string;
  missingVariables?: string[];
};

export async function previewComposedEmail(
  payload: ComposePayload,
  recipientIndex = 0,
): Promise<PreviewResult> {
  const validation = validateModules(payload.modules);
  if (!validation.ok) {
    return { ok: false, error: validation.errors[0]?.message ?? "Contenu invalide." };
  }
  const shell = await buildShellContext();

  // Preview against the selected recipient, or a sample when none/ manual-empty.
  let ctx: RecipientContext;
  const resolved = await resolveRecipients(payload).catch(() => ({ contexts: [], error: "resolve" }));
  if (resolved.contexts.length) {
    ctx = resolved.contexts[Math.min(recipientIndex, resolved.contexts.length - 1)];
  } else {
    ctx = {
      input: { email: "client@example.com" },
      kind: "manual",
      customerId: null,
      name: "Amine",
      email: "client@example.com",
      creditBalanceMad: 0,
      hasAccount: false,
    };
  }

  const vars = buildVariableMap(ctx, shell, validation.modules);
  const rendered = renderComposedEmail(
    {
      subject: payload.subject,
      preheader: payload.preheader,
      eyebrow: payload.eyebrow,
      title: payload.title,
      greetingName: ctx.name || "Amine",
      modules: validation.modules,
    },
    vars,
    shell,
  );
  return {
    ok: true,
    subject: rendered.subject,
    preheader: rendered.preheader,
    html: rendered.html,
    text: rendered.text,
    missingVariables: rendered.missingVariables,
  };
}

// ── Pre-send summary ─────────────────────────────────────────────────────────

export type SendSummary = {
  ok: boolean;
  error?: string;
  recipientCount: number;
  customerCount: number;
  manualCount: number;
  creditPerRecipientMad: number;
  creditRecipientCount: number;
  totalCreditMad: number;
  blockedCreditCount: number;
  missingVariablesByRecipient: { email: string; missing: string[] }[];
};

export async function summarizeSend(payload: ComposePayload): Promise<SendSummary> {
  const empty: SendSummary = {
    ok: false,
    recipientCount: 0,
    customerCount: 0,
    manualCount: 0,
    creditPerRecipientMad: 0,
    creditRecipientCount: 0,
    totalCreditMad: 0,
    blockedCreditCount: 0,
    missingVariablesByRecipient: [],
  };
  const validation = validateModules(payload.modules);
  if (!validation.ok) return { ...empty, error: validation.errors[0]?.message ?? "Contenu invalide." };

  const orderCheck = await validateOrderModules(validation.modules);
  if (!orderCheck.ok) return { ...empty, error: orderCheck.error };

  const resolved = await resolveRecipients(payload);
  if (resolved.error) return { ...empty, error: resolved.error };
  const shell = await buildShellContext();

  const creditModule = findCreditModule(validation.modules);
  let creditRecipientCount = 0;
  let blockedCreditCount = 0;
  let totalCreditMad = 0;
  const missing: { email: string; missing: string[] }[] = [];

  for (const ctx of resolved.contexts) {
    if (creditModule) {
      const res = resolveCreditForRecipient(creditModule, { kind: ctx.kind, hasAccount: ctx.hasAccount });
      if (res.creditStatus === "grant") {
        creditRecipientCount += 1;
        totalCreditMad += res.amountMad;
      } else if (res.creditStatus === "blocked_no_account") {
        blockedCreditCount += 1;
      }
    }
    const vars = buildVariableMap(ctx, shell, validation.modules);
    const rendered = renderComposedEmail(
      {
        subject: payload.subject,
        preheader: payload.preheader,
        eyebrow: payload.eyebrow,
        title: payload.title,
        greetingName: ctx.name,
        modules: validation.modules,
      },
      vars,
      shell,
    );
    if (rendered.missingVariables.length) missing.push({ email: ctx.email, missing: rendered.missingVariables });
  }

  const customerCount = resolved.contexts.filter((c) => c.kind === "customer").length;
  return {
    ok: true,
    recipientCount: resolved.contexts.length,
    customerCount,
    manualCount: resolved.contexts.length - customerCount,
    creditPerRecipientMad: creditModule?.amountMad ?? 0,
    creditRecipientCount,
    totalCreditMad,
    blockedCreditCount,
    missingVariablesByRecipient: missing,
  };
}

// ── Test send ────────────────────────────────────────────────────────────────

export type SendActionResult = {
  ok: boolean;
  error?: string;
  sendId?: string;
  status?: string;
  sentCount?: number;
  failedCount?: number;
  creditGrantedMad?: number;
};

export async function sendTestEmail(
  payload: ComposePayload,
  testAddress: string,
  admin: { id: string; name: string },
): Promise<SendActionResult> {
  await ensureDatabaseReady();
  const to = normalizeEmail(testAddress);
  if (!isValidEmail(to)) return { ok: false, error: "Adresse de test invalide." };
  const validation = validateModules(payload.modules);
  if (!validation.ok) return { ok: false, error: validation.errors[0]?.message ?? "Contenu invalide." };

  const shell = await buildShellContext();
  // Test uses sample/selected data and NEVER grants credit or financial effects.
  const ctx: RecipientContext = {
    input: { email: to },
    kind: "manual",
    customerId: null,
    name: "Test",
    email: to,
    creditBalanceMad: 0,
    hasAccount: false,
  };
  const vars = buildVariableMap(ctx, shell, validation.modules);
  const rendered = renderComposedEmail(
    {
      subject: `[TEST] ${payload.subject}`,
      preheader: payload.preheader,
      eyebrow: payload.eyebrow,
      title: payload.title,
      greetingName: ctx.name,
      modules: validation.modules,
    },
    vars,
    shell,
  );

  const send = await prisma.adminEmailSend.create({
    data: {
      status: "processing",
      recipientMode: payload.recipientMode,
      templateKey: payload.templateKey,
      subject: payload.subject,
      preheader: payload.preheader,
      eyebrow: payload.eyebrow,
      title: payload.title,
      modules: validation.modules as never,
      isTest: true,
      testRecipient: to,
      recipientCount: 1,
      createdByAdminId: admin.id,
      createdByAdminName: admin.name,
    },
  });
  const recipient = await prisma.adminEmailRecipient.create({
    data: {
      sendId: send.id,
      email: to,
      name: ctx.name,
      status: "pending",
      renderedSubject: rendered.subject,
      renderedHtml: rendered.html,
      renderedText: rendered.text,
      creditStatus: "none",
    },
  });

  const result = await sendRenderedEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    type: "admin_composer_test",
    templateKey: payload.templateKey,
    metadata: { adminEmailSendId: send.id, test: true },
  });

  const status = result.ok ? "sent" : "failed";
  await prisma.adminEmailRecipient.update({
    where: { id: recipient.id },
    data: {
      status,
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.error ?? null,
      emailLogId: result.logId,
    },
  });
  await prisma.adminEmailSend.update({
    where: { id: send.id },
    data: {
      status,
      sentCount: result.ok ? 1 : 0,
      failedCount: result.ok ? 0 : 1,
      sentAt: new Date(),
    },
  });
  await writeAuditLog({
    adminId: admin.id,
    adminName: admin.name,
    action: "email.test_sent",
    metadata: { sendId: send.id, to, status },
  });

  return {
    ok: result.ok,
    error: result.error,
    sendId: send.id,
    status,
    sentCount: result.ok ? 1 : 0,
    failedCount: result.ok ? 0 : 1,
    creditGrantedMad: 0,
  };
}

// ── Real send ────────────────────────────────────────────────────────────────

export async function sendRealEmail(
  payload: ComposePayload,
  admin: { id: string; name: string; canGrantCredit: boolean },
  requestMeta?: Record<string, unknown>,
): Promise<SendActionResult> {
  await ensureDatabaseReady();
  const validation = validateModules(payload.modules);
  if (!validation.ok) return { ok: false, error: validation.errors[0]?.message ?? "Contenu invalide." };

  const orderCheck = await validateOrderModules(validation.modules);
  if (!orderCheck.ok) return { ok: false, error: orderCheck.error };

  const resolved = await resolveRecipients(payload);
  if (resolved.error) return { ok: false, error: resolved.error };
  if (!resolved.contexts.length) return { ok: false, error: "Aucun destinataire." };

  const creditModule = findCreditModule(validation.modules);
  // A real credit grant requires CREDIT_GRANT — enforced server-side.
  if (creditModule && creditModule.behavior === "grant" && !admin.canGrantCredit) {
    const willGrant = resolved.contexts.some(
      (c) => resolveCreditForRecipient(creditModule, { kind: c.kind, hasAccount: c.hasAccount }).creditStatus === "grant",
    );
    if (willGrant) {
      return {
        ok: false,
        error: "Permission CREDIT_GRANT requise pour activer un crédit Ghost réel.",
      };
    }
  }

  const shell = await buildShellContext();
  const inactivityDays = creditModule ? await ghostCreditInactivityDays() : 0;

  // 1-2. Create the send + recipient rows up front (authoritative record before
  // any credit/email side effect).
  const send = await prisma.adminEmailSend.create({
    data: {
      status: "processing",
      recipientMode: payload.recipientMode,
      templateKey: payload.templateKey,
      subject: payload.subject,
      preheader: payload.preheader,
      eyebrow: payload.eyebrow,
      title: payload.title,
      modules: validation.modules as never,
      isTest: false,
      recipientCount: resolved.contexts.length,
      createdByAdminId: admin.id,
      createdByAdminName: admin.name,
      requestMeta: (requestMeta ?? undefined) as never,
    },
  });

  const recipientRows = await Promise.all(
    resolved.contexts.map((ctx) =>
      prisma.adminEmailRecipient.create({
        data: {
          sendId: send.id,
          customerId: ctx.customerId,
          email: ctx.email,
          name: ctx.name,
          status: "pending",
          creditStatus: "none",
        },
      }),
    ),
  );

  let sentCount = 0;
  let failedCount = 0;
  let creditGrantedMad = 0;

  for (let i = 0; i < resolved.contexts.length; i += 1) {
    const ctx = resolved.contexts[i];
    const row = recipientRows[i];
    let creditBalanceMad = ctx.creditBalanceMad;
    let creditStatus = "none";
    let creditAmountMad = 0;
    let creditTransactionId: string | null = null;

    // 3. Grant credit (idempotent) BEFORE rendering, so {{customer.creditBalance}}
    //    reflects the post-grant balance and the mail can never claim a grant
    //    that did not happen.
    if (creditModule) {
      const res = resolveCreditForRecipient(creditModule, { kind: ctx.kind, hasAccount: ctx.hasAccount });
      creditAmountMad = res.creditStatus === "grant" ? res.amountMad : 0;
      if (res.creditStatus === "grant" && ctx.customerId) {
        try {
          const key = recipientCreditKey(row.id);
          const grant = await prisma.$transaction((tx) =>
            grantCreditTx(tx, {
              customerId: ctx.customerId as string,
              amountMad: res.amountMad,
              reason: "admin_grant",
              idempotencyKey: key,
              resetsExpiration: false,
              inactivityDays,
              source: admin.name,
              note: creditModule.reason?.trim() || `Crédit Ghost — e-mail admin`,
              emailSendId: send.id,
            }),
          );
          if (grant.ok) {
            const txRow = await prisma.ghostCreditTransaction.findUnique({
              where: { idempotencyKey: key },
              select: { id: true },
            });
            creditTransactionId = txRow?.id ?? null;
            creditStatus = "granted";
            if (!grant.duplicate) {
              creditGrantedMad += res.amountMad;
              creditBalanceMad = grant.balanceMad ?? creditBalanceMad + res.amountMad;
            } else {
              creditBalanceMad = ctx.creditBalanceMad;
            }
          } else {
            creditStatus = "failed";
          }
        } catch (error) {
          console.error("[adminEmail] credit grant failed", error);
          creditStatus = "failed";
        }
      } else {
        creditStatus = res.creditStatus === "blocked_no_account" ? "blocked_no_account" : "display_only";
      }
    }

    // 4. Render personalized content for this recipient.
    const vars = buildVariableMap({ ...ctx, creditBalanceMad }, shell, validation.modules);
    const rendered = renderComposedEmail(
      {
        subject: payload.subject,
        preheader: payload.preheader,
        eyebrow: payload.eyebrow,
        title: payload.title,
        greetingName: ctx.name,
        modules: validation.modules,
      },
      vars,
      shell,
    );

    // 5-6. Send + store the per-recipient delivery result (+ frozen snapshot).
    const result = await sendRenderedEmail({
      to: ctx.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      customerId: ctx.customerId,
      type: "admin_composer",
      templateKey: payload.templateKey,
      metadata: { adminEmailSendId: send.id, adminEmailRecipientId: row.id },
    });

    const status = result.ok ? "sent" : "failed";
    if (result.ok) sentCount += 1;
    else failedCount += 1;

    await prisma.adminEmailRecipient.update({
      where: { id: row.id },
      data: {
        status,
        providerMessageId: result.providerMessageId ?? null,
        errorMessage: result.error ?? null,
        emailLogId: result.logId,
        renderedSubject: rendered.subject,
        renderedHtml: rendered.html,
        renderedText: rendered.text,
        creditAmountMad,
        creditStatus,
        creditTransactionId,
      },
    });
  }

  const finalStatus = failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";
  await prisma.adminEmailSend.update({
    where: { id: send.id },
    data: {
      status: finalStatus,
      sentCount,
      failedCount,
      creditGrantedMad,
      sentAt: new Date(),
    },
  });

  await writeAuditLog({
    adminId: admin.id,
    adminName: admin.name,
    action: "email.sent",
    metadata: {
      sendId: send.id,
      recipientCount: resolved.contexts.length,
      sentCount,
      failedCount,
      creditGrantedMad,
      subject: payload.subject,
      templateKey: payload.templateKey,
    },
  });
  if (creditGrantedMad > 0) {
    await writeAuditLog({
      adminId: admin.id,
      adminName: admin.name,
      action: "email.credit_granted",
      metadata: { sendId: send.id, totalMad: creditGrantedMad },
    });
  }

  return {
    ok: sentCount > 0 || resolved.contexts.length === 0,
    error: sentCount === 0 ? "Aucun e-mail n'a pu être envoyé." : undefined,
    sendId: send.id,
    status: finalStatus,
    sentCount,
    failedCount,
    creditGrantedMad,
  };
}

// ── Retry a failed recipient (never re-grants credit) ────────────────────────

export async function retryRecipient(
  sendId: string,
  recipientId: string,
  admin: { id: string; name: string },
): Promise<SendActionResult> {
  await ensureDatabaseReady();
  const send = await prisma.adminEmailSend.findUnique({ where: { id: sendId } });
  if (!send) return { ok: false, error: "Envoi introuvable." };
  const row = await prisma.adminEmailRecipient.findUnique({ where: { id: recipientId } });
  if (!row || row.sendId !== sendId) return { ok: false, error: "Destinataire introuvable." };
  if (row.status === "sent") return { ok: true, sendId, status: send.status };

  const shell = await buildShellContext();
  const validation = validateModules(send.modules);
  const modules = validation.modules;

  // Re-render (credit is NOT re-granted; the grant, if any, already happened and
  // its idempotency key is stable). Use the recipient's stored account balance.
  let creditBalanceMad = 0;
  let name = row.name;
  if (row.customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: row.customerId },
      select: { name: true, ghostCreditBalanceMad: true },
    });
    creditBalanceMad = c?.ghostCreditBalanceMad ?? 0;
    name = row.name || c?.name || "";
  }
  const ctx: RecipientContext = {
    input: { email: row.email, customerId: row.customerId },
    kind: row.customerId ? "customer" : "manual",
    customerId: row.customerId,
    name,
    email: row.email,
    creditBalanceMad,
    hasAccount: Boolean(row.customerId),
  };
  const vars = buildVariableMap(ctx, shell, modules);
  const rendered = renderComposedEmail(
    {
      subject: send.subject,
      preheader: send.preheader,
      eyebrow: send.eyebrow,
      title: send.title,
      greetingName: ctx.name,
      modules,
    },
    vars,
    shell,
  );

  const result = await sendRenderedEmail({
    to: row.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    customerId: row.customerId,
    type: send.isTest ? "admin_composer_test" : "admin_composer",
    templateKey: send.templateKey,
    metadata: { adminEmailSendId: sendId, adminEmailRecipientId: recipientId, retry: true },
  });

  const status = result.ok ? "sent" : "failed";
  await prisma.adminEmailRecipient.update({
    where: { id: recipientId },
    data: {
      status,
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.error ?? null,
      emailLogId: result.logId,
      renderedSubject: rendered.subject,
      renderedHtml: rendered.html,
      renderedText: rendered.text,
    },
  });

  // Recompute send counters from the authoritative recipient rows.
  const counts = await prisma.adminEmailRecipient.groupBy({
    by: ["status"],
    where: { sendId },
    _count: true,
  });
  const sentCount = counts.find((c) => c.status === "sent")?._count ?? 0;
  const failedCount = counts.find((c) => c.status === "failed")?._count ?? 0;
  const finalStatus = failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";
  await prisma.adminEmailSend.update({
    where: { id: sendId },
    data: { status: finalStatus, sentCount, failedCount },
  });

  await writeAuditLog({
    adminId: admin.id,
    adminName: admin.name,
    action: "email.retried",
    metadata: { sendId, recipientId, status },
  });

  return { ok: result.ok, error: result.error, sendId, status: finalStatus, sentCount, failedCount };
}

// ── History ──────────────────────────────────────────────────────────────────

export type HistoryRow = {
  id: string;
  subject: string;
  templateKey: string;
  createdByAdminName: string;
  createdAt: string;
  isTest: boolean;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  creditGrantedMad: number;
  status: string;
};

export async function listEmailHistory(limit = 50): Promise<HistoryRow[]> {
  await ensureDatabaseReady();
  const rows = await prisma.adminEmailSend.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    templateKey: r.templateKey,
    createdByAdminName: r.createdByAdminName,
    createdAt: r.createdAt.toISOString(),
    isTest: r.isTest,
    recipientCount: r.recipientCount,
    sentCount: r.sentCount,
    failedCount: r.failedCount,
    creditGrantedMad: r.creditGrantedMad,
    status: r.status,
  }));
}

export type SendRecipientDetail = {
  id: string;
  email: string;
  name: string;
  customerId: string | null;
  status: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  creditAmountMad: number;
  creditStatus: string;
  creditTransactionId: string | null;
};

export type SendDetail = {
  id: string;
  subject: string;
  preheader: string;
  templateKey: string;
  status: string;
  isTest: boolean;
  createdByAdminName: string;
  createdAt: string;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  creditGrantedMad: number;
  /** Rendered HTML of the first recipient (representative final content). */
  sampleHtml: string;
  recipients: SendRecipientDetail[];
};

export async function getEmailSendDetail(sendId: string): Promise<SendDetail | null> {
  await ensureDatabaseReady();
  const send = await prisma.adminEmailSend.findUnique({
    where: { id: sendId },
    include: { recipients: { orderBy: { createdAt: "asc" } } },
  });
  if (!send) return null;
  const sample = send.recipients.find((r) => r.renderedHtml) ?? send.recipients[0];
  return {
    id: send.id,
    subject: send.subject,
    preheader: send.preheader,
    templateKey: send.templateKey,
    status: send.status,
    isTest: send.isTest,
    createdByAdminName: send.createdByAdminName,
    createdAt: send.createdAt.toISOString(),
    sentAt: send.sentAt ? send.sentAt.toISOString() : null,
    recipientCount: send.recipientCount,
    sentCount: send.sentCount,
    failedCount: send.failedCount,
    creditGrantedMad: send.creditGrantedMad,
    sampleHtml: sample?.renderedHtml ?? "",
    recipients: send.recipients.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      customerId: r.customerId,
      status: r.status,
      providerMessageId: r.providerMessageId,
      errorMessage: r.errorMessage,
      creditAmountMad: r.creditAmountMad,
      creditStatus: r.creditStatus,
      creditTransactionId: r.creditTransactionId,
    })),
  };
}

// ── Drafts ───────────────────────────────────────────────────────────────────

export async function saveDraft(
  payload: ComposePayload,
  admin: { id: string; name: string },
  draftId?: string | null,
): Promise<{ ok: boolean; error?: string; draftId?: string }> {
  await ensureDatabaseReady();
  const validation = validateModules(payload.modules);
  // Drafts may be incomplete, but modules that ARE present must be well-formed.
  if (!validation.ok) return { ok: false, error: validation.errors[0]?.message ?? "Contenu invalide." };

  const data = {
    status: "draft" as const,
    recipientMode: payload.recipientMode,
    templateKey: payload.templateKey,
    subject: payload.subject,
    preheader: payload.preheader,
    eyebrow: payload.eyebrow,
    title: payload.title,
    modules: validation.modules as never,
    requestMeta: { recipients: payload.recipients } as never,
  };

  let id = draftId ?? null;
  if (id) {
    const existing = await prisma.adminEmailSend.findUnique({ where: { id }, select: { status: true } });
    if (!existing || existing.status !== "draft") id = null; // never overwrite a real send
  }

  const row = id
    ? await prisma.adminEmailSend.update({ where: { id }, data })
    : await prisma.adminEmailSend.create({
        data: {
          ...data,
          isTest: false,
          createdByAdminId: admin.id,
          createdByAdminName: admin.name,
        },
      });

  await writeAuditLog({
    adminId: admin.id,
    adminName: admin.name,
    action: "email.draft_saved",
    metadata: { draftId: row.id },
  });
  return { ok: true, draftId: row.id };
}

export async function listDrafts(): Promise<HistoryRow[]> {
  await ensureDatabaseReady();
  const rows = await prisma.adminEmailSend.findMany({
    where: { status: "draft" },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    templateKey: r.templateKey,
    createdByAdminName: r.createdByAdminName,
    createdAt: r.updatedAt.toISOString(),
    isTest: r.isTest,
    recipientCount: r.recipientCount,
    sentCount: r.sentCount,
    failedCount: r.failedCount,
    creditGrantedMad: r.creditGrantedMad,
    status: r.status,
  }));
}

export async function loadDraft(draftId: string): Promise<
  (ComposePayload & { draftId: string }) | null
> {
  await ensureDatabaseReady();
  const row = await prisma.adminEmailSend.findUnique({ where: { id: draftId } });
  if (!row || row.status !== "draft") return null;
  const meta = (row.requestMeta as { recipients?: RecipientInput[] } | null) ?? null;
  return {
    draftId: row.id,
    templateKey: row.templateKey,
    recipientMode: row.recipientMode as "existing" | "manual",
    subject: row.subject,
    preheader: row.preheader,
    eyebrow: row.eyebrow,
    title: row.title,
    recipients: meta?.recipients ?? [],
    modules: row.modules,
  };
}

/**
 * Delete a draft. Only rows still in "draft" status are removable — a real send
 * is an immutable historical record and is never destroyed here.
 */
export async function deleteDraft(
  draftId: string,
  admin: { id: string; name: string },
): Promise<{ ok: boolean; error?: string }> {
  await ensureDatabaseReady();
  const row = await prisma.adminEmailSend.findUnique({ where: { id: draftId }, select: { status: true } });
  if (!row) return { ok: false, error: "Brouillon introuvable." };
  if (row.status !== "draft") return { ok: false, error: "Seul un brouillon peut être supprimé." };
  await prisma.adminEmailSend.delete({ where: { id: draftId } });
  await writeAuditLog({
    adminId: admin.id,
    adminName: admin.name,
    action: "email.draft_deleted",
    metadata: { draftId },
  });
  return { ok: true };
}

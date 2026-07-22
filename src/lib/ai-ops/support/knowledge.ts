/**
 * Support knowledge assembler.
 *
 * Gathers the Ghost.ma policies and instructions the support assistant is
 * allowed to ground its replies in — refund policy, published FAQ, the guided
 * self-help tips, payment-method notes, and the official contact channels. All
 * of this is PUBLIC, non-customer content pulled from the same stores the public
 * site renders (legal pages, store settings, SUPPORT_HELP, payment methods), so
 * nothing here is PII or a business secret. The result is compact and bounded so
 * it fits in a cached prompt prefix without blowing the token budget.
 *
 * This is the "consult the relevant Ghost.ma knowledge" step: the assistant must
 * verify policy before answering, and it can only verify against what it is told.
 */

import "server-only";

import { getStoreSettings } from "@/lib/db/catalog";
import { getPublicPaymentMethods } from "@/lib/db/paymentMethods";
import { SUPPORT_HELP } from "@/lib/support/config";

export interface SupportKnowledge {
  refundPolicy: string | null;
  faq: { question: string; answer: string }[];
  selfHelp: { title: string; tips: string[] }[];
  paymentMethods: { name: string; note: string }[];
  contact: { whatsapp: string; email: string };
  /** Fingerprint of the knowledge used (e.g. "kb-8f3a1c") — recorded per reply
   *  so a later policy change never obscures why a past reply said what it did. */
  revision: string;
}

/** Stable short hash of the knowledge content (djb2 → base36). */
function fingerprint(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return `kb-${h.toString(36)}`;
}

/** Collapse whitespace and hard-cap a stored rich-text field for the prompt. */
function compact(value: string | null | undefined, max: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function gatherSupportKnowledge(): Promise<SupportKnowledge> {
  const [settings, payments] = await Promise.all([
    getStoreSettings(),
    getPublicPaymentMethods(),
  ]);

  const refunds = settings.legalPages.refunds;
  const refundPolicy = refunds?.published ? compact(refunds.content, 2500) || null : null;

  const faq = settings.faqItems
    .filter((i) => i.enabled)
    .slice(0, 30)
    .map((i) => ({ question: compact(i.question, 200), answer: compact(i.answer, 600) }));

  const selfHelp = Object.values(SUPPORT_HELP).map((entry) => ({
    title: entry.title,
    tips: entry.tips.slice(0, 6),
  }));

  const paymentMethods = payments.methods
    .map((m) => ({ name: m.name, note: compact(m.customerNote, 300) }))
    .filter((m) => m.note.length > 0)
    .slice(0, 12);

  const contact = { whatsapp: settings.footer.whatsappNumber, email: settings.footer.contactEmail };
  const revision = fingerprint(JSON.stringify({ refundPolicy, faq, selfHelp, paymentMethods, contact }));

  return { refundPolicy, faq, selfHelp, paymentMethods, contact, revision };
}

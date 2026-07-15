"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentCustomer, requireAdminCustomer } from "@/lib/auth";
import { absoluteUrl } from "@/lib/siteUrl";
import { feedbackTypeLabel } from "@/lib/feedback";
import { notifyFeedbackCreated } from "@/lib/discord/notify";
import {
  createFeedback,
  hashIp,
  listFeedback,
  getFeedbackDetail,
  setFeedbackStatus,
  setFeedbackPriority,
  assignFeedback,
  addFeedbackNote,
  linkFeedbackEntity,
  convertFeedbackToSupport,
  listCustomerFeedback,
} from "@/lib/db/feedback";
import type {
  FeedbackListFilters,
  FeedbackListResult,
  FeedbackDetailDTO,
} from "@/lib/feedbackDto";

type ActionResult = { ok: boolean; error?: string };

async function clientIpHash(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip") || "").trim();
  return hashIp(ip || null);
}

function deploymentVersion(): string | null {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    null
  );
}

// ── Public submission ────────────────────────────────────────────────────────

export interface SubmitFeedbackInput {
  type: string;
  subject: string;
  message: string;
  contactAllowed: boolean;
  guestName?: string;
  guestEmail?: string;
  attachmentId?: string | null;
  context: {
    relatedUrl?: string;
    relatedRoute?: string;
    pageTitle?: string;
    deviceType?: string;
    viewport?: string;
    browserSummary?: string;
  };
}

export async function submitFeedbackAction(
  input: SubmitFeedbackInput,
): Promise<{ ok: boolean; reference?: string; error?: string; rateLimited?: boolean }> {
  // Identity is derived from the session — never trusted from the client.
  const customer = await getCurrentCustomer().catch(() => null);
  const ipHash = await clientIpHash();

  const result = await createFeedback({
    type: input.type,
    subject: input.subject,
    message: input.message,
    contactAllowed: input.contactAllowed,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    attachmentId: input.attachmentId ?? null,
    deploymentVersion: deploymentVersion(),
    context: input.context,
    customer: customer ? { id: customer.id, name: customer.name, email: customer.email } : null,
    ipHash,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, rateLimited: result.rateLimited };
  }

  // Notify Discord once — only for a genuinely new submission (duplicate retries
  // return the existing reference without a second notification). Awaited +
  // guarded so it completes before the serverless function freezes and can never
  // fail the submission.
  if (result.isNew) {
    try {
      await notifyFeedbackCreated({
        reference: result.reference,
        typeLabel: feedbackTypeLabel(input.type),
        subject: input.subject,
        isGuest: !customer,
        relatedRoute: input.context.relatedRoute ?? null,
        excerpt: input.message,
        hasAttachment: Boolean(input.attachmentId),
        priority: "medium",
        adminUrl: absoluteUrl(`/admin/feedback/${result.id}`),
      });
    } catch (error) {
      console.error("[feedback:notify_error]", error);
    }
    revalidatePath("/admin/feedback");
  }

  return { ok: true, reference: result.reference };
}

/** Customer: their own feedback submissions (account area). */
export async function getMyFeedbackAction() {
  const customer = await getCurrentCustomer().catch(() => null);
  if (!customer) return [];
  return listCustomerFeedback(customer.id);
}

// ── Admin ────────────────────────────────────────────────────────────────────

function revalidate(id?: string) {
  revalidatePath("/admin/feedback");
  if (id) revalidatePath(`/admin/feedback/${id}`);
}

export async function getFeedbackListAction(
  filters: FeedbackListFilters,
): Promise<FeedbackListResult> {
  await requireAdminCustomer();
  return listFeedback(filters);
}

export async function getFeedbackDetailAction(id: string): Promise<FeedbackDetailDTO | null> {
  await requireAdminCustomer();
  return getFeedbackDetail(id);
}

export async function setFeedbackStatusAction(id: string, status: string): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const r = await setFeedbackStatus(id, status, { id: admin.id, name: admin.name });
  if (r.ok) revalidate(id);
  return r;
}

export async function setFeedbackPriorityAction(id: string, priority: string): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const r = await setFeedbackPriority(id, priority, { id: admin.id, name: admin.name });
  if (r.ok) revalidate(id);
  return r;
}

export async function assignFeedbackAction(id: string, assign: boolean): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const r = await assignFeedback(
    id,
    assign ? { id: admin.id, name: admin.name } : null,
    { id: admin.id, name: admin.name },
  );
  if (r.ok) revalidate(id);
  return r;
}

export async function addFeedbackNoteAction(id: string, body: string): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const r = await addFeedbackNote(id, { id: admin.id, name: admin.name }, body);
  if (r.ok) revalidate(id);
  return r;
}

export async function linkFeedbackEntityAction(
  id: string,
  entityType: string,
  entityRef: string,
): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const r = await linkFeedbackEntity(id, entityType, entityRef, { id: admin.id, name: admin.name });
  if (r.ok) revalidate(id);
  return r;
}

export async function convertFeedbackToSupportAction(
  id: string,
): Promise<{ ok: boolean; error?: string; reference?: string }> {
  const admin = await requireAdminCustomer();
  const r = await convertFeedbackToSupport(id, { id: admin.id, name: admin.name });
  if (r.ok) revalidate(id);
  return r;
}

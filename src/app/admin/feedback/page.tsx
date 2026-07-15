import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import FeedbackListView from "@/components/admin/feedback/FeedbackListView";
import { listFeedback } from "@/lib/db/feedback";
import type { FeedbackListFilters, FeedbackListSort } from "@/lib/feedbackDto";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const customer = await requireAdminCustomer();
  const sp = await searchParams;
  const filters: FeedbackListFilters = {
    query: str(sp.q),
    type: str(sp.type),
    status: str(sp.status),
    priority: str(sp.priority),
    audience: (str(sp.audience) as FeedbackListFilters["audience"]) || "",
    attachment: (str(sp.attachment) as FeedbackListFilters["attachment"]) || "",
    assignment: (str(sp.assignment) as FeedbackListFilters["assignment"]) || "",
    sort: (str(sp.sort) as FeedbackListSort) || "newest",
    page: Number(str(sp.page)) || 1,
  };
  const initial = await listFeedback(filters);

  return (
    <AdminShellRoute active="feedback" admin={toAdminIdentity(customer.name, customer.role)}>
      <FeedbackListView initial={initial} initialFilters={filters} />
    </AdminShellRoute>
  );
}

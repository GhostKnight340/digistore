import { notFound } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import FeedbackDetailView from "@/components/admin/feedback/FeedbackDetailView";
import { getFeedbackDetail } from "@/lib/db/feedback";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackDetailPage({
  params,
}: {
  params: Promise<{ feedbackId: string }>;
}) {
  const customer = await requireAdminCustomer();
  const { feedbackId } = await params;
  const detail = await getFeedbackDetail(feedbackId);
  if (!detail) notFound();

  return (
    <AdminShellRoute active="feedback" admin={toAdminIdentity(customer.name, customer.role)}>
      <FeedbackDetailView detail={detail} />
    </AdminShellRoute>
  );
}

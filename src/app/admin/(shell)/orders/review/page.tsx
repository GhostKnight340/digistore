import PaymentReviewScreen from "@/components/admin/orders/PaymentReviewScreen";
import { getAdminOrdersPage } from "@/lib/db/orders";

export const dynamic = "force-dynamic";

export default async function AdminPaymentReviewPage() {
  const orders = await getAdminOrdersPage({
    take: 200,
    statuses: ["payment_submitted", "payment_issue", "rejected"],
  });
  return <PaymentReviewScreen orders={orders} />;
}

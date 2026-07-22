import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import RefundsQueueView from "@/components/admin/refunds/RefundsQueueView";
import { listRefundRequests, type RefundQueueFilters } from "@/lib/db/refundsQuery";
import { getAdminPaymentMethods } from "@/lib/db/paymentMethods";
import type { RefundQueueTab } from "@/lib/refunds/status";
import type { RefundReason } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AdminRefundsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const customer = await requireAdminCustomer();
  const sp = await searchParams;
  const filters: RefundQueueFilters = {
    tab: (str(sp.tab) as RefundQueueTab) || "new",
    reason: (str(sp.reason) as RefundReason) || null,
    paymentMethod: str(sp.method) || null,
    q: str(sp.q) || null,
    dateFrom: str(sp.from) || null,
    dateTo: str(sp.to) || null,
    page: Number(str(sp.page)) || 1,
  };
  const [initial, config] = await Promise.all([
    listRefundRequests(filters),
    getAdminPaymentMethods(),
  ]);
  const paymentMethods = config.methods.map((m) => ({ id: m.id, name: m.name }));

  return (
    <AdminShellRoute active="refunds" admin={toAdminIdentity(customer.name, customer.role)}>
      <RefundsQueueView
        initial={initial}
        initialFilters={filters}
        paymentMethods={paymentMethods}
      />
    </AdminShellRoute>
  );
}

import { notFound } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import DepartmentDetailView from "@/components/admin/ai-operations/DepartmentDetail";
import { getDepartmentDetail } from "@/lib/ai-ops/departmentDetail";

export const dynamic = "force-dynamic";

/**
 * /admin/ai-operations/modules/[module] — the Command Center department detail:
 * overview + performance, tool permissions, execution history, and the module's
 * schedule/cost configuration (all four tabs). Admin-only.
 */
export default async function AiModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const customer = await requireAdminCustomer();
  const { module } = await params;
  const detail = await getDepartmentDetail(module);
  if (!detail) notFound();

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <DepartmentDetailView detail={detail} />
    </AdminShellRoute>
  );
}

import { notFound } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import AiModuleConfigForm from "@/components/admin/ai-operations/AiModuleConfigForm";
import { getModuleConfig } from "@/lib/ai-ops/store";

export const dynamic = "force-dynamic";

/** /admin/ai-operations/modules/[module] — per-module configuration page. */
export default async function AiModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const customer = await requireAdminCustomer();
  const { module } = await params;
  const config = await getModuleConfig(module);
  if (!config) notFound();

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <div className="mb-4">
        <a href="/admin/ai-operations" className="text-xs text-faint hover:text-white">← AI Operations</a>
        <h1 className="mt-1 text-lg font-semibold text-white">{config.label}</h1>
        <p className="text-xs text-muted">{config.description}</p>
      </div>
      <AiModuleConfigForm config={config} />
    </AdminShellRoute>
  );
}

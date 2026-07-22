import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import { getStatus, getRecentMedia } from "@/lib/composio/instagram/service";
import type { InstagramMediaDTO } from "@/lib/composio/instagram/types";
import InstagramIntegrationView from "@/components/admin/integrations/InstagramIntegrationView";

/**
 * Admin > Intégrations > Instagram.
 *
 * Server component: gates on an admin session, loads the browser-safe status DTO
 * (no Composio ids) and — when connected — recent media. All mutations happen
 * through server actions in src/app/actions/instagram.ts.
 */
export const dynamic = "force-dynamic";

type Banner = "connected" | "error-oauth" | "error-verify" | null;

function bannerFrom(params: Record<string, string | string[] | undefined>): Banner {
  if (params.connected === "1") return "connected";
  if (params.error === "oauth") return "error-oauth";
  if (params.error === "verify") return "error-verify";
  return null;
}

export default async function InstagramIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const customer = await requireAdminCustomer();
  const params = await searchParams;

  const status = await getStatus();

  // Recent media is a live Composio read — never let it break the page.
  let media: InstagramMediaDTO[] = [];
  if (status.connected) {
    try {
      media = await getRecentMedia(12);
    } catch {
      media = [];
    }
  }

  return (
    <AdminShellRoute active="integrations" admin={toAdminIdentity(customer.name, customer.role)}>
      <InstagramIntegrationView status={status} media={media} banner={bannerFrom(params)} />
    </AdminShellRoute>
  );
}

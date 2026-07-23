import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import { getStatusSafe } from "@/lib/composio/instagram/service";
import { listPublications, listQueue } from "@/lib/composio/instagram/contentStore";
import type { StudioContentItemDTO } from "@/lib/composio/instagram/types";
import InstagramIntegrationView from "@/components/admin/integrations/InstagramIntegrationView";
import InstagramStudio from "@/components/admin/integrations/instagram/studio/InstagramStudio";

/**
 * Admin > Intégrations > Instagram.
 *
 * Server component: gates on an admin session, loads the browser-safe status DTO
 * (no Composio ids). When connected it renders the Instagram Content Studio (its
 * own full-height layout, hence `bare`); when not, it falls back to the connect
 * flow. All mutations go through the server actions in
 * src/app/actions/instagram.ts and src/app/actions/instagramStudio.ts.
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
  const admin = toAdminIdentity(customer.name, customer.role);
  const banner = bannerFrom(params);

  const status = await getStatusSafe();

  if (status.connected) {
    // Queue + publications are DB reads — never let them break the studio.
    let queue: StudioContentItemDTO[] = [];
    let publications: StudioContentItemDTO[] = [];
    try {
      [queue, publications] = await Promise.all([listQueue(), listPublications()]);
    } catch {
      queue = [];
      publications = [];
    }

    return (
      <AdminShellRoute active="integrations" admin={admin} bare>
        <InstagramStudio status={status} queue={queue} publications={publications} banner={banner} />
      </AdminShellRoute>
    );
  }

  return (
    <AdminShellRoute active="integrations" admin={admin}>
      <InstagramIntegrationView status={status} media={[]} banner={banner} />
    </AdminShellRoute>
  );
}

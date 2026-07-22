import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAdminCustomer } from "@/lib/auth";
import { absoluteUrl } from "@/lib/siteUrl";
import { writeAuditLog } from "@/lib/db/adminAudit";
import * as instagram from "@/lib/composio/instagram/service";
import { normalizeComposioError } from "@/lib/composio/server";

/**
 * Composio Managed OAuth callback. Composio redirects the admin here after the
 * Instagram consent screen. We confirm the connection became active, verify it,
 * and bounce back to the integration page with a result flag.
 *
 * Security: admin-gated; only ever redirects to our own internal admin path
 * (no open redirect — we never echo a browser-supplied return URL). The Composio
 * `status` query param is treated as a hint only; the real check is the
 * server-side connection state.
 */
export const dynamic = "force-dynamic";

const ADMIN_PATH = "/admin/integrations/instagram";

function back(param: string): NextResponse {
  return NextResponse.redirect(absoluteUrl(`${ADMIN_PATH}?${param}`));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdminCustomer();
  if (!admin) {
    return NextResponse.redirect(absoluteUrl("/login?next=" + encodeURIComponent(ADMIN_PATH)));
  }

  const status = req.nextUrl.searchParams.get("status");
  if (status && status !== "success") {
    await writeAuditLog({
      adminId: admin.id,
      adminName: admin.name,
      action: "instagram.action_failed",
      metadata: { flow: "oauth_callback", status },
    });
    return back("error=oauth");
  }

  try {
    const result = await instagram.completeConnect();
    await writeAuditLog({
      adminId: admin.id,
      adminName: admin.name,
      action: result.ok ? "instagram.connected" : "instagram.action_failed",
      metadata: { flow: "oauth_callback", status: result.status, username: result.username },
    });
    return back(result.ok ? "connected=1" : "error=verify");
  } catch (error) {
    const norm = normalizeComposioError(error);
    // eslint-disable-next-line no-console
    console.error("[instagram-callback]", norm.logHint);
    return back("error=verify");
  }
}

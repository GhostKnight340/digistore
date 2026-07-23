import { handleCronRequest } from "@/lib/ops/cronRoute";
import { publishDueScheduled } from "@/lib/composio/instagram/scheduledSweep";

/**
 * Cron: publish scheduled Instagram posts whose time has arrived.
 *
 * Auth + observability come from handleCronRequest (Bearer CRON_SECRET, fails
 * closed when unset). The sweep itself claims each row atomically so overlapping
 * invocations never double-post. Scheduled every 5 minutes (see vercel.json).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCronRequest("instagram-publish", request, async () => publishDueScheduled());
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}

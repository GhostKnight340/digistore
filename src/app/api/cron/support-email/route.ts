import { handleCronRequest } from "@/lib/ops/cronRoute";
import { processDueEmailIntakes } from "@/lib/support/emailIntake";

/**
 * Support email intake worker (Vercel Cron — every 5 min, see vercel.json).
 *
 * Processes inbound-email intakes whose `dueAt` delay has elapsed: match to an
 * existing ticket and append, or create a new one. Serverless-safe: each intake
 * is claimed atomically so overlapping runs never double-process. Same auth
 * contract as the other crons (Bearer CRON_SECRET, fails closed).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCronRequest("support-email", request, async () => processDueEmailIntakes());
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

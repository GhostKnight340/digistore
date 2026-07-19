import { NextResponse } from "next/server";
import { checkAuth, checkDatabase, withHealthTimeout } from "@/lib/ops/health";
import { rollUpHealth } from "@/lib/ops/types";

/**
 * Public liveness/readiness probe for an external uptime monitor.
 *
 * Deliberately minimal: `{ status, version }` and nothing else. The rich
 * HealthResult objects behind the admin dashboard carry French `message` /
 * `action` strings that name Neon, Resend and specific env vars — useful to an
 * admin, a free reconnaissance gift to anyone else. None of that crosses this
 * boundary, and this route stays unauthenticated only because of that.
 *
 * Scope is also minimal on purpose: connectivity (DB) plus the session secret,
 * both under the shared timeout. It does NOT run the email/Discord/supplier
 * checks — an uptime monitor polling every minute must not amplify into
 * repeated counting queries or provider calls.
 *
 * See docs/uptime-monitoring.md for how to point a monitor at it.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const [database] = await Promise.all([
    withHealthTimeout("database", "database", checkDatabase),
  ]);
  const status = rollUpHealth([database, checkAuth()]);
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;

  return NextResponse.json(
    { status, version: sha ? sha.slice(0, 7) : "local" },
    {
      // 200 while serving, 503 when a dependency is down, so a monitor can
      // alert on the HTTP status alone without parsing the body.
      status: status === "offline" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

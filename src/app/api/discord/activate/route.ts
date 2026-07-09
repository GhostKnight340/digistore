import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDiscordDmWorkerSecret } from "@/lib/discord/config";
import { verifyAndActivate } from "@/lib/discord/activation";

/**
 * Internal endpoint called ONLY by the standalone Discord DM worker after it
 * receives an activation code in a DM. Authenticated with an HMAC-SHA256
 * signature over `${timestamp}.${rawBody}` using DISCORD_DM_WORKER_SECRET.
 *
 * Fails closed when the secret is unconfigured. Never logs the code, and only
 * returns a coarse status so the worker can pick the right French reply.
 */

const MAX_SKEW_MS = 5 * 60 * 1000;

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const secret = getDiscordDmWorkerSecret();
  if (!secret) {
    // Worker path not configured — fail closed without leaking that fact loudly.
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const signature = request.headers.get("x-ghost-signature") ?? "";
  const timestamp = request.headers.get("x-ghost-timestamp") ?? "";
  const rawBody = await request.text();

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  if (!safeEqualHex(signature, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: {
    code?: string;
    discordUserId?: string;
    discordUsername?: string | null;
    discordDisplayName?: string | null;
    discordAvatar?: string | null;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (!payload.code || !payload.discordUserId) {
    return NextResponse.json({ status: "invalid" });
  }

  try {
    const result = await verifyAndActivate({
      code: payload.code,
      discordUserId: payload.discordUserId,
      discordUsername: payload.discordUsername ?? null,
      discordDisplayName: payload.discordDisplayName ?? null,
      discordAvatar: payload.discordAvatar ?? null,
    });
    // Never echo the code back.
    return NextResponse.json({ status: result.status });
  } catch (error) {
    console.error("[discord:activate:endpoint]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

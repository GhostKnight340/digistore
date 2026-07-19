import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { createPendingAttachment } from "@/lib/db/feedback";
import { prisma } from "@/lib/db/prisma";
import { POLICIES, consume, dim, requestIp } from "@/lib/rateLimit";

/**
 * Public upload endpoint for an OPTIONAL feedback screenshot. Stores the file the
 * same way as product media (data: URL in prod, /public/uploads in dev — no
 * storage credentials involved), creates a PENDING FeedbackAttachment row, and
 * returns only its id. The feedback submit action links that id to the new
 * submission; an unlinked pending attachment is harmless (viewable only by
 * admins).
 *
 * The heavy image body goes through this route handler (not the server action)
 * so it isn't constrained by the server-action body limit; the submission then
 * carries only the small attachment id.
 *
 * Validation is server-side and does not trust the client: the declared
 * `file.type` on a multipart part is attacker-controlled, so the real content
 * type is SNIFFED from the file's magic bytes and the sniffed value — never the
 * declared one — is what gets stored and echoed back. Size is capped, and
 * because each accepted file becomes ~1.33× its size in base64 DB text this
 * route is additionally throttled per IP and guarded by a global circuit breaker
 * on recent unlinked uploads.
 */

/** Sniffed content types we accept. Keep in sync with sniffImageType. */
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Ceiling on unlinked attachments created in the last hour, across all callers.
 * This is a DURABLE storage-exhaustion backstop — it is a DB count, so unlike
 * the per-instance IP limiter it holds however many serverless instances are
 * running. FeedbackAttachment has no IP/owner column and we cannot add one
 * without a migration, so the cap is necessarily global rather than per-caller:
 * an attacker who saturates it also blocks legitimate uploads for the rest of
 * the window. That is the deliberate trade — a temporary loss of an optional
 * screenshot field is far cheaper than unbounded Neon storage growth. The
 * threshold is set well above any plausible organic hour.
 */
const MAX_RECENT_PENDING = 200;
const PENDING_WINDOW_MS = 60 * 60 * 1000;

/**
 * Identify the real image type from the leading bytes. Returns null for anything
 * that isn't one of the three formats we accept, which also rejects a payload
 * that merely claims to be an image.
 */
function sniffImageType(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterMs } = consume([
      dim("feedback-attachment:ip", requestIp(req), POLICIES.attachmentIp),
    ]);
    if (!allowed) {
      return NextResponse.json(
        { error: "Trop d'envois. Veuillez patienter avant de réessayer." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
        },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
    }
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "Le fichier dépasse la limite de 5 Mo." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(bytes);

    // The authoritative type: sniffed from content, not read off the request.
    const mimeType = sniffImageType(buffer);
    if (!mimeType || !ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Seules les images PNG, JPG et WebP sont autorisées." },
        { status: 400 },
      );
    }

    const recentPending = await prisma.feedbackAttachment.count({
      where: {
        submissionId: null,
        createdAt: { gte: new Date(Date.now() - PENDING_WINDOW_MS) },
      },
    });
    if (recentPending >= MAX_RECENT_PENDING) {
      return NextResponse.json(
        { error: "Import temporairement indisponible. Veuillez réessayer plus tard." },
        { status: 503 },
      );
    }

    const fileName = (file.name || "capture").slice(0, 200);

    let url: string;
    if (process.env.NODE_ENV === "production") {
      url = `data:${mimeType};base64,${buffer.toString("base64")}`;
    } else {
      const ext =
        mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
      const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
      const uploadsDir = join(process.cwd(), "public", "uploads");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(join(uploadsDir, name), buffer);
      url = `/uploads/${name}`;
    }

    const attachmentId = await createPendingAttachment({
      mimeType,
      fileName,
      sizeBytes: buffer.byteLength,
      url,
    });

    return NextResponse.json({ attachmentId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[feedback:attachment]", err);
    return NextResponse.json({ error: "Import impossible." }, { status: 500 });
  }
}

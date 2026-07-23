import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { POLICIES, consume, dim, requestIp } from "@/lib/rateLimit";

/**
 * Public upload endpoint for refund evidence (request form + the secure
 * "provide more info" page). Stores the file the same way as product/feedback
 * media (data: URL in prod, /public/uploads in dev — no storage credentials) and
 * returns a small descriptor { url, fileName, mimeType, sizeBytes }. The file is
 * only PERSISTED as a RefundAttachment when the request/submit action runs, so
 * an unlinked upload leaves no DB row.
 *
 * Validation never trusts the client: the declared multipart `file.type` is
 * attacker-controlled, so the real type is SNIFFED from magic bytes. Accepts
 * PNG/JPEG/WebP + PDF. Size-capped and throttled per IP.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (matches the rest of the app)

/** Sniff the real type from leading bytes; null rejects anything else. */
function sniffType(buffer: Buffer): string | null {
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
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  return null;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterMs } = await consume([
      dim("refund-attachment:ip", requestIp(req), POLICIES.attachmentIp),
    ]);
    if (!allowed) {
      return NextResponse.json(
        { error: "Trop d'envois. Veuillez patienter avant de réessayer." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
    }
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Le fichier dépasse la limite de 5 Mo." }, { status: 400 });
    }
    const buffer = Buffer.from(bytes);

    const mimeType = sniffType(buffer);
    if (!mimeType) {
      return NextResponse.json(
        { error: "Seuls les fichiers PNG, JPG, WebP et PDF sont autorisés." },
        { status: 400 },
      );
    }

    const fileName = (file.name || "piece-jointe").slice(0, 200);

    let url: string;
    if (process.env.NODE_ENV === "production") {
      url = `data:${mimeType};base64,${buffer.toString("base64")}`;
    } else {
      const name = `refund-${Date.now()}-${randomBytes(6).toString("hex")}.${EXT[mimeType]}`;
      const uploadsDir = join(process.cwd(), "public", "uploads");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(join(uploadsDir, name), buffer);
      url = `/uploads/${name}`;
    }

    return NextResponse.json(
      { url, fileName, mimeType, sizeBytes: buffer.byteLength },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[refund:attachment]", err);
    return NextResponse.json({ error: "Import impossible." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { createPendingAttachment } from "@/lib/db/feedback";

/**
 * Public upload endpoint for an OPTIONAL feedback screenshot. Validates the file
 * type and size server-side (never trusting the client), stores it the same way
 * as product media (data: URL in prod, /public/uploads in dev — no storage
 * credentials involved), creates a PENDING FeedbackAttachment row, and returns
 * only its id. The feedback submit action links that id to the new submission;
 * an unlinked pending attachment is harmless (viewable only by admins).
 *
 * The heavy image body goes through this route handler (not the server action)
 * so it isn't constrained by the server-action body limit; the submission then
 * carries only the small attachment id.
 */

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/jpg"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Seules les images PNG, JPG et WebP sont autorisées." },
        { status: 400 },
      );
    }
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "Le fichier dépasse la limite de 5 Mo." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(bytes);
    const fileName = (file.name || "capture").slice(0, 200);

    let url: string;
    if (process.env.NODE_ENV === "production") {
      url = `data:${file.type};base64,${buffer.toString("base64")}`;
    } else {
      const ext =
        file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
      const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
      const uploadsDir = join(process.cwd(), "public", "uploads");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(join(uploadsDir, name), buffer);
      url = `/uploads/${name}`;
    }

    const attachmentId = await createPendingAttachment({
      mimeType: file.type,
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

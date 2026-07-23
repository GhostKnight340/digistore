import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { getCurrentAdminCustomer } from "@/lib/auth";
import {
  productMediaBlobConfigured,
  uploadProductMedia,
} from "@/lib/storage/blob";
import { MAX_IMAGE_BYTES, validateImage } from "@/lib/storage/imageValidation";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/jpg"];

export async function POST(req: NextRequest) {
  try {
    const admin = await getCurrentAdminCustomer();
    if (!admin) {
      return NextResponse.json({ error: "Accès admin requis." }, { status: 403 });
    }

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
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Le fichier dépasse la limite de 5 Mo." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(bytes);

    // Defense in depth: sniff the real bytes, don't trust the declared type.
    const validation = validateImage(buffer, file.type);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Preferred path: a dedicated product-media Blob store is wired (staging /
    // production). New media NEVER lands in Postgres as base64. An upload failure
    // returns an error and leaves any existing product image untouched — the
    // client only swaps the image after a 2xx.
    if (productMediaBlobConfigured()) {
      const uploaded = await uploadProductMedia({ buffer, declaredType: file.type });
      return NextResponse.json(uploaded);
    }

    // No Blob store configured. In production that is a misconfiguration — refuse
    // rather than silently reviving the base64-in-Postgres path we are retiring.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Stockage des médias non configuré." },
        { status: 503 },
      );
    }

    // Local dev fallback: write to public/uploads and serve from there.
    const ext = validation.ext;
    const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const uploadsDir = join(process.cwd(), "public", "uploads");

    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, name), buffer);

    return NextResponse.json({
      url: `/uploads/${name}`,
      mimeType: validation.mimeType,
      fileSize: validation.size,
    });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json({ error: "Import impossible." }, { status: 500 });
  }
}

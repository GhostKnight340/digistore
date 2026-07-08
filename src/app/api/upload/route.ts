import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { getCurrentAdminCustomer } from "@/lib/auth";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/jpg"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "Le fichier dépasse la limite de 5 Mo." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(bytes);

    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({
        url: `data:${file.type};base64,${buffer.toString("base64")}`,
      });
    }

    const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
    const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const uploadsDir = join(process.cwd(), "public", "uploads");

    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, name), buffer);

    return NextResponse.json({ url: `/uploads/${name}` });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json({ error: "Import impossible." }, { status: 500 });
  }
}

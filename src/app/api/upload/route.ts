import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/jpg"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PNG, JPG, and WebP images are allowed." },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 5 MB limit." },
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
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";

/**
 * Serves a product's stored thumbnail as real image bytes so the header
 * autocomplete can show thumbnails without embedding megabytes of base64 in the
 * JSON search response (product images live as `data:` URIs in Postgres — see
 * architecture §9). Only public, active products resolve; the bytes are safely
 * long-cacheable because a product's image rarely changes.
 */

function parseDataUri(uri: string): { mime: string; body: Buffer } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(uri);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const body = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]));
  return { mime, body };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  await ensureDatabaseReady();

  const product = await prisma.product.findFirst({
    where: {
      slug,
      active: true,
      categoryRecord: { is: { active: true } },
      variants: { some: { active: true } },
    },
    select: {
      imageUrl: true,
      media: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { url: true },
      },
    },
  });

  const src = product?.imageUrl ?? product?.media[0]?.url ?? null;
  if (!src) return new NextResponse(null, { status: 404 });

  if (src.startsWith("data:")) {
    const parsed = parseDataUri(src);
    if (!parsed) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(parsed.body), {
      headers: {
        "Content-Type": parsed.mime,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }

  // A plain URL (external or /uploads in dev) — hand the browser the source.
  return NextResponse.redirect(new URL(src, _request.url), 302);
}

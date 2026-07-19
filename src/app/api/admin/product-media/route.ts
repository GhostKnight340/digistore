import { NextResponse } from "next/server";
import { getCurrentAdminCustomer } from "@/lib/auth";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import {
  buildZip,
  extensionForMime,
  parseDataUri,
  safeFileName,
  uniqueName,
  type ZipEntry,
} from "@/lib/zip";

/**
 * Admin export: every product image as a single .zip, one folder, each file
 * named after its product.
 *
 * Product artwork lives as `data:` URIs in Postgres (architecture §9), so there
 * is no bucket to sync from — the bytes are decoded straight out of the rows.
 * Any non-`data:` value (an external URL, a dev disk path) is skipped rather
 * than fetched: this endpoint must not make outbound requests on an admin
 * click. Skipped items are reported in the response headers so the admin knows
 * the export is partial.
 */

const FOLDER = "products media";

export async function GET() {
  const admin = await getCurrentAdminCustomer();
  if (!admin) {
    return NextResponse.json({ error: "Accès admin requis." }, { status: 403 });
  }

  await ensureDatabaseReady();

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      imageUrl: true,
      media: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { url: true },
      },
    },
  });

  const entries: ZipEntry[] = [];
  const taken = new Set<string>();
  let skipped = 0;

  for (const product of products) {
    const base = safeFileName(product.name);
    // The main artwork first, then any gallery media, so the primary image
    // keeps the clean "<Product>.png" name and extras get "(2)", "(3)"…
    const sources = [product.imageUrl, ...product.media.map((m) => m.url)];

    for (const source of sources) {
      if (!source) continue;
      const parsed = parseDataUri(source);
      if (!parsed) {
        skipped++;
        continue;
      }
      entries.push({
        path: `${FOLDER}/${uniqueName(taken, base, extensionForMime(parsed.mime))}`,
        data: parsed.data,
      });
    }
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "Aucune image de produit à exporter." },
      { status: 404 },
    );
  }

  const zip = buildZip(entries);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.length),
      "Content-Disposition": 'attachment; filename="products-media.zip"',
      // Surfaced by the admin button so a partial export is never silent.
      "X-Export-Count": String(entries.length),
      "X-Export-Skipped": String(skipped),
      "Cache-Control": "no-store",
    },
  });
}

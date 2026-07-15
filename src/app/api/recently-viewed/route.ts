import { NextResponse } from "next/server";
import { getVisibleParentCardsBySlugs } from "@/lib/db/catalog";

/**
 * Resolves a device's recently-viewed product SLUGS (passed by the client from
 * localStorage) to visible parent-product cards, in the given order. Hidden,
 * inactive, or removed products are dropped server-side so history never leaks
 * unavailable products, and prices are always fresh. No personal data is read or
 * stored; this is a pure read keyed only on the slugs the client already holds.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("slugs") ?? "").trim();
  if (!raw) return NextResponse.json({ products: [] });
  const slugs = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24);
  try {
    const products = await getVisibleParentCardsBySlugs(slugs);
    return NextResponse.json(
      { products },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ products: [] }, { status: 500 });
  }
}

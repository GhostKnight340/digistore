import { NextResponse } from "next/server";
import { searchProductsPreview } from "@/lib/db/catalog";

/**
 * Public product autocomplete for the header search bar. Returns only compact,
 * publicly-discoverable parent products (visibility/active/inventory rules are
 * enforced in `searchProductsPreview`). Never exposes stock, variant, or
 * fulfilment data.
 */

const PREVIEW_LIMIT = 6;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json({ query, results: [], hasMore: false });
  }

  try {
    const { results, hasMore } = await searchProductsPreview(query, PREVIEW_LIMIT);
    return NextResponse.json(
      { query, results, hasMore },
      {
        headers: {
          // Short private cache: keystroke queries are cheap to re-run and the
          // catalogue changes rarely, but results must never be shared/CDN'd.
          "Cache-Control": "private, max-age=30",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { query, results: [], hasMore: false, error: "search_failed" },
      { status: 500 },
    );
  }
}

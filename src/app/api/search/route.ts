import { NextResponse } from "next/server";
import { searchStorefront } from "@/lib/db/catalog";

/**
 * Public storefront autocomplete for the header search bar. Returns compact,
 * grouped, publicly-discoverable results — products (parent-level), categories,
 * and public collections. Visibility/active/inventory/schedule rules are all
 * enforced in `searchStorefront`. Never exposes stock counts, variants,
 * supplier cost, provider, or any admin-only data.
 */

const PREVIEW_LIMIT = 6;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json({
      query,
      products: [],
      categories: [],
      collections: [],
      hasMore: false,
    });
  }

  try {
    const groups = await searchStorefront(query, { productLimit: PREVIEW_LIMIT });
    return NextResponse.json(groups, {
      headers: {
        // Short private cache: keystroke queries are cheap to re-run and the
        // catalogue changes rarely, but results must never be shared/CDN'd.
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch {
    return NextResponse.json(
      {
        query,
        products: [],
        categories: [],
        collections: [],
        hasMore: false,
        error: "search_failed",
      },
      { status: 500 },
    );
  }
}

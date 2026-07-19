import { NextResponse } from "next/server";
import { searchStorefront } from "@/lib/db/catalog";
import { POLICIES, consume, dim, requestIp } from "@/lib/rateLimit";

/**
 * Public storefront autocomplete for the header search bar. Returns compact,
 * grouped, publicly-discoverable results — products (parent-level), categories,
 * and public collections. Visibility/active/inventory/schedule rules are all
 * enforced in `searchStorefront`. Never exposes stock counts, variants,
 * supplier cost, provider, or any admin-only data.
 */

const PREVIEW_LIMIT = 6;

/**
 * Upper bound on `q`. Every distinct query becomes an `unstable_cache` key in
 * searchStorefront, so an unbounded query length let an attacker mint unlimited
 * cache entries. Unlike the rate limit below this cap is durable — it holds no
 * matter how many serverless instances are running — and it is the real defence
 * against cache-key blow-up. No genuine autocomplete query approaches 64 chars.
 */
const MAX_QUERY_LENGTH = 64;

const EMPTY = {
  products: [],
  categories: [],
  collections: [],
  guides: [],
  hasMore: false,
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  // Over-long queries are truncated rather than rejected: a real user pasting a
  // long string still gets sensible results, and the cache key stays bounded.
  const boundedQuery = query.slice(0, MAX_QUERY_LENGTH);

  if (boundedQuery.length < 2) {
    return NextResponse.json({ query: boundedQuery, ...EMPTY });
  }

  // Unauthenticated endpoint: throttle per IP so search cannot be used to hammer
  // the database. Budget is generous enough for fast typing (the client debounces
  // keystrokes) but stops scripted floods from a single source.
  const { allowed, retryAfterMs } = consume([
    dim("search:ip", requestIp(request), POLICIES.searchIp),
  ]);
  if (!allowed) {
    return NextResponse.json(
      { query: boundedQuery, ...EMPTY, error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const groups = await searchStorefront(boundedQuery, { productLimit: PREVIEW_LIMIT });
    return NextResponse.json(groups, {
      headers: {
        // Short private cache: keystroke queries are cheap to re-run and the
        // catalogue changes rarely, but results must never be shared/CDN'd.
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch {
    return NextResponse.json(
      { query: boundedQuery, ...EMPTY, error: "search_failed" },
      { status: 500 },
    );
  }
}

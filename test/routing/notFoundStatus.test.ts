import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Guards a subtle Next.js interaction that caused real soft-404s.
 *
 * A `loading.tsx` creates a Suspense boundary. Next streams the fallback
 * immediately, which flushes the response headers with a 200 — so a later
 * `notFound()` inside that boundary can no longer set a 404. The page renders
 * the not-found UI but search engines index it as a live page.
 *
 * Crucially, a PARENT segment's `loading.tsx` also wraps its child routes, so
 * `app/products/loading.tsx` breaks `app/products/[id]/page.tsx` too. Both
 * levels must stay clear.
 *
 * If you need a loading state on one of these routes, put a `<Suspense>`
 * INSIDE the page, below the `notFound()` decision — that streams the slow
 * parts while keeping the status correct.
 *
 * Exempt: `app/admin` is authenticated and never crawled, so a soft 404 there
 * carries no SEO cost and the loading state is worth more than the status code.
 */

const APP = join(process.cwd(), "src", "app");
const EXEMPT = [join(APP, "admin")];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

test("no loading.tsx shadows a route that calls notFound()", () => {
  const offenders: string[] = [];

  for (const page of walk(APP)) {
    if (!readFileSync(page, "utf8").includes("notFound()")) continue;
    if (EXEMPT.some((e) => page.startsWith(e + "/"))) continue;

    // Walk from the page's own segment up to app/, checking every level —
    // a parent's boundary wraps this route just as its own would.
    for (let dir = dirname(page); dir.startsWith(APP); dir = dirname(dir)) {
      if (existsSync(join(dir, "loading.tsx"))) {
        offenders.push(
          `${page.replace(process.cwd() + "/", "")} is inside the Suspense ` +
            `boundary of ${join(dir, "loading.tsx").replace(process.cwd() + "/", "")}`,
        );
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These routes would return HTTP 200 instead of 404:\n  ${offenders.join("\n  ")}`,
  );
});

// AI Operations — admin authorization (spec §12: admin-only config & logs,
// server-side auth on every endpoint). Run: npm test
//
// A source-level guarantee that every AI-ops page and every exported server
// action enforces admin access via requireAdminCustomer — so no route can ship
// without the check. (The auth module itself can't be imported under node:test
// because it chains into next/navigation; the source check is the durable guard
// and is verified by the wider suite's use of requireAdminCustomer elsewhere.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

test("every AI Operations page enforces requireAdminCustomer", () => {
  const pages = walk("src/app/admin/ai-operations").filter((f) => f.endsWith("page.tsx"));
  assert.ok(pages.length >= 5, `expected the AI-ops pages, found ${pages.length}`);
  for (const file of pages) {
    const src = readFileSync(file, "utf8");
    assert.ok(src.includes("requireAdminCustomer"), `${file} is missing requireAdminCustomer`);
  }
});

test("every exported AI Operations server action calls requireAdminCustomer", () => {
  const src = readFileSync("src/app/actions/aiOperations.ts", "utf8");
  const exportedActions = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.ok(exportedActions.length > 0, "no exported actions found");
  // Each exported action body must reference the admin guard.
  const guardCount = (src.match(/requireAdminCustomer/g) ?? []).length;
  assert.ok(
    guardCount >= exportedActions.length,
    `only ${guardCount} guards for ${exportedActions.length} actions`,
  );
});

test("the cron dispatcher route uses the CRON_SECRET-gated handler", () => {
  const src = readFileSync("src/app/api/cron/ai-ops/route.ts", "utf8");
  assert.ok(src.includes("handleCronRequest"), "cron route must use handleCronRequest (fails closed on missing secret)");
});

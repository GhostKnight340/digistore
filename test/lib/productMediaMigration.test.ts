// Blob migration safety: idempotent retries, partial-failure recovery, and
// delete-only-when-unreferenced. The pure decode/validate/skip logic is unit
// tested in imageValidation.test.ts; the upload/DB/Blob wiring is asserted at the
// source level (no live Blob/DB here). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("scripts/migrate-product-images-to-blob.ts", "utf8");
const blob = readFileSync("src/lib/storage/blob.ts", "utf8");
const gc = readFileSync("src/lib/storage/productMediaGc.ts", "utf8");

test("migration only picks un-migrated rows (idempotent reruns)", () => {
  // ProductMedia already migrated (blobUrl set) is excluded; Product.imageUrl only
  // when still a base64 data URI.
  assert.match(migration, /url:\s*\{\s*startsWith:\s*"data:"\s*\},\s*blobUrl:\s*null/);
  assert.match(migration, /imageUrl:\s*\{\s*startsWith:\s*"data:"\s*\}/);
});

test("DB row is updated only AFTER a successful upload (partial-failure recovery)", () => {
  // The update call is inside the try, after uploadProductMedia resolves.
  assert.match(migration, /const uploaded = await uploadProductMedia/);
  const uploadIdx = migration.indexOf("uploadProductMedia({ buffer");
  const updateIdx = migration.indexOf(".update({");
  assert.ok(uploadIdx > 0 && uploadIdx < updateIdx, "upload must precede the DB update");
});

test("uploads use a random suffix so retries never overwrite (duplicate-safe)", () => {
  assert.match(blob, /addRandomSuffix:\s*true/);
  // Validation happens before the product-media put (defense in depth). Anchor on
  // addRandomSuffix, which is unique to the product-media upload.
  const validateIdx = blob.indexOf("validateImage(input.buffer");
  const putIdx = blob.indexOf("addRandomSuffix: true");
  assert.ok(validateIdx > 0 && validateIdx < putIdx, "validate before upload");
});

test("migration refuses to run against production and is dry-run by default", () => {
  assert.match(migration, /activeDbIsProduction\(\)/);
  assert.match(migration, /const apply = args\.includes\("--apply"\)/);
});

test("Blob deletion only happens when no row still references the object", () => {
  assert.match(gc, /productMedia\.count/);
  assert.match(gc, /product\.count/);
  // Guard: return (keep the blob) while references remain.
  assert.match(gc, /if \(mediaRefs \+ productRefs > 0\) return/);
  assert.match(gc, /deleteProductMediaBlob/);
});

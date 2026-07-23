// Pure product-image helpers — magic-byte sniffing, validation, data-URI parsing
// and header-only dimension extraction. No Blob, no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_IMAGE_BYTES,
  extForMime,
  imageDimensions,
  isDataUri,
  isVercelBlobUrl,
  parseDataUri,
  sniffImageMime,
  validateImage,
} from "../../src/lib/storage/imageValidation";

// ── Crafted minimal images (valid headers, enough bytes for dimension parsing) ──

// 1×1 PNG: signature + IHDR(width=1,height=1).
const PNG_1x1 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk header
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
  0x08, 0x06, 0x00, 0x00, 0x00,
]);

// JPEG with a SOF0 declaring 200×100 (width×height).
const JPEG_200x100 = Buffer.from([
  0xff, 0xd8, // SOI
  0xff, 0xc0, // SOF0
  0x00, 0x11, // segment length
  0x08, // precision
  0x00, 0x64, // height = 100
  0x00, 0xc8, // width  = 200
  0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

// WebP (VP8X) declaring canvas 100×200.
const WEBP_100x200 = (() => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  // width-1 = 99 (LE 24-bit at 24), height-1 = 199 (LE 24-bit at 27)
  b[24] = 99; b[25] = 0; b[26] = 0;
  b[27] = 199; b[28] = 0; b[29] = 0;
  return b;
})();

test("sniffImageMime identifies png/jpeg/webp and rejects others", () => {
  assert.equal(sniffImageMime(PNG_1x1), "image/png");
  assert.equal(sniffImageMime(JPEG_200x100), "image/jpeg");
  assert.equal(sniffImageMime(WEBP_100x200), "image/webp");
  assert.equal(sniffImageMime(Buffer.from("not an image")), null);
});

test("validateImage accepts a real image and reports canonical type/ext/size", () => {
  const v = validateImage(PNG_1x1);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.mimeType, "image/png");
    assert.equal(v.ext, "png");
    assert.equal(v.size, PNG_1x1.length);
  }
});

test("validateImage rejects oversize, empty, and non-image bytes", () => {
  assert.equal(validateImage(Buffer.alloc(0)).ok, false);
  assert.equal(validateImage(Buffer.from("hello world, not an image")).ok, false);
  const tooBig = Buffer.alloc(MAX_IMAGE_BYTES + 1); // size check runs before sniff
  assert.equal(validateImage(tooBig).ok, false);
});

test("validateImage rejects a declared type that disagrees with the bytes", () => {
  // PNG bytes but caller claims webp → mismatch.
  assert.equal(validateImage(PNG_1x1, "image/webp").ok, false);
  // image/jpg is normalized to image/jpeg and accepted.
  assert.equal(validateImage(JPEG_200x100, "image/jpg").ok, true);
});

test("extForMime maps canonical types", () => {
  assert.equal(extForMime("image/png"), "png");
  assert.equal(extForMime("image/jpeg"), "jpg");
  assert.equal(extForMime("image/webp"), "webp");
});

test("imageDimensions reads header dimensions for each format", () => {
  assert.deepEqual(imageDimensions(PNG_1x1), { width: 1, height: 1 });
  assert.deepEqual(imageDimensions(JPEG_200x100), { width: 200, height: 100 });
  assert.deepEqual(imageDimensions(WEBP_100x200), { width: 100, height: 200 });
  assert.equal(imageDimensions(Buffer.from("nope")), null);
});

test("isDataUri / parseDataUri handle base64 data URIs and reject the rest", () => {
  const uri = `data:image/png;base64,${PNG_1x1.toString("base64")}`;
  assert.equal(isDataUri(uri), true);
  const parsed = parseDataUri(uri);
  assert.ok(parsed);
  assert.equal(parsed!.mimeType, "image/png");
  assert.deepEqual(parsed!.buffer, PNG_1x1);

  // A plain URL is not a data URI.
  assert.equal(parseDataUri("https://x.public.blob.vercel-storage.com/a.png"), null);
  // A non-base64 data URI is not treated as image media.
  assert.equal(parseDataUri("data:text/plain,hello"), null);
});

test("isVercelBlobUrl recognizes only the Blob public host over https", () => {
  assert.equal(
    isVercelBlobUrl("https://abc123.public.blob.vercel-storage.com/product-media/x.png"),
    true,
  );
  assert.equal(isVercelBlobUrl("https://example.com/x.png"), false);
  assert.equal(isVercelBlobUrl("data:image/png;base64,AAAA"), false);
  assert.equal(isVercelBlobUrl(null), false);
});

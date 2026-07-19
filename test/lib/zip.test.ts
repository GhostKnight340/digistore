import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildZip,
  extensionForMime,
  parseDataUri,
  safeFileName,
  uniqueName,
} from "../../src/lib/zip";

/**
 * The ZIP writer is hand-rolled, so these tests validate the archive with the
 * system `unzip` rather than by re-reading it with our own code — a
 * self-consistent round-trip would pass even if the container were malformed.
 *
 * Note: `unzip -t` (CRC + central directory) is the integrity check and handles
 * everything. Extraction is asserted only for ASCII names, because the Info-ZIP
 * build shipped on macOS mangles UTF-8 filenames regardless of the 0x0800 flag.
 * The UTF-8 path is verified structurally below and cross-checked against
 * Python's zipfile, which reads it correctly.
 */

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff];

test("produces an archive the system unzip accepts, with intact bytes", () => {
  const png = Buffer.from(PNG_BYTES);
  const zip = buildZip([
    { path: "products media/Steam Wallet.png", data: png },
    { path: "products media/Carte Cadeau Ete.png", data: Buffer.from("second") },
  ]);

  const dir = mkdtempSync(join(tmpdir(), "zip-test-"));
  const archive = join(dir, "out.zip");
  writeFileSync(archive, zip);

  // -t tests every CRC and the central directory; fails on a malformed archive.
  assert.match(execFileSync("unzip", ["-t", archive], { encoding: "utf8" }), /No errors detected/);

  execFileSync("unzip", ["-q", archive, "-d", dir]);
  const extracted = join(dir, "products media");
  assert.deepEqual(readdirSync(extracted).sort(), [
    "Carte Cadeau Ete.png",
    "Steam Wallet.png",
  ]);
  // Byte-for-byte, including the 0xff that would corrupt under text handling.
  assert.deepEqual(readFileSync(join(extracted, "Steam Wallet.png")), png);
});

test("a non-ASCII filename stays valid and is flagged UTF-8", () => {
  const zip = buildZip([{ path: "products media/Été.png", data: Buffer.from("x") }]);
  const dir = mkdtempSync(join(tmpdir(), "zip-utf8-"));
  const archive = join(dir, "utf8.zip");
  writeFileSync(archive, zip);

  // Integrity still holds even though macOS unzip would garble the name.
  assert.match(execFileSync("unzip", ["-t", archive], { encoding: "utf8" }), /No errors detected/);

  // General-purpose bit 11 (0x0800) must be set, or readers guess CP437.
  assert.equal(zip.readUInt16LE(6) & 0x0800, 0x0800);
  // The name is stored as raw UTF-8, not escaped or transliterated.
  assert.ok(zip.includes(Buffer.from("products media/Été.png", "utf8")));
});

test("an empty archive is still structurally valid", () => {
  const dir = mkdtempSync(join(tmpdir(), "zip-empty-"));
  const archive = join(dir, "empty.zip");
  writeFileSync(archive, buildZip([]));
  // unzip exits 1 on an empty archive but must not report corruption.
  try {
    execFileSync("unzip", ["-t", archive], { encoding: "utf8" });
  } catch (err) {
    assert.doesNotMatch(String((err as { stdout?: string }).stdout ?? ""), /cannot find|corrupt/i);
  }
});

test("refuses to emit a silently-corrupt archive past the entry limit", () => {
  const tooMany = Array.from({ length: 0x10000 }, (_, i) => ({
    path: `f${i}`,
    data: Buffer.alloc(0),
  }));
  assert.throws(() => buildZip(tooMany), /65535 entries/);
});

test("parseDataUri decodes base64 and rejects other URLs", () => {
  const parsed = parseDataUri("data:image/png;base64,aGVsbG8=");
  assert.equal(parsed?.mime, "image/png");
  assert.equal(parsed?.data.toString(), "hello");
  assert.equal(parseDataUri("https://cdn.example.com/a.png"), null);
  assert.equal(parseDataUri("/uploads/a.png"), null);
});

test("extensionForMime maps the image types and degrades safely", () => {
  assert.equal(extensionForMime("image/png"), "png");
  assert.equal(extensionForMime("image/jpeg"), "jpg");
  assert.equal(extensionForMime("IMAGE/WEBP"), "webp");
  assert.equal(extensionForMime("application/octet-stream"), "octetstream");
});

test("safeFileName strips path separators and reserved characters", () => {
  // The important property: no separator survives, so nothing can escape the folder.
  assert.equal(safeFileName("Steam / Wallet"), "Steam Wallet");
  assert.equal(safeFileName("../../etc/passwd"), "etc passwd");
  assert.equal(safeFileName('a:b*c?d"e<f>g|h'), "a b c d e f g h");
  assert.equal(safeFileName("Xbox Gift-Card"), "Xbox Gift-Card"); // hyphens kept
  assert.equal(safeFileName("trailing dot."), "trailing dot"); // Windows strips these
  assert.equal(safeFileName("   "), "sans-nom");
});

test("uniqueName disambiguates products that share a name", () => {
  const taken = new Set<string>();
  assert.equal(uniqueName(taken, "Steam", "png"), "Steam.png");
  assert.equal(uniqueName(taken, "Steam", "png"), "Steam (2).png");
  assert.equal(uniqueName(taken, "Steam", "png"), "Steam (3).png");
  // Case-insensitive, because Windows and macOS filesystems are.
  assert.equal(uniqueName(taken, "steam", "png"), "steam (4).png");
});

/**
 * Pure image helpers — NO `server-only`, NO Vercel Blob, NO DB. Safe to import
 * from unit tests (node:test) and from the migration script. The Blob wrapper in
 * ./blob and the /api/upload route both build on these so validation is defined
 * in exactly one place.
 *
 * We deliberately sniff the magic bytes rather than trusting a caller-supplied
 * MIME string: the upload route accepts a browser-declared `file.type`, and the
 * migration reads a `data:<mime>;base64,` prefix — both are forgeable, and the
 * value ends up in a Blob object's Content-Type and in strict next/image
 * remotePatterns, so it has to be real.
 */

/** The only image types we accept for product media. Matches the historic
 * /api/upload allow-list (png / jpeg / webp). */
export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

/** 5 MB, matching the existing upload cap. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** File extension for a canonical MIME. */
export function extForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

/**
 * Identify an image from its leading bytes. Returns a canonical allowed MIME or
 * null when the bytes are not a PNG / JPEG / WebP.
 */
export function sniffImageMime(buf: Buffer): AllowedImageMime | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageValidation =
  | { ok: true; mimeType: AllowedImageMime; ext: string; size: number }
  | { ok: false; error: string };

/**
 * Validate raw bytes as an allowed, within-size image. `declaredType` (when
 * given) must also agree with the sniffed type — a mismatch is rejected rather
 * than silently trusting the bytes, since a lie in either direction is a signal.
 */
export function validateImage(buf: Buffer, declaredType?: string | null): ImageValidation {
  if (buf.length === 0) return { ok: false, error: "Fichier vide." };
  if (buf.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Le fichier dépasse la limite de 5 Mo." };
  }
  const sniffed = sniffImageMime(buf);
  if (!sniffed) {
    return { ok: false, error: "Seules les images PNG, JPG et WebP sont autorisées." };
  }
  if (declaredType) {
    const normalized = declaredType === "image/jpg" ? "image/jpeg" : declaredType;
    if (normalized !== sniffed) {
      return { ok: false, error: "Le type de fichier ne correspond pas à son contenu." };
    }
  }
  return { ok: true, mimeType: sniffed, ext: extForMime(sniffed), size: buf.length };
}

// ── data: URI helpers ────────────────────────────────────────────────────────

/** True for a `data:` URI (base64 or otherwise) — the legacy in-Postgres form. */
export function isDataUri(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

/**
 * Decode a base64 `data:<mime>;base64,<payload>` URI into its declared MIME and
 * bytes. Returns null for anything that is not a base64 data URI (e.g. a real
 * URL, an empty string, or a non-base64 data URI). Does NOT validate the bytes —
 * pass the result through validateImage().
 */
export function parseDataUri(value: string): { mimeType: string; buffer: Buffer } | null {
  if (!isDataUri(value)) return null;
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(value);
  if (!match) return null;
  const [, mimeType, isBase64, payload] = match;
  if (!isBase64) return null; // only base64 data URIs are legacy image media
  try {
    const buffer = Buffer.from(payload, "base64");
    if (buffer.length === 0) return null;
    return { mimeType: (mimeType || "application/octet-stream").trim(), buffer };
  } catch {
    return null;
  }
}

/**
 * Whether a stored value is a Vercel Blob public URL. Used to decide a row is
 * already migrated (its `Product.imageUrl` points at Blob), independent of any
 * particular store id.
 */
export function isVercelBlobUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

// ── Dimensions ───────────────────────────────────────────────────────────────

/**
 * Read intrinsic pixel dimensions straight from the image header — no decode, no
 * dependency. Supports PNG, JPEG and the three WebP chunk variants (VP8 / VP8L /
 * VP8X). Returns null when the header can't be parsed (dimensions then stay
 * null in the DB, which next/image tolerates via `fill`).
 */
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  const mime = sniffImageMime(buf);
  if (mime === "image/png") return pngDimensions(buf);
  if (mime === "image/jpeg") return jpegDimensions(buf);
  if (mime === "image/webp") return webpDimensions(buf);
  return null;
}

function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  // IHDR is the first chunk: width at byte 16, height at byte 20 (big-endian).
  if (buf.length < 24) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  // Walk the marker segments until a Start-Of-Frame (SOFn) is found.
  let offset = 2; // skip SOI (0xFFD8)
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0..SOF15, excluding DHT(C4), JPG(C8) and DAC(CC) which are not frames.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      if (!width || !height) return null;
      return { width, height };
    }
    // Otherwise skip this segment using its length field.
    const segLen = buf.readUInt16BE(offset + 2);
    if (segLen < 2) return null;
    offset += 2 + segLen;
  }
  return null;
}

function webpDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  const format = buf.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    // Lossy: 3-byte frame tag, then 0x9d 0x01 0x2a, then 14-bit width/height LE.
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    if (!width || !height) return null;
    return { width, height };
  }
  if (format === "VP8L") {
    // Lossless: after 0x2f signature, 14-bit (width-1) then 14-bit (height-1).
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (format === "VP8X") {
    // Extended: 24-bit (canvas-width-1) then 24-bit (canvas-height-1), LE.
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  return null;
}

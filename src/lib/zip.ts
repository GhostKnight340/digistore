/**
 * Minimal ZIP writer — "store" method only (no compression).
 *
 * Product media is already-compressed PNG/JPEG/WebP, so deflating it would burn
 * CPU for ~0% gain. Storing keeps this to one small dependency-free file
 * instead of pulling a zip library into a deliberately minimal dependency set.
 *
 * Format: APPNOTE.TXT 6.3.3 — local header + data per entry, then a central
 * directory, then the end-of-central-directory record. No ZIP64, so this is
 * good to 4 GB and 65 535 entries; `buildZip` throws rather than silently
 * emitting a corrupt archive past those limits.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed time/date (2-second resolution, epoch 1980). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export interface ZipEntry {
  /** Path inside the archive. Use "/" separators; forward slashes make folders. */
  path: string;
  data: Buffer;
}

export function buildZip(entries: ZipEntry[], now = new Date()): Buffer {
  if (entries.length > 0xffff) {
    throw new Error(`ZIP supports at most 65535 entries (got ${entries.length}).`);
  }

  const { time, date } = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 filename
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // compressed == uncompressed when stored
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // offset of local header
    centrals.push(central, name);

    offset += local.length + name.length + size;
    if (offset > 0xffffffff) {
      throw new Error("ZIP exceeds the 4 GB limit — ZIP64 is not supported here.");
    }
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuf, end]);
}

/** Decodes a `data:` URI into bytes + mime. Returns null for any other URL. */
export function parseDataUri(uri: string): { mime: string; data: Buffer } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(uri);
  if (!match) return null;
  return {
    mime: match[1] || "application/octet-stream",
    data: match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3])),
  };
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

export function extensionForMime(mime: string): string {
  const normalized = mime.toLowerCase().trim();
  if (MIME_EXTENSIONS[normalized]) return MIME_EXTENSIONS[normalized];
  const subtype = normalized.split("/")[1]?.replace(/[^a-z0-9]/g, "");
  return subtype || "bin";
}

/**
 * Turns a product name into a filename that is safe on Windows, macOS and
 * Linux: no path separators, no reserved characters, no trailing dot/space
 * (which Windows silently strips), and never empty.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    // Reserved on Windows, plus control characters. Hyphens are legal
    // in filenames and are deliberately kept.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Windows silently strips a trailing dot/space; a leading dot would make
    // the file hidden on Unix. Neither is wanted for an export folder.
    .replace(/[. ]+$/, "")
    .replace(/^[.\s]+/, "");
  return cleaned.slice(0, 120) || "sans-nom";
}

/** Appends " (2)", " (3)"… so two products with the same name both survive. */
export function uniqueName(taken: Set<string>, base: string, ext: string): string {
  let candidate = `${base}.${ext}`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (${n}).${ext}`;
    n++;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

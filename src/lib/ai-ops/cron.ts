/**
 * Pure cron + timezone primitives for AI Operations scheduling (no server-only,
 * no DB, no provider).
 *
 * The base scheduler and the report scheduler both need to answer "does this
 * cron fire around now, in the configured timezone?". The serverless dispatcher
 * runs on a coarse (~15 min) cadence, so these helpers match to the HOUR and
 * rely on an idempotency bucket to collapse the repeated ticks within the
 * scheduled hour into a single run. Kept pure (timestamp + timezone passed in)
 * so every boundary is unit-testable without a clock or ICU surprises.
 */

/** A parsed 5-field cron: each field is a set of allowed integers, or null=«*». */
export interface ParsedCron {
  minute: Set<number> | null;
  hour: Set<number> | null;
  dom: Set<number> | null; // day of month, 1-31
  month: Set<number> | null; // 1-12
  dow: Set<number> | null; // day of week, 0-6 (Sun=0; 7 is normalized to 0)
}

interface FieldSpec {
  min: number;
  max: number;
}

const FIELD_SPECS: FieldSpec[] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week (7 == 0)
];

/** Parses one cron field into a set of ints, or null for «*». Returns undefined on error. */
function parseField(raw: string, spec: FieldSpec): Set<number> | null | undefined {
  const field = raw.trim();
  if (field === "*") return null;
  const out = new Set<number>();
  for (const part of field.split(",")) {
    // Step syntax: base/step where base is «*» or a range.
    const [baseRaw, stepRaw] = part.split("/");
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step <= 0) return undefined;

    let lo: number;
    let hi: number;
    if (baseRaw === "*" || baseRaw === "") {
      lo = spec.min;
      hi = spec.max;
    } else if (baseRaw.includes("-")) {
      const [a, b] = baseRaw.split("-");
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(baseRaw);
      hi = Number(baseRaw);
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) return undefined;
    if (lo < spec.min || hi > spec.max) return undefined;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parses a standard 5-field cron expression. Returns null when malformed. */
export function parseCron(expr: string): ParsedCron | null {
  const fields = (expr ?? "").trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const parsed: (Set<number> | null)[] = [];
  for (let i = 0; i < 5; i++) {
    const set = parseField(fields[i], FIELD_SPECS[i]);
    if (set === undefined) return null;
    parsed.push(set);
  }
  const [minute, hour, dom, month, dow] = parsed;
  // Normalize day-of-week 7 (some crons) to 0 (Sunday).
  if (dow && dow.has(7)) {
    dow.delete(7);
    dow.add(0);
  }
  return { minute, hour, dom, month, dow };
}

/** Wall-clock parts of an instant, evaluated in a given IANA timezone. */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0-6 (Sun=0)
  hour: number; // 0-23
  minute: number; // 0-59
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Converts an instant to its wall-clock parts in `timeZone` using Intl (full
 * ICU is available in Node). Falls back to UTC parts if the timezone is
 * unknown, so a bad config never throws mid-dispatch.
 */
export function zonedParts(now: Date, timeZone: string): ZonedParts {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    let hour = Number(get("hour"));
    if (hour === 24) hour = 0; // some ICU builds emit "24" for midnight
    return {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      weekday: WEEKDAY_INDEX[get("weekday")] ?? now.getUTCDay(),
      hour,
      minute: Number(get("minute")),
    };
  } catch {
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
      weekday: now.getUTCDay(),
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
    };
  }
}

/**
 * Does the cron match these wall-clock parts to the HOUR? The dispatcher fires
 * on a coarse (~15 min) cadence, so we match month/day/hour exactly and treat
 * it as due once the scheduled minute-of-the-hour has passed; the idempotency
 * bucket then dedupes the repeated ticks within that hour.
 *
 * Day matching follows cron semantics: when BOTH day-of-month and day-of-week
 * are restricted, either matching is enough; when one is «*», the other rules.
 */
export function cronMatchesHour(cron: ParsedCron, parts: ZonedParts): boolean {
  if (cron.month && !cron.month.has(parts.month)) return false;
  if (cron.hour && !cron.hour.has(parts.hour)) return false;

  const domRestricted = cron.dom !== null;
  const dowRestricted = cron.dow !== null;
  const domOk = !domRestricted || cron.dom!.has(parts.day);
  const dowOk = !dowRestricted || cron.dow!.has(parts.weekday);
  const dayOk = domRestricted && dowRestricted ? domOk || dowOk : domOk && dowOk;
  if (!dayOk) return false;

  // The scheduled minute must have arrived within this hour. A «*» minute means
  // "any minute" (top of every matching hour).
  const scheduledMinute = cron.minute ? Math.min(...cron.minute) : 0;
  return parts.minute >= scheduledMinute;
}

/**
 * The next instant (from `after`) at which `schedule` fires in `timeZone`, or
 * null if none within a year / the cron is malformed. Used for the admin
 * "next execution" display, so a minute-resolution forward scan is fine. Pure.
 */
export function nextFiringTime(schedule: string, timeZone: string, after: Date = new Date()): Date | null {
  const cron = parseCron(schedule);
  if (!cron) return null;
  const scheduledMinute = cron.minute ? Math.min(...cron.minute) : 0;
  const MAX_MINUTES = 366 * 24 * 60;
  // Start at the next whole minute.
  let t = new Date(Math.ceil((after.getTime() + 1) / 60000) * 60000);
  for (let i = 0; i < MAX_MINUTES; i++) {
    const parts = zonedParts(t, timeZone);
    const minuteOk = cron.minute ? cron.minute.has(parts.minute) : parts.minute === scheduledMinute;
    if (minuteOk && cronMatchesHour({ ...cron, minute: null }, parts)) {
      return t;
    }
    t = new Date(t.getTime() + 60000);
  }
  return null;
}

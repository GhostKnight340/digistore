/**
 * Deterministic, timezone-aware date-range resolution for AI Operations tools.
 *
 * The model never picks raw timestamps: it requests a named preset (today,
 * yesterday, this_week, …) or a custom `{ start, end }` (calendar dates), and
 * this module resolves it to a concrete half-open UTC instant range
 * `[start, end)` interpreted in the configured business timezone (default
 * Africa/Casablanca). Pure — no DB, no server-only — so every boundary is
 * unit-testable. `now` is injected so tests are deterministic.
 *
 * Timezone math mirrors src/lib/expenses/monthlyReview.ts (Intl.DateTimeFormat,
 * no external lib): we read the wall-clock parts in the zone, then convert a
 * local midnight back to its UTC instant via the zone's offset at that moment.
 */

export const DEFAULT_TIMEZONE = "Africa/Casablanca";

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_7_days",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export function isDatePreset(value: unknown): value is DatePreset {
  return typeof value === "string" && (DATE_PRESETS as readonly string[]).includes(value);
}

/** What a tool accepts: a preset, or an explicit inclusive calendar-date range. */
export type DateRangeInput = { preset: DatePreset } | { start: string; end: string };

export interface ResolvedRange {
  /** Inclusive lower bound (UTC instant). */
  start: Date;
  /** Exclusive upper bound (UTC instant). */
  end: Date;
  /** Human label stating the interpreted period, e.g. "today (2026-07-21)". */
  label: string;
  /** Which shape produced this range. */
  kind: DatePreset | "custom";
}

export type ResolveResult =
  | { ok: true; range: ResolvedRange }
  | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Custom ranges are capped so a tool can never scan an unbounded history. */
const MAX_CUSTOM_DAYS = 366;

// ── Timezone helpers ─────────────────────────────────────────────────────────

/** The zone's UTC offset (ms) at an instant: localWallClock = instant + offset. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some engines format midnight as "24"
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

interface Ymd {
  year: number;
  month: number; // 1-based
  day: number;
}

/** Wall-clock calendar date (Y/M/D) in the zone for an instant. */
function zonedYmd(instant: Date, timeZone: string): Ymd {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) map[p.type] = p.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** The UTC instant of local midnight (00:00 in the zone) for a calendar date. */
function zonedDayStartUtc({ year, month, day }: Ymd, timeZone: string): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = zoneOffsetMs(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offset);
}

/** Shift a calendar date by whole days (calendar-correct across months/years). */
function addDays({ year, month, day }: Ymd, delta: number): Ymd {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/** ISO weekday (Mon=0 … Sun=6) for a calendar date. */
function mondayIndex({ year, month, day }: Ymd): number {
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  return (wd + 6) % 7;
}

function fmtYmd({ year, month, day }: Ymd): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Preset resolution ────────────────────────────────────────────────────────

function resolvePreset(preset: DatePreset, now: Date, timeZone: string): ResolvedRange {
  const todayYmd = zonedYmd(now, timeZone);
  const startOfToday = zonedDayStartUtc(todayYmd, timeZone);

  switch (preset) {
    case "today":
      return { start: startOfToday, end: now, label: `today (${fmtYmd(todayYmd)})`, kind: "today" };
    case "yesterday": {
      const y = addDays(todayYmd, -1);
      return {
        start: zonedDayStartUtc(y, timeZone),
        end: startOfToday,
        label: `yesterday (${fmtYmd(y)})`,
        kind: "yesterday",
      };
    }
    case "this_week": {
      const ws = addDays(todayYmd, -mondayIndex(todayYmd));
      return {
        start: zonedDayStartUtc(ws, timeZone),
        end: now,
        label: `this week (from ${fmtYmd(ws)})`,
        kind: "this_week",
      };
    }
    case "last_week": {
      const thisWeekStart = addDays(todayYmd, -mondayIndex(todayYmd));
      const lastWeekStart = addDays(thisWeekStart, -7);
      return {
        start: zonedDayStartUtc(lastWeekStart, timeZone),
        end: zonedDayStartUtc(thisWeekStart, timeZone),
        label: `last week (${fmtYmd(lastWeekStart)} to ${fmtYmd(addDays(thisWeekStart, -1))})`,
        kind: "last_week",
      };
    }
    case "this_month": {
      const monthStart: Ymd = { year: todayYmd.year, month: todayYmd.month, day: 1 };
      return {
        start: zonedDayStartUtc(monthStart, timeZone),
        end: now,
        label: `this month (from ${fmtYmd(monthStart)})`,
        kind: "this_month",
      };
    }
    case "last_month": {
      const thisMonthStart: Ymd = { year: todayYmd.year, month: todayYmd.month, day: 1 };
      const lm = new Date(Date.UTC(todayYmd.year, todayYmd.month - 2, 1));
      const lastMonthStart: Ymd = { year: lm.getUTCFullYear(), month: lm.getUTCMonth() + 1, day: 1 };
      return {
        start: zonedDayStartUtc(lastMonthStart, timeZone),
        end: zonedDayStartUtc(thisMonthStart, timeZone),
        label: `last month (${fmtYmd(lastMonthStart)})`,
        kind: "last_month",
      };
    }
    case "last_7_days":
      // Rolling 7×24h window ending now ("the past seven days").
      return {
        start: new Date(now.getTime() - 7 * DAY_MS),
        end: now,
        label: "the past 7 days",
        kind: "last_7_days",
      };
  }
}

// ── Custom range ─────────────────────────────────────────────────────────────

function parseIsoDate(value: string): Ymd | null {
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Reject impossible dates (e.g. 2026-02-30) by round-tripping through UTC.
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function resolveCustom(start: string, end: string, timeZone: string): ResolveResult {
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  if (!s || !e) return { ok: false, error: "Dates must be valid YYYY-MM-DD." };
  const startUtc = zonedDayStartUtc(s, timeZone);
  // Inclusive end date → exclusive boundary at the start of the following day.
  const endUtc = zonedDayStartUtc(addDays(e, 1), timeZone);
  if (endUtc <= startUtc) return { ok: false, error: "End date must be on or after the start date." };
  if (endUtc.getTime() - startUtc.getTime() > (MAX_CUSTOM_DAYS + 1) * DAY_MS) {
    return { ok: false, error: `Custom range may not exceed ${MAX_CUSTOM_DAYS} days.` };
  }
  return {
    ok: true,
    range: { start: startUtc, end: endUtc, label: `${fmtYmd(s)} to ${fmtYmd(e)}`, kind: "custom" },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ResolveOptions {
  now?: Date;
  timeZone?: string;
}

/**
 * Resolve a preset or custom range to concrete UTC instants. Never throws;
 * returns a typed error for invalid input (fail closed at the tool boundary).
 */
export function resolveDateRange(input: DateRangeInput, opts: ResolveOptions = {}): ResolveResult {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone || DEFAULT_TIMEZONE;

  if ("preset" in input) {
    if (!isDatePreset(input.preset)) return { ok: false, error: `Unknown date preset: ${input.preset}` };
    return { ok: true, range: resolvePreset(input.preset, now, timeZone) };
  }
  if ("start" in input && "end" in input) {
    return resolveCustom(input.start, input.end, timeZone);
  }
  return { ok: false, error: "A date range requires either a preset or start+end dates." };
}

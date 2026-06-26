import "server-only";

export async function timeAdmin<T>(
  actionName: string,
  queryName: string,
  run: () => Promise<T>,
  recordCount?: (result: T) => number,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await run();
    logAdminTiming(actionName, queryName, start, recordCount?.(result));
    return result;
  } catch (error) {
    logAdminTiming(actionName, queryName, start, undefined, true);
    throw error;
  }
}

export function logAdminTiming(
  actionName: string,
  queryName: string,
  start: number,
  records?: number,
  failed = false,
) {
  if (process.env.NODE_ENV !== "development") return;
  const durationMs = Math.round(performance.now() - start);
  const count = typeof records === "number" ? ` records=${records}` : "";
  const status = failed ? " failed=true" : "";
  console.log(`[admin-perf] action=${actionName} query=${queryName} durationMs=${durationMs}${count}${status}`);
}

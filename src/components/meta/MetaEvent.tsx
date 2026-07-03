"use client";

import { useEffect, useRef } from "react";
import { trackMetaEvent } from "@/lib/meta/client";
import type { MetaCustomData, MetaEventName } from "@/lib/meta/events";

/**
 * Fires one deduplicated Meta event (pixel + CAPI) when mounted. Useful from
 * server components: <MetaEvent event="ViewContent" data={{...}} />.
 * Re-fires only when the event or its payload actually changes.
 */
export default function MetaEvent({
  event,
  data,
}: {
  event: MetaEventName;
  data?: MetaCustomData;
}) {
  const key = JSON.stringify([event, data ?? {}]);
  const lastFired = useRef<string | null>(null);

  useEffect(() => {
    if (lastFired.current === key) return;
    lastFired.current = key;
    trackMetaEvent(event, data ?? {});
    // `key` captures event + data; listing them separately would re-run on
    // every render because `data` is a fresh object each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

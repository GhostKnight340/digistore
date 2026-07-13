"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Fires a single analytics event when mounted. Rendered from server components
 * (e.g. the collection page) that want a page-level event without becoming
 * client components themselves. Renders nothing.
 */
export default function TrackView({
  event,
  params,
}: {
  event: string;
  params?: Record<string, string | number | boolean | undefined>;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEvent(event, params ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

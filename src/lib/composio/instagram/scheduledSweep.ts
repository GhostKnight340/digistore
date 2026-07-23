import "server-only";

import { claimForPublish, listDueScheduled } from "./contentStore";
import { publishContentItem, type PublishActor } from "./publishFlow";

/**
 * Publishes every scheduled Instagram item whose time has arrived. Invoked by
 * /api/cron/instagram-publish. Each row is claimed atomically (scheduled →
 * publishing) so overlapping cron runs can't double-post; publishContentItem
 * then records success/failure. Failures stay as `failed` for manual retry —
 * the sweep does not auto-retry so a broken post can't hammer the API.
 */
const CRON_ACTOR: PublishActor = { id: "system:cron", name: "Planification" };

export async function publishDueScheduled(now = new Date()): Promise<{
  processed: number;
  published: number;
  failed: number;
}> {
  const due = await listDueScheduled(now, 10);
  let published = 0;
  let failed = 0;

  for (const item of due) {
    const claimed = await claimForPublish(item.id, ["scheduled"]);
    if (!claimed) continue; // another run took it
    const res = await publishContentItem(claimed, CRON_ACTOR);
    if (res.ok) published += 1;
    else failed += 1;
  }

  return { processed: published + failed, published, failed };
}

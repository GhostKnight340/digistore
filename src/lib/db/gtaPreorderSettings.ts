import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { GTA_PREORDER_TAG } from "@/lib/cacheTags";

/**
 * Small runtime-editable overrides for the GTA VI pre-order landing page.
 *
 * The bulk of the campaign lives in the typed `gtaPreorderConfig` file, but a
 * couple of values benefit from being editable from the admin without a deploy —
 * currently just the hero image the admin uploads. It is stored in a single
 * `StoreSetting` row (id "gta-preorder") so no schema change is needed, mirroring
 * how the store-settings blob is persisted.
 *
 * The image itself is whatever the site owner uploads; this module only stores
 * and returns the URL. It ships empty by default (the page then renders its
 * original generated hero).
 */

const SETTING_ID = "gta-preorder";

export interface GtaPreorderSettings {
  /** Admin-uploaded hero image URL (data: URI in prod, /uploads/* in dev).
   *  Empty → the page uses its original generated hero. */
  heroImageUrl: string;
}

const DEFAULTS: GtaPreorderSettings = { heroImageUrl: "" };

function normalize(value: unknown): GtaPreorderSettings {
  if (typeof value !== "object" || value === null) return { ...DEFAULTS };
  const raw = value as Record<string, unknown>;
  return {
    heroImageUrl:
      typeof raw.heroImageUrl === "string" ? raw.heroImageUrl.slice(0, 2_000_000) : "",
  };
}

export const getGtaPreorderSettings = unstable_cache(
  async (): Promise<GtaPreorderSettings> => {
    const record = await prisma.storeSetting.findUnique({ where: { id: SETTING_ID } });
    return record ? normalize(record.value) : { ...DEFAULTS };
  },
  ["gta-preorder-settings"],
  { tags: [GTA_PREORDER_TAG] },
);

/** Persist the admin-chosen hero image URL (empty string clears it). */
export async function saveGtaPreorderHeroImage(url: string): Promise<void> {
  const settings = normalize({ heroImageUrl: url });
  // Plain JSON object for the Prisma Json column.
  const value = { heroImageUrl: settings.heroImageUrl };
  await prisma.storeSetting.upsert({
    where: { id: SETTING_ID },
    update: { value },
    create: { id: SETTING_ID, value },
  });
  revalidateTag(GTA_PREORDER_TAG);
}

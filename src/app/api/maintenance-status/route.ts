import { NextResponse } from "next/server";
import { getStoreSettings } from "@/lib/db/catalog";

export const revalidate = 30;

export async function GET() {
  const settings = await getStoreSettings().catch(() => undefined);
  return NextResponse.json({ enabled: Boolean(settings?.maintenance.enabled) });
}

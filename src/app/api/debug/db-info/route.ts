import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * TEMPORARY diagnostic endpoint — read-only, no secrets/data returned.
 * Used to confirm which Neon branch/database this deployment's Prisma
 * client is actually connected to at runtime. Delete after use.
 */
export async function GET() {
  try {
    const [branchRow] = await prisma.$queryRawUnsafe<{ branch_id: string; endpoint_id: string }[]>(
      "SELECT current_setting('neon.branch_id', true) as branch_id, current_setting('neon.endpoint_id', true) as endpoint_id",
    );
    const [dbRow] = await prisma.$queryRawUnsafe<{ db: string }[]>(
      "SELECT current_database() as db",
    );
    const cols = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE (table_name = 'ProductVariant' AND column_name = 'reloadlyProductId') OR (table_name = 'Order' AND column_name = 'paymentProvider')",
    );
    const migrations = await prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null }[]>(
      "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5",
    );

    return NextResponse.json({
      branchId: branchRow?.branch_id ?? null,
      endpointId: branchRow?.endpoint_id ?? null,
      database: dbRow?.db ?? null,
      columnsFound: cols,
      recentMigrations: migrations,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

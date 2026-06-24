/**
 * Mock test-code inventory. Phase 1 only — these are fake codes used to
 * demonstrate the manual fulfillment flow. No real gift cards are involved.
 *
 * The live inventory (with used/unused status) is stored in localStorage and
 * owned by StoreContext. This module only provides the initial seed data and
 * pure helpers for summarizing it.
 */
import type { InventoryCode } from "./types";

/** Keyed by product id — a few demo codes per product. */
const seedCodes: Record<string, string[]> = {
  "steam-50": ["STEAM-TEST-50-001", "STEAM-TEST-50-002"],
  "steam-100": ["STEAM-TEST-100-001", "STEAM-TEST-100-002", "STEAM-TEST-100-003"],
  "steam-200": ["STEAM-TEST-200-001", "STEAM-TEST-200-002"],
  "psn-100": ["PSN-TEST-100-001", "PSN-TEST-100-002"],
  "psn-250": ["PSN-TEST-250-001"],
  "xbox-100": ["XBOX-TEST-100-001", "XBOX-TEST-100-002"],
  "xbox-200": ["XBOX-TEST-200-001"],
  "nintendo-150": ["NINTENDO-TEST-150-001"],
  "roblox-100": ["ROBLOX-TEST-100-001", "ROBLOX-TEST-100-002"],
  "roblox-200": ["ROBLOX-TEST-200-001"],
  "valorant-100": ["VALORANT-TEST-100-001", "VALORANT-TEST-100-002"],
  "valorant-200": ["VALORANT-TEST-200-001"],
};

/** Builds the initial inventory list seeded into localStorage on first load. */
export function seedInventory(): InventoryCode[] {
  const codes: InventoryCode[] = [];
  for (const [productId, list] of Object.entries(seedCodes)) {
    list.forEach((code, i) => {
      codes.push({
        id: `${productId}-${String(i + 1).padStart(3, "0")}`,
        productId,
        code,
        status: "unused",
      });
    });
  }
  return codes;
}

export interface InventorySnapshotRow {
  productId: string;
  total: number;
  unused: number;
  used: number;
}

/** Summarizes a live inventory list into per-product used/unused counts. */
export function inventorySnapshot(
  inventory: InventoryCode[],
): InventorySnapshotRow[] {
  const byProduct = new Map<string, InventoryCode[]>();
  for (const code of inventory) {
    const list = byProduct.get(code.productId) ?? [];
    list.push(code);
    byProduct.set(code.productId, list);
  }
  return [...byProduct.entries()]
    .map(([productId, list]) => ({
      productId,
      total: list.length,
      unused: list.filter((c) => c.status === "unused").length,
      used: list.filter((c) => c.status === "used").length,
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

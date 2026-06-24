/**
 * Mock test-code inventory. Phase 1 only — these are fake codes used to
 * demonstrate the instant-delivery flow. No real gift cards are involved.
 *
 * Keyed by product id. Products without an explicit list fall back to a
 * generated placeholder code so every purchase still delivers something.
 */
const inventory: Record<string, string[]> = {
  "steam-100": ["STEAM-TEST-100-001", "STEAM-TEST-100-002", "STEAM-TEST-100-003"],
  "psn-100": ["PSN-TEST-100-001", "PSN-TEST-100-002"],
  "valorant-100": ["VALORANT-TEST-100-001", "VALORANT-TEST-100-002"],
};

/** Simple per-product cursor so repeat purchases cycle through the list. */
const cursors: Record<string, number> = {};

function prefixFor(productId: string): string {
  return productId.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
}

/**
 * Returns a single test code for the given product. When the mock inventory
 * for a product is exhausted (or missing), a deterministic placeholder code
 * is generated so the delivery flow always succeeds in Phase 1.
 */
export function assignCode(productId: string): string {
  const list = inventory[productId];
  const cursor = cursors[productId] ?? 0;

  if (list && cursor < list.length) {
    cursors[productId] = cursor + 1;
    return list[cursor];
  }

  // Generated fallback code.
  cursors[productId] = cursor + 1;
  const serial = String(cursor + 1).padStart(3, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefixFor(productId)}-TEST-${serial}-${rand}`;
}

/** Returns `quantity` codes for a product. */
export function assignCodes(productId: string, quantity: number): string[] {
  return Array.from({ length: quantity }, () => assignCode(productId));
}

/** Snapshot of remaining mock stock — used by the admin inventory view. */
export function inventorySnapshot() {
  return Object.entries(inventory).map(([productId, codes]) => {
    const used = cursors[productId] ?? 0;
    return {
      productId,
      total: codes.length,
      remaining: Math.max(codes.length - used, 0),
      codes,
    };
  });
}

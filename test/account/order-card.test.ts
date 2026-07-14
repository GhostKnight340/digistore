// Account order-card presentation helpers. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  orderCardSummary,
  orderItemCount,
  orderItemCountLabel,
  type OrderCardItem,
} from "../../src/lib/account/orderCard";
import { getPublicOrderLabel } from "../../src/lib/orderNumber";

function item(overrides: Partial<OrderCardItem> = {}): OrderCardItem {
  return {
    quantity: 1,
    product: { name: "Carte Steam" },
    variant: null,
    ...overrides,
  };
}

test("a single-line order is titled with the product it contains", () => {
  assert.equal(orderCardSummary({ items: [item()] }), "Carte Steam");
});

test("the variant name wins over the product name when there is one", () => {
  assert.equal(
    orderCardSummary({ items: [item({ variant: { name: "Carte Steam 200 MAD" } })] }),
    "Carte Steam 200 MAD",
  );
});

test("a multi-line order gets a general summary, not one product standing in for the basket", () => {
  const summary = orderCardSummary({
    items: [item(), item({ product: { name: "Carte PSN" } })],
  });
  assert.equal(summary, "Carte Steam + 1 autre");

  const three = orderCardSummary({
    items: [item(), item({ product: { name: "Carte PSN" } }), item({ product: { name: "Roblox" } })],
  });
  assert.equal(three, "Carte Steam + 2 autres");
});

test("an order with no lines still renders a title rather than an empty card", () => {
  assert.equal(orderCardSummary({ items: [] }), "Commande");
});

test("a very long product name is passed through untouched — the card wraps it in CSS", () => {
  const longName = "Carte cadeau PlayStation Store Maroc édition spéciale 1000 MAD livraison immédiate";
  assert.equal(orderCardSummary({ items: [item({ product: { name: longName } })] }), longName);
});

test("the item count sums quantities, not lines", () => {
  const order = { items: [item({ quantity: 2 }), item({ quantity: 3 })] };
  assert.equal(orderItemCount(order), 5);
  assert.equal(orderItemCountLabel(order), "5 articles");
});

test("the item count label is singular for one article and safe when empty", () => {
  assert.equal(orderItemCountLabel({ items: [item()] }), "1 article");
  assert.equal(orderItemCountLabel({ items: [] }), "Aucun article");
});

test("the card shows the human-readable order number, never an internal id", () => {
  assert.equal(getPublicOrderLabel({ publicOrderNumber: "#000123" }), "#000123");
  // No public number yet → a generic label, not the database id.
  assert.equal(getPublicOrderLabel({ publicOrderNumber: null }), "Commande");
});

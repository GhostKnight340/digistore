// Account navigation model shared by the desktop sidebar and the mobile
// account drawer. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_NAV,
  accountNavCount,
  accountSectionLabel,
  type AccountView,
} from "../../src/lib/account/nav";

test("the drawer offers every account section, in order", () => {
  assert.deepEqual(
    ACCOUNT_NAV.map((item) => item.view),
    ["dashboard", "orders", "favoris", "wallet", "support", "security"],
  );
  assert.deepEqual(
    ACCOUNT_NAV.map((item) => item.label),
    ["Tableau de bord", "Commandes", "Favoris", "Crédit Ghost", "Support", "Sécurité"],
  );
});

test("every section points at a real account route", () => {
  assert.deepEqual(
    ACCOUNT_NAV.map((item) => item.href),
    [
      "/account",
      "/account/orders",
      "/account/favoris",
      "/account/wallet",
      "/account/support",
      "/account/security",
    ],
  );
});

test("the active section resolves to exactly one nav entry", () => {
  const views: AccountView[] = [
    "dashboard",
    "orders",
    "favoris",
    "wallet",
    "support",
    "security",
  ];
  for (const active of views) {
    const matches = ACCOUNT_NAV.filter((item) => item.view === active);
    assert.equal(matches.length, 1, `${active} must highlight one entry`);
  }
});

test("the compact mobile header names the current section", () => {
  assert.equal(accountSectionLabel("wallet"), "Crédit Ghost");
  assert.equal(accountSectionLabel("orders"), "Commandes");
});

test("badge counts appear only on orders and support, and never as a zero", () => {
  const counts = { ordersCount: 3, supportCount: 2 };
  assert.equal(accountNavCount("orders", counts), 3);
  assert.equal(accountNavCount("support", counts), 2);
  assert.equal(accountNavCount("wallet", counts), undefined);
  assert.equal(accountNavCount("security", counts), undefined);
  assert.equal(accountNavCount("orders", { ordersCount: 0 }), undefined);
});

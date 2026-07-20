// Admin Email Composer — the ONE renderer used by both preview and send.
// Asserts the branded shell, per-module HTML, variable substitution, safe
// escaping, and that missing variables are surfaced. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderComposedEmail,
  type ComposedShellContext,
} from "../../../src/lib/email/renderComposedEmail";
import type { EmailModule, VariableMap } from "../../../src/lib/email/composerModules";
import { defaultStoreSettings } from "../../../src/lib/storeSettings";

const shell: ComposedShellContext = {
  settings: defaultStoreSettings,
  supportEmail: "support@ghost.ma",
  currentYear: "2026",
  paymentBadges: [],
};

function render(modules: EmailModule[], vars: VariableMap = {}, over: Partial<{ subject: string; preheader: string; eyebrow: string; title: string; greetingName: string }> = {}) {
  return renderComposedEmail(
    {
      subject: over.subject ?? "Objet",
      preheader: over.preheader ?? "",
      eyebrow: over.eyebrow ?? "Ghost.ma",
      title: over.title ?? "Titre",
      greetingName: over.greetingName ?? "Amine",
      modules,
    },
    vars,
    shell,
  );
}

test("renders the branded HTML shell with header, greeting and footer", () => {
  const { html } = render([{ type: "text", id: "t", body: "Bonjour" }]);
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("ghost.ma"));
  assert.ok(html.includes("Bonjour Amine,"));
  assert.ok(html.includes("support@ghost.ma"));
});

test("the credit module renders the amount and title (both HTML and text)", () => {
  const modules: EmailModule[] = [
    { type: "credit", id: "c", amountMad: 5, title: "Crédit Ghost offert", description: "Merci", behavior: "grant", buttonLabel: "Voir mon solde" },
  ];
  const { html, text } = render(modules);
  assert.ok(html.includes("5 DH"));
  assert.ok(html.includes("Crédit Ghost offert"));
  assert.ok(html.includes("Voir mon solde"));
  assert.ok(text.includes("5 DH"));
});

test("the button module renders a real href and escapes the label", () => {
  const modules: EmailModule[] = [
    { type: "button", id: "b", label: "A & B", url: "https://ghost.ma/x", style: "primary", align: "center" },
  ];
  const { html } = render(modules);
  assert.ok(html.includes('href="https://ghost.ma/x"'));
  assert.ok(html.includes("A &amp; B"));
});

test("HTML is escaped — a script in body cannot break out", () => {
  const modules: EmailModule[] = [{ type: "text", id: "t", body: "<script>alert(1)</script>" }];
  const { html } = render(modules);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("the order module renders the order number and total", () => {
  const modules: EmailModule[] = [
    {
      type: "order",
      id: "o",
      orderId: "ord1",
      customerId: "cust1",
      orderNumber: "#000128",
      status: "delivered",
      productSummary: "1× Carte PSN",
      totalMad: 250,
      orderUrl: "https://ghost.ma/order/000128",
    },
  ];
  const { html } = render(modules);
  assert.ok(html.includes("#000128"));
  assert.ok(html.includes("250 DH"));
  assert.ok(html.includes("Carte PSN"));
});

test("the notice module renders in all four styles", () => {
  for (const style of ["info", "success", "warning", "error"] as const) {
    const { html } = render([{ type: "notice", id: "n", style, body: "Attention" }]);
    assert.ok(html.includes("Attention"));
  }
});

test("the product module renders name, region and price", () => {
  const modules: EmailModule[] = [
    { type: "product", id: "p", productId: "p1", name: "PlayStation Plus", region: "Maroc", priceMad: 199, imageUrl: null, productUrl: "https://ghost.ma/product/psplus" },
  ];
  const { html } = render(modules);
  assert.ok(html.includes("PlayStation Plus"));
  assert.ok(html.includes("Maroc"));
  assert.ok(html.includes("199 DH"));
});

test("variables are substituted in subject and text body", () => {
  const vars: VariableMap = { "customer.name": "Sofia", "customer.creditBalance": "45 DH" };
  const res = render(
    [{ type: "text", id: "t", body: "Votre solde est {{customer.creditBalance}}." }],
    vars,
    { subject: "Bonjour {{customer.name}}" },
  );
  assert.equal(res.subject, "Bonjour Sofia");
  assert.ok(res.html.includes("Votre solde est 45 DH."));
});

test("missing variables are surfaced for pre-send validation", () => {
  const res = render(
    [{ type: "text", id: "t", body: "Commande {{order.number}}" }],
    { "customer.name": "Amine" },
  );
  assert.ok(res.missingVariables.includes("order.number"));
});

test("preview and send produce identical output for the same input (one renderer)", () => {
  const modules: EmailModule[] = [{ type: "text", id: "t", body: "Bonjour {{customer.name}}" }];
  const vars: VariableMap = { "customer.name": "Amine" };
  const a = render(modules, vars);
  const b = render(modules, vars);
  assert.equal(a.html, b.html);
  assert.equal(a.text, b.text);
});

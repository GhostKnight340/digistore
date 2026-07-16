// The checkout six-digit verification email must surface the code prominently in
// both HTML and text, render the branded shell (required for auth emails), and
// never leak the code into a clickable link. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { renderEmailTemplate } from "../../src/lib/emailTemplates";
import { defaultStoreSettings } from "../../src/lib/storeSettings";

function render() {
  return renderEmailTemplate(defaultStoreSettings, "checkout_email_verification", {
    customer_name: "Amine",
    verification_code: "482913",
    expiry_minutes: "10",
  });
}

test("the code appears in the HTML and the plain-text bodies", () => {
  const rendered = render();
  assert.ok(rendered.html.includes("482913"), "HTML should contain the code");
  assert.ok(rendered.text.includes("482913"), "text should contain the code");
});

test("the email uses the branded HTML shell", () => {
  const { html } = render();
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("ghost.ma"));
  assert.ok(html.includes("Code de vérification"));
});

test("the expiry duration is communicated", () => {
  const rendered = render();
  assert.ok(rendered.text.includes("10 minutes"));
});

test("the code is not embedded in an href link", () => {
  const { html } = render();
  assert.ok(!html.includes("href=\"482913\""));
  assert.ok(!/href="[^"]*482913/.test(html), "code must not appear inside a link target");
});

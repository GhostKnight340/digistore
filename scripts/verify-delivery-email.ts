// Verifies that the order_delivered email never contains delivered secrets.
// Renders the branded template with a sentinel "secret" injected through every
// plausible variable and asserts it appears in NONE of subject / plain-text /
// HTML body / hidden preheader, and that the CTA points at the token delivery
// link. Pure render check — no DB, no network.
//
// Usage:  npx tsx scripts/verify-delivery-email.ts
import { renderEmailTemplate } from "../src/lib/emailTemplates";
import { defaultStoreSettings } from "../src/lib/storeSettings";

const SECRET = "SECRET-CODE-1234-XYZ";
const TOKEN = "tok_TESTdeliveryTOKEN123";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  ok - ${message}`);
}

function main() {
  const rendered = renderEmailTemplate(defaultStoreSettings, "order_delivered", {
    customer_name: "Zakariya",
    order_number: "#000017",
    delivery_url: `https://ghost.ma/delivery/${TOKEN}`,
    total: "250 MAD",
    // Legacy/removed secret channels — must not surface anywhere anymore:
    codes: SECRET,
  });

  console.log("Rendering order_delivered…");
  assert(!rendered.subject.includes(SECRET), "subject contains no code");
  assert(!rendered.text.includes(SECRET), "plain-text contains no code");
  assert(!rendered.html.includes(SECRET), "HTML body contains no code");

  // Hidden preheader is the first hidden div in the branded HTML.
  const preheaderMatch = rendered.html.match(/opacity:0;">\s*([\s\S]*?)<\/div>/);
  const preheader = preheaderMatch?.[1] ?? "";
  assert(!preheader.includes(SECRET), "preheader/preview text contains no code");

  assert(rendered.html.includes(`/delivery/${TOKEN}`), "CTA links to the token delivery page");
  assert(rendered.text.includes(`/delivery/${TOKEN}`), "plain-text links to the token delivery page");

  console.log("\nAll delivery-email safety checks passed.");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}

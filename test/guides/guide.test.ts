// Guide content model normalizers + sanitization. Pure — no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeGuideBlocks,
  normalizeGuideFaq,
  normalizeGuideNavigatorTip,
  normalizeGuideAliases,
  normalizeGuideIcon,
  slugifyGuide,
  isValidGuideUrl,
} from "../../src/lib/guide";
import { normalizeLegalHtml } from "../../src/lib/legalHtml";

test("slugifyGuide strips accents/punctuation and hyphenates", () => {
  assert.equal(slugifyGuide("Activer une carte Steam !"), "activer-une-carte-steam");
  assert.equal(slugifyGuide("  Région PSN  "), "region-psn");
});

test("normalizeGuideBlocks drops empty/unknown blocks and keeps valid ones", () => {
  const blocks = normalizeGuideBlocks([
    { type: "heading", text: "" }, // dropped: empty
    { type: "heading", text: "Étapes" }, // kept
    { type: "paragraph", text: "Bonjour" }, // kept
    { type: "steps", items: ["a", "", "b"] }, // kept, blanks removed
    { type: "bogus", text: "x" }, // dropped: unknown type
    { type: "cta", label: "Voir", url: "javascript:alert(1)" }, // dropped: unsafe url
    { type: "cta", label: "Voir", url: "/products" }, // kept
  ]);
  const types = blocks.map((b) => b.type);
  assert.deepEqual(types, ["heading", "paragraph", "steps", "cta"]);
  const steps = blocks.find((b) => b.type === "steps");
  assert.deepEqual(steps && steps.type === "steps" ? steps.items : null, ["a", "b"]);
});

test("normalizeGuideFaq drops blank + duplicate questions (test 12)", () => {
  const faq = normalizeGuideFaq([
    { question: "Q1", answer: "A1" },
    { question: "q1", answer: "dup" }, // dropped: duplicate (case-insensitive)
    { question: "Q2", answer: "" }, // dropped: no answer
    { question: "", answer: "A" }, // dropped: no question
    { question: "Q3", answer: "A3" },
  ]);
  assert.deepEqual(faq.map((f) => f.question), ["Q1", "Q3"]);
});

test("normalizeGuideAliases trims, lowercases, de-duplicates", () => {
  assert.deepEqual(normalizeGuideAliases([" PSN ", "psn", "Carte PSN", ""]), [
    "psn",
    "carte psn",
  ]);
});

test("normalizeGuideIcon coerces unknown keys to empty", () => {
  assert.equal(normalizeGuideIcon("gaming"), "gaming");
  assert.equal(normalizeGuideIcon("not-an-icon"), "");
  assert.equal(normalizeGuideIcon(123), "");
});

test("normalizeGuideNavigatorTip defaults type + booleans safely", () => {
  const tip = normalizeGuideNavigatorTip({ enabled: "yes", type: "bogus", message: "hi" });
  assert.equal(tip.enabled, false); // non-boolean → default
  assert.equal(tip.type, "information"); // unknown → default
  assert.equal(tip.message, "hi");
});

test("isValidGuideUrl accepts safe destinations, rejects unsafe", () => {
  assert.ok(isValidGuideUrl("/products"));
  assert.ok(isValidGuideUrl("https://ghost.ma"));
  assert.ok(isValidGuideUrl("#faq"));
  assert.ok(!isValidGuideUrl("javascript:alert(1)"));
  assert.ok(!isValidGuideUrl("data:text/html,x"));
  assert.ok(!isValidGuideUrl(""));
});

test("guide rich text is sanitized before render (test 13)", () => {
  const out = normalizeLegalHtml('<p>ok</p><script>alert("x")</script>');
  assert.ok(!out.toLowerCase().includes("<script"));
  assert.ok(!out.includes("alert("));
});

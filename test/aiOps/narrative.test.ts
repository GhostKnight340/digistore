// AI Operations — shared narrative helper: lenient JSON extraction + coercion
// with deterministic fallback. Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { extractJsonObject, coerceNarrative, type AiNarrative } from "../../src/lib/ai-ops/narrative";

const FALLBACK: AiNarrative = {
  summary: "fallback summary",
  recommendations: ["fallback rec"],
  trends: "",
  topPriorities: ["fallback priority"],
};

test("extractJsonObject pulls a balanced object out of surrounding prose/fences", () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('Here you go: {"x":"y"} — done'), { x: "y" });
  assert.equal(extractJsonObject("no json here"), null);
  assert.equal(extractJsonObject(""), null);
  assert.equal(extractJsonObject("[1,2,3]"), null); // arrays are not objects
});

test("coerceNarrative uses model prose when a summary is present", () => {
  const raw = JSON.stringify({
    summary: "All good.",
    recommendations: ["Do X", "Do Y", ""],
    trends: "stable",
    topPriorities: ["P1"],
  });
  const n = coerceNarrative(raw, FALLBACK);
  assert.equal(n.summary, "All good.");
  assert.deepEqual(n.recommendations, ["Do X", "Do Y"]); // empties filtered
  assert.equal(n.trends, "stable");
  assert.deepEqual(n.topPriorities, ["P1"]);
});

test("coerceNarrative falls back when the summary is missing or unparseable", () => {
  assert.equal(coerceNarrative("provider was down", FALLBACK).summary, "fallback summary");
  assert.equal(coerceNarrative(JSON.stringify({ recommendations: ["x"] }), FALLBACK).summary, "fallback summary");
  assert.equal(coerceNarrative("", FALLBACK), FALLBACK);
});

test("coerceNarrative caps list fields (brevity)", () => {
  const raw = JSON.stringify({ summary: "s", recommendations: ["1", "2", "3", "4", "5", "6"], trends: "", topPriorities: [] });
  assert.equal(coerceNarrative(raw, FALLBACK).recommendations.length, 3);
});

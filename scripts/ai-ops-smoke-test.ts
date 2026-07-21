/**
 * Live smoke test for the AI Operations OpenRouter provider.
 *
 * Loads .env.local / .env (via the --import preloader), then performs ONE real
 * OpenRouter completion through the provider-agnostic interface, printing the
 * text, token usage, and cost. No database, no other side effects.
 *
 *   npm run ai-ops:smoke-test                 # default cheap model
 *   npm run ai-ops:smoke-test anthropic/claude-haiku-4.5
 */
import { resolveProvider } from "../src/lib/ai-ops/provider";
import { isProviderConfigured } from "../src/lib/ai-ops/config";

async function main() {
  if (!isProviderConfigured("openrouter")) {
    console.error(
      "✗ OPENROUTER_API_KEY is not set. Add it to .env.local at the repo root and retry.",
    );
    process.exit(1);
  }

  const model = process.argv[2] || "anthropic/claude-haiku-4.5";
  const client = resolveProvider("openrouter");
  console.log(`→ Calling OpenRouter (provider=${client.provider}, model=${model})…`);

  const started = Date.now();
  const result = await client.complete({
    model,
    system: "You are a terse assistant. Reply in one short sentence, nothing else.",
    input: "Confirm you are reachable by replying: AI Operations foundation is live.",
    timeoutMs: 30_000,
  });

  console.log("\n✓ OpenRouter responded:");
  console.log(`  provider : ${result.provider}`);
  console.log(`  model    : ${result.model}`);
  console.log(`  text     : ${result.text}`);
  console.log(
    `  usage    : in=${result.usage.tokensIn} out=${result.usage.tokensOut} cost≈$${result.usage.estimatedCostUsd}`,
  );
  console.log(`  latency  : ${Date.now() - started}ms`);
}

main().catch((error) => {
  const code = error && typeof error === "object" && "code" in error ? (error as { code: string }).code : "";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ Smoke test failed${code ? ` [${code}]` : ""}: ${message}`);
  process.exit(1);
});

// Manual sandbox smoke test for the Reloadly foundation. Not run by CI, not
// imported by app code. Usage: npm run reloadly:smoke-test
import { getGiftCardProducts } from "../src/lib/reloadly/operations";

async function main() {
  const page = await getGiftCardProducts({ size: 5 });
  console.log(
    "Sample products:",
    page.content.map(
      (p) => `${p.productId}: ${p.productName} (${p.country.isoName})`,
    ),
  );
  console.log("Total products available:", page.totalElements);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

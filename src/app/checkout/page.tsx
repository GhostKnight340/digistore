import { redirect } from "next/navigation";
import CheckoutClient from "./CheckoutClient";
import { getCurrentCustomer } from "@/lib/auth";
import { isOrderingCurrentlyEnabled } from "@/lib/db/ordering";
import { getSpendableBalance } from "@/lib/db/ghostCredit";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  // Direct-URL protection: with ordering disabled there is nothing to check out.
  // Send the visitor back to the cart, which shows the "orders unavailable"
  // state instead of a dead checkout form.
  if (!(await isOrderingCurrentlyEnabled())) redirect("/cart");

  const customer = await getCurrentCustomer();
  // Spendable Ghost Credit (after applying any due 60-day expiry) so the
  // customer can choose to apply it toward this order.
  const wallet = customer ? await getSpendableBalance(customer.id) : null;
  return (
    <CheckoutClient
      initialCustomer={
        customer
          ? {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              emailVerified: customer.emailVerified,
              ghostCreditBalanceMad: wallet?.balanceMad ?? 0,
            }
          : null
      }
    />
  );
}

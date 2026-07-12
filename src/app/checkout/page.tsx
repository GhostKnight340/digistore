import { redirect } from "next/navigation";
import CheckoutClient from "./CheckoutClient";
import { getCurrentCustomer } from "@/lib/auth";
import { isOrderingCurrentlyEnabled } from "@/lib/db/ordering";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  // Direct-URL protection: with ordering disabled there is nothing to check out.
  // Send the visitor back to the cart, which shows the "orders unavailable"
  // state instead of a dead checkout form.
  if (!(await isOrderingCurrentlyEnabled())) redirect("/cart");

  const customer = await getCurrentCustomer();
  return (
    <CheckoutClient
      initialCustomer={
        customer
          ? {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              emailVerified: customer.emailVerified,
            }
          : null
      }
    />
  );
}

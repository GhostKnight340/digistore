import CheckoutClient from "./CheckoutClient";
import { getCurrentCustomer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
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

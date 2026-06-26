import { getPaymentConfig } from "@/lib/db/paymentSettings";
import CheckoutClient from "./CheckoutClient";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const config = await getPaymentConfig();
  return <CheckoutClient config={config} />;
}

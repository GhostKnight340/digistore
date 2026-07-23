import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import FindOrderForm from "./FindOrderForm";

/**
 * Guest order lookup (number + e-mail). Logged-in customers don't need it — their
 * orders are in their account, and the hardened lookup only resolves orders that
 * belong to their account anyway — so send them straight to their order history.
 * The redirect lives here (server-side) so it covers the nav link, a direct URL
 * and old bookmarks alike.
 */
export default async function FindOrderPage() {
  const customer = await getCurrentCustomer();
  if (customer) redirect("/account/orders");
  return <FindOrderForm />;
}

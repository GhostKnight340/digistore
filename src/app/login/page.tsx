import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { resolveAuthedRedirect } from "@/lib/authRedirect";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Already-authenticated users should never see the auth UI.
  const customer = await getCurrentCustomer();
  if (customer) {
    redirect(resolveAuthedRedirect(await searchParams));
  }
  return <LoginClient />;
}

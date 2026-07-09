import { redirect } from "next/navigation";
import { requireCustomer, isProfileIncomplete } from "@/lib/auth";
import DiscordCompleteClient from "./DiscordCompleteClient";

export const dynamic = "force-dynamic";

export default async function DiscordCompletePage() {
  const customer = await requireCustomer();
  // Only for incomplete Discord accounts; a finished profile has nothing to do here.
  if (!isProfileIncomplete(customer)) redirect("/account");

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-md">
        <DiscordCompleteClient
          defaultName={customer.discordGlobalName || customer.discordUsername || customer.name}
          discordUsername={customer.discordUsername}
        />
      </div>
    </div>
  );
}

import Link from "next/link";
import AccountShell from "@/components/account/AccountShell";
import SupportTicketList from "@/components/support/SupportTicketList";
import { LifebuoyIcon, ArrowRightIcon } from "@/components/account/icons";
import { requireCustomer, getAccountOrders, isProfileIncomplete } from "@/lib/auth";
import { listSupportTicketsForCustomer } from "@/lib/db/supportTickets";

export const dynamic = "force-dynamic";

export default async function AccountSupportPage() {
  const customer = await requireCustomer();
  const incomplete = isProfileIncomplete(customer);
  const accountEmail = incomplete ? null : customer.email;
  const [orders, tickets] = await Promise.all([
    getAccountOrders(customer.id),
    listSupportTicketsForCustomer(customer.id, accountEmail),
  ]);

  return (
    <AccountShell
      name={customer.name}
      email={incomplete ? "" : customer.email}
      active="support"
      verified={!incomplete && customer.emailVerified}
      ordersCount={orders.length}
      supportCount={tickets.length}
      title="Mes demandes de support"
      subtitle="Suivez vos demandes, consultez les réponses de notre équipe et donnez votre avis."
    >
      <div className="rounded-[18px] border border-border bg-card p-4 shadow-soft sm:p-[26px]">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center px-2 py-10 text-center sm:px-6">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
              <LifebuoyIcon className="h-7 w-7" />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-white">Aucune demande de support</p>
            <p className="mt-1 max-w-sm text-[13px] text-muted">
              Une question ou un souci avec une commande ? Notre équipe est là pour vous aider.
            </p>
            <Link href="/support" className="btn-primary mt-5 text-sm">
              Contacter le support
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <SupportTicketList tickets={tickets} />
        )}
      </div>

      {/* Feedback is separate from support — a low-friction way to suggest ideas.
          The link opens the global feedback dialog via ?feedback=1. */}
      <Link
        href="/account/support?feedback=1"
        className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-border bg-card p-5 shadow-soft transition hover:border-accent/50"
      >
        <div>
          <p className="text-[15px] font-semibold text-white">Envoyer une suggestion</p>
          <p className="text-[13px] text-muted">
            Une idée ou une amélioration ? Partagez votre avis (hors problème de commande).
          </p>
        </div>
        <ArrowRightIcon className="h-4 w-4 text-faint" />
      </Link>
    </AccountShell>
  );
}

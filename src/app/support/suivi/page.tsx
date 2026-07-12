import { Suspense } from "react";
import Link from "next/link";
import TicketStatusLookup from "@/components/support/TicketStatusLookup";
import SupportTicketList from "@/components/support/SupportTicketList";
import { getCurrentCustomer, isProfileIncomplete } from "@/lib/auth";
import { listSupportTicketsForCustomer } from "@/lib/db/supportTickets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suivre ma demande - ghost.ma" };

export default async function SupportTicketStatusPage() {
  // Logged-in customers see their own tickets directly instead of having to
  // re-enter a reference + e-mail. The manual lookup stays available below for
  // guests and for a demand opened under a different address.
  const customer = await getCurrentCustomer().catch(() => null);
  const tickets = customer
    ? await listSupportTicketsForCustomer(
        customer.id,
        isProfileIncomplete(customer) ? null : customer.email,
      )
    : [];

  return (
    <>
      {customer && (
        <section className="container-page pt-12">
          <div className="mx-auto max-w-[560px]">
            <p className="mb-3 text-[12.5px] font-bold uppercase tracking-[0.14em] text-[#4d7fff]">
              GHOST.MA
            </p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-white">
                Mes demandes
              </h1>
              <Link
                href="/account/support"
                className="text-sm font-medium text-accent hover:text-accent-hover"
              >
                Gérer dans mon compte →
              </Link>
            </div>
            {tickets.length > 0 ? (
              <div className="mt-6">
                <SupportTicketList tickets={tickets} />
              </div>
            ) : (
              <p className="mt-4 rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-sm text-muted">
                Vous n&apos;avez pas encore de demande liée à ce compte. Utilisez le formulaire ci-dessous
                si vous avez ouvert une demande avec une autre adresse e-mail.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Manual lookup: primary entry for guests, secondary for logged-in users
          (a reference opened under a different e-mail). */}
      <Suspense fallback={null}>
        <TicketStatusLookup heading={customer ? "Suivre une autre demande" : undefined} />
      </Suspense>
    </>
  );
}

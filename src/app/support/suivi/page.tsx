import { Suspense } from "react";
import TicketStatusLookup from "@/components/support/TicketStatusLookup";

export const metadata = { title: "Suivre ma demande - ghost.ma" };

export default function SupportTicketStatusPage() {
  return (
    <Suspense fallback={null}>
      <TicketStatusLookup />
    </Suspense>
  );
}

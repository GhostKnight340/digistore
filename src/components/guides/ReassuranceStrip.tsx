import Link from "next/link";

/**
 * A calm confidence strip closing the Help Center: the brand promises that make
 * activation feel safe. Static copy only — these are commitments, not metrics, so
 * there are no fabricated numbers. Ends with a route to human support.
 */

const ITEMS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Livraison instantanée",
    body: "Vos codes arrivent immédiatement après le paiement.",
    icon: (
      <>
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      </>
    ),
  },
  {
    title: "Guides pas à pas",
    body: "Des instructions claires pour chaque activation.",
    icon: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
        <line x1="8" y1="7.5" x2="16" y2="7.5" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </>
    ),
  },
  {
    title: "Paiement sécurisé",
    body: "Vos transactions sont protégées de bout en bout.",
    icon: (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
  {
    title: "Support réactif",
    body: "Une question ? Notre équipe répond avant et après l'achat.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.2 9.2a3 3 0 0 1 5.2 1.9c0 2-3 2.4-3 4" />
        <circle cx="11.4" cy="17" r="0.8" fill="currentColor" />
      </>
    ),
  },
];

export default function ReassuranceStrip() {
  return (
    <section aria-labelledby="hc-reassurance" className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="hc-reassurance" className="text-lg font-semibold text-white">
            Activez en toute confiance
          </h2>
          <p className="mt-1 text-sm text-muted">
            Vous ne trouvez pas votre réponse ? Notre support est là pour vous.
          </p>
        </div>
        <Link href="/support" className="btn-primary shrink-0">
          Contacter le support
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((item) => (
          <div key={item.title} className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface2 text-accent">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                {item.icon}
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

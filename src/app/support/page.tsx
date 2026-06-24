import Link from "next/link";

export const metadata = { title: "Support - Karta" };

const faqs = [
  {
    q: "La livraison est-elle vraiment instantanée?",
    a: "Oui. Votre code apparaît à l'écran dès que la commande est confirmée, et une copie vous est envoyée par email.",
  },
  {
    q: "Quels moyens de paiement sont disponibles?",
    a: "La phase 1 utilise un paiement test. Le virement bancaire, la crypto et PayPal sont affichés comme options prévues, mais ne sont pas encore actifs.",
  },
  {
    q: "Que faire si mon code ne fonctionne pas?",
    a: "Ce prototype utilise des codes test qui ne peuvent pas être activés sur de vraies boutiques. En production, notre support local remplacera tout code défectueux.",
  },
  {
    q: "Le service est-il adapté aux clients au Maroc?",
    a: "Oui. Karta est pensé pour le Maroc, avec un support local en darija, arabe, français et anglais.",
  },
];

export default function SupportPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Support
        </h1>
        <p className="mt-2 text-muted">
          Besoin d'aide? Retrouvez les réponses rapides ci-dessous ou contactez
          notre équipe.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Chat en direct", "Bientôt"],
            ["Email", "support@karta.ma"],
            ["Horaires", "9:00 - 22:00 (GMT+1)"],
          ].map(([title, text]) => (
            <div key={title} className="card p-5 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                <span className="h-2 w-2 rounded-full bg-current" />
              </span>
              <h3 className="mt-3 font-semibold text-white">{title}</h3>
              <p className="text-xs text-muted">{text}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-12 text-xl font-semibold tracking-tight text-white">
          Questions fréquentes
        </h2>
        <div className="mt-4 space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.q}
              className="card group p-5 [&_summary]:cursor-pointer"
            >
              <summary className="flex items-center justify-between gap-4 font-semibold text-white">
                {faq.q}
                <span className="text-muted transition group-open:rotate-180">
                  v
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted">{faq.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/products" className="btn-primary">
            Parcourir le catalogue
          </Link>
        </div>
      </div>
    </div>
  );
}

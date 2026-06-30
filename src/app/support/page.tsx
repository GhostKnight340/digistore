import Link from "next/link";

export const metadata = { title: "Contact & Support - ghost.ma" };

const faqs = [
  {
    q: "La livraison est-elle rapide?",
    a: "Pour les produits à traitement automatique, votre code apparaît à l'écran dès que le paiement est confirmé, et une copie vous est envoyée par email. Certains produits nécessitent une vérification manuelle et sont livrés dans les meilleurs délais.",
  },
  {
    q: "Quels moyens de paiement sont disponibles?",
    a: "Vous pouvez payer par virement bancaire, PayPal, cryptomonnaie et les autres méthodes prises en charge par ghost.ma. Selon le moyen choisi, un justificatif de paiement peut vous être demandé pour confirmer la transaction.",
  },
  {
    q: "Comment suivre ma commande?",
    a: "Vous recevez le statut de votre commande par email et vous pouvez le consulter à tout moment sur le site, depuis votre compte ou via le suivi de commande en tant qu'invité.",
  },
  {
    q: "Que faire si mon code ne fonctionne pas?",
    a: "Contactez-nous avec votre numéro de commande et le code concerné. Si le code est invalide ou inutilisable de notre fait, nous le remplaçons ou vous remboursons selon notre Politique de Remboursement.",
  },
  {
    q: "Le service est-il adapté aux clients au Maroc?",
    a: "Oui. ghost.ma est pensé pour le Maroc, avec un support local en darija, arabe, français et anglais.",
  },
];

export default function SupportPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Contact &amp; Support
        </h1>
        <p className="mt-2 text-muted">
          Besoin d&apos;aide? Retrouvez les réponses rapides ci-dessous ou
          contactez notre équipe. Pour un traitement plus rapide, indiquez
          toujours votre numéro de commande.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["WhatsApp", "+212 600 000 000"],
            ["Email", "support@ghost.ma"],
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

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/contact" className="btn-primary">
            Nous écrire
          </Link>
          <Link href="/products" className="btn-ghost">
            Parcourir le catalogue
          </Link>
        </div>
      </div>
    </div>
  );
}

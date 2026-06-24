import Link from "next/link";
import { formatMAD, formatDate } from "@/lib/format";
import { isDelivered, orderStatusLabel } from "@/lib/orderStatus";
import { getCustomerOrder } from "@/lib/db/orders";

const methodLabels: Record<string, string> = {
  test: "Paiement test",
  bank: "Virement bancaire",
  crypto: "Crypto",
  paypal: "PayPal",
};

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getCustomerOrder(id);

  if (!order) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">
            Commande introuvable
          </p>
          <p className="mt-1 text-sm text-muted">
            Cette commande a peut-être été passée sur un autre appareil ou un
            autre navigateur.
          </p>
          <Link href="/products" className="btn-primary mt-6">
            Parcourir le catalogue
          </Link>
        </div>
      </div>
    );
  }

  const delivered = isDelivered(order.status);

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-3xl">
        <section className="text-center">
          {delivered ? (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-green-500/30 bg-green-500/15 text-3xl">
                ✓
              </span>
              <p className="mt-5 text-sm font-medium uppercase tracking-wide text-green-400">
                Commande livrée
              </p>
              <h1 className="mt-2 text-3xl font-bold text-white">
                Confirmation de commande
              </h1>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
                Merci, {order.customerName.split(" ")[0]}. Votre paiement est
                confirmé et votre code est disponible.
              </p>
            </>
          ) : (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-amber-500/30 bg-amber-500/15 text-3xl">
                ⏳
              </span>
              <p className="mt-5 text-sm font-medium uppercase tracking-wide text-amber-400">
                {orderStatusLabel(order.status)}
              </p>
              <h1 className="mt-2 text-3xl font-bold text-white">
                Nous avons bien reçu votre commande
              </h1>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
                Merci, {order.customerName.split(" ")[0]}. Votre paiement est en
                cours de vérification. Votre code sera disponible sur la page de
                livraison dès que la commande sera confirmée.
              </p>
            </>
          )}
        </section>

        <section className="card mt-8 overflow-hidden">
          <div className="border-b border-border px-6 py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Détails de la commande
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {delivered
                    ? "Aucune action supplémentaire n'est nécessaire."
                    : "Aucune action n'est requise pendant la vérification."}
                </p>
              </div>
              <span
                className={`chip ${
                  delivered
                    ? "border-green-500/40 text-green-400"
                    : "border-amber-500/40 text-amber-400"
                }`}
              >
                {orderStatusLabel(order.status)}
              </span>
            </div>
          </div>

          <dl className="grid gap-px bg-border/60 sm:grid-cols-2">
            <Meta label="ID commande" value={order.id} />
            <Meta
              label="Méthode de paiement"
              value={methodLabels[order.paymentMethod] ?? order.paymentMethod}
            />
            <Meta label="Email client" value={order.customerEmail} />
            <Meta label="Total payé" value={formatMAD(order.totalMad)} highlight />
            <Meta label="Date d'achat" value={formatDate(order.createdAt)} />
            <Meta
              label="Statut de livraison"
              value={orderStatusLabel(order.status)}
              highlight={delivered}
            />
          </dl>

          <div className="border-t border-border px-6 py-5">
            <h3 className="text-sm font-semibold text-white">Articles</h3>
            <ul className="mt-3 space-y-2">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between gap-4 text-sm text-muted"
                >
                  <span>
                    {item.name}{" "}
                    <span className="text-muted/70">×{item.quantity}</span>
                  </span>
                  <span className="shrink-0 text-white">
                    {formatMAD(item.unitPriceMad * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-accent/40 bg-accent/10 p-6 text-center">
          <h2 className="text-lg font-bold text-white">
            {delivered
              ? "Votre livraison est sécurisée"
              : "Suivez l'état de votre commande"}
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-relaxed text-muted">
            {delivered
              ? "Votre code est sauvegardé dans l'historique de commandes de votre compte. Vous pouvez revenir à cette page à tout moment depuis votre compte."
              : "Suivez l'état de votre commande sur la page de livraison. Votre code y apparaîtra automatiquement une fois le paiement confirmé."}
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={`/delivery/${order.id}`} className="btn-primary">
              {delivered ? "Voir mon code" : "Suivre ma commande"}
            </Link>
            <Link href="/products" className="btn-ghost">
              Retour à la boutique
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd
        className={`mt-1 break-words text-sm font-semibold ${
          highlight ? "text-accent-strong" : "text-white"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

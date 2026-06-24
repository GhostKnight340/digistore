export const metadata = { title: "Conditions - Karta" };

export default function TermsPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Conditions d'utilisation
        </h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            Ces conditions sont provisoires pour le prototype Karta. En
            utilisant cette démo, vous acceptez qu'aucun paiement réel ne soit
            traité et qu'aucune vraie carte cadeau ne soit livrée.
          </p>
          <h2 className="pt-2 text-base font-semibold text-white">
            1. Utilisation du prototype
          </h2>
          <p>
            Tous les produits, prix, codes et commandes sont fournis uniquement
            pour la démonstration. Les codes affichés après le paiement sont des
            codes test et ne peuvent pas être utilisés sur une vraie boutique.
          </p>
          <h2 className="pt-2 text-base font-semibold text-white">
            2. Livraison numérique
          </h2>
          <p>
            En production, les codes numériques seront livrés instantanément et
            ne seront généralement pas remboursables une fois révélés, sauf en
            cas de code défectueux.
          </p>
          <h2 className="pt-2 text-base font-semibold text-white">
            3. Changements
          </h2>
          <p>
            Les conditions finales seront publiées avant l'activation de vraies
            transactions.
          </p>
        </div>
      </div>
    </div>
  );
}

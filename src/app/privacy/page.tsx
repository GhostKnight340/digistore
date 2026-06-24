export const metadata = { title: "Confidentialité - Karta" };

export default function PrivacyPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Politique de confidentialité
        </h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            Cette politique de confidentialité est un texte provisoire pour le
            prototype Karta.
          </p>
          <h2 className="pt-2 text-base font-semibold text-white">
            Données stockées
          </h2>
          <p>
            Dans ce prototype, votre panier et votre historique de commandes
            sont stockés uniquement dans votre navigateur avec localStorage.
            Rien n'est envoyé à un serveur, et le nom ou l'email saisi au
            paiement ne quitte pas votre appareil.
          </p>
          <h2 className="pt-2 text-base font-semibold text-white">
            Supprimer vos données
          </h2>
          <p>
            Vous pouvez supprimer les données enregistrées à tout moment en
            vidant les données du site dans votre navigateur.
          </p>
          <h2 className="pt-2 text-base font-semibold text-white">
            Version finale
          </h2>
          <p>
            Une politique de confidentialité complète sera publiée avant toute
            collecte ou utilisation de données réelles.
          </p>
        </div>
      </div>
    </div>
  );
}

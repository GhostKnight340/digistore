import Link from "next/link";

export default function AccountPage() {
  return (
    <div className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit">
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-lg">
                #
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Invit?</p>
                <p className="text-xs text-muted">Non connect?</p>
              </div>
            </div>
            <nav className="mt-5 space-y-1 text-sm">
              <span className="block rounded-lg bg-accent/10 px-3 py-2 font-medium text-white">
                Suivi de commande
              </span>
              <span className="block rounded-lg px-3 py-2 text-muted">
                Profil (bientôt)
              </span>
              <span className="block rounded-lg px-3 py-2 text-muted">
                Paramètres (bientôt)
              </span>
            </nav>
            <Link href="/login" className="btn-ghost mt-4 w-full">
              Connexion / Inscription
            </Link>
          </div>
          <p className="mt-3 px-1 text-xs text-muted">
            Les commandes sont enregistrées dans Supabase. Le suivi se fait par lien de commande jusqu'à l'ajout d'une authentification complète.
          </p>
        </aside>

        <section>
          <h1 className="text-3xl font-bold text-white">Suivi de commande</h1>
          <div className="card mt-8 grid place-items-center px-6 py-20 text-center">
            <span className="text-4xl">#</span>
            <p className="mt-4 text-lg font-semibold text-white">
              Ouvrez le lien de votre commande
            </p>
            <p className="mt-1 max-w-md text-sm text-muted">
              Sans compte client, l'historique des commandes n'est pas conservé dans ce navigateur. Utilisez le lien reçu après paiement ou contactez le support avec votre numéro de commande.
            </p>
            <Link href="/products" className="btn-primary mt-6">
              Parcourir le catalogue
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

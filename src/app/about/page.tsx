export const metadata = { title: "À propos - Karta" };

export default function AboutPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          À propos de Karta
        </h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            Karta est une plateforme marocaine pour acheter des cartes de jeu et
            des codes numériques pour les plateformes que les gamers utilisent
            au quotidien.
          </p>
          <p>
            Notre objectif est simple: proposer une boutique claire, fiable et
            rapide pour acheter un code, le recevoir instantanément et profiter
            d'un support local qui comprend les clients au Maroc.
          </p>
          <p>
            Que vous achetiez en tant qu'invité ou via votre compte, vous
            recevez vos codes après confirmation du paiement et suivez vos
            commandes par email et directement sur le site. Notre équipe support
            reste disponible pour vous accompagner à chaque étape.
          </p>
        </div>
      </div>
    </div>
  );
}

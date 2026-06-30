export const metadata = { title: "À propos - ghost.ma" };

export default function AboutPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          À propos de ghost.ma
        </h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            ghost.ma est une plateforme marocaine pour acheter des cartes de jeu et
            des codes numériques pour les plateformes que les gamers utilisent
            au quotidien.
          </p>
          <p>
            Notre objectif est simple: proposer une boutique claire, fiable et
            rapide pour acheter un code après confirmation du paiement et profiter
            d'un support local qui comprend les clients au Maroc.
          </p>
          <p>
            Cette version est un prototype phase 1. Les produits, les prix et
            les codes sont fournis à titre de démonstration: aucun paiement réel
            n'est traité et aucune vraie carte cadeau n'est livrée.
          </p>
        </div>
      </div>
    </div>
  );
}

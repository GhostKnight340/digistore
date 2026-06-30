import Link from "next/link";

export const metadata = { title: "Conditions Générales de Vente - ghost.ma" };

export default function TermsPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Conditions Générales de Vente
        </h1>
        <p className="mt-3 text-sm text-faint">
          Dernière mise à jour : 30 juin 2026
        </p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            Les présentes Conditions Générales de Vente encadrent l&apos;achat
            des produits numériques proposés sur ghost.ma. En passant commande, en
            tant qu&apos;invité ou via un compte client, vous reconnaissez avoir
            lu et accepté ces conditions.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            1. Nos produits
          </h2>
          <p>
            ghost.ma propose exclusivement des produits numériques : cartes
            cadeaux, codes numériques, cartes de jeu, portefeuilles, monnaies de
            jeu et autres clés activables en ligne. Aucun bien physique
            n&apos;est vendu ni expédié.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            2. Compte et commande en tant qu&apos;invité
          </h2>
          <p>
            Vous pouvez acheter en tant qu&apos;invité, en renseignant
            simplement les informations nécessaires au traitement de votre
            commande, ou avec un compte client qui vous donne accès à votre
            historique de commandes et au suivi de vos achats. Vous êtes
            responsable de l&apos;exactitude des informations fournies et de la
            confidentialité de vos identifiants.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            3. Processus de commande
          </h2>
          <p>
            Vous sélectionnez vos produits, vérifiez le contenu de votre panier,
            la région applicable et le prix total, puis choisissez votre moyen
            de paiement et confirmez votre commande. Un récapitulatif vous est
            envoyé par email et reste accessible depuis votre compte.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            4. Paiement
          </h2>
          <p>
            Plusieurs moyens de paiement sont disponibles, notamment le virement
            bancaire, PayPal, la cryptomonnaie et les autres méthodes prises en
            charge par ghost.ma. Selon le moyen choisi, un justificatif de paiement
            peut vous être demandé afin de confirmer la transaction. Votre
            commande est traitée une fois le paiement vérifié.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            5. Livraison
          </h2>
          <p>
            Certaines commandes sont livrées rapidement après la
            confirmation du paiement. D&apos;autres produits nécessitent une
            vérification préalable et sont livrés dans les meilleurs délais une
            fois cette vérification effectuée. Vous recevez vos codes et le
            statut de votre commande par email, et pouvez également les consulter
            directement sur le site.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            6. Disponibilité
          </h2>
          <p>
            L&apos;offre dépend de la disponibilité des produits. En cas
            d&apos;indisponibilité après votre commande, nous vous en informons
            et procédons au remboursement intégral des sommes correspondantes.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            7. Régions et compatibilité
          </h2>
          <p>
            Certains produits sont valables uniquement dans une région, un pays
            ou sur une plateforme déterminée, comme indiqué sur leur fiche. Il
            vous appartient de vérifier la compatibilité d&apos;un produit avec
            votre compte et votre région avant l&apos;achat.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            8. Responsabilités du client
          </h2>
          <p>
            Vous vous engagez à fournir des informations exactes, à vérifier la
            compatibilité des produits avant l&apos;achat, à utiliser les codes
            conformément aux conditions des plateformes concernées et à ne pas
            en faire un usage frauduleux.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            9. Prévention de la fraude
          </h2>
          <p>
            Afin de protéger nos clients et la plateforme, une commande
            présentant des signaux de risque peut faire l&apos;objet d&apos;une
            vérification complémentaire, être retardée ou annulée. Si une
            commande est annulée sans qu&apos;aucune fraude ne soit caractérisée,
            les sommes correspondantes vous sont remboursées.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            10. Remboursements
          </h2>
          <p>
            Les produits numériques étant livrés de manière dématérialisée, un
            code livré et révélé n&apos;est généralement pas remboursable, sauf
            s&apos;il est invalide ou inutilisable de notre fait. Les conditions
            détaillées figurent dans notre{" "}
            <Link href="/refunds" className="text-accent hover:underline">
              Politique de Remboursement
            </Link>
            .
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            11. Limitation de responsabilité
          </h2>
          <p>
            ghost.ma s&apos;engage à fournir des produits conformes à leur
            description. Notre responsabilité ne saurait être engagée pour une
            mauvaise utilisation d&apos;un code, une incompatibilité régionale
            non vérifiée avant l&apos;achat ou les décisions des plateformes
            tierces sur lesquelles les codes sont activés. Notre responsabilité
            est en tout état de cause limitée au montant de la commande
            concernée.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            12. Support
          </h2>
          <p>
            Notre équipe est disponible pour toute question relative à votre
            commande via les canaux indiqués sur notre page{" "}
            <Link href="/support" className="text-accent hover:underline">
              Contact &amp; Support
            </Link>
            .
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            13. Droit applicable et modifications
          </h2>
          <p>
            Les présentes conditions sont régies par le droit marocain. Nous
            pouvons les faire évoluer afin de refléter l&apos;évolution de nos
            services ; la version applicable est celle en vigueur au moment de
            votre commande.
          </p>
        </div>
      </div>
    </div>
  );
}

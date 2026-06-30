import Link from "next/link";

export const metadata = { title: "Politique de Remboursement - ghost.ma" };

export default function RefundsPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Politique de Remboursement
        </h1>
        <p className="mt-3 text-sm text-faint">
          Dernière mise à jour : 30 juin 2026
        </p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            ghost.ma vend des produits numériques livrés de manière dématérialisée.
            En raison de leur nature, les codes ne peuvent être « retournés » une
            fois révélés. Cette politique précise clairement les situations dans
            lesquelles un remboursement est possible et celles où il ne l&apos;est
            pas.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Principe général
          </h2>
          <p>
            Vous payez pour un produit fonctionnel et conforme. Lorsqu&apos;un
            problème provient de notre côté, nous le corrigeons ou nous vous
            remboursons. Lorsqu&apos;un produit a été livré et utilisé
            conformément à sa description, il ne peut, par nature, faire
            l&apos;objet d&apos;un remboursement.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Commande annulée avant la livraison
          </h2>
          <p>
            Si votre commande n&apos;a pas encore été livrée, vous pouvez en
            demander l&apos;annulation. Dès lors que le code ne vous a pas été
            remis, vous êtes intégralement remboursé.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Paiement en double
          </h2>
          <p>
            Si un même achat a donné lieu à plusieurs paiements, nous vous
            remboursons les montants payés en trop après vérification de la
            transaction.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Code invalide ou inutilisable
          </h2>
          <p>
            Si le code reçu s&apos;avère invalide, déjà utilisé ou techniquement
            inutilisable de notre fait, nous le remplaçons en priorité. Si aucun
            remplacement n&apos;est possible, nous procédons au remboursement
            intégral du produit concerné.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Investigations manuelles
          </h2>
          <p>
            Certaines demandes nécessitent une vérification de notre part,
            notamment lorsqu&apos;un code est signalé comme défectueux. Nous
            menons alors une investigation, vous tenons informé de
            l&apos;avancement et vous communiquons une décision motivée dès
            qu&apos;elle est terminée.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Produits déjà livrés
          </h2>
          <p>
            Un produit dont le code a été livré et révélé est réputé consommé. Il
            ne peut faire l&apos;objet d&apos;un remboursement, sauf en cas de
            code invalide ou inutilisable de notre fait.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Erreur d&apos;achat du client
          </h2>
          <p>
            Les achats effectués par erreur — mauvais produit, mauvaise région,
            mauvaise plateforme ou quantité incorrecte — ne sont pas
            remboursables une fois le code livré, dès lors que le produit
            correspond à sa description. Vérifiez soigneusement la région et la
            compatibilité avant de finaliser votre commande.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Activité frauduleuse
          </h2>
          <p>
            Aucune commande associée à une activité frauduleuse, à une
            usurpation d&apos;identité ou à une violation de nos conditions ne
            donne lieu à remboursement. Les commandes concernées peuvent être
            annulées et les codes désactivés lorsque cela est possible.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Rétrofacturations
          </h2>
          <p>
            En cas de problème, contactez d&apos;abord notre support : nous
            résolvons la grande majorité des situations rapidement et à
            l&apos;amiable. Une rétrofacturation engagée sans nous avoir
            contactés, alors que le produit a été livré conformément, est
            considérée comme injustifiée et peut entraîner la suspension du
            compte concerné.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Comment demander un remboursement
          </h2>
          <p>
            Contactez notre support via notre page{" "}
            <Link href="/support" className="text-accent hover:underline">
              Contact &amp; Support
            </Link>{" "}
            en précisant votre numéro de commande et la nature du problème. Les
            remboursements sont effectués sur le moyen de paiement d&apos;origine
            lorsque cela est possible, ou par un moyen équivalent.
          </p>
        </div>
      </div>
    </div>
  );
}

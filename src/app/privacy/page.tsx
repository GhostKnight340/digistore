import Link from "next/link";

export const metadata = { title: "Politique de Confidentialité - Karta" };

export default function PrivacyPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Politique de Confidentialité
        </h1>
        <p className="mt-3 text-sm text-faint">
          Dernière mise à jour : 30 juin 2026
        </p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            Chez Karta, nous accordons une grande importance à la protection de
            vos données. Cette politique explique quelles informations nous
            collectons, pourquoi, comment nous les utilisons et quels sont vos
            droits, que vous achetiez en tant qu&apos;invité ou via un compte
            client.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Informations de compte
          </h2>
          <p>
            Lorsque vous créez un compte, nous collectons les informations
            nécessaires à sa gestion, telles que votre nom, votre adresse email
            et vos identifiants de connexion. Si vous achetez en tant
            qu&apos;invité, nous ne collectons que les informations nécessaires
            au traitement de votre commande.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Historique des commandes
          </h2>
          <p>
            Pour les clients disposant d&apos;un compte, nous conservons
            l&apos;historique de vos commandes afin que vous puissiez retrouver
            vos codes, suivre le statut de vos achats et bénéficier d&apos;un
            support plus rapide. Vous pouvez le consulter à tout moment sur le
            site.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Informations de paiement
          </h2>
          <p>
            Nous collectons les informations nécessaires à la vérification et au
            traitement de vos paiements, ainsi que, selon le moyen de paiement
            utilisé, les justificatifs que vous nous transmettez. Ces
            informations servent uniquement à confirmer votre transaction et à
            prévenir la fraude.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">Cookies</h2>
          <p>
            Nous utilisons des cookies et technologies similaires pour assurer
            le bon fonctionnement du site, mémoriser votre panier, maintenir
            votre session et améliorer votre expérience. Vous pouvez gérer vos
            préférences depuis votre navigateur.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Mesure d&apos;audience
          </h2>
          <p>
            Nous utilisons des outils de mesure d&apos;audience pour comprendre
            comment le site est utilisé et l&apos;améliorer. Ces analyses
            portent sur des données d&apos;usage agrégées et nous aident à offrir
            une expérience plus fluide et plus fiable.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Communications par email
          </h2>
          <p>
            Nous utilisons votre adresse email pour vous transmettre les
            informations essentielles relatives à vos commandes : confirmation,
            statut, livraison de vos codes et messages de support. Vous pouvez
            vous désinscrire des communications commerciales à tout moment, sans
            que cela n&apos;affecte les emails liés à vos commandes.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">Sécurité</h2>
          <p>
            Nous mettons en œuvre des mesures techniques et organisationnelles
            adaptées pour protéger vos données contre tout accès, perte ou
            utilisation non autorisés. Nous vous recommandons également de
            protéger vos identifiants et de ne jamais les partager.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Vos droits
          </h2>
          <p>
            Vous pouvez à tout moment demander l&apos;accès à vos données, leur
            rectification ou leur suppression, ainsi que vous opposer à certains
            traitements, dans les limites prévues par la loi. Pour exercer ces
            droits, contactez-nous via notre page{" "}
            <Link href="/support" className="text-accent hover:underline">
              Contact &amp; Support
            </Link>
            .
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Modifications
          </h2>
          <p>
            Cette politique peut évoluer afin de refléter les changements de nos
            services ou de la réglementation. La version applicable est celle
            publiée sur le site.
          </p>
        </div>
      </div>
    </div>
  );
}

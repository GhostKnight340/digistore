import Link from "next/link";

export const metadata = { title: "Mentions légales - ghost.ma" };

// Informations légales — à compléter lors de l'enregistrement officiel.
// Modifiez uniquement les valeurs ci-dessous ; le reste de la page s'y réfère.
const legalInfo = {
  nomCommercial: "ghost.ma",
  exploitant: "[Nom de l'exploitant]",
  adresse: "[Adresse à compléter]",
  email: "support@ghost.ma",
  whatsapp: "+212 600 000 000",
  immatriculation: "À compléter lors de l'enregistrement officiel",
};

export default function LegalPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Mentions légales
        </h1>
        <p className="mt-3 text-sm text-faint">
          Dernière mise à jour : 30 juin 2026
        </p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <h2 className="pt-2 text-base font-semibold text-white">
            Informations sur l&apos;éditeur
          </h2>
          <dl className="card divide-y divide-border p-0 text-sm">
            <Row label="Nom commercial" value={legalInfo.nomCommercial} />
            <Row label="Exploitant" value={legalInfo.exploitant} />
            <Row label="Adresse" value={legalInfo.adresse} />
            <Row
              label="Email"
              value={
                <a
                  href={`mailto:${legalInfo.email}`}
                  className="text-accent hover:underline"
                >
                  {legalInfo.email}
                </a>
              }
            />
            <Row label="WhatsApp" value={legalInfo.whatsapp} />
            <Row
              label="Immatriculation"
              value={legalInfo.immatriculation}
            />
          </dl>

          <h2 className="pt-4 text-base font-semibold text-white">
            Éditeur du site
          </h2>
          <p>
            Le site {legalInfo.nomCommercial} est édité et exploité par{" "}
            {legalInfo.exploitant}. Pour toute question relative au site ou à vos
            commandes, vous pouvez nous joindre à l&apos;adresse{" "}
            <a
              href={`mailto:${legalInfo.email}`}
              className="text-accent hover:underline"
            >
              {legalInfo.email}
            </a>{" "}
            ou par WhatsApp au {legalInfo.whatsapp}.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Immatriculation
          </h2>
          <p>
            Les informations d&apos;immatriculation seront mises à jour lors de
            l&apos;enregistrement officiel de l&apos;activité.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Propriété intellectuelle
          </h2>
          <p>
            L&apos;ensemble des éléments composant le site {legalInfo.nomCommercial}{" "}
            — marque, logo, textes, visuels et interface — est protégé par le
            droit de la propriété intellectuelle. Toute reproduction ou
            exploitation, totale ou partielle, sans autorisation préalable est
            interdite. Les marques et noms de produits de tiers cités sur le site
            appartiennent à leurs propriétaires respectifs.
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Conditions et confidentialité
          </h2>
          <p>
            L&apos;utilisation du site est régie par nos{" "}
            <Link href="/terms" className="text-accent hover:underline">
              Conditions Générales de Vente
            </Link>
            , notre{" "}
            <Link href="/refunds" className="text-accent hover:underline">
              Politique de Remboursement
            </Link>{" "}
            et notre{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              Politique de Confidentialité
            </Link>
            .
          </p>

          <h2 className="pt-2 text-base font-semibold text-white">
            Droit applicable
          </h2>
          <p>
            Les présentes mentions légales sont régies par le droit marocain.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 font-medium text-white">{label}</dt>
      <dd className="text-muted">{value}</dd>
    </div>
  );
}

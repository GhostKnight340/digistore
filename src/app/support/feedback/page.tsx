import Link from "next/link";
import SupportFeedbackForm from "@/components/support/SupportFeedbackForm";
import { getSupportFeedbackStatusAction } from "@/app/actions/support";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre avis sur le support - ghost.ma" };

export default async function SupportFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const status = token ? await getSupportFeedbackStatusAction(token) : null;

  if (!status) {
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-md card p-8 text-center">
          <h1 className="text-2xl font-bold text-white">Lien invalide ou expiré</h1>
          <p className="mt-2 text-sm text-muted">
            Ce lien d&apos;avis n&apos;est plus valide. Vous pouvez retrouver vos demandes depuis votre espace client.
          </p>
          <Link href="/account/support" className="btn-primary mt-6">
            Mes demandes
          </Link>
        </div>
      </div>
    );
  }

  if (status.feedbackGiven) {
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-md card p-8 text-center">
          <h1 className="text-2xl font-bold text-white">Merci pour votre retour</h1>
          <p className="mt-2 text-sm text-muted">
            Votre avis sur la demande {status.reference} a bien été enregistré. Il nous aide à améliorer notre support.
          </p>
          <Link href="/account/support" className="btn-primary mt-6">
            Mes demandes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-16">
      <SupportFeedbackForm token={token} reference={status.reference} />
    </div>
  );
}

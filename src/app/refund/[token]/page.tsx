import { getRefundTokenContextAction } from "@/app/actions/refunds";
import RefundInfoPage from "@/components/refunds/RefundInfoPage";
import RefundChoicePage from "@/components/refunds/RefundChoicePage";

export const dynamic = "force-dynamic";

/**
 * Secure customer landing for a refund case. The unguessable token in the path
 * is the only capability: it is scoped to ONE refund request and ONE purpose
 * (provide info / choose resolution), is hashed at rest, and expires. An
 * invalid/expired/used token reveals nothing.
 */
export default async function RefundTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await getRefundTokenContextAction(token);

  if (!ctx) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-foreground">Lien indisponible</h1>
        <p className="mt-2 text-sm text-muted">
          Ce lien n’est plus valide ou a expiré. Si vous pensez qu’il s’agit d’une erreur, répondez
          à notre e-mail ou contactez l’assistance.
        </p>
        <a href="/" className="btn-primary mt-6 inline-block">
          Retour à l’accueil
        </a>
      </main>
    );
  }

  return ctx.purpose === "PROVIDE_INFO" ? (
    <RefundInfoPage token={token} ctx={ctx} />
  ) : (
    <RefundChoicePage token={token} ctx={ctx} />
  );
}

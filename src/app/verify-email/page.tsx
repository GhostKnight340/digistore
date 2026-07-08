import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma, ensureDatabaseReady } from "@/lib/db/prisma";
import { consumeAuthToken, sendWelcomeEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await ensureDatabaseReady();
  const { token = "" } = await searchParams;
  const customer = await consumeAuthToken(token, "email_verification");
  let ok = false;
  if (customer) {
    const firstVerification = !customer.emailVerified;
    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });
    if (firstVerification) await sendWelcomeEmail(updated);
    revalidatePath("/account");
    revalidatePath("/account/security");
    ok = true;
  }

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-md card p-8 text-center">
        <h1 className="text-2xl font-bold text-white">
          {ok ? "E-mail vérifié" : "Lien invalide ou expiré"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {ok
            ? "Votre compte ghost.ma est maintenant vérifié."
            : "Demandez un nouveau lien depuis votre espace sécurité."}
        </p>
        <Link href={ok ? "/account" : "/login"} className="btn-primary mt-6">
          Continuer
        </Link>
      </div>
    </div>
  );
}

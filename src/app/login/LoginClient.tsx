"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthLayout from "@/components/auth/AuthLayout";
import LoginForm from "@/components/auth/LoginForm";
import { loginCustomerAction } from "@/app/actions/auth";

const googleErrors: Record<string, string> = {
  access_denied: "Connexion Google annulée.",
  google_cancelled: "Connexion Google annulée.",
  google_config: "La connexion Google n’est pas configurée pour le moment.",
  google_provider: "Google n’a pas pu confirmer votre identité. Réessayez.",
  google_missing_email: "Votre compte Google ne fournit pas d’adresse e-mail.",
  google_state: "La session Google a expiré. Réessayez.",
  google_account_conflict: "Impossible de lier ce compte Google. Contactez le support.",
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The OAuth callback redirects to /login?error=... on failure, so the error
  // param is present at mount time and can seed state directly (no effect).
  const [error, setError] = useState(() => {
    const googleError = searchParams.get("error");
    return googleError ? googleErrors[googleError] ?? "Connexion Google impossible. Réessayez." : "";
  });

  return (
    <AuthLayout active="login">
      <LoginForm
        serverError={error}
        onGoogle={() => {
          // Reuse the existing Google OAuth route (sets state cookie, redirects to Google).
          window.location.href = "/auth/google?mode=login";
        }}
        onSubmit={async ({ email, password, remember }) => {
          setError("");
          try {
            const result = await loginCustomerAction({ email, password, remember });
            if (!result.ok) {
              setError(result.error || "E-mail ou mot de passe incorrect.");
              return;
            }
            router.push(result.redirectTo || "/account/orders");
            router.refresh();
          } catch (err) {
            console.error("[login:submit]", err);
            setError("Une erreur est survenue. Veuillez réessayer.");
          }
        }}
      />
    </AuthLayout>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

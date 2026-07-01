"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/auth/AuthLayout";
import RegisterForm from "@/components/auth/RegisterForm";
import { registerCustomerAction } from "@/app/actions/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  return (
    <AuthLayout active="register">
      <RegisterForm
        serverError={error}
        serverMessage={message}
        onGoogle={() => {
          // Reuse the existing Google OAuth route in register mode.
          window.location.href = "/auth/google?mode=register";
        }}
        onSubmit={async ({ name, email, password, newsletter }) => {
          setError("");
          setMessage("");
          try {
            const result = await registerCustomerAction({
              name,
              email,
              password,
              // The form already enforces confirm === password client-side.
              confirmPassword: password,
              acceptTerms: true,
              marketingOptIn: newsletter,
            });
            if (!result.ok) {
              setError(result.error || "Impossible de créer le compte. Veuillez réessayer.");
              return;
            }
            // registerCustomerAction sets the session; keep current behavior:
            // surface the verification message and refresh so the UI reflects the new session.
            if (result.message) setMessage(result.message);
            router.refresh();
          } catch (err) {
            console.error("[register:submit]", err);
            setError("Une erreur est survenue. Veuillez réessayer.");
          }
        }}
      />
    </AuthLayout>
  );
}

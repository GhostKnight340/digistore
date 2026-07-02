"use client";

import AuthLayout from "@/components/auth/AuthLayout";
import LoginForm from "@/components/auth/LoginForm";
// import { signIn } from "next-auth/react"; // or your existing auth helpers

export default function LoginPage() {
  return (
    <AuthLayout active="login">
      <LoginForm
        onGoogle={() => {
          // TODO: reuse existing Google auth
          // signIn("google", { callbackUrl: "/" });
        }}
        onSubmit={async ({ email, password, remember }) => {
          // TODO: reuse existing email/password sign-in
          // await signIn("credentials", { email, password, redirect: true, callbackUrl: "/" });
          console.log({ email, password, remember });
        }}
      />
    </AuthLayout>
  );
}

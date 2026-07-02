"use client";

import AuthLayout from "@/components/auth/AuthLayout";
import RegisterForm from "@/components/auth/RegisterForm";
// import { signIn } from "next-auth/react";

export default function RegisterPage() {
  return (
    <AuthLayout active="register">
      <RegisterForm
        onGoogle={() => {
          // TODO: reuse existing Google auth
          // signIn("google", { callbackUrl: "/" });
        }}
        onSubmit={async ({ name, email, password, newsletter }) => {
          // TODO: reuse existing account-creation logic, then sign in
          console.log({ name, email, password, newsletter });
        }}
      />
    </AuthLayout>
  );
}

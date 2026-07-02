# ghost.ma — Login & Register redesign (handoff)

Premium, dark, trust-focused authentication UI for the ghost.ma digital gift-card
marketplace. UI only — reuses your existing auth logic via two callback props.

## What this is
- Split layout: left trust panel (logo, headline, 3 benefit rows, "Comment ça marche"
  steps) + right form. The trust panel is hidden below the `lg` breakpoint (mobile-first).
- Google sign-in/up button above a "Ou continuer avec votre e-mail" divider.
- Email/password forms with focus, error and success states, password visibility toggle,
  password strength meter (register), "Remember me", "Forgot password?", loading state.
- No decorative/continuous animation — motion is limited to hover / focus / loading /
  validation feedback.

## File tree
```
app/(auth)/login/page.tsx
app/(auth)/register/page.tsx
components/auth/AuthLayout.tsx
components/auth/LoginForm.tsx
components/auth/RegisterForm.tsx
components/auth/GoogleSignInButton.tsx
components/auth/AuthDivider.tsx
components/auth/FormField.tsx          (+ MailIcon / LockIcon / UserIcon exports)
components/auth/PasswordInput.tsx
components/auth/PasswordStrength.tsx   (+ scorePassword util)
components/auth/Checkbox.tsx
components/auth/SubmitButton.tsx
```
Copy the `app/` and `components/` folders into your project root (merge with existing).

## Wiring (the only backend work)
Only the two page files have hooks to connect:
- `onGoogle` → your existing Google auth (e.g. `signIn("google", …)`).
- `onSubmit` → your existing email/password sign-in / account creation.
Everything else is presentational.

## Requirements
- Next.js App Router + React + TypeScript.
- Tailwind CSS (used for layout/responsive utilities only). No config or globals.css
  changes required — exact colors are inline styles.
- Fonts **Geist** + **Geist Mono** must be available (the components reference them by
  name). Easiest: `npm i geist` and expose in `app/layout.tsx`:
  ```tsx
  import { GeistSans } from "geist/font/sans";
  import { GeistMono } from "geist/font/mono";
  // <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
  ```
  Or replace the two `fontFamily` references (AuthLayout.tsx, and the mono label in the
  "Comment ça marche" heading + PasswordStrength) with your loaded font.

## Notes
- Route paths assumed: `/login`, `/register`, `/forgot-password`, `/terms`, `/privacy`.
  Adjust the `<Link href>` values if yours differ.
- Validation is client-side UX only — keep your server-side validation as the source of
  truth.

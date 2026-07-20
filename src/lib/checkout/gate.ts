/**
 * Who may place an order, and what is still missing.
 *
 * This lived inline in CheckoutClient and got it wrong: `accountReady` was
 * `isLoggedIn ? accountVerified : false`, so a guest could never submit even
 * after the server had been changed to accept guests. Guest checkout was
 * half-shipped — the server allowed it, the UI silently did not.
 *
 * Pure and dependency-free so the rule is unit-testable (the checkout component
 * cannot be imported under the test runner's `--conditions=react-server`).
 *
 * Every decision here is re-checked server-side in `createOrderAction`; this
 * exists to keep the UI honest, never as the security boundary.
 */

export type CheckoutMode = "guest" | "register" | "login";

export interface CheckoutGateInput {
  isLoggedIn: boolean;
  /** Logged-in customers must have a verified e-mail. */
  accountVerified: boolean;
  /** Which tab the not-logged-in customer chose, if any. */
  mode: CheckoutMode | null;
  /** The chosen tab reports its own fields complete. */
  gateReady: boolean;
  /** That tab's French explanation of what remains, or null when complete. */
  gateIncompleteReason: string | null;
}

export interface CheckoutGate {
  /** True when the account/identity step is satisfied. */
  accountReady: boolean;
  /** True when this is a guest order (no account will be created). */
  isGuest: boolean;
  /** What still blocks the identity step, or null. */
  accountIncomplete: string | null;
}

/**
 * Resolves the identity step.
 *
 * The asymmetry between "guest" and "register" is deliberate and is the crux of
 * the rule: a GUEST is ready as soon as their details check out, because there
 * is nothing left to create. A customer who chose "Créer un compte" must
 * additionally press that button — which creates the account, logs them in, and
 * re-renders checkout authenticated. Treating a filled-but-unsubmitted register
 * form as ready would place the order WITHOUT the account they asked for.
 */
export function resolveCheckoutGate(input: CheckoutGateInput): CheckoutGate {
  if (input.isLoggedIn) {
    return {
      accountReady: input.accountVerified,
      isGuest: false,
      accountIncomplete: input.accountVerified
        ? null
        : "Vérifiez votre adresse e-mail pour continuer vers le paiement.",
    };
  }

  const isGuest = input.mode === "guest";
  if (isGuest) {
    return {
      accountReady: input.gateReady,
      isGuest: true,
      accountIncomplete: input.gateReady ? null : input.gateIncompleteReason,
    };
  }

  // "register" (not yet submitted) or "login" (not yet authenticated), or no
  // choice made yet. None of these may place an order.
  return {
    accountReady: false,
    isGuest: false,
    accountIncomplete:
      input.gateIncompleteReason ??
      "Créez votre compte ou commandez sans compte pour continuer.",
  };
}

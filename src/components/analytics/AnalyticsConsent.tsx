"use client";

/**
 * The analytics consent runtime: stores the visitor's choice, loads GA4 only
 * once consent is granted, and renders the banner + the re-open entry point.
 *
 * Why this replaces the inline <script> that used to sit in the root layout:
 * the layout is server-rendered, so it could not know the visitor's choice and
 * loaded gtag for everyone. Loading is now client-side and strictly downstream
 * of a granted decision — before that, no provider script is fetched, no
 * provider cookie is set, and `window.gtag` does not exist (so every call in
 * src/lib/analytics.ts no-ops on its own, with no extra guarding at call sites).
 *
 * Refusing later is honoured immediately for everything subsequent; the already
 * loaded gtag script cannot be unloaded without a reload, so we additionally
 * push a `consent: denied` update and stop emitting. Nothing is queued or
 * replayed on a later grant — events from the undecided period are simply lost,
 * which is the correct outcome.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  CONSENT_STORAGE_KEY,
  mayLoadProvider,
  parseStoredConsent,
  serializeConsent,
  shouldLogAnalyticsToConsole,
  type ConsentDecision,
  type StoredConsent,
} from "@/lib/analytics/consent";

interface ConsentContextValue {
  consent: StoredConsent | null;
  /** True once the stored value has been read — avoids a first-paint flash. */
  hydrated: boolean;
  decide: (decision: ConsentDecision) => void;
  openPreferences: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

/** Re-open the consent choice from anywhere (the footer link uses this). */
export function useAnalyticsConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) {
    // A no-op fallback keeps a stray consumer from crashing the page: analytics
    // is never important enough to break rendering.
    return {
      consent: null,
      hydrated: false,
      decide: () => {},
      openPreferences: () => {},
    };
  }
  return context;
}

export default function AnalyticsConsentProvider({
  children,
  gaId,
  isProduction,
  globallyEnabled,
  debug,
}: {
  children: React.ReactNode;
  gaId: string | null;
  isProduction: boolean;
  globallyEnabled: boolean;
  debug: boolean;
}) {
  const [consent, setConsent] = useState<StoredConsent | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [reopened, setReopened] = useState(false);

  // Read the stored decision after mount. localStorage is unavailable in SSR and
  // can throw in private-mode Safari, so this never assumes success.
  useEffect(() => {
    try {
      setConsent(parseStoredConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY)));
    } catch {
      setConsent(null);
    }
    setHydrated(true);
  }, []);

  const decide = useCallback((decision: ConsentDecision) => {
    const serialized = serializeConsent(decision);
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, serialized);
    } catch {
      // Storage denied: honour the choice for this page view rather than
      // re-prompting in a loop. The banner will return on the next visit.
    }
    setConsent(parseStoredConsent(serialized));
    setReopened(false);
    // A refusal after a previous grant: tell gtag to stop. The script itself
    // cannot be removed without a reload, but this halts further collection.
    if (decision === "denied") {
      const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
      try {
        gtag?.("consent", "update", { analytics_storage: "denied" });
      } catch {
        /* analytics must never break the UI */
      }
    }
  }, []);

  const openPreferences = useCallback(() => setReopened(true), []);

  const canLoad = mayLoadProvider({
    isProduction,
    providerId: gaId,
    consent,
    globallyEnabled,
    debug,
  });

  // Inject gtag exactly once, only after consent. Appending the tag directly
  // (rather than next/script) keeps the ordering explicit and observable.
  useEffect(() => {
    if (!canLoad || !gaId) return;
    if (document.getElementById("ga4-src")) return;

    const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    function gtag(...args: unknown[]) {
      w.dataLayer!.push(args);
    }
    w.gtag = gtag;
    gtag("js", new Date());
    // Analytics-only storage; ad storage is never requested because Ghost.ma
    // runs no advertising tags.
    gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied" });
    gtag("config", gaId);

    const script = document.createElement("script");
    script.id = "ga4-src";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    // A blocked or failed load must not surface anywhere.
    script.onerror = () => {};
    document.head.appendChild(script);
  }, [canLoad, gaId]);

  // Developer affordance: in a non-production runtime with debug on, make it
  // obvious that analytics is deliberately inert and why.
  useEffect(() => {
    if (!shouldLogAnalyticsToConsole({ isProduction, debug })) return;
    if (!hydrated) return;
    console.info(
      "[analytics] debug mode — nothing is sent.",
      { decision: consent?.decision ?? "undecided", gaConfigured: Boolean(gaId) },
    );
  }, [isProduction, debug, hydrated, consent, gaId]);

  const value = useMemo<ConsentContextValue>(
    () => ({ consent, hydrated, decide, openPreferences }),
    [consent, hydrated, decide, openPreferences],
  );

  // Show the banner when the visitor has not chosen, or asked to change. Not
  // shown at all when analytics could never run anyway (no id configured, or the
  // kill switch is off) — asking for consent we would not act on is noise.
  const analyticsPossible = globallyEnabled && Boolean(gaId);
  const showBanner = analyticsPossible && hydrated && (consent === null || reopened);

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {showBanner ? (
        <ConsentBanner
          current={consent?.decision ?? null}
          onDecide={decide}
          onDismiss={reopened ? () => setReopened(false) : null}
        />
      ) : null}
    </ConsentContext.Provider>
  );
}

function ConsentBanner({
  current,
  onDecide,
  onDismiss,
}: {
  current: ConsentDecision | null;
  onDecide: (decision: ConsentDecision) => void;
  /** Only set when re-opened from the footer — a first-time visitor must choose. */
  onDismiss: (() => void) | null;
}) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-[95] px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:px-4 sm:pb-4"
    >
      <div className="card mx-auto max-w-3xl border border-border-strong p-4 shadow-card sm:p-5">
        <h2 id="consent-title" className="text-[15px] font-semibold text-white">
          Cookies de mesure d’audience
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Nous utilisons Google Analytics pour comprendre comment le site est utilisé et
          l’améliorer. Ces cookies ne sont déposés qu’avec votre accord. Les cookies
          nécessaires au fonctionnement du site — connexion, panier et commande — restent
          actifs dans tous les cas.{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-white">
            En savoir plus
          </a>
        </p>
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          {/* Equal visual weight and equal size: refusing must be exactly as
              easy as accepting. */}
          <button
            type="button"
            onClick={() => onDecide("granted")}
            className="btn btn-primary min-h-[44px] flex-1 justify-center"
          >
            Accepter
          </button>
          <button
            type="button"
            onClick={() => onDecide("denied")}
            className="btn min-h-[44px] flex-1 justify-center border border-border-strong"
          >
            Refuser
          </button>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="btn-ghost min-h-[44px] justify-center text-muted"
            >
              Annuler
            </button>
          ) : null}
        </div>
        {current ? (
          <p className="mt-3 text-[12px] text-muted">
            Choix actuel : {current === "granted" ? "accepté" : "refusé"}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

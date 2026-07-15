"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  mergeWishlistAction,
  toggleWishlistAction,
} from "@/app/actions/wishlist";

const WISHLIST_KEY = "ghost.wishlist.v1";

interface WishlistContextValue {
  ready: boolean;
  enabled: boolean;
  authenticated: boolean;
  count: number;
  isSaved: (slug: string) => boolean;
  toggle: (slug: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(slugs: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(slugs));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Global wishlist state shared by every heart button and the account page.
 *
 * - Guests: the set lives in localStorage (device-only, no personal data).
 * - Logged-in: the server-persisted set is the source of truth; toggles call a
 *   session-guarded server action. On first mount while authenticated, any guest
 *   localStorage entries are merged into the account (preserving them across
 *   login) and then cleared.
 */
export function WishlistProvider({
  children,
  authenticated,
  initialSlugs,
  enabled = true,
}: {
  children: React.ReactNode;
  authenticated: boolean;
  initialSlugs: string[];
  enabled?: boolean;
}) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const mergedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }
    const local = readLocal();
    if (authenticated) {
      const base = new Set(initialSlugs);
      // Merge any guest entries saved before login, then clear local storage.
      if (local.length > 0 && !mergedRef.current) {
        mergedRef.current = true;
        const optimistic = new Set(base);
        local.forEach((s) => optimistic.add(s));
        setSaved(optimistic);
        setReady(true);
        void mergeWishlistAction(local).then((res) => {
          if (res.ok && res.slugs) setSaved(new Set(res.slugs));
          writeLocal([]);
        });
        return;
      }
      setSaved(base);
    } else {
      setSaved(new Set(local));
    }
    setReady(true);
    // initialSlugs identity changes per navigation; effect is safe to re-run.
  }, [authenticated, enabled, initialSlugs]);

  const isSaved = useCallback((slug: string) => saved.has(slug), [saved]);

  const toggle = useCallback(
    (slug: string) => {
      if (!enabled) return;
      setSaved((prev) => {
        const next = new Set(prev);
        const willSave = !next.has(slug);
        if (willSave) next.add(slug);
        else next.delete(slug);

        if (authenticated) {
          // Server is the source of truth; revert on failure.
          void toggleWishlistAction(slug).then((res) => {
            if (!res.ok && !res.requiresAuth) {
              setSaved((cur) => {
                const revert = new Set(cur);
                if (willSave) revert.delete(slug);
                else revert.add(slug);
                return revert;
              });
            }
          });
        } else {
          writeLocal([...next]);
        }
        return next;
      });
    },
    [authenticated, enabled],
  );

  const value = useMemo<WishlistContextValue>(
    () => ({
      ready,
      enabled,
      authenticated,
      count: saved.size,
      isSaved,
      toggle,
    }),
    [ready, enabled, authenticated, saved.size, isSaved, toggle],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    // Safe no-op fallback so a heart button rendered outside the provider (e.g.
    // in isolation) never crashes.
    return {
      ready: false,
      enabled: false,
      authenticated: false,
      count: 0,
      isSaved: () => false,
      toggle: () => {},
    };
  }
  return ctx;
}

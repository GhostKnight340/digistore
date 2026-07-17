"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GuideIndexItem } from "@/lib/types";
import { guideHref } from "@/lib/guide";
import GuideIcon from "./GuideIcon";
import type { CategorySummary } from "./HelpCenter";

/**
 * The Help Center hero: a single, calm entry point. A large prompt, one
 * prominent search field with live guide suggestions, and quick category chips —
 * so a customer arriving from an order email lands on "what do I do now?" and
 * reaches the right guide in one move. Presentation only; all state is lifted to
 * HelpCenter.
 */
export default function HelpHero({
  query,
  onQueryChange,
  suggestions,
  categories,
  activePlatform,
  onSelectPlatform,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  suggestions: GuideIndexItem[];
  categories: CategorySummary[];
  activePlatform: string;
  onSelectPlatform: (platform: string) => void;
}) {
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = focused && query.trim().length > 0 && suggestions.length > 0;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      router.push(guideHref(suggestions[active].slug));
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  }

  return (
    <header className="relative overflow-hidden rounded-[24px] border border-border bg-[radial-gradient(120%_140%_at_50%_-20%,rgba(62,123,250,0.16),transparent_60%)] px-5 py-12 text-center sm:px-8 sm:py-16">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[24px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      />
      <div className="relative mx-auto max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Centre d&apos;aide · Activation
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
          Comment pouvons-nous vous aider&nbsp;?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          Trouvez le bon guide pour activer votre carte cadeau, votre abonnement ou
          votre clé — étape par étape, en quelques minutes.
        </p>

        <div className="relative mx-auto mt-7 max-w-xl">
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => {
                onQueryChange(e.target.value);
                setActive(-1);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                // Delay so a click on a suggestion registers before we close.
                blurTimer.current = setTimeout(() => setFocused(false), 120);
              }}
              onKeyDown={onKeyDown}
              placeholder="Rechercher : Steam, Netflix, PlayStation…"
              aria-label="Rechercher un guide d'activation"
              aria-expanded={open}
              role="combobox"
              aria-controls="hc-suggestions"
              className="h-14 w-full rounded-2xl border border-border bg-surface pl-12 pr-4 text-[15px] text-text shadow-soft outline-none transition placeholder:text-faint focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.6" y2="16.6" />
            </svg>
          </div>

          {open && (
            <ul
              id="hc-suggestions"
              role="listbox"
              className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-elevated p-1.5 text-left shadow-card"
            >
              {suggestions.map((g, i) => (
                <li key={g.slug} role="option" aria-selected={i === active}>
                  <Link
                    href={guideHref(g.slug)}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                    }}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                      i === active ? "bg-surface2" : "hover:bg-surface2"
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface2 text-accent">
                      {g.heroImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.heroImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <GuideIcon icon={g.icon} className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{g.title}</span>
                      {g.platform ? (
                        <span className="block truncate text-xs text-faint">{g.platform}</span>
                      ) : null}
                    </span>
                    <span className="text-faint" aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {categories.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-faint">Populaire :</span>
            {categories.slice(0, 7).map((c) => (
              <button
                key={c.platform}
                type="button"
                onClick={() => onSelectPlatform(c.platform)}
                aria-pressed={activePlatform === c.platform}
                className={`rounded-full border px-3 py-1 text-[13px] font-medium transition ${
                  activePlatform === c.platform
                    ? "border-accent bg-accent/15 text-white"
                    : "border-border bg-surface/60 text-muted hover:border-border-strong hover:text-white"
                }`}
              >
                {c.platform}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

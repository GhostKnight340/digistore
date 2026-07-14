import Link from "next/link";
import { Sora } from "next/font/google";
import ReleaseCountdown from "@/components/gta/ReleaseCountdown";
import type { GtaPreorderConfig } from "@/lib/gtaPreorder";

const sora = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap" });

/**
 * Full-bleed cinematic hero for the GTA VI pre-order campaign. The premium
 * "Vice City" look — dark base with magenta / purple / teal sunset glows, a
 * prominent countdown and a stylized typographic "VI" monogram over an abstract
 * neon collage.
 *
 * IMPORTANT (brand safety): this is entirely ORIGINAL styling. It uses no
 * Rockstar / Take-Two artwork, characters, or logo — only CSS gradients,
 * generic geometry and the roman numerals "VI" set in our own typeface. If an
 * APPROVED hero image is ever added to the config (`hero.heroImageUrl`), it is
 * shown behind a scrim instead of the generated collage.
 */
export default function GtaHero({
  config,
  released,
  daysLeft,
  heroImageUrl,
}: {
  config: GtaPreorderConfig;
  released: boolean;
  daysLeft: number;
  /** Admin-uploaded hero image (from DB). Overrides the config value; when
   *  empty the original generated collage is shown. */
  heroImageUrl?: string;
}) {
  const { hero } = config;
  const art = (heroImageUrl || hero.heroImageUrl).trim();
  const hasArt = Boolean(art);

  return (
    <section
      className={`relative mt-4 overflow-hidden rounded-[24px] border border-[#3a2350] ${sora.className}`}
      style={{
        background:
          "linear-gradient(150deg,#1a1030 0%,#160e28 45%,#0e0a1a 100%)",
      }}
    >
      {/* Atmospheric depth: sunset glows in the GTA-VI palette. Decorative. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle,rgba(233,56,140,0.42),transparent 70%)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-28 right-1/3 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle,rgba(42,190,212,0.28),transparent 70%)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/4 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle,rgba(124,77,255,0.35),transparent 70%)" }}
      />

      {/* Optional approved artwork behind a scrim (only if configured). */}
      {hasArt && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(90deg,#140c26 30%,rgba(20,12,38,0.55) 100%)" }}
          />
        </>
      )}

      <div className="relative grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
        {/* Left: copy, countdown, CTAs */}
        <div className="min-w-0">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.24em]"
            style={{ color: "#ff5ca8" }}
          >
            {hero.eyebrow}
          </p>
          <h1 className="mt-4 text-[clamp(2.1rem,6.4vw,3.4rem)] font-extrabold leading-[1.03] tracking-tight text-white">
            {hero.heading}
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#c9c2e0]">
            {hero.subheading}
          </p>

          <p
            className="mt-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium text-white"
            style={{ borderColor: "rgba(255,92,168,0.4)", background: "rgba(233,56,140,0.12)" }}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "#ff5ca8" }} />
            {hero.releaseLine}
          </p>

          {!released && (
            <>
              <p className="sr-only">Sortie dans environ {daysLeft} jours.</p>
              <ReleaseCountdown />
            </>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#plateforme"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white transition hover:-translate-y-px"
              style={{
                background: "linear-gradient(135deg,#e5388c 0%,#7c4dff 100%)",
                boxShadow: "0 10px 30px rgba(233,56,140,0.35)",
              }}
            >
              {hero.primaryCtaLabel}
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="#comment"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 text-[15px] font-semibold text-white transition hover:bg-white/10"
            >
              {hero.secondaryCtaLabel}
            </Link>
          </div>
        </div>

        {/* Right: original VI monogram over an abstract neon collage. Purely
            decorative; hidden from assistive tech and on the smallest screens. */}
        {!hasArt && (
          <div aria-hidden className="relative hidden min-h-[300px] sm:block">
            <MonogramCollage />
          </div>
        )}
      </div>
    </section>
  );
}

/** Abstract neon "collage" of gradient tiles with an original VI monogram —
 *  evokes a cinematic poster grid without any third-party artwork. */
function MonogramCollage() {
  const tiles = [
    { c: "linear-gradient(160deg,#ff7eb3,#ff3d81)", cls: "left-0 top-0 h-[46%] w-[38%]" },
    { c: "linear-gradient(160deg,#7c4dff,#3a2df0)", cls: "left-0 bottom-0 h-[46%] w-[38%]" },
    { c: "linear-gradient(160deg,#2ad4d4,#1b8bd0)", cls: "right-0 top-0 h-[46%] w-[38%]" },
    { c: "linear-gradient(160deg,#ffb14a,#ff5ca8)", cls: "right-0 bottom-0 h-[46%] w-[38%]" },
  ];
  return (
    <div className="absolute inset-0">
      {tiles.map((tile, i) => (
        <span
          key={i}
          className={`absolute overflow-hidden rounded-[16px] opacity-80 ${tile.cls}`}
          style={{ background: tile.c }}
        >
          {/* faint palm/skyline silhouette bar for a Vice-City feel (generic). */}
          <span className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: "linear-gradient(0deg,rgba(0,0,0,0.35),transparent)" }} />
        </span>
      ))}
      {/* Center VI monogram — original typographic treatment. */}
      <div className="absolute inset-0 grid place-items-center">
        <span
          className="rounded-[18px] px-6 py-2 text-[clamp(4rem,11vw,7rem)] font-extrabold leading-none tracking-tight"
          style={{
            background: "linear-gradient(135deg,#ff5ca8 0%,#7c4dff 55%,#ffb14a 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 6px 24px rgba(124,77,255,0.5))",
          }}
        >
          VI
        </span>
      </div>
    </div>
  );
}

import Image from "next/image";
import { Sora } from "next/font/google";
import TrackedLink from "@/components/gta/TrackedLink";
import { getGtaPreorderSettings } from "@/lib/db/gtaPreorderSettings";
import {
  GTA_CAMPAIGN_ID,
  GTA_PREORDER_PATH,
  gtaPreorderConfig,
} from "@/lib/gtaPreorder";

const sora = Sora({ subsets: ["latin"], weight: ["400", "700", "800"], display: "swap" });

/**
 * Homepage GTA VI pre-order banner — the animated "alive" design from the
 * design handoff (neon glow blobs, shimmering badge, gradient title, animated
 * CTA arrow). It links to `/precommande-gta-6` and only renders when the
 * campaign is active.
 *
 * Brand safety: the right-side key-art bleed uses the SAME admin-uploaded image
 * as the pre-order hero (`getGtaPreorderSettings().heroImageUrl`) — never any
 * bundled Rockstar / third-party artwork. When no image is uploaded the banner
 * still looks complete (card gradient + neon glows), just without the photo.
 */
export default async function GtaPreorderBanner() {
  if (!gtaPreorderConfig.active) return null;
  const { heroImageUrl } = await getGtaPreorderSettings();
  const art = heroImageUrl.trim();
  const hasArt = Boolean(art);
  // Optimize through next/image for Blob + same-origin sources; pass a legacy
  // base64 data: URI (pre-migration) or an external URL through untouched.
  const artUnoptimized =
    !/^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(art) && !art.startsWith("/");

  return (
    <section className={`mt-8 sm:mt-12 ${sora.className}`}>
      <div
        className="relative overflow-hidden rounded-[24px]"
        style={{
          border: "1px solid rgba(120,90,190,0.3)",
          background: "linear-gradient(115deg,#15132b 0%,#121a33 48%,#0c1120 100%)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Key art bleeding from the right — the admin-uploaded image only. */}
        {hasArt && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[64%] sm:w-[54%]">
            <Image
              src={art}
              alt=""
              fill
              // Homepage hero → the LCP image, so load it eagerly (not lazy).
              priority
              sizes="(min-width: 640px) 54vw, 64vw"
              className="object-cover"
              style={{ objectPosition: "62% center" }}
              unoptimized={artUnoptimized}
            />
            <span
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg,#101228 0%,rgba(16,18,40,0.7) 22%,rgba(16,18,40,0.15) 55%,transparent 100%)",
              }}
            />
            <span
              className="absolute inset-0"
              style={{ background: "linear-gradient(0deg,rgba(12,17,32,0.5) 0%,transparent 40%)" }}
            />
          </div>
        )}

        {/* Animated neon glow blobs. */}
        <span
          aria-hidden
          className="gta-glow pointer-events-none absolute rounded-full"
          style={{
            top: "-30%",
            right: "6%",
            width: 420,
            height: 420,
            background: "radial-gradient(circle,rgba(233,64,168,0.4),transparent 68%)",
            filter: "blur(30px)",
          }}
        />
        <span
          aria-hidden
          className="gta-glow--slow pointer-events-none absolute rounded-full"
          style={{
            bottom: "-34%",
            left: "10%",
            width: 460,
            height: 460,
            background: "radial-gradient(circle,rgba(56,150,255,0.32),transparent 68%)",
            filter: "blur(34px)",
          }}
        />

        {/* Content row — stacks on mobile, CTA right on desktop. */}
        <div className="relative flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:gap-7 sm:px-[34px] sm:py-[30px]">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* Shimmering badge. */}
            <div
              className="relative self-start overflow-hidden rounded-full px-[13px] py-1.5"
              style={{
                background: "linear-gradient(90deg,rgba(233,64,168,0.18),rgba(56,150,255,0.18))",
                border: "1px solid rgba(233,64,168,0.4)",
              }}
            >
              <span
                className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{
                  background: "linear-gradient(90deg,#ff8fd4,#7db8ff)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Précommande GTA VI
              </span>
              <span
                aria-hidden
                className="gta-shimmer absolute left-0 top-0 h-full w-2/5"
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)" }}
              />
            </div>

            <h2
              className="m-0 text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[26px]"
              style={{ color: "#f6f8fc" }}
            >
              Préparez votre précommande de{" "}
              <span
                style={{
                  background: "linear-gradient(90deg,#ff7fce,#8bbcff)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                GTA VI
              </span>
            </h2>

            <p className="m-0 max-w-[620px] text-[14.5px] leading-[1.55]" style={{ color: "#aeb8cc" }}>
              Ajoutez le crédit nécessaire avec une carte PlayStation ou Xbox, puis
              précommandez sur la boutique officielle. Sortie&nbsp;: 19 novembre 2026.
            </p>
          </div>

          <TrackedLink
            href={GTA_PREORDER_PATH}
            event="select_gta_banner"
            params={{ campaign: GTA_CAMPAIGN_ID, source: "homepage" }}
            className="gta-banner__cta inline-flex shrink-0 items-center gap-2.5 rounded-[13px] px-6 py-[13px] text-[15px] font-bold text-white"
          >
            Découvrir
            <span aria-hidden className="gta-arrow text-[17px] leading-none">→</span>
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}

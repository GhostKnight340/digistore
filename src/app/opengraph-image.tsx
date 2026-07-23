import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Site-wide default social-preview card (1200×630). Applies to every route that
// doesn't set its own openGraph.images (product/category/guide pages do). Built
// with next/og so the card is real text — crisp at any scale — instead of a
// letterboxed logo, and regenerates automatically if branding changes.
export const alt = "ghost.ma — Cartes cadeaux et recharges au Maroc";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public/brand/navigator-icon-512.png"),
  );
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#05070d",
          backgroundImage:
            "radial-gradient(1000px 500px at 80% -10%, rgba(62,123,250,0.28), transparent)",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={104} height={104} alt="" />
          <span style={{ fontSize: 60, fontWeight: 700, color: "#ffffff" }}>
            ghost.ma
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.05,
            }}
          >
            Cartes cadeaux & recharges
          </span>
          <span style={{ fontSize: 40, color: "#9fb2d0" }}>
            Codes numeriques livres rapidement, au Maroc.
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{ width: 44, height: 6, borderRadius: 999, background: "#3e7bfa" }}
          />
          <span style={{ fontSize: 30, color: "#6f83a3" }}>
            Steam · PlayStation · Xbox · Nintendo · Roblox · Valorant
          </span>
        </div>
      </div>
    ),
    size,
  );
}

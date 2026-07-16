import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/siteUrl";
import { isProductionRuntime } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  // Only the real production site (ghost.ma) is indexable. Staging/preview
  // return a blanket disallow so staging.ghost.ma and preview URLs never get
  // crawled or indexed as duplicate content. See src/lib/env.ts.
  if (!isProductionRuntime()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Non-indexable app areas: admin, account, transactional flows and APIs.
      disallow: [
        "/admin",
        "/account",
        "/api",
        "/order",
        "/delivery",
        "/payment",
        "/checkout",
        "/cart",
        "/find-order",
        "/auth",
        "/login",
        "/reset-password",
        "/forgot-password",
        "/verify-email",
        "/403",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}

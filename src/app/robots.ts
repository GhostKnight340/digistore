import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
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

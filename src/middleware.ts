import { NextResponse, type NextRequest } from "next/server";

const MAINTENANCE_BYPASS_PREFIXES = [
  "/admin",
  "/payment",
  "/order",
  "/delivery",
  "/find-order",
  "/maintenance",
  "/api",
  "/auth",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const bypassed = MAINTENANCE_BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (bypassed) {
    return NextResponse.next();
  }

  try {
    const statusUrl = new URL("/api/maintenance-status", request.nextUrl.origin);
    const res = await fetch(statusUrl, { next: { revalidate: 30 } });
    if (res.ok) {
      const { enabled } = (await res.json()) as { enabled: boolean };
      if (enabled) {
        return NextResponse.redirect(new URL("/maintenance", request.url));
      }
    }
  } catch {
    // Fail open: don't block the storefront if the status check itself errors.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};

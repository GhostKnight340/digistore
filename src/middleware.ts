import { NextResponse, type NextRequest } from "next/server";
import { MAINTENANCE_BYPASS_COOKIE } from "@/lib/maintenance";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-current-path", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });

  // Emergency maintenance bypass: visiting any URL with
  // ?maintenance_bypass=<MAINTENANCE_BYPASS_SECRET> stores a cookie so this
  // browser can reach the site even while maintenance is on.
  const secret = process.env.MAINTENANCE_BYPASS_SECRET;
  if (secret) {
    const provided = request.nextUrl.searchParams.get("maintenance_bypass");
    if (provided && provided === secret) {
      response.cookies.set(MAINTENANCE_BYPASS_COOKIE, secret, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionPayloadAtEdge, SESSION_COOKIE_NAME } from "@/lib/auth/jwt-payload";
import { getDefaultPathForRole, getUnauthorizedPageRedirect } from "@/lib/auth/capabilities";

const publicRoutes = [
  "/login",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/branding",
  "/api/health"
];
const publicRoutePrefixes = ["/uploads/branding/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // The page itself returns notFound outside development. Let it decide before
  // authentication so the development gallery is never exposed as a login route.
  if (pathname === "/design-system") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const secret = process.env.JWT_SECRET;
  const session = token && secret ? await getSessionPayloadAtEdge(token, secret) : null;
  const validSession = Boolean(session);

  if (validSession && pathname === "/login") {
    return NextResponse.redirect(new URL(getDefaultPathForRole(session!.role), request.url));
  }

  if (
    publicRoutes.includes(pathname) ||
    publicRoutePrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  }

  if (!secret) {
    return NextResponse.json({ error: "JWT_SECRET não configurado" }, { status: 500 });
  }

  if (!validSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!pathname.startsWith("/api/") && session) {
    const redirectPath = getUnauthorizedPageRedirect(session.role, pathname);
    if (redirectPath) return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

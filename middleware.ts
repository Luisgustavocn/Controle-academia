import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/login") || pathname.startsWith("/login") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("ca_session")?.value;

  if (!token && (pathname.startsWith("/dashboard") || pathname.startsWith("/api"))) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (token) {
    try {
      await jwtVerify(token, JWT_SECRET);
    } catch {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Sessao invalida" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/"],
};

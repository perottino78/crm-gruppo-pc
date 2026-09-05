import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/session";

// Protegge tutte le pagine dell'app dietro login, tranne /login stessa e le
// route API (che restano protette dalla propria chiave x-seed-key, usata
// anche da script/curl esterni al browser e quindi senza cookie di sessione).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessione = await verifySession(token);

  if (pathname === "/login") {
    if (sessione) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (!sessione) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|immagini|favicon.ico).*)"],
};

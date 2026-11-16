import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/session";
import { tesseraValida } from "@/lib/solaris/satellite";

// Tessera satellitare (Esri World Imagery) passata dal nostro server: così lo Studio la può disegnare
// sul suo canvas ed esportare l'immagine (stessa origine). Nessuna lettura del database.
export async function GET(req: NextRequest) {
  const sessione = await verifySession(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessione) return new NextResponse("Non autorizzato", { status: 401 });

  const p = req.nextUrl.searchParams;
  const z = Number(p.get("z")), x = Number(p.get("x")), y = Number(p.get("y"));
  if (!tesseraValida(z, x, y)) return new NextResponse("Tessera non valida", { status: 400 });

  try {
    // blankTile=false: dove a quello zoom non c'è immagine Esri risponde 404 (lo Studio scende di uno zoom)
    const r = await fetch(
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?blankTile=false`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!r.ok) return new NextResponse("Immagine non disponibile", { status: r.status === 404 ? 404 : 502 });
    return new NextResponse(await r.arrayBuffer(), {
      headers: {
        "Content-Type": r.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=604800",
      },
    });
  } catch {
    return new NextResponse("Servizio satellitare non raggiungibile", { status: 502 });
  }
}

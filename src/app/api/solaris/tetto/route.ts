import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/session";
import { faldeGoogle } from "@/lib/solaris/google-mappe";
import { faldaMigliore, misureFalda } from "@/lib/solaris/satellite";

// Falde del tetto riconosciute da Google Solar API per Solaris Studio: la migliore per i pannelli e tutte le altre.
// 404 «nessuna_chiave» se in Impostazioni non c'è la chiave Google; falde vuote se l'edificio non è coperto.
export async function GET(req: NextRequest) {
  const sessione = await verifySession(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessione) return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  if (!(Math.abs(lat) <= 85 && Math.abs(lon) <= 180)) return NextResponse.json({ errore: "Coordinate non valide" }, { status: 400 });
  try {
    const r = await faldeGoogle(lat, lon);
    if ("errore" in r) return NextResponse.json({ errore: r.errore }, { status: r.errore === "nessuna_chiave" ? 404 : 502 });
    const migliore = faldaMigliore(r.falde);
    return NextResponse.json({
      falde: r.falde.length,
      migliore: migliore ? { ...migliore, ...misureFalda(migliore) } : null,
    });
  } catch {
    return NextResponse.json({ errore: "Google Solar non raggiungibile" }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/session";

// Indirizzo → coordinate per la foto satellitare di Solaris Studio.
// Prima il geocodificatore Esri (preciso al numero civico), poi OpenStreetMap. Nessuna lettura del database.
export async function GET(req: NextRequest) {
  const sessione = await verifySession(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessione) return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 200);
  if (q.length < 3) return NextResponse.json({ errore: "Indirizzo troppo corto" }, { status: 400 });

  try {
    const r = await fetch(
      "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&maxLocations=1&countryCode=ITA&SingleLine=" +
        encodeURIComponent(q),
      { signal: AbortSignal.timeout(8000) },
    );
    const j = await r.json();
    const c = j?.candidates?.[0];
    if (c && c.score >= 80) {
      return NextResponse.json({ lat: c.location.y, lon: c.location.x, indirizzo: c.address, preciso: c.score >= 95 });
    }
  } catch {}

  try {
    const r = await fetch(
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=" + encodeURIComponent(q),
      { headers: { "User-Agent": "SolarisStudio/1.0" }, signal: AbortSignal.timeout(8000) },
    );
    const j = await r.json();
    if (j?.[0]) {
      return NextResponse.json({ lat: Number(j[0].lat), lon: Number(j[0].lon), indirizzo: j[0].display_name, preciso: false });
    }
  } catch {}

  return NextResponse.json({ errore: "Indirizzo non trovato" }, { status: 404 });
}

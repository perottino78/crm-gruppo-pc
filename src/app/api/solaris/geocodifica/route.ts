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
      "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&maxLocations=1&countryCode=ITA&outFields=City,Subregion&SingleLine=" +
        encodeURIComponent(q),
      { signal: AbortSignal.timeout(8000) },
    );
    const j = await r.json();
    const c = j?.candidates?.[0];
    if (c && c.score >= 80) {
      return NextResponse.json({ lat: c.location.y, lon: c.location.x, indirizzo: c.address, preciso: c.score >= 95, comune: nomeComune(c.attributes?.City, c.attributes?.Subregion) });
    }
  } catch {}

  try {
    const r = await fetch(
      "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=it&q=" + encodeURIComponent(q),
      { headers: { "User-Agent": "SolarisStudio/1.0" }, signal: AbortSignal.timeout(8000) },
    );
    const j = await r.json();
    if (j?.[0]) {
      const a = j[0].address || {};
      return NextResponse.json({ lat: Number(j[0].lat), lon: Number(j[0].lon), indirizzo: j[0].display_name, preciso: false, comune: nomeComune(a.city || a.town || a.village || a.municipality, a.county) });
    }
  } catch {}

  return NextResponse.json({ errore: "Indirizzo non trovato" }, { status: 404 });
}

/** «Rosta (Torino)»: il comune con la provincia, per la località dello Studio. */
function nomeComune(comune?: string, provincia?: string): string | null {
  if (!comune) return null;
  const pr = (provincia || "").replace(/^(Provincia|Città Metropolitana) d[i']\s*/i, "").trim();
  return pr && pr.toLowerCase() !== comune.toLowerCase() ? `${comune} (${pr})` : comune;
}

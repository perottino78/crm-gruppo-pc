// Google per Solaris Studio: foto satellitare nitida (Maps Static API) e falde del tetto (Solar API).
// La chiave sta cifrata in Configurazione «solaris_google_maps_key» (Impostazioni › Google) o nella variabile GOOGLE_MAPS_API_KEY.
// Non esce mai verso il browser: le rotte /api/solaris/* chiamano Google al posto dello Studio.
import { prisma } from "@/lib/prisma";
import { cifra, decifra } from "@/lib/mail/caselle";
import { faldeDaSolar, type Falda } from "@/lib/solaris/satellite";

const CHIAVE = "solaris_google_maps_key";
const MAPS_BASE = () => process.env.GOOGLE_MAPS_BASE || "https://maps.googleapis.com";
const SOLAR_BASE = () => process.env.GOOGLE_SOLAR_BASE || "https://solar.googleapis.com";

// memoria breve: una foto chiede la chiave più volte di fila, il database si legge al massimo una volta al minuto
let memoria: { valore: string | null; il: number } | null = null;

export async function chiaveGoogleMaps(): Promise<string | null> {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  if (memoria && Date.now() - memoria.il < 60_000) return memoria.valore;
  const riga = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE }, select: { valore: true } });
  const valore = riga ? decifra(riga.valore) : null;
  memoria = { valore, il: Date.now() };
  return valore;
}

export async function haChiaveGoogleMaps(): Promise<boolean> {
  return !!(await chiaveGoogleMaps());
}

export async function salvaChiaveGoogleMaps(chiave: string | null) {
  memoria = null;
  if (!chiave) {
    await prisma.configurazione.deleteMany({ where: { chiave: CHIAVE } });
    return;
  }
  const valore = cifra(chiave);
  await prisma.configurazione.upsert({ where: { chiave: CHIAVE }, update: { valore }, create: { chiave: CHIAVE, valore } });
}

/** Foto satellitare 1280×1280 (640 a scala 2) centrata sul punto. null se manca la chiave o Google rifiuta. */
export async function fotoGoogle(lat: number, lon: number, zoom: number, chiave?: string | null): Promise<{ img: ArrayBuffer; tipo: string } | { errore: string }> {
  const k = chiave ?? (await chiaveGoogleMaps());
  if (!k) return { errore: "nessuna_chiave" };
  const u = `${MAPS_BASE()}/maps/api/staticmap?center=${lat},${lon}&zoom=${zoom}&size=640x640&scale=2&maptype=satellite&format=jpg&key=${encodeURIComponent(k)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
  const tipo = r.headers.get("content-type") || "";
  if (!r.ok || !tipo.startsWith("image/")) {
    const testo = (await r.text().catch(() => "")).slice(0, 300);
    return { errore: `Google Maps ${r.status}: ${testo || "risposta non valida"}` };
  }
  return { img: await r.arrayBuffer(), tipo };
}

/** Falde del tetto più vicino al punto (Google Solar API). [] se l'edificio non è coperto. */
export async function faldeGoogle(lat: number, lon: number, chiave?: string | null): Promise<{ falde: Falda[] } | { errore: string }> {
  const k = chiave ?? (await chiaveGoogleMaps());
  if (!k) return { errore: "nessuna_chiave" };
  const u = `${SOLAR_BASE()}/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lon}&requiredQuality=LOW&key=${encodeURIComponent(k)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
  if (r.status === 404) return { falde: [] };
  const j = await r.json().catch(() => null);
  if (!r.ok) return { errore: `Google Solar ${r.status}: ${(j as { error?: { message?: string } })?.error?.message ?? "errore"}` };
  return { falde: faldeDaSolar(j) };
}

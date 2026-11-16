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

// ===== Mappa interattiva: tessere satellitari Google (Map Tiles API), sessione creata qui e tenuta in memoria =====
const TILE_BASE = () => process.env.GOOGLE_TILE_BASE || "https://tile.googleapis.com";
let sessioneTessere: { token: string; scade: number; chiave: string } | null = null;

async function sessioneGoogle(k: string): Promise<string | null> {
  if (sessioneTessere && sessioneTessere.chiave === k && Date.now() < sessioneTessere.scade - 3_600_000) return sessioneTessere.token;
  const r = await fetch(`${TILE_BASE()}/v1/createSession?key=${encodeURIComponent(k)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapType: "satellite", language: "it-IT", region: "IT", scale: "scaleFactor2x", highDpi: true }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { session?: string; expiry?: string };
  if (!j.session) return null;
  sessioneTessere = { token: j.session, scade: (Number(j.expiry) || Date.now() / 1000 + 86400) * 1000, chiave: k };
  return j.session;
}

/** Una tessera satellitare Google per la mappa del passo 1. */
export async function tesseraGoogle(z: number, x: number, y: number): Promise<{ img: ArrayBuffer; tipo: string } | { errore: string; stato: number }> {
  const k = await chiaveGoogleMaps();
  if (!k) return { errore: "nessuna_chiave", stato: 404 };
  const s = await sessioneGoogle(k);
  if (!s) return { errore: "sessione Google non creata (attiva «Map Tiles API»)", stato: 502 };
  const r = await fetch(`${TILE_BASE()}/v1/2dtiles/${z}/${x}/${y}?session=${encodeURIComponent(s)}&key=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) sessioneTessere = null;
    return { errore: `Google ${r.status}`, stato: r.status === 404 ? 404 : 502 };
  }
  return { img: await r.arrayBuffer(), tipo: r.headers.get("content-type") || "image/jpeg" };
}

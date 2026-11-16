// Foto satellitare del tetto per Solaris Studio: conti puri (senza rete né DB), usati dallo Studio e dai test.
// Le immagini sono le tessere di Esri World Imagery (proiezione Web Mercator, 256 px per tessera).

export const TESSERA = 256;

/** Metri per pixel di una tessera a quella latitudine e zoom. */
export function metriPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Posizione in pixel "globali" (sull'intero mondo a quello zoom). */
export function pixelGlobale(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = TESSERA * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * n,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n,
  };
}

/** Tessere da scaricare per un riquadro di `lato` pixel centrato sul punto. */
export function tessereRiquadro(lat: number, lon: number, zoom: number, lato: number) {
  const c = pixelGlobale(lat, lon, zoom);
  const x0 = c.x - lato / 2, y0 = c.y - lato / 2;
  const tx0 = Math.floor(x0 / TESSERA), ty0 = Math.floor(y0 / TESSERA);
  const tx1 = Math.floor((x0 + lato - 1) / TESSERA), ty1 = Math.floor((y0 + lato - 1) / TESSERA);
  const tessere: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      tessere.push({ x: tx, y: ty, dx: Math.round(tx * TESSERA - x0), dy: Math.round(ty * TESSERA - y0) });
  return tessere;
}

/** Controllo dei parametri di una tessera richiesta alla rotta (niente indirizzi arbitrari verso Esri). */
export function tesseraValida(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isInteger)) return false;
  if (z < 15 || z > 21) return false;
  const n = 2 ** z;
  return x >= 0 && x < n && y >= 0 && y < n;
}

// ===================== Falde riconosciute da Google Solar API =====================

export type Falda = {
  azimut: number; // gradi da nord in senso orario, verso cui scende la falda (180 = sud)
  pendenza: number; // gradi
  area: number; // m² a terra (proiezione orizzontale)
  centro: { lat: number; lon: number };
  box: { sud: number; ovest: number; nord: number; est: number };
};

type PuntoSolar = { latitude?: number; longitude?: number };
type SegmentoSolar = {
  pitchDegrees?: number;
  azimuthDegrees?: number;
  stats?: { areaMeters2?: number; groundAreaMeters2?: number };
  center?: PuntoSolar;
  boundingBox?: { sw?: PuntoSolar; ne?: PuntoSolar };
};

/** Falde dalla risposta di buildingInsights:findClosest (solarPotential.roofSegmentStats). */
export function faldeDaSolar(json: unknown): Falda[] {
  const segs = (json as { solarPotential?: { roofSegmentStats?: SegmentoSolar[] } })?.solarPotential?.roofSegmentStats ?? [];
  const out: Falda[] = [];
  for (const s of segs) {
    const c = s.center, sw = s.boundingBox?.sw, ne = s.boundingBox?.ne;
    if (c?.latitude == null || c.longitude == null || sw?.latitude == null || sw.longitude == null || ne?.latitude == null || ne.longitude == null) continue;
    const area = s.stats?.groundAreaMeters2 ?? s.stats?.areaMeters2 ?? 0;
    if (!(area > 0)) continue;
    out.push({
      azimut: ((s.azimuthDegrees ?? 180) % 360 + 360) % 360,
      pendenza: s.pitchDegrees ?? 0,
      area,
      centro: { lat: c.latitude, lon: c.longitude },
      box: { sud: sw.latitude, ovest: sw.longitude, nord: ne.latitude, est: ne.longitude },
    });
  }
  return out;
}

/** Scarto in gradi fra l'orientamento della falda e il sud pieno. */
export function scartoDaSud(azimut: number): number {
  return Math.abs(((azimut - 180 + 540) % 360) - 180);
}

/** La falda migliore per i pannelli: la più grande fra quelle che non guardano a nord (piane comprese). */
export function faldaMigliore(falde: Falda[]): Falda | null {
  if (!falde.length) return null;
  const buone = falde.filter((f) => f.pendenza < 5 || scartoDaSud(f.azimut) <= 100);
  const elenco = buone.length ? buone : falde;
  return elenco.reduce((a, b) => (b.area > a.area ? b : a));
}

/**
 * Larghezza lungo la gronda e profondità a terra (metri) di una falda rettangolare ruotata,
 * ricavate dal suo riquadro nord-sud/est-ovest e dall'area. Vicino ai 45° il riquadro non basta: falda quadrata.
 */
export function misureFalda(f: Falda): { larghezza: number; profondita: number } {
  const mLat = 111320, mLon = 111320 * Math.cos((f.centro.lat * Math.PI) / 180);
  const bw = Math.abs(f.box.est - f.box.ovest) * mLon, bh = Math.abs(f.box.nord - f.box.sud) * mLat;
  const t = (f.azimut * Math.PI) / 180;
  const cx = Math.abs(Math.cos(t)), sx = Math.abs(Math.sin(t));
  // gronda lungo (cos, sin), discesa lungo (sin, cos) in valore assoluto: bw = w·cx + p·sx, bh = w·sx + p·cx
  const det = cx * cx - sx * sx;
  let w = Math.sqrt(f.area), p = Math.sqrt(f.area);
  if (Math.abs(det) > 0.3) {
    const ww = (bw * cx - bh * sx) / det, pp = (bh * cx - bw * sx) / det;
    if (ww > 0.5 && pp > 0.5) { w = ww; p = pp; }
  }
  const k = Math.sqrt(f.area / (w * p)); // riporta all'area vera
  return { larghezza: w * k, profondita: p * k };
}

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

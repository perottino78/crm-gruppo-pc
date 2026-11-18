import sharp from "sharp";

/** Formati che si convertono in WebP (le GIF animate, gli SVG e i WebP già pronti restano come sono). */
const DA_CONVERTIRE = /^image\/(jpe?g|png|heic|heif|tiff?|bmp)$/i;

export type FileImmagine = { contenuto: Buffer; mime: string; nome: string };

/**
 * Trasforma una foto in WebP leggero (max `maxLato` px per lato, qualità `qualita`).
 * Se il file non è una foto convertibile, o la conversione non riesce, torna il file com'era:
 * un caricamento non deve mai fallire per colpa della conversione.
 */
export async function convertiInWebp(f: FileImmagine, maxLato = 2000, qualita = 80): Promise<FileImmagine> {
  if (!DA_CONVERTIRE.test(f.mime)) return f;
  try {
    const out = await sharp(f.contenuto, { failOn: "none" }).rotate().resize({ width: maxLato, height: maxLato, fit: "inside", withoutEnlargement: true }).webp({ quality: qualita }).toBuffer();
    // se per caso pesa di più dell'originale, tieni l'originale
    if (out.length >= f.contenuto.length) return f;
    return { contenuto: out, mime: "image/webp", nome: f.nome.replace(/\.[a-z0-9]+$/i, "") + ".webp" };
  } catch {
    return f;
  }
}

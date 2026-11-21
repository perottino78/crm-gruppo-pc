// Unisce l'ordine (PDF) con i file scelti (PDF e immagini) in un solo PDF da scaricare e mandare in chat.
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

export type FileDaUnire = { nome: string; mime: string; contenuto: Buffer };

const A4 = { w: 595.28, h: 841.89 };

/** Ritorna il PDF unito e l'elenco dei file che non si possono mettere in un PDF (es. schede HTML). */
export async function unisciInUnPdf(ordine: Buffer, altri: FileDaUnire[]): Promise<{ pdf: Buffer; saltati: string[] }> {
  const out = await PDFDocument.create();
  const saltati: string[] = [];
  const copia = async (buf: Buffer) => {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  };
  await copia(ordine);
  for (const f of altri) {
    try {
      if (f.mime === "application/pdf" || f.contenuto.subarray(0, 4).toString("latin1") === "%PDF") { await copia(f.contenuto); continue; }
      if (/^image\//.test(f.mime)) {
        // JPEG e PNG diretti; WebP e altri convertiti in JPEG
        const buf = f.mime === "image/jpeg" || f.mime === "image/png" ? f.contenuto : await sharp(f.contenuto).jpeg({ quality: 85 }).toBuffer();
        const img = f.mime === "image/png" ? await out.embedPng(buf) : await out.embedJpg(buf);
        const fit = Math.min((A4.w - 40) / img.width, (A4.h - 40) / img.height, 1);
        const w = img.width * fit, h = img.height * fit;
        const page = out.addPage([A4.w, A4.h]);
        page.drawImage(img, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
        continue;
      }
      saltati.push(f.nome);
    } catch {
      saltati.push(f.nome);
    }
  }
  return { pdf: Buffer.from(await out.save()), saltati };
}

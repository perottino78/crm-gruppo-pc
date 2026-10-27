// Layout del PDF dell'ordine fornitore.
import { DocumentoPdf, aCapo } from "./pdf";
import { importoRiga, totaleOrdine } from "./calcoli";

export type DatiPdfOrdine = {
  numero: string;
  data: Date;
  azienda: { ragioneSociale: string; righe: string[] };
  fornitore: { ragioneSociale: string; righe: string[] };
  testata: [string, string][]; // etichetta, valore
  righe: { codice?: string | null; codiceFornitore?: string | null; descrizione: string; quantita: number; um?: string | null; prezzoAcquisto?: number | null; scontoAcquisto?: number | null }[];
  note?: string | null;
  firma?: string | null;
};

const eur = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean }) + " €";
const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });

export function pdfOrdineFornitore(d: DatiPdfOrdine): Uint8Array {
  const pdf = new DocumentoPdf();
  const M = pdf.margine, L = pdf.larghezza;
  // Intestazione: azienda a sinistra, titolo a destra
  pdf.testo(M, pdf.y, d.azienda.ragioneSociale, 13, true);
  pdf.testo(M + 300, pdf.y, "ORDINE FORNITORE", 14, true);
  pdf.y -= 14;
  const yTitolo = pdf.y;
  for (const r of d.azienda.righe) { pdf.testo(M, pdf.y, r, 8); pdf.y -= 10; }
  pdf.testo(M + 300, yTitolo, `N. ${d.numero} del ${dataIt(d.data)}`, 11, true);
  pdf.y -= 10;
  // Riquadro fornitore
  const hForn = 16 + d.fornitore.righe.length * 10;
  pdf.rett(M + 280, pdf.y - hForn + 10, L - 280, hForn + 2, 0.95);
  pdf.testo(M + 288, pdf.y, "Spett.le", 8);
  pdf.y -= 11;
  pdf.testo(M + 288, pdf.y, d.fornitore.ragioneSociale, 10, true);
  for (const r of d.fornitore.righe) { pdf.y -= 10; pdf.testo(M + 288, pdf.y, r, 8); }
  pdf.y -= 22;
  // Dati testata in due colonne
  const coppie = d.testata.filter(([, v]) => v);
  for (let i = 0; i < coppie.length; i += 2) {
    for (let k = 0; k < 2 && i + k < coppie.length; k++) {
      const [et, v] = coppie[i + k];
      const x = M + k * (L / 2);
      pdf.testo(x, pdf.y, et, 7);
      const righeV = aCapo(v, L / 2 - 10, 9);
      righeV.slice(0, 3).forEach((rv, j) => pdf.testo(x, pdf.y - 10 - j * 10, rv, 9, j === 0));
    }
    const altezza = Math.max(...[0, 1].filter((k) => i + k < coppie.length).map((k) => Math.min(3, aCapo(coppie[i + k][1], L / 2 - 10, 9).length)));
    pdf.y -= 14 + altezza * 10;
  }
  pdf.y -= 6;
  // Tabella righe
  const col = { pos: M, cod: M + 20, codF: M + 86, desc: M + 150, qta: M + 352, um: M + 368, prezzo: M + 438, sc: M + 466, imp: M + L - 2 };
  const conPrezzi = d.righe.some((r) => r.prezzoAcquisto !== null && r.prezzoAcquisto !== undefined);
  const fineDesc = conPrezzi ? col.qta - 22 : M + L - 70;
  const intestazione = () => {
    pdf.rett(M, pdf.y - 4, L, 15, 0.88);
    const h = pdf.y + 1;
    pdf.testo(col.pos + 2, h, "Pos.", 7, true); pdf.testo(col.cod, h, "Codice", 7, true); pdf.testo(col.codF, h, "Cod. fornitore", 7, true);
    pdf.testo(col.desc, h, "Descrizione", 7, true);
    if (conPrezzi) {
      pdf.testoDx(col.qta, h, "Q.tà", 7, true); pdf.testo(col.um, h, "UM", 7, true);
      pdf.testoDx(col.prezzo, h, "Prezzo", 7, true); pdf.testoDx(col.sc, h, "Sc.%", 7, true); pdf.testoDx(col.imp, h, "Importo", 7, true);
    } else { pdf.testoDx(M + L - 32, h, "Q.tà", 7, true); pdf.testo(M + L - 24, h, "UM", 7, true); }
    pdf.y -= 16;
  };
  intestazione();
  d.righe.forEach((r, i) => {
    const desc = aCapo(r.descrizione, fineDesc - col.desc, 8);
    const cod = aCapo(r.codice ?? "", col.codF - col.cod - 4, 7);
    const codF = aCapo(r.codiceFornitore ?? "", col.desc - col.codF - 4, 7);
    const n = Math.max(desc.length, cod.length, codF.length, 1);
    if (pdf.spazio(n * 10 + 8)) intestazione();
    const y = pdf.y;
    pdf.testo(col.pos + 2, y, String(i + 1), 8);
    cod.forEach((t, j) => pdf.testo(col.cod, y - j * 10, t, 7));
    codF.forEach((t, j) => pdf.testo(col.codF, y - j * 10, t, 7));
    desc.forEach((t, j) => pdf.testo(col.desc, y - j * 10, t, 8));
    const xQta = conPrezzi ? col.qta : M + L - 32, xUm = conPrezzi ? col.um : M + L - 24;
    pdf.testoDx(xQta, y, String(r.quantita), 8, true);
    pdf.testo(xUm, y, r.um ?? "pz", 8);
    if (conPrezzi && r.prezzoAcquisto !== null && r.prezzoAcquisto !== undefined) {
      pdf.testoDx(col.prezzo, y, eur(r.prezzoAcquisto).replace(" €", ""), 8);
      if (r.scontoAcquisto) pdf.testoDx(col.sc, y, String(r.scontoAcquisto).replace(".", ","), 8);
      const imp = importoRiga(r); if (imp !== null) pdf.testoDx(col.imp, y, eur(imp), 8);
    }
    const fondo = y - (n - 1) * 10 - 5;
    pdf.linea(M, fondo, M + L, fondo, 0.3);
    pdf.y = fondo - 10;
  });
  if (conPrezzi) {
    const t = totaleOrdine(d.righe);
    pdf.spazio(20); pdf.y -= 4;
    pdf.testoDx(col.sc, pdf.y, "Totale imponibile", 9, true); pdf.testoDx(col.imp, pdf.y, eur(t.totale), 9, true);
    pdf.y -= 16;
  }
  pdf.y -= 8;
  if (d.note) { pdf.spazio(24); pdf.paragrafo("Note", 8, true); pdf.paragrafo(d.note, 9); pdf.y -= 6; }
  pdf.spazio(40);
  pdf.paragrafo("Vi preghiamo di inviarci conferma d'ordine indicando il vostro numero di conferma e la data di consegna prevista, citando sempre il nostro numero d'ordine nei documenti di trasporto e in fattura.", 8);
  if (d.firma) { pdf.y -= 10; pdf.paragrafo(d.firma, 9, true); }
  return pdf.toBytes((n, tot) => `Ordine fornitore ${d.numero} - ${d.azienda.ragioneSociale} - pagina ${n} di ${tot}`);
}

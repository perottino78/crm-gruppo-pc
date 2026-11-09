// PDF della fattura (copia di cortesia) e del DDT di uscita, con il generatore minimale di src/lib/ordini/pdf.ts.
import { DocumentoPdf, aCapo } from "@/lib/ordini/pdf";
import { CEDENTE, codiceIvaDa, metodoPagamento, tipoFattura } from "./tabelle";
import { importoRiga, totali } from "./calcoli";

const eur = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean }) + " €";
const q = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
const oraIt = (d: Date) => `${dataIt(d)} ${d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}`;

type Riga = { codice?: string | null; descrizione: string; quantita: number; um?: string | null; prezzo: number; sconto?: number | null; aliquota: number; natura?: string | null };
type Cliente = { nome: string; righe: string[] };

function intestazione(pdf: DocumentoPdf, titolo: string, numero: string, data: Date, cliente: Cliente, destinazione?: string | null) {
  const M = pdf.margine, L = pdf.larghezza;
  pdf.testo(M, pdf.y, CEDENTE.denominazione, 13, true);
  pdf.testo(M + 300, pdf.y, titolo, 13, true);
  pdf.y -= 13;
  const yT = pdf.y;
  for (const r of [`${CEDENTE.indirizzo} ${CEDENTE.numeroCivico} - ${CEDENTE.cap} ${CEDENTE.comune} (${CEDENTE.provincia})`, `P.IVA e C.F. ${CEDENTE.partitaIva}`, `Tel. ${CEDENTE.telefono} - ${CEDENTE.email}`, `PEC ${CEDENTE.pec} - ${CEDENTE.sito}`]) { pdf.testo(M, pdf.y, r, 8); pdf.y -= 10; }
  pdf.testo(M + 300, yT, `N. ${numero} del ${dataIt(data)}`, 11, true);
  pdf.y -= 8;
  const hCli = 16 + cliente.righe.length * 10;
  pdf.rett(M + 280, pdf.y - hCli + 10, L - 280, hCli + 2, 0.95);
  pdf.testo(M + 288, pdf.y, "Spett.le", 8);
  pdf.y -= 11;
  const yCli = pdf.y;
  pdf.testo(M + 288, pdf.y, cliente.nome.slice(0, 48), 10, true);
  for (const r of cliente.righe) { pdf.y -= 10; pdf.testo(M + 288, pdf.y, r.slice(0, 60), 8); }
  if (destinazione) {
    let y = yCli;
    pdf.testo(M, y + 11, "Luogo di destinazione", 8, true);
    for (const r of aCapo(destinazione, 250, 8).slice(0, 4)) { pdf.testo(M, y, r, 8); y -= 10; }
  }
  pdf.y -= 22;
}

function tabellaRighe(pdf: DocumentoPdf, righe: Riga[], conPrezzi: boolean) {
  const M = pdf.margine, L = pdf.larghezza;
  const col = conPrezzi ? { cod: M, descr: M + 55, q: M + 285, um: M + 292, prezzo: M + 375, sc: M + 405, iva: M + 440, tot: M + L } : { cod: M, descr: M + 60, q: M + L - 50, um: M + L, prezzo: 0, sc: 0, iva: 0, tot: 0 };
  const testa = () => {
    pdf.rett(M, pdf.y - 4, L, 14, 0.88);
    pdf.testo(col.cod + 2, pdf.y, "Codice", 8, true);
    pdf.testo(col.descr, pdf.y, "Descrizione", 8, true);
    pdf.testoDx(col.q, pdf.y, "Q.tà", 8, true);
    if (conPrezzi) {
      pdf.testo(col.um, pdf.y, "U.M.", 8, true);
      pdf.testoDx(col.prezzo, pdf.y, "Prezzo", 8, true);
      pdf.testoDx(col.sc, pdf.y, "Sc.%", 8, true);
      pdf.testoDx(col.iva, pdf.y, "IVA", 8, true);
      pdf.testoDx(col.tot, pdf.y, "Importo", 8, true);
    } else pdf.testoDx(col.um, pdf.y, "U.M.", 8, true);
    pdf.y -= 16;
  };
  testa();
  const largDescr = (conPrezzi ? col.q - 35 : col.q - 40) - col.descr;
  for (const r of righe) {
    const linee = aCapo(r.descrizione, largDescr, 8);
    if (pdf.spazio(linee.length * 10 + 4)) testa();
    pdf.testo(col.cod + 2, pdf.y, (r.codice ?? "").slice(0, 12), 7);
    linee.forEach((l, i) => pdf.testo(col.descr, pdf.y - i * 10, l, 8));
    const solaDescrizione = conPrezzi && r.prezzo === 0;
    if (!solaDescrizione) pdf.testoDx(col.q, pdf.y, q(r.quantita), 8);
    if (conPrezzi) {
      if (!solaDescrizione) {
        pdf.testo(col.um, pdf.y, (r.um ?? "").slice(0, 8), 8);
        pdf.testoDx(col.prezzo, pdf.y, eur(r.prezzo), 8);
        if (r.sconto) pdf.testoDx(col.sc, pdf.y, q(r.sconto), 8);
        pdf.testoDx(col.iva, pdf.y, r.natura ?? `${q(r.aliquota)}%`, 8);
        pdf.testoDx(col.tot, pdf.y, eur(importoRiga(r)), 8);
      }
    } else pdf.testoDx(col.um, pdf.y, r.um ?? "", 8);
    pdf.y -= linee.length * 10 + 6;
    pdf.linea(M, pdf.y + 10, M + L, pdf.y + 10, 0.2);
  }
}

export type DatiPdfFattura = {
  tipo: string; numero: string; data: Date; stato: string; cliente: Cliente; righe: Riga[]; causale?: string | null; riferimento?: string | null; note?: string | null;
  metodoPagamento?: string | null; banca?: string | null; iban?: string | null; rate?: { data: Date; importo: number }[]; bollo: boolean; addebitoBollo: boolean;
  ddt?: string[]; fatturaCollegata?: string | null; destinazione?: string | null;
  trasporto?: { causale?: string | null; aCura?: string | null; vettore?: string | null; aspetto?: string | null; colli?: number | null; peso?: number | null; porto?: string | null; inizio?: Date | null } | null;
};

export function pdfFattura(d: DatiPdfFattura): Uint8Array {
  const tf = tipoFattura(d.tipo);
  const pdf = new DocumentoPdf();
  const M = pdf.margine, L = pdf.larghezza;
  const titolo = (tf.codice === "FATTURA" || tf.codice === "SALDO" ? "FATTURA" : tf.nome.toUpperCase()).slice(0, 28);
  intestazione(pdf, titolo, d.numero, d.data, d.cliente, tf.trasporto ? d.destinazione : null);
  if (d.stato === "BOZZA") { pdf.rett(M, pdf.y - 4, L, 16, 0.85); pdf.testo(M + 6, pdf.y, "ANTEPRIMA — FATTURA NON ANCORA EMESSA", 10, true); pdf.y -= 20; }
  else if (d.stato === "PROVA") { pdf.rett(M, pdf.y - 4, L, 16, 0.85); pdf.testo(M + 6, pdf.y, "FATTURA DI PROVA — NON VALIDA AI FINI FISCALI", 10, true); pdf.y -= 20; }
  else if (tf.fiscale) { pdf.testo(M, pdf.y, "Copia di cortesia: l'originale è la fattura elettronica trasmessa allo SDI.", 7); pdf.y -= 12; }
  const info: [string, string][] = [
    ["Pagamento", metodoPagamento(d.metodoPagamento).nome], ["Banca", [d.banca, d.iban].filter(Boolean).join(" - ")], ["Riferimento", d.riferimento ?? ""],
    ["DDT", (d.ddt ?? []).join(", ")], ["Fattura stornata", d.fatturaCollegata ?? ""],
  ].filter(([, v]) => v) as [string, string][];
  for (const [k, v] of info) { pdf.testo(M, pdf.y, `${k}:`, 8, true); for (const r of aCapo(v, L - 90, 8)) { pdf.testo(M + 85, pdf.y, r, 8); pdf.y -= 10; } }
  if (d.causale) { pdf.y -= 2; pdf.paragrafo(`Causale: ${d.causale}`, 8); }
  pdf.y -= 6;
  tabellaRighe(pdf, d.righe, true);
  // Riepilogo IVA e totali
  const t = totali(d.righe, { bollo: d.bollo, addebitoBollo: d.bollo && d.addebitoBollo });
  pdf.spazio(40 + t.riepilogo.length * 11 + 70);
  pdf.y -= 8;
  const yInizio = pdf.y;
  pdf.testo(M, pdf.y, "Aliquota", 8, true); pdf.testoDx(M + 200, pdf.y, "Imponibile", 8, true); pdf.testoDx(M + 260, pdf.y, "Imposta", 8, true);
  pdf.y -= 11;
  for (const v of t.riepilogo) {
    pdf.testo(M, pdf.y, v.natura ? `${v.natura} ${(codiceIvaDa(0, v.natura).norma ?? "").slice(0, 32)}` : `IVA ${q(v.aliquota)}%`, 8);
    pdf.testoDx(M + 200, pdf.y, eur(v.imponibile), 8); pdf.testoDx(M + 260, pdf.y, eur(v.imposta), 8);
    pdf.y -= 11;
  }
  let y = yInizio;
  const riga = (k: string, v: string, b = false) => { pdf.testo(M + L - 200, y, k, b ? 10 : 9, b); pdf.testoDx(M + L, y, v, b ? 10 : 9, b); y -= b ? 15 : 12; };
  riga("Totale imponibile", eur(t.imponibile));
  riga("Totale IVA", eur(t.iva));
  if (d.bollo) riga(d.addebitoBollo ? "Bollo (addebitato)" : "Bollo virtuale assolto", eur(t.bollo));
  y -= 2;
  pdf.rett(M + L - 205, y - 4, 205, 16, 0.9);
  riga(tf.notaCredito ? "TOTALE NOTA DI CREDITO" : "TOTALE DA PAGARE", eur(t.totale), true);
  pdf.y = Math.min(pdf.y, y) - 8;
  if (d.rate?.length) {
    pdf.testo(M, pdf.y, "Scadenze:", 8, true);
    pdf.testo(M + 85, pdf.y, d.rate.map((r) => `${dataIt(r.data)} ${eur(r.importo)}`).join("  ·  "), 8);
    pdf.y -= 12;
  }
  if (d.bollo) { pdf.paragrafo("Imposta di bollo assolta in modo virtuale ai sensi del DM 17/06/2014.", 7); }
  if (tf.trasporto && d.trasporto) trasporto(pdf, d.trasporto);
  if (d.note) { pdf.y -= 4; pdf.paragrafo(d.note, 8); }
  return pdf.toBytes((n, tot) => `${CEDENTE.denominazione} - ${d.numero} - pagina ${n} di ${tot}`);
}

function trasporto(pdf: DocumentoPdf, t: NonNullable<DatiPdfFattura["trasporto"]>) {
  const M = pdf.margine, L = pdf.larghezza;
  pdf.spazio(80);
  pdf.y -= 6;
  pdf.rett(M, pdf.y - 50, L, 62, 0.96);
  const celle: [string, string][] = [
    ["Causale trasporto", t.causale ?? ""], ["Trasporto a cura", t.aCura ?? ""], ["Vettore", t.vettore ?? ""], ["Porto", t.porto ?? ""],
    ["Aspetto dei beni", t.aspetto ?? ""], ["N. colli", t.colli ? String(t.colli) : ""], ["Peso (kg)", t.peso ? q(t.peso) : ""], ["Inizio trasporto", t.inizio ? oraIt(t.inizio) : ""],
  ];
  celle.forEach(([k, v], i) => {
    const x = M + 6 + (i % 4) * (L / 4), y = pdf.y - Math.floor(i / 4) * 26;
    pdf.testo(x, y, k, 7, true); pdf.testo(x, y - 10, v.slice(0, 30), 8);
  });
  pdf.y -= 62;
  pdf.testo(M, pdf.y, "Firma del conducente", 8); pdf.testo(M + L / 3, pdf.y, "Firma del vettore", 8); pdf.testo(M + (2 * L) / 3, pdf.y, "Firma del destinatario", 8);
  pdf.y -= 26;
  pdf.linea(M, pdf.y, M + L / 3 - 10, pdf.y); pdf.linea(M + L / 3, pdf.y, M + (2 * L) / 3 - 10, pdf.y); pdf.linea(M + (2 * L) / 3, pdf.y, M + L, pdf.y);
  pdf.y -= 10;
}

export type DatiPdfDdt = {
  numero: string; data: Date; prova: boolean; cliente: Cliente; destinazione?: string | null; righe: Riga[]; riferimento?: string | null; note?: string | null; noteConsegna?: string | null;
  causale: string; aCura: string; vettore?: string | null; aspetto?: string | null; colli?: number | null; pesoLordo?: number | null; pesoNetto?: number | null; volume?: number | null; porto?: string | null; inizio?: Date | null;
};

export function pdfDdt(d: DatiPdfDdt): Uint8Array {
  const pdf = new DocumentoPdf();
  const M = pdf.margine, L = pdf.larghezza;
  intestazione(pdf, "DOCUMENTO DI TRASPORTO", d.numero, d.data, d.cliente, d.destinazione || d.cliente.righe.filter((r) => !/^(P\.IVA|C\.F\.)/.test(r)).join(", ") || null);
  pdf.testo(M, pdf.y, "D.d.t. (D.P.R. 472 del 14/08/1996)", 7); pdf.y -= 12;
  if (d.prova) { pdf.rett(M, pdf.y - 4, L, 16, 0.85); pdf.testo(M + 6, pdf.y, "DDT DI PROVA — NON VALIDO", 10, true); pdf.y -= 20; }
  if (d.riferimento) { pdf.paragrafo(`Riferimento: ${d.riferimento}`, 8); pdf.y -= 2; }
  tabellaRighe(pdf, d.righe, false);
  trasporto(pdf, { causale: d.causale, aCura: d.aCura, vettore: d.vettore, aspetto: d.aspetto, colli: d.colli, peso: d.pesoLordo, porto: d.porto, inizio: d.inizio });
  if (d.pesoNetto || d.volume) { pdf.paragrafo([d.pesoNetto ? `Peso netto ${q(d.pesoNetto)} kg` : null, d.volume ? `Volume ${q(d.volume)} m³` : null].filter(Boolean).join(" · "), 8); }
  if (d.noteConsegna) pdf.paragrafo(`Note sulla consegna: ${d.noteConsegna}`, 8);
  if (d.note) pdf.paragrafo(d.note, 8);
  return pdf.toBytes((n, tot) => `${CEDENTE.denominazione} - DDT ${d.numero} - pagina ${n} di ${tot}`);
}

/** Righe dell'indirizzo del cliente per il riquadro. */
export const righeCliente = (c: { indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null; partitaIva?: string | null; codiceFiscale?: string | null }) =>
  [c.indirizzo, [c.cap, c.comune, c.provincia ? `(${c.provincia})` : null].filter(Boolean).join(" "), c.partitaIva ? `P.IVA ${c.partitaIva}` : null, c.codiceFiscale ? `C.F. ${c.codiceFiscale}` : null].filter(Boolean) as string[];

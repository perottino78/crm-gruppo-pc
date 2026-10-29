// Lettura delle fatture elettroniche (FatturaPA / SDI) senza librerie esterne.
// Accetta .xml, .xml.p7m (firmati CAdES, anche in base64 o a blocchi) e .zip con più fatture.
// Testato in tests/magazzino/fatture.test.ts.
import { leggiZip } from "@/lib/articoli/foglio";

export type Nodo = { nome: string; figli: Nodo[]; testo: string };

const decodifica = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "lt") return "<"; if (k === "gt") return ">"; if (k === "amp") return "&"; if (k === "quot") return '"'; if (k === "apos") return "'";
    const n = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });

/** Parser XML minimale (elementi e testo; attributi, commenti e istruzioni ignorati; prefissi rimossi). */
export function parseXml(xml: string): Nodo {
  const radice: Nodo = { nome: "#", figli: [], testo: "" };
  const pila: Nodo[] = [radice];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([\w.:-]+)\s*>|<([\w.:-]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const cima = pila[pila.length - 1];
    if (m[1] !== undefined) cima.testo += m[1];
    else if (m[2]) { if (pila.length > 1) pila.pop(); }
    else if (m[3]) {
      const n: Nodo = { nome: m[3].replace(/^[\w.-]+:/, ""), figli: [], testo: "" };
      cima.figli.push(n);
      if (!m[5]) pila.push(n);
    } else if (m[6] !== undefined) cima.testo += decodifica(m[6]);
  }
  return radice;
}

/** Primo discendente con il percorso indicato ("A/B/C"), cercando a qualsiasi profondità il primo pezzo. */
export function trova(n: Nodo | undefined, percorso: string): Nodo | undefined {
  if (!n) return undefined;
  const [primo, ...resto] = percorso.split("/");
  const cerca = (x: Nodo): Nodo | undefined => {
    for (const f of x.figli) { if (f.nome === primo) return f; const d = cerca(f); if (d) return d; }
    return undefined;
  };
  let cur = cerca(n);
  for (const p of resto) { cur = cur?.figli.find((f) => f.nome === p); if (!cur) return undefined; }
  return cur;
}
export const testo = (n: Nodo | undefined, percorso?: string) => ((percorso ? trova(n, percorso) : n)?.testo ?? "").trim();
export const figli = (n: Nodo | undefined, nome: string) => (n?.figli ?? []).filter((f) => f.nome === nome);
export function tutti(n: Nodo | undefined, nome: string): Nodo[] {
  const out: Nodo[] = [];
  const giro = (x: Nodo) => { for (const f of x.figli) { if (f.nome === nome) out.push(f); else giro(f); } };
  if (n) giro(n);
  return out;
}

const numero = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const numeroOpz = (s: string) => (s.trim() ? numero(s) : null);
const cent = (n: number) => Math.round(n * 100) / 100;

/** Estrae il testo XML della fattura da file .xml o .p7m (DER grezzo, base64 o contenuto a blocchi). */
export function estraiXml(buf: Buffer): string | null {
  let b = buf;
  const inizio = b.subarray(0, 64).toString("latin1").trim();
  if (/^[A-Za-z0-9+/=\s]+$/.test(b.subarray(0, 200).toString("latin1")) && !inizio.startsWith("<")) {
    try { const dec = Buffer.from(b.toString("latin1").replace(/\s+/g, ""), "base64"); if (dec.length > 100) b = dec; } catch { /* non è base64 */ }
  }
  const s = b.toString("latin1");
  const apertura = s.search(/<(?:[\w.-]+:)?FatturaElettronica[\s>]/);
  if (apertura < 0) return null;
  const xmlDecl = s.lastIndexOf("<?xml", apertura);
  const da = xmlDecl >= 0 && apertura - xmlDecl < 200 ? xmlDecl : apertura;
  const chiusura = /<\/(?:[\w.-]+:)?FatturaElettronica\s*>/g;
  chiusura.lastIndex = apertura;
  const mc = chiusura.exec(s);
  if (!mc) return null;
  let bytes = b.subarray(da, mc.index + mc[0].length);
  // p7m "a blocchi": il contenuto è spezzato in OCTET STRING con intestazioni 0x04 <lunghezza>.
  // 0x04 non può comparire in un XML valido: si rimuovono le intestazioni.
  if (bytes.includes(0x04)) {
    const pulito: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x04) {
        const l = bytes[i + 1];
        i += l === 0x81 ? 2 : l === 0x82 ? 3 : l === 0x83 ? 4 : 1;
        continue;
      }
      pulito.push(bytes[i]);
    }
    bytes = Buffer.from(pulito);
  }
  const dichiarata = /encoding=["']([\w-]+)["']/i.exec(bytes.subarray(0, 100).toString("latin1"))?.[1]?.toLowerCase();
  return bytes.toString(dichiarata && /8859|latin|windows-1252/.test(dichiarata) ? "latin1" : "utf8");
}

export type FatturaLetta = {
  fornitore: { denominazione: string; partitaIva: string | null; codiceFiscale: string | null; indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null; email: string | null };
  cliente: { denominazione: string; partitaIva: string | null };
  tipoDocumento: string;
  notaCredito: boolean;
  numero: string;
  data: string; // AAAA-MM-GG
  divisa: string;
  totale: number;
  imponibile: number;
  iva: number;
  causale: string;
  righe: { posizione: number; codice: string | null; descrizione: string; quantita: number | null; um: string | null; prezzoUnitario: number | null; importo: number; aliquotaIva: number | null }[];
  scadenze: { data: string | null; importo: number; modalita: string | null }[];
  ddt: { numero: string; data: string | null }[];
  ordini: { numero: string; data: string | null }[];
};

const denominazione = (anag: Nodo | undefined) => testo(anag, "Denominazione") || [testo(anag, "Nome"), testo(anag, "Cognome")].filter(Boolean).join(" ");

/** Legge l'XML FatturaPA: una voce per ogni corpo (lotto di fatture nello stesso file). */
export function leggiFatturaPA(xml: string): FatturaLetta[] {
  const r = parseXml(xml);
  const fe = trova(r, "FatturaElettronica");
  if (!fe) throw new Error("Il file non è una fattura elettronica (manca FatturaElettronica).");
  const testata = trova(fe, "FatturaElettronicaHeader");
  const ced = trova(testata, "CedentePrestatore");
  const datiAnag = trova(ced, "DatiAnagrafici");
  const sede = trova(ced, "Sede");
  const ces = trova(testata, "CessionarioCommittente");
  const piva = (n: Nodo | undefined) => { const c = testo(n, "IdFiscaleIVA/IdCodice"); const p = testo(n, "IdFiscaleIVA/IdPaese"); return c ? (p && p !== "IT" ? p + c : c) : null; };
  const fornitore = {
    denominazione: denominazione(trova(datiAnag, "Anagrafica")) || "Fornitore senza nome",
    partitaIva: piva(datiAnag), codiceFiscale: testo(datiAnag, "CodiceFiscale") || null,
    indirizzo: [testo(sede, "Indirizzo"), testo(sede, "NumeroCivico")].filter(Boolean).join(" ") || null,
    cap: testo(sede, "CAP") || null, comune: testo(sede, "Comune") || null, provincia: testo(sede, "Provincia") || null,
    email: testo(ced, "Contatti/Email") || null,
  };
  const cliente = { denominazione: denominazione(trova(trova(ces, "DatiAnagrafici"), "Anagrafica")), partitaIva: piva(trova(ces, "DatiAnagrafici")) };
  const corpi = figli(fe, "FatturaElettronicaBody");
  if (!corpi.length) throw new Error("La fattura non ha il corpo (FatturaElettronicaBody).");
  return corpi.map((b) => {
    const dg = trova(b, "DatiGenerali/DatiGeneraliDocumento") ?? trova(b, "DatiGeneraliDocumento");
    const tipo = testo(dg, "TipoDocumento") || "TD01";
    const righe = tutti(trova(b, "DatiBeniServizi"), "DettaglioLinee").map((l, i) => {
      const codici = figli(l, "CodiceArticolo");
      const cod = codici.find((c) => /forn|art|int|cod/i.test(testo(c, "CodiceTipo"))) ?? codici[0];
      return {
        posizione: Number(testo(l, "NumeroLinea")) || i + 1, codice: cod ? testo(cod, "CodiceValore") || null : null,
        descrizione: testo(l, "Descrizione") || "(senza descrizione)", quantita: numeroOpz(testo(l, "Quantita")), um: testo(l, "UnitaMisura") || null,
        prezzoUnitario: numeroOpz(testo(l, "PrezzoUnitario")), importo: cent(numero(testo(l, "PrezzoTotale"))), aliquotaIva: numeroOpz(testo(l, "AliquotaIVA")),
      };
    });
    const riep = tutti(trova(b, "DatiBeniServizi"), "DatiRiepilogo");
    const imponibile = cent(riep.reduce((t, x) => t + numero(testo(x, "ImponibileImporto")), 0));
    const iva = cent(riep.reduce((t, x) => t + numero(testo(x, "Imposta")), 0));
    const totDoc = testo(dg, "ImportoTotaleDocumento");
    const totale = totDoc ? cent(numero(totDoc)) : cent(imponibile + iva);
    const scadenze = tutti(trova(b, "DatiPagamento") ? b : undefined, "DettaglioPagamento").map((p) => ({
      data: testo(p, "DataScadenzaPagamento") || null, importo: cent(numero(testo(p, "ImportoPagamento"))), modalita: testo(p, "ModalitaPagamento") || null,
    }));
    const ddt = tutti(trova(b, "DatiGenerali"), "DatiDDT").map((d) => ({ numero: testo(d, "NumeroDDT"), data: testo(d, "DataDDT") || null })).filter((d) => d.numero);
    const ordini = tutti(trova(b, "DatiGenerali"), "DatiOrdineAcquisto").map((d) => ({ numero: testo(d, "IdDocumento"), data: testo(d, "Data") || null })).filter((d) => d.numero);
    return {
      fornitore, cliente, tipoDocumento: tipo, notaCredito: tipo === "TD04" || tipo === "TD08",
      numero: testo(dg, "Numero"), data: testo(dg, "Data"), divisa: testo(dg, "Divisa") || "EUR",
      totale, imponibile, iva, causale: figli(dg, "Causale").map((c) => c.testo.trim()).join(" ").slice(0, 500),
      righe, scadenze, ddt, ordini,
    };
  });
}

export type FileFattura = { nome: string; fatture: FatturaLetta[]; xml: string | null; errore: string | null };

/** Legge un file caricato (.xml, .p7m, .zip con più fatture). */
export function leggiFileFatture(nome: string, buf: Buffer): FileFattura[] {
  if (/\.zip$/i.test(nome) || (buf[0] === 0x50 && buf[1] === 0x4b)) {
    const out: FileFattura[] = [];
    for (const [n, dati] of leggiZip(buf)) {
      if (/\/$/.test(n) || /^__MACOSX|\/\./.test(n) || !/\.(xml|p7m)$/i.test(n)) continue;
      out.push(...leggiFileFatture(n.split("/").pop() ?? n, dati));
    }
    return out;
  }
  const xml = estraiXml(buf);
  if (!xml) return [{ nome, fatture: [], xml: null, errore: "Non contiene una fattura elettronica leggibile." }];
  try { return [{ nome, fatture: leggiFatturaPA(xml), xml, errore: null }]; }
  catch (e) { return [{ nome, fatture: [], xml, errore: (e as Error).message }]; }
}

// Partite IVA delle società del gruppo: dal cessionario si capisce a chi è intestata la fattura.
export const SOCIETA_GRUPPO: Record<string, string> = { "10741080013": "P&C", "12059980016": "Work & Services" };
export const divisioneDaCliente = (piva: string | null) => (piva ? SOCIETA_GRUPPO[piva.replace(/^IT/, "")] ?? null : null);

/** Chiave che impedisce di caricare due volte la stessa fattura. */
export const chiaveFattura = (partitaIva: string | null, fornitoreNome: string, tipo: string, numero: string, data: string) =>
  [(partitaIva ?? fornitoreNome).toUpperCase().replace(/\s+/g, ""), tipo, numero.toUpperCase().replace(/\s+/g, ""), data.slice(0, 4)].join("|");

export const MODALITA_PAGAMENTO: Record<string, string> = {
  MP01: "Contanti", MP02: "Assegno", MP05: "Bonifico", MP08: "Carta di pagamento", MP12: "RIBA", MP19: "SEPA Direct Debit", MP21: "SEPA Direct Debit B2B", MP23: "PagoPA",
};
export const TIPI_DOCUMENTO: Record<string, string> = {
  TD01: "Fattura", TD02: "Acconto su fattura", TD04: "Nota di credito", TD05: "Nota di debito", TD06: "Parcella", TD08: "Nota di credito semplificata",
  TD24: "Fattura differita", TD25: "Fattura differita (triangolare)", TD16: "Integrazione reverse charge", TD17: "Autofattura servizi estero",
};

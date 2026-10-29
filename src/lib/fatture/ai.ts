// Prompt e normalizzazione delle risposte AI per bolle e fatture in PDF/foto.
import { leggiQuantita } from "@/lib/magazzino/calcoli";
import type { FatturaLetta } from "./fatturapa";

export type BollaAi = { fornitore?: string; numero?: string; data?: string; righe?: { codice?: string; descrizione?: string; quantita?: number | string; um?: string }[] };
export type FatturaAi = {
  fornitore?: { denominazione?: string; partitaIva?: string; codiceFiscale?: string; indirizzo?: string; cap?: string; comune?: string; provincia?: string };
  clientePartitaIva?: string; tipo?: string; numero?: string; data?: string; imponibile?: number | string; iva?: number | string; totale?: number | string;
  righe?: { codice?: string; descrizione?: string; quantita?: number | string; um?: string; prezzoUnitario?: number | string; importo?: number | string; aliquotaIva?: number | string }[];
  scadenze?: { data?: string; importo?: number | string }[]; ddt?: { numero?: string; data?: string }[]; ordini?: string[];
};

export function promptBolla(): string {
  return `Sei il magazziniere di Gruppo P&C. Ricevi la foto o il PDF di una bolla di consegna (DDT) di un fornitore.
Restituisci SOLO un oggetto JSON, senza testo prima o dopo, con questa forma:
{"fornitore":"ragione sociale del mittente","numero":"numero del DDT","data":"AAAA-MM-GG","righe":[{"codice":"codice articolo del fornitore o vuoto","descrizione":"descrizione","quantita":numero,"um":"pz|mt|mq|kg|cf|..."}]}
Regole: una riga per ogni articolo consegnato, nell'ordine della bolla. Quantità come numero (virgola decimale → punto).
Ignora righe di soli totali, trasporto, imballi a rendere e annotazioni. Se un dato non è leggibile lascialo vuoto: non inventare.`;
}

export function promptFattura(): string {
  return `Sei l'impiegata amministrativa di Gruppo P&C. Ricevi il PDF o la foto di una fattura d'acquisto di un fornitore.
Restituisci SOLO un oggetto JSON, senza testo prima o dopo, con questa forma:
{"fornitore":{"denominazione":"","partitaIva":"solo cifre","codiceFiscale":"","indirizzo":"","cap":"","comune":"","provincia":""},
 "clientePartitaIva":"partita IVA del destinatario","tipo":"TD01 fattura | TD04 nota di credito","numero":"","data":"AAAA-MM-GG",
 "imponibile":numero,"iva":numero,"totale":numero,
 "righe":[{"codice":"","descrizione":"","quantita":numero,"um":"","prezzoUnitario":numero,"importo":numero,"aliquotaIva":numero}],
 "scadenze":[{"data":"AAAA-MM-GG","importo":numero}],"ddt":[{"numero":"","data":"AAAA-MM-GG"}],"ordini":["numeri d'ordine citati, es. 12/2026"]}
Regole: importi come numeri con il punto decimale, senza simboli. L'importo di riga è il totale della riga (imponibile).
Se un dato manca lascialo vuoto: non inventare. I totali devono essere quelli stampati in fattura.`;
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const n = (v: unknown) => leggiQuantita(v);
const dataIso = (v: unknown) => { const t = s(v); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t) ?? /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t); if (!m) return null; return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; };

export function normalizzaBollaAi(j: BollaAi | null) {
  if (!j || !Array.isArray(j.righe)) return null;
  const righe = j.righe.map((r) => ({ codice: s(r.codice) || null, descrizione: s(r.descrizione), quantita: n(r.quantita), um: s(r.um) || null })).filter((r) => r.descrizione);
  if (!righe.length) return null;
  return { fornitore: s(j.fornitore) || null, numero: s(j.numero) || null, data: dataIso(j.data), righe };
}

export function normalizzaFatturaAi(j: FatturaAi | null): FatturaLetta | null {
  if (!j) return null;
  const numero = s(j.numero), data = dataIso(j.data), nome = s(j.fornitore?.denominazione);
  if (!numero || !data || !nome) return null;
  const righe = (j.righe ?? []).map((r, i) => ({ posizione: i + 1, codice: s(r.codice) || null, descrizione: s(r.descrizione) || "(senza descrizione)", quantita: n(r.quantita), um: s(r.um) || null, prezzoUnitario: n(r.prezzoUnitario), importo: n(r.importo) ?? 0, aliquotaIva: n(r.aliquotaIva) }));
  const imponibile = n(j.imponibile) ?? righe.reduce((t, r) => t + r.importo, 0);
  const iva = n(j.iva) ?? 0;
  const tipo = /TD0?4|nota/i.test(s(j.tipo)) ? "TD04" : "TD01";
  return {
    fornitore: { denominazione: nome, partitaIva: s(j.fornitore?.partitaIva).replace(/\D/g, "") || null, codiceFiscale: s(j.fornitore?.codiceFiscale) || null, indirizzo: s(j.fornitore?.indirizzo) || null, cap: s(j.fornitore?.cap) || null, comune: s(j.fornitore?.comune) || null, provincia: s(j.fornitore?.provincia) || null, email: null },
    cliente: { denominazione: "", partitaIva: s(j.clientePartitaIva).replace(/\D/g, "") || null },
    tipoDocumento: tipo, notaCredito: tipo === "TD04", numero, data, divisa: "EUR",
    totale: n(j.totale) ?? Math.round((imponibile + iva) * 100) / 100, imponibile, iva, causale: "",
    righe: righe.length ? righe : [{ posizione: 1, codice: null, descrizione: "Totale fattura", quantita: null, um: null, prezzoUnitario: null, importo: imponibile, aliquotaIva: null }],
    scadenze: (j.scadenze ?? []).map((x) => ({ data: dataIso(x.data), importo: n(x.importo) ?? 0, modalita: null })).filter((x) => x.importo > 0),
    ddt: (j.ddt ?? []).map((d) => ({ numero: s(d.numero), data: dataIso(d.data) })).filter((d) => d.numero),
    ordini: (j.ordini ?? []).map((o) => ({ numero: s(o), data: null })).filter((o) => o.numero),
  };
}

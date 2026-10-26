// Lettura degli estratti conto bancari in formato CSV/testo (export dell'home banking).
// Funzioni pure, senza accesso al database: testate in tests/amministrazione.
import { createHash } from "crypto";

export type RigaEstratto = {
  riga: number; // numero di riga nel file (1 = prima riga)
  data: Date;
  dataValuta: Date | null;
  importo: number; // + entrata, - uscita (arrotondato al centesimo)
  descrizione: string;
};

export type RigaScartata = { riga: number; motivo: string; testo: string };

export type EsitoLettura = {
  ok: boolean;
  errore?: string;
  separatore: string;
  rigaIntestazione: number;
  colonne: { data: string; valuta?: string; importo?: string; entrate?: string; uscite?: string; descrizione: string[] };
  righe: RigaEstratto[];
  scartate: RigaScartata[];
};

/** Arrotonda al centesimo evitando gli errori della virgola mobile. */
export function cent(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Converte un importo scritto all'italiana o all'inglese: "1.234,56", "-1234.56", "€ 1.234,56", "(12,00)", "12,00-". */
export function leggiImporto(testo: string | undefined | null): number | null {
  if (testo == null) return null;
  let s = String(testo).trim();
  if (s === "") return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  s = s.replace(/eur|€/gi, "").replace(/\s|\u00a0/g, "");
  if (s.endsWith("-")) { negativo = !negativo; s = s.slice(0, -1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) { negativo = !negativo; s = s.slice(1); }
  if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/'/g, "");
  const ultimaVirgola = s.lastIndexOf(",");
  const ultimoPunto = s.lastIndexOf(".");
  if (ultimaVirgola >= 0 && ultimoPunto >= 0) {
    // il separatore che compare per ultimo è quello dei decimali
    if (ultimaVirgola > ultimoPunto) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (ultimaVirgola >= 0) {
    if ((s.match(/,/g) || []).length > 1) return null;
    s = s.replace(",", ".");
  } else if (ultimoPunto >= 0) {
    // solo punti: "1.234" o "1.234.567" sono migliaia; "1234.5" / "12.34" sono decimali
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else if ((s.match(/\./g) || []).length > 1) return null;
  }
  const n = Number(s);
  if (!isFinite(n)) return null;
  return cent(negativo ? -n : n);
}

/** Legge una data: gg/mm/aaaa, gg-mm-aaaa, gg.mm.aaaa, gg/mm/aa, aaaa-mm-gg (eventuale ora ignorata). */
export function leggiData(testo: string | undefined | null): Date | null {
  if (testo == null) return null;
  const s = String(testo).trim().split(/[ T]/)[0];
  let g: number, m: number, a: number;
  let r = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s);
  if (r) {
    g = +r[1]; m = +r[2]; a = +r[3];
    if (a < 100) a += 2000;
  } else {
    r = /^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/.exec(s);
    if (!r) return null;
    a = +r[1]; m = +r[2]; g = +r[3];
  }
  if (m < 1 || m > 12 || g < 1 || g > 31 || a < 1990 || a > 2100) return null;
  const d = new Date(Date.UTC(a, m - 1, g, 12, 0, 0));
  if (d.getUTCDate() !== g) return null; // es. 31/02
  return d;
}

/** Data in formato aaaa-mm-gg (UTC), usata per impronte e confronti. */
export function giorno(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Divide un testo CSV in righe e celle, rispettando le virgolette. */
export function leggiCsv(testo: string, separatore: string): string[][] {
  const righe: string[][] = [];
  let cella = "";
  let riga: string[] = [];
  let tra = false;
  const t = testo.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (tra) {
      if (c === '"') {
        if (t[i + 1] === '"') { cella += '"'; i++; } else tra = false;
      } else cella += c;
    } else if (c === '"') tra = true;
    else if (c === separatore) { riga.push(cella); cella = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      riga.push(cella); righe.push(riga); riga = []; cella = "";
    } else cella += c;
  }
  if (cella !== "" || riga.length) { riga.push(cella); righe.push(riga); }
  return righe;
}

function indovinaSeparatore(testo: string): string {
  const campione = testo.split(/\r?\n/).slice(0, 40).join("\n");
  const conta = (s: string) => campione.split(s).length - 1;
  const candidati = [";", "\t", ",", "|"].map((s) => ({ s, n: conta(s) }));
  candidati.sort((a, b) => b.n - a.n);
  return candidati[0].n > 0 ? candidati[0].s : ";";
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

type Mappa = { data: number; valuta: number; importo: number; entrate: number; uscite: number; descrizione: number[] };

function mappaIntestazione(celle: string[]): Mappa | null {
  const n = celle.map((c) => norm(c));
  const trova = (test: (s: string) => boolean, escludi: number[] = []) => n.findIndex((s, i) => !escludi.includes(i) && s !== "" && test(s));
  const valuta = trova((s) => /valuta/.test(s));
  const data = trova((s) => /^data( (contabile|operazione|registrazione|contabilizzazione|movimento))?$/.test(s) || /data (contabile|operazione|registrazione|contabilizzazione)/.test(s), [valuta]);
  const dataFallback = data >= 0 ? data : trova((s) => /^data\b/.test(s), [valuta]);
  const entrate = trova((s) => /^(avere|entrate|accrediti|accredito|entrata)$/.test(s) || /^(importo )?(avere|accredit)/.test(s));
  const uscite = trova((s) => /^(dare|uscite|addebiti|addebito|uscita)$/.test(s) || /^(importo )?(dare|addebit)/.test(s));
  const importo = trova((s) => /^(importo|ammontare|movimento|importo eur|importo euro|importo in euro|importo \(eur\))$/.test(s) || /^importo/.test(s), [entrate, uscite]);
  const usate = [dataFallback, valuta, importo, entrate, uscite];
  const descrizione: number[] = [];
  n.forEach((s, i) => {
    if (usate.includes(i) || s === "") return;
    if (/descrizione|causale|operazione|dettagli|beneficiario|ordinante|motivo|note|informazioni|tipologia/.test(s) && !/^data/.test(s) && !/saldo|divisa|valut|abi|cab|numero|codice|stato|categoria/.test(s)) descrizione.push(i);
  });
  if (dataFallback < 0) return null;
  if (importo < 0 && entrate < 0 && uscite < 0) return null;
  return { data: dataFallback, valuta, importo, entrate, uscite, descrizione };
}

/** Legge un estratto conto CSV. Cerca da sola la riga di intestazione e le colonne. */
export function leggiEstratto(testo: string): EsitoLettura {
  const vuoto = { separatore: ";", rigaIntestazione: -1, colonne: { data: "", descrizione: [] }, righe: [], scartate: [] };
  if (!testo || !testo.trim()) return { ok: false, errore: "Il file è vuoto.", ...vuoto };
  const separatore = indovinaSeparatore(testo);
  const tabella = leggiCsv(testo, separatore);
  let iTest = -1;
  let mappa: Mappa | null = null;
  for (let i = 0; i < Math.min(tabella.length, 60); i++) {
    const m = mappaIntestazione(tabella[i]);
    if (m) { iTest = i; mappa = m; break; }
  }
  if (!mappa) {
    return { ok: false, errore: "Non trovo la riga di intestazione: servono almeno una colonna «Data» e una colonna «Importo» (oppure «Dare»/«Avere», «Entrate»/«Uscite»).", ...vuoto, separatore };
  }
  const intest = tabella[iTest];
  const nomeCol = (i: number) => (i >= 0 ? (intest[i] || "").trim() : undefined);
  const righe: RigaEstratto[] = [];
  const scartate: RigaScartata[] = [];
  for (let i = iTest + 1; i < tabella.length; i++) {
    const r = tabella[i];
    const testoRiga = r.join(" ").trim();
    if (!testoRiga) continue;
    const cell = (k: number) => (k >= 0 ? (r[k] ?? "").trim() : "");
    const data = leggiData(cell(mappa.data));
    if (!data) {
      // righe di totale/saldo a fondo file: scartate senza allarmare
      scartate.push({ riga: i + 1, motivo: /saldo|totale/i.test(testoRiga) ? "Riga di saldo/totale" : "Data mancante o non valida", testo: testoRiga.slice(0, 120) });
      continue;
    }
    let importo: number | null = null;
    if (mappa.importo >= 0) importo = leggiImporto(cell(mappa.importo));
    if ((importo === null || importo === 0) && (mappa.entrate >= 0 || mappa.uscite >= 0)) {
      const e = mappa.entrate >= 0 ? leggiImporto(cell(mappa.entrate)) : null;
      const u = mappa.uscite >= 0 ? leggiImporto(cell(mappa.uscite)) : null;
      if (e !== null && e !== 0) importo = Math.abs(e);
      else if (u !== null && u !== 0) importo = -Math.abs(u);
      else if (importo === null && (e === 0 || u === 0)) importo = 0;
    }
    if (importo === null) { scartate.push({ riga: i + 1, motivo: "Importo mancante o non leggibile", testo: testoRiga.slice(0, 120) }); continue; }
    if (importo === 0) { scartate.push({ riga: i + 1, motivo: "Importo zero", testo: testoRiga.slice(0, 120) }); continue; }
    let descrizione = mappa.descrizione.map((k) => cell(k)).filter(Boolean).join(" · ");
    if (!descrizione) {
      const usate = [mappa.data, mappa.valuta, mappa.importo, mappa.entrate, mappa.uscite];
      descrizione = r.filter((_, k) => !usate.includes(k)).map((x) => x.trim()).filter((x) => x && !leggiImporto(x) && !leggiData(x)).join(" · ");
    }
    righe.push({ riga: i + 1, data, dataValuta: leggiData(cell(mappa.valuta)), importo, descrizione: descrizione.replace(/\s+/g, " ").trim() || "(senza descrizione)" });
  }
  return {
    ok: righe.length > 0,
    errore: righe.length ? undefined : "Nessun movimento leggibile nel file.",
    separatore,
    rigaIntestazione: iTest + 1,
    colonne: {
      data: nomeCol(mappa.data)!,
      valuta: nomeCol(mappa.valuta),
      importo: nomeCol(mappa.importo),
      entrate: nomeCol(mappa.entrate),
      uscite: nomeCol(mappa.uscite),
      descrizione: mappa.descrizione.map((k) => nomeCol(k)!).filter(Boolean),
    },
    righe,
    scartate,
  };
}

/**
 * Impronta di un movimento: conto + giorno + importo + descrizione + occorrenza.
 * L'occorrenza (1, 2, 3…) distingue movimenti identici nello stesso file (es. due commissioni
 * uguali lo stesso giorno), mentre reimportando lo stesso file si ottengono le stesse impronte
 * e i doppioni vengono scartati.
 */
export function improntePer(contoId: string, righe: Pick<RigaEstratto, "data" | "importo" | "descrizione">[]): string[] {
  const visti = new Map<string, number>();
  return righe.map((r) => {
    const base = [contoId, giorno(r.data), Math.round(r.importo * 100), norm(r.descrizione).replace(/ /g, "")].join("|");
    const n = (visti.get(base) ?? 0) + 1;
    visti.set(base, n);
    return createHash("sha256").update(`${base}|${n}`).digest("hex");
  });
}

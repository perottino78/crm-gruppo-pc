// Modulo d'ordine «Angolari in alluminio per i legni delle vetrate» (richiesta di Ugo 20/11/2026), fornitore IL MASTRO: per ogni riga
// forma (L, U, Z, piatto) con le misure dei lati come nella legenda, spessore, lato del «bello» (interno, esterno o entrambi), colore,
// lunghezza e pezzi. Costo a peso come il listino della lattoneria (sviluppo × spessore × 2,7 kg/dm³ × €/kg del colore), vendita × 2.
// Modulo puro (test in tests/ordini/angolari.test.ts).
import { COLORI_LATTONERIA, DENSITA_ALLUMINIO, FASCE, RICARICO_LATTONERIA } from "@/lib/listini/lattoneria";
import { leggiCodiceLegno, sezioneDellaRiga, LUNGHEZZA_STANDARD } from "./legno";

export type Forma = "L" | "U" | "Z" | "PIATTO" | "PUNTA";
export const FORME: Record<Forma, { nome: string; lati: ("a" | "b" | "c")[]; facoltativi?: ("a" | "b" | "c")[]; spiega: string }> = {
  L: { nome: "Angolare a L", lati: ["a", "b"], spiega: "A = lato 1, B = lato 2 (copre due facce del legno)" },
  U: { nome: "Profilo a U", lati: ["a", "b", "c"], spiega: "A e C = ali, B = fondo (copre tre facce)" },
  Z: { nome: "Profilo a Z", lati: ["a", "b", "c"], spiega: "A = ala sopra, B = anima, C = ala sotto" },
  PIATTO: { nome: "Piatto", lati: ["a"], spiega: "A = larghezza della lamiera" },
  // copertina a punta (richiesta di Ugo 20/11/2026, «a spicchio»): due falde che salgono a punta come un tettuccio, angolo in cima, risvolto C facoltativo sui due lati
  PUNTA: { nome: "Copertina a punta", lati: ["a", "b", "c"], facoltativi: ["c"], spiega: "A e B = falde, angolo in cima in gradi, C = risvolto verticale su entrambi i lati (facoltativo)" },
};
/** Misure scritte all'esterno o all'interno della piega: cambia lo sviluppo della lamiera (circa uno spessore per piega). */
export const MISURA: Record<string, string> = { EST: "Misure esterne", INT: "Misure interne" };
/** Pieghe di ogni forma (per la correzione esterno/interno). */
const pieghe = (x: Angolare) => ({ L: 1, U: 2, Z: 2, PIATTO: 0, PUNTA: 1 + (x.c ? 2 : 0) })[x.forma];
export const SPESSORI = [1, 1.5, 2]; // mm (10/10, 15/10, 20/10)
export const BELLO: Record<string, string> = { EST: "Esterno", INT: "Interno", ENTRAMBI: "Entrambi i lati" };
export const RIGHE_ANGOLARI = 12;
export const PREFISSO_ANGOLARI = "ANGALL-";

const num = (v: string | undefined) => { const n = Number(String(v ?? "").replace(",", ".").trim()); return Number.isFinite(n) && n > 0 ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
export const spessoreLabel = (mm: number) => `${Math.round(mm * 10)}/10`;

export type Angolare = { forma: Forma; a: number; b: number; c: number; spessore: number; bello: string; colore: number; lunghezza: number; pezzi: number; misura?: string; angolo?: number };

/** Una riga del modulo dai valori `tab_ang_<n>_<colonna>`; null se non ha pezzi o misure. */
export function angolareDellaRiga(v: Record<string, string>, n: number): Angolare | null {
  const g = (c: string) => v[`tab_ang_${n}_${c}`];
  const forma = (g("forma") as Forma) in FORME ? (g("forma") as Forma) : "L";
  const pezzi = Math.round(num(g("pezzi")));
  const lati = { a: num(g("a")), b: num(g("b")), c: num(g("c")) };
  if (!pezzi || FORME[forma].lati.some((l) => !lati[l] && !FORME[forma].facoltativi?.includes(l))) return null;
  const spessore = SPESSORI.includes(num(g("spessore"))) ? num(g("spessore")) : 1.5;
  const colore = Math.min(COLORI_LATTONERIA.length - 1, Math.max(0, Math.round(num(g("colore")))));
  const x: Angolare = { forma, ...lati, c: FORME[forma].lati.includes("c") ? lati.c : 0, b: FORME[forma].lati.includes("b") ? lati.b : 0, spessore, bello: g("bello") in BELLO ? g("bello") : "EST", colore, lunghezza: num(g("lunghezza")) || LUNGHEZZA_STANDARD, pezzi, misura: g("misura") === "INT" ? "INT" : "EST" };
  if (forma === "PUNTA") x.angolo = Math.min(179, Math.max(1, Math.round(num(g("angolo")) || 90)));
  return x;
}

/** Sviluppo della lamiera: somma dei lati (il risvolto della copertina vale due volte), meno uno spessore per piega se le misure sono esterne, più uno se interne. */
export const sviluppo = (x: Angolare) => {
  const somma = x.a + x.b + (x.forma === "PUNTA" ? 2 * x.c : x.c);
  const corr = pieghe(x) * x.spessore * (x.misura === "INT" ? 1 : -1);
  return Math.round((somma + corr) * 10) / 10;
};
/** kg di una barra: sviluppo × spessore × lunghezza × 2,7 kg/dm³. */
export const kgBarra = (x: Angolare) => (sviluppo(x) * x.spessore * x.lunghezza * DENSITA_ALLUMINIO) / 1e6;
export const euroKg = (x: Angolare) => FASCE[COLORI_LATTONERIA[x.colore].fascia].euroKg;
/** Costo di Il Mastro a barra (kg × €/kg del colore, ai 5 centesimi, mai sotto 0,50 €) e vendita × 2. */
export const costoBarra = (x: Angolare) => Math.max(0.5, Math.round(kgBarra(x) * euroKg(x) * 20) / 20);
export const venditaBarra = (x: Angolare) => r2(costoBarra(x) * RICARICO_LATTONERIA);

export const misureLabel = (x: Angolare) => FORME[x.forma].lati.filter((l) => x[l]).map((l) => x[l]).join("×") + (x.forma === "PUNTA" ? ` a ${x.angolo ?? 90}°` : "");
export const descrizioneAngolare = (x: Angolare) =>
  `${FORME[x.forma].nome} in alluminio ${misureLabel(x)}${x.forma === "PUNTA" && x.c ? " (con risvolti)" : ""} ${x.misura === "INT" ? "misure interne" : "misure esterne"}, sp. ${spessoreLabel(x.spessore)}, bello ${BELLO[x.bello].toLowerCase()}, ${COLORI_LATTONERIA[x.colore].nome}, L ${x.lunghezza} mm`;
/** Codice della riga d'ordine: tutto quello che serve per ricompilare il modulo (ANGALL-L-30X50X0-15-EST-C0-3000). */
export const codiceAngolare = (x: Angolare) =>
  `${PREFISSO_ANGOLARI}${x.forma}-${x.a}X${x.b}X${x.c}-${Math.round(x.spessore * 10)}-${x.bello}-C${x.colore}-${x.lunghezza}-M${x.misura === "INT" ? "I" : "E"}${x.forma === "PUNTA" ? `-G${x.angolo ?? 90}` : ""}`;

export function leggiCodiceAngolare(codice: string | null | undefined, pezzi = 1): Angolare | null {
  // i codici salvati prima del 20/11/2026 non hanno -M (misure) e -G (angolo della copertina): valgono misure esterne
  const m = /^ANGALL-(L|U|Z|PIATTO|PUNTA)-(\d+)X(\d+)X(\d+)-(\d+)-(EST|INT|ENTRAMBI)-C(\d+)-(\d+)(?:-M(E|I))?(?:-G(\d+))?$/.exec((codice ?? "").trim());
  if (!m) return null;
  const x: Angolare = { forma: m[1] as Forma, a: +m[2], b: +m[3], c: +m[4], spessore: +m[5] / 10, bello: m[6], colore: +m[7], lunghezza: +m[8], pezzi, misura: m[9] === "I" ? "INT" : "EST" };
  if (x.forma === "PUNTA") x.angolo = m[10] ? +m[10] : 90;
  return x;
}

const inValori = (v: Record<string, string>, n: number, x: Angolare) => {
  Object.assign(v, {
    [`tab_ang_${n}_forma`]: x.forma, [`tab_ang_${n}_a`]: String(x.a), [`tab_ang_${n}_b`]: x.b ? String(x.b) : "", [`tab_ang_${n}_c`]: x.c ? String(x.c) : "",
    [`tab_ang_${n}_spessore`]: String(x.spessore), [`tab_ang_${n}_bello`]: x.bello, [`tab_ang_${n}_colore`]: String(x.colore),
    [`tab_ang_${n}_lunghezza`]: String(x.lunghezza), [`tab_ang_${n}_pezzi`]: String(x.pezzi),
    [`tab_ang_${n}_misura`]: x.misura === "INT" ? "INT" : "EST", ...(x.forma === "PUNTA" ? { [`tab_ang_${n}_angolo`]: String(x.angolo ?? 90) } : {}),
  });
};

/**
 * Modulo già compilato nell'ordine: gli angolari già salvati nelle righe dell'ordine, altrimenti quelli del materiale della pratica (anche dal rilevatore); se non ce ne sono, una proposta per ogni legno
 * (righe LEGNO-… dell'ordine e materiale della pratica aggiunto dal rilevatore): angolare a L spessore × larghezza del legno, stessa lunghezza
 * e stessi pezzi, 15/10, bello esterno, bianco. È solo una proposta: si corregge prima di salvare.
 */
export function valoriAngolari(righeOrdine: { codice: string | null; quantita: number }[], altriLegni: { codice: string | null; quantita: number }[] = []) {
  const v: Record<string, string> = {};
  const daCodici = (rr: { codice: string | null; quantita: number }[]) => rr.map((r) => leggiCodiceAngolare(r.codice, r.quantita)).filter((x): x is Angolare => !!x);
  // prima quelli salvati nell'ordine, poi quelli messi nel materiale della pratica (anche dal rilevatore)
  const salvati = daCodici(righeOrdine).length ? daCodici(righeOrdine) : daCodici(altriLegni);
  if (salvati.length) { salvati.slice(0, RIGHE_ANGOLARI).forEach((x, i) => inValori(v, i + 1, x)); return { valori: v, proposta: false }; }
  const perCodice = new Map<string, number>();
  for (const r of [...righeOrdine, ...altriLegni]) if (leggiCodiceLegno(r.codice)) perCodice.set(r.codice!, Math.max(perCodice.get(r.codice!) ?? 0, r.quantita));
  let n = 0;
  for (const [codice, pezzi] of perCodice) {
    const c = leggiCodiceLegno(codice)!;
    const s = sezioneDellaRiga(c.riga)!;
    if (++n > RIGHE_ANGOLARI) break;
    inValori(v, n, { forma: "L", a: s.spessore, b: s.larghezza, c: 0, spessore: 1.5, bello: "EST", colore: 0, lunghezza: c.lunghezza, pezzi });
  }
  return { valori: v, proposta: n > 0 };
}

export function riepilogoAngolari(v: Record<string, string>) {
  const righe = Array.from({ length: RIGHE_ANGOLARI }, (_, i) => angolareDellaRiga(v, i + 1)).map((x, i) => (x ? { n: i + 1, x, kg: kgBarra(x) * x.pezzi, costo: r2(costoBarra(x) * x.pezzi), vendita: r2(venditaBarra(x) * x.pezzi) } : null)).filter((r): r is NonNullable<typeof r> => !!r);
  return { righe, pezzi: righe.reduce((t, r) => t + r.x.pezzi, 0), kg: righe.reduce((t, r) => t + r.kg, 0), costo: r2(righe.reduce((t, r) => t + r.costo, 0)), vendita: r2(righe.reduce((t, r) => t + r.vendita, 0)) };
}

/** Righe d'ordine dal modulo: prezzo d'acquisto = costo di Il Mastro a barra. */
export const righeDaAngolari = (v: Record<string, string>) =>
  riepilogoAngolari(v).righe.map(({ x }) => ({ codice: codiceAngolare(x), descrizione: descrizioneAngolare(x), quantita: x.pezzi, prezzo: costoBarra(x) }));

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n2 = (n: number, d = 2) => n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" as unknown as boolean });

/** Tabella per il fornitore (segnaposto `{{riepilogo_angolari}}`): forme, misure, kg; niente prezzi (li fa lui a peso). */
export function htmlRiepilogoAngolari(v: Record<string, string>): string {
  const r = riepilogoAngolari(v);
  if (!r.righe.length) return "<p>Nessun angolare ordinato.</p>";
  const tr = r.righe.map(({ x, kg }) => `<tr><td>${esc(FORME[x.forma].nome)}</td><td>${misureLabel(x)}${x.forma === "PUNTA" && x.c ? " (risvolti)" : ""}</td><td>${x.misura === "INT" ? "interne" : "esterne"}</td><td>${spessoreLabel(x.spessore)}</td><td>${esc(BELLO[x.bello])}</td><td>${esc(COLORI_LATTONERIA[x.colore].nome)}</td><td class="num">${x.lunghezza}</td><td class="num">${x.pezzi}</td><td class="num">${sviluppo(x)}</td><td class="num">${n2(kg, 2)}</td></tr>`).join("");
  return `<table class="m"><thead><tr><th>Forma</th><th>Lati (mm)</th><th>Misure</th><th>Spessore</th><th>Bello</th><th>Colore</th><th>Lunghezza mm</th><th>Pezzi</th><th>Sviluppo mm</th><th>kg</th></tr></thead><tbody>${tr}<tr class="tot"><td colspan="7">Totale</td><td class="num">${r.pezzi}</td><td></td><td class="num">${n2(r.kg, 2)}</td></tr></tbody></table>`;
}

/** Disegno della legenda (forme e lati A, B, C) per il modulo e per la scheda. */
export const LEGENDA_SVG = `<svg viewBox="0 0 660 120" width="660" height="120" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="12">
<g stroke="#334155" stroke-width="4" fill="none"><path d="M20 20 V95 H95"/><path d="M150 20 V95 H230 V20"/><path d="M290 20 H335 V95 H380"/><path d="M430 60 H505"/><path d="M545 95 V80 L590 35 L635 80 V95"/></g>
<path d="M578 47 A 16 16 0 0 0 602 47" stroke="#b45309" stroke-width="1.5" fill="none"/>
<g fill="#b45309" font-weight="bold"><text x="5" y="60">A</text><text x="55" y="112">B</text><text x="135" y="60">A</text><text x="185" y="112">B</text><text x="236" y="60">C</text><text x="305" y="14">A</text><text x="341" y="60">B</text><text x="350" y="112">C</text><text x="462" y="52">A</text><text x="553" y="55">A</text><text x="618" y="55">B</text><text x="533" y="95">C</text><text x="640" y="95">C</text><text x="583" y="66" font-size="10">°</text></g>
<g fill="#111"><text x="20" y="12">L</text><text x="175" y="12">U</text><text x="350" y="12">Z</text><text x="450" y="80">Piatto</text><text x="550" y="14">Copertina a punta</text></g>
<text x="20" y="118" font-size="10" fill="#555"></text></svg>`;

const righeModulo = Array.from({ length: RIGHE_ANGOLARI }, (_, i) => {
  const n = i + 1;
  return `<tr><td class="n">${n}</td>${["forma", "a", "b", "c", "angolo", "misura", "spessore", "bello", "colore", "lunghezza", "pezzi"].map((c) => `<td>{{tab_ang_${n}_${c}}}</td>`).join("")}</tr>`;
}).join("");

/** Il modello salvato tiene le colonne della tabella (servono al modulo dell'ordine); nella scheda vanno la legenda e il riepilogo leggibile. */
export const MODELLO_ANGOLARI = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Ordine angolari in alluminio {{ordine}}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:22px}
 h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;margin:16px 0 6px;border-bottom:2px solid #475569;padding-bottom:2px}
 table{border-collapse:collapse} .m{width:100%} .m th,.m td{border:1px solid #999;padding:3px 6px;text-align:left} .m th{background:#eef2f6}
 .num{text-align:right} .tot td{font-weight:bold;background:#f5f7fa} .dati td{border:none;padding:2px 10px 2px 0} .box{border:1px solid #999;padding:6px;min-height:40px}
 .nascosta{display:none}
</style></head><body>
<h1>Ordine angolari in alluminio — ordine {{ordine}}</h1>
<table class="dati"><tr><td><b>Fornitore</b></td><td>{{fornitore}}</td><td><b>Data</b></td><td>{{data}}</td></tr>
<tr><td><b>Cliente / cantiere</b></td><td>{{cliente}}</td><td><b>Pratica</b></td><td>{{commessa}}</td></tr>
<tr><td><b>Consegna richiesta</b></td><td>{{consegna}}</td><td><b>Consegna a</b></td><td>{{indirizzo}}</td></tr></table>
<h2>Legenda dei lati</h2>
${LEGENDA_SVG}
<h2>Angolari da produrre (alluminio pressopiegato preverniciato)</h2>
{{riepilogo_angolari}}
<table class="nascosta"><tbody>${righeModulo}</tbody></table>
<h2>Note</h2>
<div class="box">{{note}}</div>
<p style="margin-top:20px">P&amp;C S.r.l. — Corso Moncenisio 28, Rosta (TO) — info@gruppopec.com — 011 19887497</p>
</body></html>
`;

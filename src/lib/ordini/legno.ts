// Modulo d'ordine «Legno piallato per vetrate» (richiesta di Ugo 20/11/2026): sezioni 30×50…30×170 e 50×50…50×170 mm, barre da 3000 mm.
// Il prezzo si fa sullo sviluppo (cubatura): m³ = spessore × larghezza × lunghezza; € = m³ × prezzo al m³. Modulo puro (test in tests/ordini/legno.test.ts).

export type SezioneLegno = { spessore: number; larghezza: number };

/** Le sezioni del modulo, nell'ordine delle righe (riga 1 = 30×50 … riga 26 = 50×170), passo 10 mm. */
export const SEZIONI_LEGNO: SezioneLegno[] = [30, 50].flatMap((spessore) => Array.from({ length: 13 }, (_, i) => ({ spessore, larghezza: 50 + i * 10 })));

export const LUNGHEZZA_STANDARD = 3000; // mm
/** Righe del modulo con le misure libere (oltre alle 26 sezioni fisse). */
export const RIGHE_LIBERE = 6;
/** Prezzo indicativo dell'abete piallato 4 lati (nov 2026: rivenditori ~800–900 €/m³ per listelli piallati; da confermare col fornitore). Solo per la stima in ONE, non va nella scheda. */
export const PREZZO_M3_INDICATIVO = 900;

export const nomeSezione = (s: SezioneLegno, lunghezza = LUNGHEZZA_STANDARD) => `${s.spessore} × ${s.larghezza} × ${lunghezza}`;

/** Sezione della riga (1…26) del modulo. */
export const sezioneDellaRiga = (riga: number): SezioneLegno | null => SEZIONI_LEGNO[riga - 1] ?? null;

const num = (v: string | undefined) => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".").trim()); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Volume di una barra in m³ (misure in mm). */
export const volumeBarra = (s: SezioneLegno, lunghezza = LUNGHEZZA_STANDARD) => (s.spessore * s.larghezza * lunghezza) / 1e9;

export type RigaRiepilogo = { riga: number; sezione: SezioneLegno; lunghezza: number; pezzi: number; metri: number; m3: number; prezzoBarra: number | null; totale: number | null };

/** Righe con pezzi > 0 e totali, dai valori del modulo (`tab_legno_<riga>_pezzi`, `tab_legno_<riga>_lunghezza`, `prezzo_m3`). */
export function riepilogoLegno(valori: Record<string, string>, prezzoM3?: number | null) {
  const p = prezzoM3 ?? (num(valori.prezzo_m3) || null);
  const righe: RigaRiepilogo[] = [];
  SEZIONI_LEGNO.forEach((sezione, i) => {
    const riga = i + 1;
    const pezzi = Math.round(num(valori[`tab_legno_${riga}_pezzi`]));
    if (!pezzi) return;
    const lunghezza = num(valori[`tab_legno_${riga}_lunghezza`]) || LUNGHEZZA_STANDARD;
    const m3 = volumeBarra(sezione, lunghezza) * pezzi;
    const prezzoBarra = p ? Math.round(volumeBarra(sezione, lunghezza) * p * 100) / 100 : null;
    righe.push({ riga, sezione, lunghezza, pezzi, metri: (lunghezza / 1000) * pezzi, m3, prezzoBarra, totale: prezzoBarra !== null ? Math.round(prezzoBarra * pezzi * 100) / 100 : null });
  });
  // misure libere (Ugo 20/11/2026): spessore, larghezza e lunghezza a piacere, stesso calcolo sullo sviluppo
  for (let n = 1; n <= RIGHE_LIBERE; n++) {
    const sezione = { spessore: Math.round(num(valori[`tab_legnol_${n}_spessore`])), larghezza: Math.round(num(valori[`tab_legnol_${n}_larghezza`])) };
    const pezzi = Math.round(num(valori[`tab_legnol_${n}_pezzi`]));
    if (!pezzi || !sezione.spessore || !sezione.larghezza) continue;
    const lunghezza = num(valori[`tab_legnol_${n}_lunghezza`]) || LUNGHEZZA_STANDARD;
    const m3 = volumeBarra(sezione, lunghezza) * pezzi;
    const prezzoBarra = p ? Math.round(volumeBarra(sezione, lunghezza) * p * 100) / 100 : null;
    righe.push({ riga: 100 + n, sezione, lunghezza, pezzi, metri: (lunghezza / 1000) * pezzi, m3, prezzoBarra, totale: prezzoBarra !== null ? Math.round(prezzoBarra * pezzi * 100) / 100 : null });
  }
  const pezzi = righe.reduce((t, r) => t + r.pezzi, 0);
  const metri = righe.reduce((t, r) => t + r.metri, 0);
  const m3 = righe.reduce((t, r) => t + r.m3, 0);
  const totale = p ? Math.round(righe.reduce((t, r) => t + (r.totale ?? 0), 0) * 100) / 100 : null;
  return { righe, pezzi, metri, m3, prezzoM3: p, totale };
}

const n2 = (n: number, dec = 2) => n.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" as unknown as boolean });

/** Tabella riassuntiva per la scheda (segnaposto `{{riepilogo_legno}}`): i prezzi compaiono solo se è scritto il prezzo concordato al m³. */
export function htmlRiepilogoLegno(valori: Record<string, string>): string {
  const r = riepilogoLegno(valori);
  if (!r.righe.length) return "<p>Nessuna misura ordinata.</p>";
  const conPrezzo = r.prezzoM3 !== null;
  const tr = r.righe.map((x) => `<tr><td>${nomeSezione(x.sezione, x.lunghezza)}</td><td class="num">${x.pezzi}</td><td class="num">${n2(x.metri, 1)}</td><td class="num">${n2(x.m3, 4)}</td>${conPrezzo ? `<td class="num">${n2(x.prezzoBarra!)}</td><td class="num">${n2(x.totale!)}</td>` : ""}</tr>`).join("");
  const tot = `<tr class="tot"><td>Totale</td><td class="num">${r.pezzi}</td><td class="num">${n2(r.metri, 1)}</td><td class="num">${n2(r.m3, 4)}</td>${conPrezzo ? `<td></td><td class="num">${n2(r.totale!)}</td>` : ""}</tr>`;
  return `<table class="m"><thead><tr><th>Sezione × lunghezza (mm)</th><th>Pezzi</th><th>Metri lineari</th><th>m³</th>${conPrezzo ? `<th>€ a barra (${n2(r.prezzoM3!)} €/m³)</th><th>Totale €</th>` : ""}</tr></thead><tbody>${tr}${tot}</tbody></table>`;
}

const righeModulo = SEZIONI_LEGNO.map((s, i) => `<tr><td class="n">${i + 1}</td><td>${s.spessore} × ${s.larghezza}</td><td>{{tab_legno_${i + 1}_pezzi}}</td><td>{{tab_legno_${i + 1}_lunghezza}}</td></tr>`).join("");

export const MODELLO_LEGNO = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Ordine legno piallato {{ordine}}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:22px}
 h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;margin:16px 0 6px;border-bottom:2px solid #92400e;padding-bottom:2px}
 table{border-collapse:collapse} .m{width:100%} .m th,.m td{border:1px solid #999;padding:3px 6px;text-align:left} .m th{background:#f3eee6}
 .n{color:#666;width:28px} .num{text-align:right} .tot td{font-weight:bold;background:#faf6ef} .opz{margin-right:12px;white-space:nowrap}
 .dati td{border:none;padding:2px 10px 2px 0} .colonne{display:flex;gap:16px} .colonne>div{flex:1} .box{border:1px solid #999;padding:6px;min-height:40px}
</style></head><body>
<h1>Ordine legno piallato per vetrate — ordine {{ordine}}</h1>
<table class="dati"><tr><td><b>Fornitore</b></td><td>{{fornitore}}</td><td><b>Data</b></td><td>{{data}}</td></tr>
<tr><td><b>Cliente / cantiere</b></td><td>{{cliente}}</td><td><b>Pratica</b></td><td>{{commessa}}</td></tr>
<tr><td><b>Consegna richiesta</b></td><td>{{consegna}}</td><td><b>Consegna a</b></td><td>{{indirizzo}}</td></tr></table>
<h2>Legno</h2>
<p><b>Essenza:</b> {{sc:essenza|Abete|Abete lamellare|Larice|Pino}}</p>
<p><b>Lavorazione:</b> {{sc:lavorazione|Piallato 4 lati|Piallato 4 lati con spigoli smussati|Piallato 4 lati con spigoli arrotondati}}</p>
<p><b>Qualità e trattamenti:</b> {{multi:trattamento|Essiccato (umidità 12% ±2)|Senza nodi cadenti|Impregnato|Grezzo da verniciare}}</p>
<h2>Misure (sezione in mm, lunghezza standard 3000 mm)</h2>
<div class="colonne"><div>
<table class="m"><thead><tr><th>#</th><th>Sezione</th><th>Pezzi</th><th>Lunghezza (mm)</th></tr></thead><tbody>${righeModulo}</tbody></table>
</div></div>
<h2>Riepilogo</h2>
<p><b>Prezzo concordato al m³ (facoltativo):</b> {{prezzo_m3}}</p>
{{riepilogo_legno}}
<h2>Note</h2>
<div class="box">{{note}}</div>
<p style="margin-top:20px">P&amp;C S.r.l. — Corso Moncenisio 28, Rosta (TO) — info@gruppopec.com — 011 19887497</p>
</body></html>
`;

// ── Collegamento con gli articoli e le righe dell'ordine (richiesta di Ugo 20/11/2026) ──
// Ogni sezione è un articolo «LEGNO-30X50-3000» (Articoli › Complementi vetrate › Legni piallati); nell'ordine le righe con questi codici
// riempiono il modulo, e «Salva il legno nell'ordine» le riscrive dal modulo con il prezzo a barra.

export const PREFISSO_LEGNO = "LEGNO-";
export const codiceLegno = (s: SezioneLegno, lunghezza = LUNGHEZZA_STANDARD) => `${PREFISSO_LEGNO}${s.spessore}X${s.larghezza}-${lunghezza}`;
export const descrizioneLegno = (s: SezioneLegno, lunghezza = LUNGHEZZA_STANDARD) => `Legno piallato ${s.spessore} × ${s.larghezza} × ${lunghezza} mm`;

/** Riga del modulo e lunghezza da un codice «LEGNO-30X50-3000» (null se non è un legno del modulo). */
export function leggiCodiceLegno(codice: string | null | undefined): { riga: number; lunghezza: number } | null {
  const m = /^LEGNO-(\d+)X(\d+)-(\d+)$/i.exec((codice ?? "").trim());
  if (!m) return null;
  const i = SEZIONI_LEGNO.findIndex((s) => s.spessore === Number(m[1]) && s.larghezza === Number(m[2]));
  return i < 0 ? null : { riga: i + 1, lunghezza: Number(m[3]) };
}

/** Qualsiasi legno «LEGNO-<spessore>X<larghezza>-<lunghezza>», anche su misura (null se il codice non è un legno). */
export function leggiLegnoLibero(codice: string | null | undefined): { sezione: SezioneLegno; lunghezza: number } | null {
  const m = /^LEGNO-(\d+)X(\d+)-(\d+)$/i.exec((codice ?? "").trim());
  if (!m || !+m[1] || !+m[2] || !+m[3]) return null;
  return { sezione: { spessore: +m[1], larghezza: +m[2] }, lunghezza: +m[3] };
}

/** Costo indicativo di una barra (sviluppo × €/m³) e vendita × 2, come gli articoli dei legni piallati. */
export const costoLegno = (s: SezioneLegno, lunghezza: number, prezzoM3 = PREZZO_M3_INDICATIVO) => Math.round(volumeBarra(s, lunghezza) * prezzoM3 * 100) / 100;
export const venditaLegno = (s: SezioneLegno, lunghezza: number) => Math.round(costoLegno(s, lunghezza) * 2 * 100) / 100;

/** Valori del modulo dalle righe dell'ordine: pezzi sommati per sezione, lunghezza dalla prima riga, prezzo al m³ ricavato dal prezzo a barra; le misure fuori dalle 26 sezioni vanno nelle righe libere. */
export function valoriDaRighe(righe: { codice: string | null; quantita: number; prezzoAcquisto?: number | null }[]): Record<string, string> {
  const v: Record<string, string> = {};
  let libere = 0;
  for (const r of righe) {
    const c = leggiCodiceLegno(r.codice);
    const lib = c ? null : leggiLegnoLibero(r.codice);
    if (lib && libere < RIGHE_LIBERE) {
      libere++;
      Object.assign(v, { [`tab_legnol_${libere}_spessore`]: String(lib.sezione.spessore), [`tab_legnol_${libere}_larghezza`]: String(lib.sezione.larghezza), [`tab_legnol_${libere}_lunghezza`]: String(lib.lunghezza), [`tab_legnol_${libere}_pezzi`]: String(r.quantita) });
      if (!v.prezzo_m3 && r.prezzoAcquisto) v.prezzo_m3 = String(Math.round(r.prezzoAcquisto / volumeBarra(lib.sezione, lib.lunghezza)));
      continue;
    }
    if (!c) continue;
    const k = `tab_legno_${c.riga}_pezzi`;
    v[k] = String((Number(v[k]) || 0) + r.quantita);
    v[`tab_legno_${c.riga}_lunghezza`] ??= String(c.lunghezza);
    if (!v.prezzo_m3 && r.prezzoAcquisto) v.prezzo_m3 = String(Math.round(r.prezzoAcquisto / volumeBarra(SEZIONI_LEGNO[c.riga - 1], c.lunghezza)));
  }
  return v;
}

/** Righe d'ordine da scrivere dal modulo: una per sezione con pezzi, prezzo a barra sullo sviluppo. */
export function righeDaValori(valori: Record<string, string>, prezzoM3: number) {
  return riepilogoLegno(valori, prezzoM3).righe.map((x) => ({
    codice: codiceLegno(x.sezione, x.lunghezza), descrizione: descrizioneLegno(x.sezione, x.lunghezza), quantita: x.pezzi, prezzo: x.prezzoBarra ?? 0,
  }));
}

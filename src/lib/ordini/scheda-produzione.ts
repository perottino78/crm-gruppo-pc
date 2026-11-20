// Schede di produzione in HTML per il fornitore (misure definitive): segnaposto, campi da compilare e compilazione. Logica pura, testata.
import { htmlRiepilogoLegno, MODELLO_LEGNO } from "./legno";

/** Segnaposto che riempie il CRM da solo. */
export const SEGNAPOSTO_FISSI: Record<string, string> = {
  ordine: "numero dell'ordine", data: "data dell'ordine", fornitore: "ragione sociale del fornitore", cliente: "cliente finale",
  commessa: "numero della pratica", indirizzo: "indirizzo di consegna", consegna: "consegna richiesta",
  righe: "tabella delle righe d'ordine (senza prezzi)", misure_rilievo: "misure e note del rilievo",
  riepilogo_legno: "riepilogo del modulo legno (pezzi, metri, m³ e, se scritto, prezzo al m³)",
};

export const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const RE_SCELTA = /\{\{\s*(sc|multi):([a-zA-Z0-9_àèéìòù]+)\|([^}]+?)\s*\}\}/g;
const RE_CAMPO = /\{\{\s*([a-zA-Z0-9_àèéìòù]+)\s*\}\}/g;

export type DescrizioneCampo = { nome: string; tipo: "testo" | "scelta" | "multi"; opzioni: string[] };

/** Tutti i campi del modello nell'ordine in cui compaiono: testo libero `{{nome}}`, scelta singola `{{sc:nome|A|B|C}}` (☒ ☐ nella scheda) e scelta multipla `{{multi:nome|A|B|C}}`. */
export function descriviCampi(html: string): DescrizioneCampo[] {
  const trovati: { pos: number; d: DescrizioneCampo }[] = [];
  for (const m of html.matchAll(RE_SCELTA)) trovati.push({ pos: m.index ?? 0, d: { nome: m[2], tipo: m[1] === "sc" ? "scelta" : "multi", opzioni: m[3].split("|").map((x) => x.trim()).filter(Boolean) } });
  for (const m of html.matchAll(RE_CAMPO)) if (!(m[1] in SEGNAPOSTO_FISSI)) trovati.push({ pos: m.index ?? 0, d: { nome: m[1], tipo: "testo", opzioni: [] } });
  const visti = new Set<string>();
  return trovati.sort((a, b) => a.pos - b.pos).map((t) => t.d).filter((d) => (visti.has(d.nome) ? false : (visti.add(d.nome), true)));
}

/** I campi del modello che il CRM non riempie da solo (solo i nomi, in ordine, senza doppioni). */
export const campiDaCompilare = (html: string): string[] => descriviCampi(html).map((d) => d.nome);

export const nomeCampo = (c: string) => c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());

/** Sostituisce i segnaposto. I valori testuali sono protetti (HTML escape, a capo conservati); `righe` è già HTML.
 *  Le scelte diventano caselle: la voce scelta ☒, le altre ☐ (per le multiple i valori scelti sono separati da «|»). */
export function compilaScheda(html: string, valori: Record<string, string>, righeHtml: string): string {
  const conScelte = html.replace(RE_SCELTA, (_m, tipo: string, nome: string, opz: string) => {
    const scelti = tipo === "multi" ? (valori[nome] ?? "").split("|").map((x) => x.trim()).filter(Boolean) : [(valori[nome] ?? "").trim()];
    return opz.split("|").map((o) => o.trim()).filter(Boolean).map((o) => `<span class="opz">${scelti.includes(o) ? "&#9746;" : "&#9744;"} ${esc(o)}</span>`).join(" ");
  });
  return conScelte.replace(RE_CAMPO, (_m, k: string) => {
    if (k === "righe") return righeHtml;
    if (k === "riepilogo_legno") return htmlRiepilogoLegno(valori);
    const v = valori[k] ?? "";
    return esc(v).replace(/\n/g, "<br>");
  });
}

export function tabellaRighe(righe: { descrizione: string; quantita: number; um?: string | null; codice?: string | null; note?: string | null }[]): string {
  if (!righe.length) return "<p>Nessuna riga.</p>";
  const tr = righe.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.codice ?? "")}</td><td>${esc(r.descrizione)}${r.note ? `<br><small>${esc(r.note)}</small>` : ""}</td><td style="text-align:right">${esc(String(r.quantita).replace(".", ","))} ${esc(r.um ?? "")}</td></tr>`).join("");
  return `<table class="righe"><thead><tr><th>#</th><th>Codice</th><th>Descrizione</th><th>Q.tà</th></tr></thead><tbody>${tr}</tbody></table>`;
}

/** Modello di partenza: si modifica dall'editor (Ordini fornitori › Schede di produzione). */
export const MODELLO_PREDEFINITO = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Scheda di produzione {{ordine}}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;margin:24px}
 h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #1d4ed8;padding-bottom:2px}
 table{border-collapse:collapse;width:100%} th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top} th{background:#eee}
 .dati td{border:none;padding:2px 8px 2px 0}.box{border:1px solid #999;padding:8px;min-height:60px}
</style></head><body>
<h1>Scheda di produzione — ordine {{ordine}}</h1>
<table class="dati"><tr><td><b>Fornitore</b></td><td>{{fornitore}}</td><td><b>Data</b></td><td>{{data}}</td></tr>
<tr><td><b>Cliente finale</b></td><td>{{cliente}}</td><td><b>Pratica</b></td><td>{{commessa}}</td></tr>
<tr><td><b>Consegna richiesta</b></td><td>{{consegna}}</td><td><b>Consegna a</b></td><td>{{indirizzo}}</td></tr></table>
<h2>Materiale ordinato</h2>
{{righe}}
<h2>Misure definitive per la produzione</h2>
<div class="box">{{misure_definitive}}</div>
<h2>Colori, finiture e note di produzione</h2>
<div class="box">{{note_produzione}}</div>
<h2>Misure rilevate in cantiere (riferimento)</h2>
<div class="box">{{misure_rilievo}}</div>
<p style="margin-top:24px">P&amp;C S.r.l. — Corso Moncenisio 28, Rosta (TO) — info@gruppopec.com — 011 19887497</p>
</body></html>
`;

/** Campi a tabella: `tab_<gruppo>_<riga>_<colonna>` (es. tab_dimensioni_1_L). Nell'ordine si compilano come una piccola tabella per gruppo, una riga per ogni elemento. */
export function raggruppaCampi(campi: string[]) {
  const singoli: string[] = [];
  const mappa = new Map<string, { righe: Set<number>; colonne: string[] }>();
  for (const c of campi) {
    const m = /^tab_([A-Za-z0-9]+)_(\d+)_(.+)$/.exec(c);
    if (!m) { singoli.push(c); continue; }
    const g = mappa.get(m[1]) ?? { righe: new Set<number>(), colonne: [] };
    g.righe.add(Number(m[2]));
    if (!g.colonne.includes(m[3])) g.colonne.push(m[3]);
    mappa.set(m[1], g);
  }
  return { singoli, tabelle: [...mappa.entries()].map(([gruppo, g]) => ({ gruppo, righe: [...g.righe].sort((a, b) => a - b), colonne: g.colonne })) };
}

export const MODELLO_LIPARI = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Modulo d'ordine NEW LIPARI {{ordine}}</title>
<style>
 @page{size:A4 landscape;margin:8mm}
 body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#111;margin:14px}
 h1{font-size:20px;margin:0}.sotto{color:#666;font-style:italic;margin:0 0 6px}
 h2{font-size:11px;margin:10px 0 3px;background:#e5e5e5;padding:3px 6px;text-transform:uppercase}
 table.m{border-collapse:collapse;width:100%}table.m th,table.m td{border:1px solid #888;padding:3px 4px;text-align:center;height:22px}
 table.m th{background:#f3f3f3;font-size:9px}td.n{background:#f3f3f3;font-style:italic;width:18px}
 .testa{display:flex;justify-content:space-between;align-items:flex-start}.dati td{border:none;padding:1px 8px 1px 0;text-align:left}
 .sotto2{display:flex;gap:14px;margin-top:10px;align-items:flex-start}.sotto2>div{flex:1}
 .box{border:1px solid #888;padding:8px;min-height:70px}.leg{font-size:9px;margin-top:6px}.att{color:#b91c1c;font-size:9px;margin:4px 0}
</style></head><body>
<div class="testa"><div><h1>MODULO D'ORDINE</h1><p class="sotto">NEW LIPARI</p></div>
<table class="dati"><tr><td><b>Cliente</b></td><td>{{cliente}}</td></tr><tr><td><b>Rif. ordine</b></td><td>{{ordine}} — pratica {{commessa}}</td></tr><tr><td><b>Data</b></td><td>{{data}}</td></tr><tr><td><b>Fornitore</b></td><td>{{fornitore}}</td></tr></table></div>
<table class="m"><thead><tr><th rowspan="2">#</th><th colspan="1" rowspan="2">Q.TÀ</th><th colspan="3">INSTALLAZIONE STRUTTURA</th><th colspan="4">DIMENSIONI (mm)</th><th colspan="8">H PIANTONI (mm)</th><th colspan="3">COLORE</th><th colspan="2">MOTORE (vista frontale)</th><th colspan="2">TELO ASSEMBLATO**</th><th colspan="3">OPTIONAL</th></tr><tr><th>Parete</th><th>Isola</th><th>Patio</th><th>L</th><th>S</th><th>H (escl. tettuccio)</th><th>H1</th><th>A</th><th>B</th><th>C</th><th>D</th><th>A1</th><th>B1</th><th>C1</th><th>D1</th><th>Struttura</th><th>Tessuto</th><th>Ovalini</th><th>DX</th><th>SX</th><th>SI</th><th>NO</th><th>SV</th><th>SP</th><th>TT</th></tr></thead><tbody><tr><td class="n">1</td><td>{{tab_qta_1_qta}}</td><td>{{tab_installazione_1_parete}}</td><td>{{tab_installazione_1_isola}}</td><td>{{tab_installazione_1_patio}}</td><td>{{tab_dimensioni_1_L}}</td><td>{{tab_dimensioni_1_S}}</td><td>{{tab_dimensioni_1_H}}</td><td>{{tab_dimensioni_1_H1}}</td><td>{{tab_piantoni_1_A}}</td><td>{{tab_piantoni_1_B}}</td><td>{{tab_piantoni_1_C}}</td><td>{{tab_piantoni_1_D}}</td><td>{{tab_piantoni_1_A1}}</td><td>{{tab_piantoni_1_B1}}</td><td>{{tab_piantoni_1_C1}}</td><td>{{tab_piantoni_1_D1}}</td><td>{{tab_colore_1_struttura}}</td><td>{{tab_colore_1_tessuto}}</td><td>{{tab_colore_1_ovalini}}</td><td>{{tab_motore_1_DX}}</td><td>{{tab_motore_1_SX}}</td><td>{{tab_telo_1_SI}}</td><td>{{tab_telo_1_NO}}</td><td>{{tab_optional_1_SV}}</td><td>{{tab_optional_1_SP}}</td><td>{{tab_optional_1_TT}}</td></tr><tr><td class="n">2</td><td>{{tab_qta_2_qta}}</td><td>{{tab_installazione_2_parete}}</td><td>{{tab_installazione_2_isola}}</td><td>{{tab_installazione_2_patio}}</td><td>{{tab_dimensioni_2_L}}</td><td>{{tab_dimensioni_2_S}}</td><td>{{tab_dimensioni_2_H}}</td><td>{{tab_dimensioni_2_H1}}</td><td>{{tab_piantoni_2_A}}</td><td>{{tab_piantoni_2_B}}</td><td>{{tab_piantoni_2_C}}</td><td>{{tab_piantoni_2_D}}</td><td>{{tab_piantoni_2_A1}}</td><td>{{tab_piantoni_2_B1}}</td><td>{{tab_piantoni_2_C1}}</td><td>{{tab_piantoni_2_D1}}</td><td>{{tab_colore_2_struttura}}</td><td>{{tab_colore_2_tessuto}}</td><td>{{tab_colore_2_ovalini}}</td><td>{{tab_motore_2_DX}}</td><td>{{tab_motore_2_SX}}</td><td>{{tab_telo_2_SI}}</td><td>{{tab_telo_2_NO}}</td><td>{{tab_optional_2_SV}}</td><td>{{tab_optional_2_SP}}</td><td>{{tab_optional_2_TT}}</td></tr><tr><td class="n">3</td><td>{{tab_qta_3_qta}}</td><td>{{tab_installazione_3_parete}}</td><td>{{tab_installazione_3_isola}}</td><td>{{tab_installazione_3_patio}}</td><td>{{tab_dimensioni_3_L}}</td><td>{{tab_dimensioni_3_S}}</td><td>{{tab_dimensioni_3_H}}</td><td>{{tab_dimensioni_3_H1}}</td><td>{{tab_piantoni_3_A}}</td><td>{{tab_piantoni_3_B}}</td><td>{{tab_piantoni_3_C}}</td><td>{{tab_piantoni_3_D}}</td><td>{{tab_piantoni_3_A1}}</td><td>{{tab_piantoni_3_B1}}</td><td>{{tab_piantoni_3_C1}}</td><td>{{tab_piantoni_3_D1}}</td><td>{{tab_colore_3_struttura}}</td><td>{{tab_colore_3_tessuto}}</td><td>{{tab_colore_3_ovalini}}</td><td>{{tab_motore_3_DX}}</td><td>{{tab_motore_3_SX}}</td><td>{{tab_telo_3_SI}}</td><td>{{tab_telo_3_NO}}</td><td>{{tab_optional_3_SV}}</td><td>{{tab_optional_3_SP}}</td><td>{{tab_optional_3_TT}}</td></tr></tbody></table>
<p class="att">*NB: specificare le dimensioni L1/L2/L3 nel caso abbiano valori diversi tra loro: {{misure_parziali_L1_L2_L3}}</p>
<div class="sotto2"><div><table class="m"><thead><tr><th colspan="8">TRAVERSI AGGIUNTIVI</th></tr><tr><th>#</th><th>S1</th><th>S2</th><th>S3</th><th>S4</th><th>T1</th><th>T2</th><th>T3</th></tr></thead><tbody><tr><td class="n">1</td><td>{{tab_traversi_1_S1}}</td><td>{{tab_traversi_1_S2}}</td><td>{{tab_traversi_1_S3}}</td><td>{{tab_traversi_1_S4}}</td><td>{{tab_traversi_1_T1}}</td><td>{{tab_traversi_1_T2}}</td><td>{{tab_traversi_1_T3}}</td></tr><tr><td class="n">2</td><td>{{tab_traversi_2_S1}}</td><td>{{tab_traversi_2_S2}}</td><td>{{tab_traversi_2_S3}}</td><td>{{tab_traversi_2_S4}}</td><td>{{tab_traversi_2_T1}}</td><td>{{tab_traversi_2_T2}}</td><td>{{tab_traversi_2_T3}}</td></tr><tr><td class="n">3</td><td>{{tab_traversi_3_S1}}</td><td>{{tab_traversi_3_S2}}</td><td>{{tab_traversi_3_S3}}</td><td>{{tab_traversi_3_S4}}</td><td>{{tab_traversi_3_T1}}</td><td>{{tab_traversi_3_T2}}</td><td>{{tab_traversi_3_T3}}</td></tr></tbody></table></div><div><table class="m"><thead><tr><th colspan="5">ILLUMINAZIONE — SIRIO</th></tr><tr><th>#</th><th>N° faretti</th><th>Stripe led (X)</th><th>N° ovalina</th><th>Ovalina led (X)</th></tr></thead><tbody><tr><td class="n">1</td><td>{{tab_illuminazione_1_faretti}}</td><td>{{tab_illuminazione_1_strip}}</td><td>{{tab_illuminazione_1_ovalina}}</td><td>{{tab_illuminazione_1_ovalinaled}}</td></tr><tr><td class="n">2</td><td>{{tab_illuminazione_2_faretti}}</td><td>{{tab_illuminazione_2_strip}}</td><td>{{tab_illuminazione_2_ovalina}}</td><td>{{tab_illuminazione_2_ovalinaled}}</td></tr><tr><td class="n">3</td><td>{{tab_illuminazione_3_faretti}}</td><td>{{tab_illuminazione_3_strip}}</td><td>{{tab_illuminazione_3_ovalina}}</td><td>{{tab_illuminazione_3_ovalinaled}}</td></tr></tbody></table></div></div>
<h2>Materiale ordinato</h2>
{{righe}}
<h2>Note</h2><div class="box">{{note_produzione}}</div>
<p class="leg"><b>Legenda optional:</b> SV = sensore vento · SP = sensore pioggia · TT = tettuccio. <b>**Attenzione:</b> il telo viene fornito assemblato solo fino ad una larghezza di 500 cm; per larghezze superiori (fino a un massimo di 700 cm) verrà applicata una maggiorazione del +5 %.</p>
<p class="leg">P&amp;C S.r.l. — Corso Moncenisio 28, Rosta (TO) — info@gruppopec.com — 011 19887497</p>
</body></html>
`;

export const MODELLO_SEEGLASS = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Modulo d'ordine SEEGLASS RUN {{ordine}}</title>
<style>
 @page{size:A4;margin:10mm}
 body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:16px}
 h1{font-size:20px;margin:0}.sotto{color:#555;margin:0 0 8px}
 h2{font-size:12px;margin:12px 0 3px;background:#e5e5e5;padding:3px 6px;text-transform:uppercase}
 table.f{border-collapse:collapse;width:100%}table.f th{width:30%;text-align:left;background:#f6f6f6;font-weight:600}
 table.f th,table.f td{border:1px solid #999;padding:4px 6px;vertical-align:top}
 .opz{display:inline-block;margin-right:12px;white-space:nowrap;font-size:11px}
 .testa{display:flex;justify-content:space-between;align-items:flex-start}.dati td{border:none;padding:1px 8px 1px 0}
 .box{border:1px solid #999;padding:8px;min-height:60px}.firma{margin-top:18px;display:flex;justify-content:space-between}.firma div{border-top:1px solid #444;width:45%;padding-top:3px;font-size:10px}
</style></head><body>
<div class="testa"><div><h1>MODULO D'ORDINE · SEEGLASS RUN</h1><p class="sotto">Vetrata scorrevole Scintilla — fornitore C3 Systems</p>{{sc:tipo_documento|Ordine|Preventivo}}</div>
<table class="dati"><tr><td><b>Data</b></td><td>{{data}}</td></tr><tr><td><b>Nome</b></td><td>{{cliente}}</td></tr><tr><td><b>Città / Paese</b></td><td>{{citta}}</td></tr><tr><td><b>Riferimento</b></td><td>{{ordine}} — pratica {{commessa}}</td></tr><tr><td><b>Indirizzo di consegna</b></td><td>{{indirizzo}}</td></tr></table></div>
<h2>Misure della vetrata</h2><table class="f"><tr><th>Larghezza (L) mm</th><td>{{larghezza_mm}}</td></tr><tr><th>Altezza (H) mm</th><td>{{altezza_mm}}</td></tr><tr><th>Le misure sono</th><td>{{sc:misure_riferite|Interne|Esterne|Totali}}<br><small>Misure totali o pubblicate, inclusi i profili superiori e inferiori (eccetto il profilo incassato).</small></td></tr></table><h2>Tipo di vetro e finiture</h2><table class="f"><tr><th>Vetro</th><td>{{sc:tipo_vetro|Completo (con vetro)|Semi-lavorato (senza vetro)}}</td></tr><tr><th>Spessore</th><td>{{sc:spessore|8 mm|10 mm}}</td></tr><tr><th>Finitura</th><td>{{sc:finitura_vetro|Trasparente|Altri}} {{vetro_altri}}</td></tr></table><h2>Ante, vie e profilo</h2><table class="f"><tr><th>N° ante</th><td>{{sc:n_ante|Lo decide il produttore|Desidero specificare}} {{n_ante_num}}</td></tr><tr><th>Numero di vie</th><td>{{sc:n_vie|3 vie|4 vie|5 vie|6 vie}}</td></tr><tr><th>Profilo inferiore</th><td>{{sc:profilo_inferiore|In superficie|Incassato}} &nbsp; misura luce: {{luce_incassato}}</td></tr><tr><th>Posizionamento delle ante sul profilo</th><td>{{sc:posizione_ante|Sinistra|Centrale|Destra}}<br><small>Vista interna della vetrata.</small></td></tr></table><h2>Colori e guarnizioni</h2><table class="f"><tr><th>Colore profili alluminio</th><td>{{sc:colore_profili|Bianco|RAL / Altri}}</td></tr><tr><th>RAL / Altri: profilo superiore · inferiore · anta · laterale</th><td>{{ral_superiore}} · {{ral_inferiore}} · {{ral_anta}} · {{ral_laterale}}</td></tr><tr><th>Tipi di guarnizioni</th><td>{{sc:guarnizioni|Trasparente PLUS|Alluminio decorativo nero|Alluminio decorativo colore della vetrata}}</td></tr><tr><th>Colore tappi</th><td>{{sc:colore_tappi|Bianco|Nero|Grigio|Cromo opaco}}</td></tr><tr><th>Decorazione stile industriale</th><td>{{sc:stile_industriale|No|Sì}} &nbsp; {{sc:spazzolino|Con spazzolino|Senza spazzolino}} &nbsp; {{sc:colore_decor|Nero}}</td></tr></table><h2>Maniglia e azionamento · sistemi di chiusura / apertura</h2><table class="f"><tr><th>Sistemi scelti</th><td>{{multi:chiusura|Auto-blocco|Serratura CD-6|Serratura CD-4|Maniglia e azionamento|Pomo fisso Seeglass|Tirante anello|Chiusura inferiore}}</td></tr><tr><th>Finitura maniglie e serrature</th><td>{{sc:finitura_chiusura|Cromo opaco|Nero opaco|Cromo lucido}}</td></tr><tr><th>Chiusura inferiore</th><td>{{sc:chiusura_inferiore|Semplice (interno)|Doppia (interno ed esterno)}}</td></tr><tr><th>Altezza degli azionamenti</th><td>{{sc:altezza_azionamenti|Lo decide il fabbricante|Altezza indicata}} {{altezza_azionamenti_mm}} mm<br><small>Non inferiore a 265 mm. Se gli azionamenti di sezioni diverse devono essere allineati alla stessa altezza va indicato espressamente.</small></td></tr></table><h2>Produzione e trasporto</h2><table class="f"><tr><th>Profili</th><td>{{multi:non_tagliare|Non tagliare i profili}}<br><small>Il trasporto di sistemi oltre 1.850 mm comporta un supplemento nel costo totale.</small></td></tr><tr><th>Trasporto</th><td>{{sc:trasporto|Trasporto C3 Systems|Trasporto cliente|Con nostri mezzi (senza agenzia)}}</td></tr></table><h2>Materiale ordinato</h2>
{{righe}}
<h2>Note per la produzione</h2><div class="box">{{note_produzione}}</div>
<div class="firma"><div>Firma e timbro</div><div>P&amp;C S.r.l. — Corso Moncenisio 28, Rosta (TO) — info@gruppopec.com — 011 19887497</div></div>
</body></html>
`;

/** Modelli già pronti, da cui partire dall'editor. */
export const MODELLI_PRONTI: { chiave: string; nome: string; descrizione: string; html: string }[] = [
  { chiave: "standard", nome: "Scheda di produzione standard", descrizione: "Dati dell'ordine, materiale, misure definitive e note.", html: MODELLO_PREDEFINITO },
  { chiave: "lipari", nome: "Modulo d'ordine NEW LIPARI (pergola Lucilla)", descrizione: "Come il modulo del fornitore: installazione, dimensioni, piantoni, colore, motore, optional, traversi e illuminazione, una riga per pergola.", html: MODELLO_LIPARI },
  { chiave: "legno", nome: "Ordine legno piallato per vetrate (30×50…50×170 × 3000)", descrizione: "Tutte le sezioni da 30×50 a 30×170 e da 50×50 a 50×170 mm: pezzi e lunghezza per misura, essenza e lavorazione; nella scheda il riepilogo con metri, m³ e, se scritto, il prezzo concordato al m³.", html: MODELLO_LEGNO },
  { chiave: "seeglass", nome: "Modulo d'ordine SEEGLASS RUN (vetrata scorrevole Scintilla)", descrizione: "Come il modulo di C3 Systems: misure, vetro, ante e vie, profilo, colori, guarnizioni, chiusure, altezza azionamenti e trasporto, con le caselle ☒ ☐.", html: MODELLO_SEEGLASS },
];

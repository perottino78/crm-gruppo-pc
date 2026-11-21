// Modulo d'ordine «Serramenti P.V.C.» (richiesta di Ugo 21/11/2026, dal modulo cartaceo di P&C): intestazione, tipologia vetro,
// colore maniglie, fori, una riga per ogni finestra (misure, apertura, rifilo alletta, celino, cassonetto, colori, vetro STC),
// coprifili disponibili e note. Costanti e modello HTML: logica pura, testata in tests/ordini/serramenti.test.ts.

/** Numero di finestre che il modulo può contenere (come righe `tab_fin_<n>_…`). */
export const N_FINESTRE = 12;

export const VETRI = ["DI SERIE 4/16/4BE 32db", "44.2/16/4BE 39db", "44.2/16/44.2 44db"];
export const MANIGLIE = ["BRONZO", "OTTONE SAT.", "ARGENTO SAT"];
export const FORI = ["AEREAZIONE 160,5", "PASSAGATTO 225 MM", "PASSACANE"];

/** Codici apertura del modulo (vista interna), nell'ordine del disegno. */
export const APERTURE: { gruppo: string; codici: string[] }[] = [
  { gruppo: "Battente", codici: ["1S", "1D", "2S", "2D", "3SD1", "3SD2", "3SS", "3DD", "4DD", "4SS", "4SDD", "4SSD", "W1"] },
  { gruppo: "Traslante", codici: ["T2SX", "T2DX", "T4SX", "T4DX"] },
  { gruppo: "Alzante", codici: ["A2SX", "A2DX", "A4SX", "A4DX"] },
];
export const TUTTI_CODICI_APERTURA = APERTURE.flatMap((g) => g.codici);

/** Colonne di ogni finestra: nome del campo (`tab_fin_<n>_<nome>`) ed etichetta. */
export const COLONNE_FINESTRA: { nome: string; etichetta: string }[] = [
  { nome: "pos", etichetta: "FIN / P.FIN" }, { nome: "stanza", etichetta: "Stanza" }, { nome: "qta", etichetta: "Q.tà" },
  { nome: "L", etichetta: "Larghezza L" }, { nome: "H", etichetta: "Altezza H" }, { nome: "telaio", etichetta: "Telaio L - Z" },
  { nome: "apertura", etichetta: "Cod. apertura (vista interna)" }, { nome: "traverso", etichetta: "H traverso centrale" },
  { nome: "rdx", etichetta: "Rifilo alletta dx" }, { nome: "rsx", etichetta: "Rifilo alletta sx" }, { nome: "rsup", etichetta: "Rifilo alletta sup" }, { nome: "rinf", etichetta: "Rifilo alletta inf" },
  { nome: "celL", etichetta: "Celino larg." }, { nome: "celP", etichetta: "Celino prof." }, { nome: "celC", etichetta: "Celino colore" },
  { nome: "casL", etichetta: "Cassonetto largh." }, { nome: "casH", etichetta: "Cassonetto altezza" }, { nome: "casP1", etichetta: "Cassonetto prof. 1" }, { nome: "casP2", etichetta: "Cassonetto prof. 2" }, { nome: "casC", etichetta: "Cassonetto colore" },
  { nome: "cint", etichetta: "Colore interno" }, { nome: "cext", etichetta: "Colore esterno" }, { nome: "stc", etichetta: "Vetro STC" }, { nome: "nota", etichetta: "Note" },
];

/** Coprifili disponibili: ogni riga ha numero di pezzi (`tab_cop_<n>_qta`) e colore (`tab_cop_<n>_col`). */
export const COPRIFILI = ["Piatto 50x2", "Piatto 30x2", "Piatto 70x2", "Piatto 150x2", "Ang 40x20x2", "Ang 60x40x2"];

const SITO = (typeof process !== "undefined" && process.env?.APP_URL) || "https://crm-gruppo-pc.vercel.app";
export const IMG_CODICI_APERTURA = `${SITO}/immagini/serramenti/codici-apertura.png`;
export const IMG_CASSONETTO_CELINO = `${SITO}/immagini/serramenti/cassonetto-celino.png`;
export const IMG_LOGO = `${SITO}/immagini/brand/pc_logo.png`;

const campo = (n: number, c: string) => `{{tab_fin_${n}_${c}}}`;

function corpoFinestra(n: number): string {
  const c = (x: string) => campo(n, x);
  return `<tbody data-vuoto="auto"><tr class="r1"><td>${c("pos")}</td><td>${c("stanza")}</td><td>${c("qta")}</td><td class="l">${c("L")}</td><td class="x">x</td><td class="l">${c("H")}</td><td>${c("telaio")}</td><td>${c("apertura")}</td><td>${c("traverso")}</td><td>${c("rdx")}</td><td>${c("rsx")}</td><td>${c("rsup")}</td><td>${c("rinf")}</td><td>${c("celL")}</td><td>${c("celP")}</td><td>${c("celC")}</td><td>${c("casL")}</td><td>${c("casH")}</td><td>${c("casP1")}</td><td>${c("casP2")}</td><td>${c("casC")}</td></tr>`
    + `<tr class="r2"><td colspan="3"></td><td colspan="3"><b>col int</b> ${c("cint")} &nbsp; <b>col ext</b> ${c("cext")}</td><td colspan="3">VETRO STC {{multi:tab_fin_${n}_stc|STC}}</td><td colspan="12"><b>NOTE</b> ${c("nota")}</td></tr></tbody>`;
}

function righeCoprifili(): string {
  return COPRIFILI.map((nome, i) => `<tr><td>${nome} n°</td><td>{{tab_cop_${i + 1}_qta}}</td><td>col:</td><td>{{tab_cop_${i + 1}_col}}</td></tr>`).join("");
}

/** Il modello HTML completo (si modifica dall'editor dei moduli: Ordini fornitori › Moduli di rilievo). */
export function modelloSerramenti(): string {
  const finestre = Array.from({ length: N_FINESTRE }, (_, i) => corpoFinestra(i + 1)).join("\n");
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Modulo serramenti PVC — ordine {{ordine}}</title>
<style>
 @page{size:A4 landscape;margin:10mm}
 body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:14px}
 table{border-collapse:collapse;width:100%}
 th,td{border:1px solid #888;padding:3px 4px;text-align:center;vertical-align:middle}
 th{background:#eee;font-size:10px}
 .testa td{text-align:left;font-size:12px;padding:5px 7px}
 .testa .titolo{font-size:18px;font-weight:bold;text-align:center}
 .opz{white-space:nowrap;margin-right:8px;font-size:11px}
 .logo img{height:62px}
 .r1 td{height:22px} .r1 .x{width:10px;border-left:none;border-right:none;padding:0} .r1 .l{border-right:none}
 .r2 td{text-align:left;font-size:10px;height:20px}
 tbody{page-break-inside:avoid}
 .sotto{display:flex;gap:14px;margin-top:10px;align-items:flex-start} .sotto > div{flex:1}
 .sotto table td{text-align:left;border:none;border-bottom:1px solid #bbb}
 .note{border:1px solid #888;min-height:70px;padding:6px;white-space:pre-wrap}
 h3{margin:8px 0 3px;font-size:12px;border-bottom:2px solid #e5642a}
 img.leg{width:100%;max-width:520px}
 .firma{margin-top:10px;font-size:10px;color:#555}
</style></head><body>
<table class="testa"><tr>
<td rowspan="5" class="logo" style="width:90px;text-align:center"><img src="${IMG_LOGO}" alt="P&amp;C"></td>
<td colspan="3" class="titolo">MODULO SERRAMENTI P.V.C.</td><td style="text-align:center">RESPONSABILE ORDINE<br><b>{{responsabile_ordine}}</b></td></tr>
<tr><td>DESTINAZIONE MERCE: <b>{{indirizzo}}</b></td><td colspan="2" style="text-align:center"><b>TIPOLOGIA VETRO</b></td><td style="text-align:center"><b>COLORE MANIGLIE</b></td></tr>
<tr><td>DATA RILIEVO: <b>{{data_rilievo}}</b></td><td colspan="2" rowspan="3">{{sc:tipologia_vetro|${VETRI.join("|")}}}</td><td rowspan="3">{{sc:colore_maniglie|${MANIGLIE.join("|")}}}<br><br><b>FORO</b><br>{{multi:foro|${FORI.join("|")}}}</td></tr>
<tr><td>RIFERIMENTO: <b>{{cliente}}</b> — ordine {{ordine}}, pratica {{commessa}}</td></tr>
<tr><td>RILIEVO ESEGUITO DA: <b>{{rilievo_eseguito_da}}</b></td></tr>
</table>
<div style="height:6px"></div>
<table>
<thead><tr><th rowspan="2">FIN<br>P.FIN</th><th rowspan="2">Stanza</th><th rowspan="2">Q.tà</th><th colspan="3">Larghezza L &nbsp;x&nbsp; Altezza H</th><th rowspan="2">Telaio<br>L - Z</th><th rowspan="2">Cod. apertura<br>vista interna</th><th rowspan="2">H traverso<br>centrale</th><th colspan="4">Rifilo alletta</th><th colspan="3">Celino</th><th colspan="5">Cassonetto PVC</th></tr>
<tr><th>L</th><th></th><th>H</th><th>dx</th><th>sx</th><th>sup</th><th>inf</th><th>Larg.</th><th>Prof.</th><th>Colore</th><th>Largh.</th><th>Altezza</th><th>Prof.1</th><th>Prof.2</th><th>Colore</th></tr></thead>
${finestre}
</table>
<div class="sotto">
<div><h3>COPRIFILI DISPONIBILI</h3><table>${righeCoprifili()}</table>
<h3>NOTE</h3><div class="note">{{note}}</div></div>
<div><h3>CODICI APERTURA (vista interna)</h3><img class="leg" src="${IMG_CODICI_APERTURA}" alt="Codici apertura">
<h3>CASSONETTO E CELINO</h3><img class="leg" style="max-width:300px" src="${IMG_CASSONETTO_CELINO}" alt="Cassonetto e celino"></div>
</div>
<p class="firma">P&amp;C S.r.l. — Corso Moncenisio 28, Rosta (TO) — info@gruppopec.com — 011 19887497</p>
</body></html>
`;
}

export const MODELLO_SERRAMENTI = modelloSerramenti();

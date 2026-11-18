// Schede di produzione in HTML per il fornitore (misure definitive): segnaposto, campi da compilare e compilazione. Logica pura, testata.

/** Segnaposto che riempie il CRM da solo. */
export const SEGNAPOSTO_FISSI: Record<string, string> = {
  ordine: "numero dell'ordine", data: "data dell'ordine", fornitore: "ragione sociale del fornitore", cliente: "cliente finale",
  commessa: "numero della pratica", indirizzo: "indirizzo di consegna", consegna: "consegna richiesta",
  righe: "tabella delle righe d'ordine (senza prezzi)", misure_rilievo: "misure e note del rilievo",
};

export const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** I {{campo}} del modello che il CRM non riempie da solo: diventano caselle da compilare (in ordine, senza doppioni). */
export function campiDaCompilare(html: string): string[] {
  const visti = new Set<string>();
  for (const m of html.matchAll(/\{\{\s*([a-zA-Z0-9_àèéìòù]+)\s*\}\}/g)) if (!(m[1] in SEGNAPOSTO_FISSI)) visti.add(m[1]);
  return [...visti];
}

export const nomeCampo = (c: string) => c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());

/** Sostituisce i segnaposto. I valori testuali sono protetti (HTML escape, a capo conservati); `righe` è già HTML. */
export function compilaScheda(html: string, valori: Record<string, string>, righeHtml: string): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_àèéìòù]+)\s*\}\}/g, (_m, k: string) => {
    if (k === "righe") return righeHtml;
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

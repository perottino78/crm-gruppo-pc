// Schede tecniche del fotovoltaico (pannello, inverter, batteria) come le mostra Solaris Studio: lo Studio le salva nel progetto
// (statoJson.schedeOfferta) quando si torna all'offerta, e la stampa le mette in fondo se le righe ☀️ hanno la spunta «allega la scheda».
// Modulo puro: nessun PDF del fornitore, i dati sono quelli del catalogo dello Studio.

export type SchedaSolaris = { titolo: string; voci: [string, string][] };

const testo = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");

/** Le schede salvate nel progetto, ripulite (al massimo 3 schede da 20 voci). */
export function leggiSchedeSolaris(stato: unknown): SchedaSolaris[] {
  const lista = (stato as { schedeOfferta?: unknown } | null)?.schedeOfferta;
  if (!Array.isArray(lista)) return [];
  const out: SchedaSolaris[] = [];
  for (const s of lista.slice(0, 3)) {
    const titolo = testo((s as { titolo?: unknown })?.titolo, 160);
    const voci = (s as { voci?: unknown })?.voci;
    if (!titolo || !Array.isArray(voci)) continue;
    const pulite = voci
      .slice(0, 20)
      .map((v): [string, string] => (Array.isArray(v) ? [testo(v[0], 60), testo(v[1], 160)] : ["", ""]))
      .filter(([a, b]) => a && b);
    if (pulite.length) out.push({ titolo, voci: pulite });
  }
  return out;
}

/** Righe portate dallo Studio che hanno una scheda tecnica (pannello, inverter, batteria). */
export const rigaConSchedaSolaris = (testo: string | null | undefined) =>
  !!testo && /^☀️ (Pannello|Inverter|Batteria) /.test(testo);

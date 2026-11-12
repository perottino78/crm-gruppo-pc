// Riepilogo di una riga prodotto nell'offerta stampata (richiesta di Rocco, nov 2026): poche voci chiare a elenco puntato
// — tipo/materiale, colore, misure, optional — invece della scheda tecnica completa, che «sembra un promemoria per noi».

const PAROLE_MAIUSCOLE = new Set(["pvc", "wpc", "led", "rgb", "ral", "ipe", "zpc"]);

/** «SERRAMENTI PVC» → «Serramenti PVC», «PORTE INTERNE» → «Porte interne». */
export function nomeLeggibile(testo: string): string {
  const parole = testo.replace(/_/g, " ").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return parole.map((p, i) => (PAROLE_MAIUSCOLE.has(p) ? p.toUpperCase() : i === 0 ? p[0].toUpperCase() + p.slice(1) : p)).join(" ");
}

/** Colore da mostrare al cliente (niente segnaposto del listino). */
export function coloreLeggibile(colore: string | null | undefined): string | null {
  const c = (colore ?? "").trim();
  if (!c || /^(-|—|std|standard|unico|n\.?d\.?|nessuno|default)$/i.test(c)) return null;
  // le righe «tariffa» dei listini al m² / al metro (Scintilla, Brillante, taglio freddo, Chirenti…) non sono un colore
  if (/^(tariffa\b|placeholder$)/i.test(c)) return null;
  return c;
}

export type DatiRiepilogo = {
  gruppo?: string | null;
  sottogruppo?: string | null;
  colore?: string | null;
  misura?: string | null;
  optionali?: string[];
};

/** Le voci dell'elenco puntato, nell'ordine: tipo, colore, misure, optional. */
export function vociRiepilogo(d: DatiRiepilogo): { etichetta: string; valore: string }[] {
  const voci: { etichetta: string; valore: string }[] = [];
  const tipo = [d.gruppo ? nomeLeggibile(d.gruppo) : null, d.sottogruppo ?? null].filter(Boolean).join(" — ");
  if (tipo) voci.push({ etichetta: "Tipo", valore: tipo });
  const colore = coloreLeggibile(d.colore);
  if (colore) voci.push({ etichetta: "Colore", valore: colore });
  if (d.misura) voci.push({ etichetta: "Misure", valore: d.misura });
  const opt = (d.optionali ?? []).map((o) => o.trim()).filter(Boolean);
  if (opt.length) voci.push({ etichetta: "Optional", valore: opt.join(" · ") });
  return voci;
}

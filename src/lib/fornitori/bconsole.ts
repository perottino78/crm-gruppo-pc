// Conversione delle anagrafiche fornitori esportate da BConsole (ordini fornitori → anagrafica/edit)
// nei campi del Soggetto del CRM. Funzioni pure: testabili senza database.

export type FornitoreBConsole = {
  id: string; ord?: number;
  rag_soc?: string; nome?: string; cognome?: string;
  ind?: string; cap?: string; cmn?: string; prv?: string; id_naz?: string;
  tel?: string; cell?: string; eml?: string; eml2?: string; pec?: string; web?: string;
  prt_iva?: string; cod_fis?: string; codice_destinatario?: string;
  id_tip_pag_frn?: string; id_cen_cst?: string;
};

const pulisci = (s?: string | null) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t || null;
};

/** Chiave per riconoscere lo stesso fornitore scritto in modi diversi ("ALIAS S.R.L." = "Alias srl"). */
export function chiaveNome(s: string): string {
  return s
    .toUpperCase()
    .replace(/[.,'"]/g, " ")
    .replace(/\b(S\s*R\s*L\s*S?|S\s*P\s*A|S\s*N\s*C|S\s*A\s*S|SOC(IETA)?|COOP|UNIPERSONALE)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function normalizzaPiva(s?: string | null): string | null {
  const t = (s ?? "").replace(/^IT/i, "").replace(/\D/g, "");
  return t.length >= 8 && !/^0+$/.test(t) ? t : null;
}

export function convertiFornitore(f: FornitoreBConsole) {
  const ragione = pulisci(f.rag_soc) ?? pulisci([f.cognome, f.nome].filter(Boolean).join(" "));
  const sdi = pulisci(f.codice_destinatario);
  const piva = normalizzaPiva(f.prt_iva);
  const persona = !piva && !!(f.nome || f.cognome) && !/\b(S\.?R\.?L|S\.?P\.?A|S\.?N\.?C|S\.?A\.?S)\b/i.test(ragione ?? "");
  const nota = [
    `Importato da BConsole (anagrafica n. ${f.id}${f.ord ? `, ${f.ord} ordini fornitore` : ""}).`,
    f.id_cen_cst ? `Centro di costo BConsole: ${f.id_cen_cst}.` : null,
    f.web ? `Sito: ${f.web}` : null,
    pulisci(f.cell) && pulisci(f.tel) ? `Cellulare: ${pulisci(f.cell)}` : null,
  ].filter(Boolean).join("\n");
  return {
    ragioneSociale: ragione ?? `Fornitore BConsole ${f.id}`,
    tipo: persona ? "PERSONA" : "AZIENDA",
    partitaIva: piva,
    codiceFiscale: pulisci(f.cod_fis)?.toUpperCase() ?? null,
    codiceSdi: sdi && sdi !== "0000000" ? sdi.toUpperCase() : null,
    pec: pulisci(f.pec),
    indirizzo: pulisci(f.ind),
    cap: pulisci(f.cap),
    comune: pulisci(f.cmn),
    provincia: pulisci(f.prv)?.toUpperCase() ?? null,
    telefono: pulisci(f.tel) ?? pulisci(f.cell),
    email: pulisci(f.eml)?.toLowerCase() ?? null,
    emailOrdini: pulisci(f.eml2)?.toLowerCase() ?? null,
    condizioniPagamento: pulisci(f.id_tip_pag_frn),
    note: nota,
  };
}

/** Riempie solo i campi vuoti: quello che è già stato scritto a mano nel CRM non si tocca. */
export function campiDaCompletare<T extends Record<string, unknown>>(esistente: T, nuovo: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(nuovo)) {
    if (k === "note" || k === "tipo" || k === "ragioneSociale") continue;
    const att = esistente[k as keyof T];
    if ((att === null || att === undefined || att === "") && v !== null && v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

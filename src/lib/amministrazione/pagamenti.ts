// Pagamenti e incassi registrati a mano dallo scadenzario (come in BConsole): metodo, banca, commissioni, ritenuta 11%.
// Funzioni pure, testate in tests/amministrazione/pagamenti.test.ts.

/** Come si paga o si incassa (le voci usate in BConsole). */
export const METODI_PAGAMENTO = [
  { chiave: "BONIFICO", nome: "Bonifico" },
  { chiave: "BONIFICO_DETRAZIONE", nome: "Bonifico per detrazione (ritenuta 11%)", soloIncassi: true },
  { chiave: "CARTA_CREDITO", nome: "Carta di credito" },
  { chiave: "BANCOMAT", nome: "Bancomat / POS" },
  { chiave: "ASSEGNO", nome: "Assegno" },
  { chiave: "CONTANTI", nome: "Contanti" },
  { chiave: "RIBA", nome: "RIBA" },
  { chiave: "RID", nome: "RID / addebito diretto (SDD)" },
  { chiave: "F24", nome: "F24" },
  { chiave: "PAGOPA", nome: "PagoPA" },
  { chiave: "FINANZIAMENTO", nome: "Finanziaria / cessione del credito" },
  { chiave: "COMPENSAZIONE", nome: "Compensazione" },
] as const;
export const nomeMetodo = (k?: string | null) => METODI_PAGAMENTO.find((m) => m.chiave === k)?.nome ?? k ?? "";

/** Ritenuta d'acconto trattenuta dalla banca sui bonifici per detrazioni fiscali (dal 2025: 11%). */
export const ALIQUOTA_RITENUTA = 0.11;
const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Ritenuta su una scadenza: 11% della parte di imponibile che la scadenza rappresenta.
 * Es. fattura 10.000 + IVA 10% = 11.000, saldo 11.000 → ritenuta 1.100; se la scadenza è metà della fattura, metà ritenuta.
 */
export function ritenutaPrevista(f: { imponibile: number; totale: number } | null, importoScadenza: number, aliquota = ALIQUOTA_RITENUTA): number {
  if (!f || f.totale <= 0 || f.imponibile <= 0 || importoScadenza <= 0) return 0;
  return cent(aliquota * f.imponibile * Math.min(1, importoScadenza / f.totale));
}

/** Controlli prima di salvare un pagamento: ritorna il motivo del rifiuto o null. */
export function controllaPagamento(p: { importo: number; ritenuta: number; commissione: number; residuo: number }): string | null {
  if (!(p.importo >= 0) || !(p.ritenuta >= 0) || !(p.commissione >= 0)) return "Gli importi non possono essere negativi.";
  if (p.importo + p.ritenuta <= 0) return "Scrivi l'importo pagato.";
  if (cent(p.importo + p.ritenuta) > cent(p.residuo) + 0.009) return `Importo più alto del residuo da saldare (${p.residuo.toFixed(2).replace(".", ",")} €).`;
  return null;
}

/**
 * Estratto conto importato contro pagamenti già registrati a mano sulla stessa banca: stesso importo, data a pochi giorni.
 * Ogni pagamento a mano si conferma una volta sola, si preferisce quello con la data più vicina.
 * Ritorna per ogni riga dell'estratto l'id del pagamento a mano che conferma (o null: movimento nuovo).
 */
export function confermePagamentiManuali(righe: { data: Date; importo: number }[], manuali: { id: string; data: Date; importo: number }[], giorni = 7): (string | null)[] {
  const usati = new Set<string>();
  return righe.map((r) => {
    let migliore: { id: string; diff: number } | null = null;
    for (const m of manuali) {
      if (usati.has(m.id) || Math.abs(cent(m.importo) - cent(r.importo)) > 0.004) continue;
      const diff = Math.abs(m.data.getTime() - r.data.getTime()) / 86400000;
      if (diff <= giorni && (!migliore || diff < migliore.diff)) migliore = { id: m.id, diff };
    }
    if (migliore) usati.add(migliore.id);
    return migliore?.id ?? null;
  });
}

// Pagamenti e incassi registrati a mano dallo scadenzario (come in BConsole): metodo, banca, commissioni, ritenuta 11%.
// Funzioni pure, testate in tests/amministrazione/pagamenti.test.ts.

/**
 * Come si paga o si incassa: le stesse voci della tendina «Pagamento» di BConsole (elenco di Debora, 18/11/2026),
 * più quelle nostre (bonifico per detrazione, bancomat/POS, finanziaria). Le chiavi vecchie restano valide.
 */
export const METODI_PAGAMENTO = [
  { chiave: "ASSEGNO", nome: "Assegno" },
  { chiave: "BANCOMAT", nome: "Bancomat / POS" },
  { chiave: "BOLLETTINO_BANCARIO", nome: "Bollettino bancario" },
  { chiave: "BOLLETTINO_POSTALE", nome: "Bollettino di c/c postale" },
  { chiave: "BONIFICO", nome: "Bonifico" },
  { chiave: "BONIFICO_DETRAZIONE", nome: "Bonifico per detrazione (ritenuta 11%)", soloIncassi: true },
  { chiave: "CARTA_CREDITO", nome: "Carta di pagamento (credito)" },
  { chiave: "COMPENSAZIONE", nome: "Compensazione" },
  { chiave: "CONTANTI", nome: "Contanti" },
  { chiave: "CONTANTI_TESORERIA", nome: "Contanti presso Tesoreria" },
  { chiave: "DOMICILIAZIONE_BANCARIA", nome: "Domiciliazione bancaria" },
  { chiave: "DOMICILIAZIONE_POSTALE", nome: "Domiciliazione postale" },
  { chiave: "F24", nome: "F24" },
  { chiave: "FINANZIAMENTO", nome: "Finanziaria / cessione del credito" },
  { chiave: "GIROCONTO_CONTABILITA_SPECIALE", nome: "Giroconto su conti di contabilità speciale" },
  { chiave: "MAV", nome: "MAV" },
  { chiave: "PAGO_PA", nome: "PAGO PA" },
  { chiave: "PAGOPA", nome: "PagoPA" },
  { chiave: "QUIETANZA_ERARIO", nome: "Quietanza erario" },
  { chiave: "RIBA", nome: "RIBA" },
  { chiave: "RID", nome: "RID" },
  { chiave: "RID_UTENZA", nome: "RID utenza" },
  { chiave: "RID_VELOCE", nome: "RID veloce" },
  { chiave: "SEPA_DD", nome: "SEPA Direct Debit" },
  { chiave: "SEPA_DD_B2B", nome: "SEPA Direct Debit B2B" },
  { chiave: "SEPA_DD_CORE", nome: "SEPA Direct Debit CORE" },
  { chiave: "TRATTENUTA_SOMME_RISCOSSE", nome: "Trattenuta su somme già riscosse" },
  { chiave: "VAGLIA_CAMBIARIO", nome: "Vaglia cambiario" },
  { chiave: "VERSAMENTO_CONTANTI_CC", nome: "Versamento contanti su c/c" },
] as const;
export const nomeMetodo = (k?: string | null) => METODI_PAGAMENTO.find((m) => m.chiave === k)?.nome ?? k ?? "";

/** Ritenuta d'acconto trattenuta dalla banca sui bonifici per detrazioni fiscali (dal 2025: 11%). */
export const ALIQUOTA_RITENUTA = 0.11;
const cent = (n: number) => Math.round(n * 100) / 100;

/** IVA con cui si scorpora l'importo lordo per la ritenuta (la formula di Debora e di BConsole). */
export const DIVISORE_RITENUTA = 1.22;

/**
 * Ritenuta del bonifico parlante, come la calcola l'amministrazione (Debora, 18/11/2026):
 *   importo lordo : 1,22 = X      ritenuta = X × 11 / 100
 * Es. fattura 492,06 € → 492,06 : 1,22 = 403,33 → ritenuta 44,37 €. Il campo resta modificabile nel modulo.
 */
export function ritenutaPrevista(importoLordo: number, aliquota = ALIQUOTA_RITENUTA): number {
  if (!(importoLordo > 0)) return 0;
  return cent((importoLordo / DIVISORE_RITENUTA) * aliquota);
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

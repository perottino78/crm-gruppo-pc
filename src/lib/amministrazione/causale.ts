// Causale proposta quando si registra un incasso (richiesta di Ugo, 21/11/2026): «ACCONTO FT n. …» o «SALDO FT n. …» presi da soli
// dalla scadenza e dalla fattura collegata, come si scriveva in BConsole («SALDO FT n. 2703/00»). Modulo puro.

export type TipoIncasso = "ACCONTO" | "SALDO";
export type FatturaPerCausale = { numero: string; tipoDocumento: string; data: Date };

/** Acconto o saldo: dall'origine della scadenza (acconto/saldo della pratica), dal tipo di documento (TD02 = acconto) o dalla descrizione. */
export function tipoIncasso(s: { origine?: string | null; tipoDocumento?: string | null; descrizione?: string | null }): TipoIncasso {
  if (s.origine === "COMMESSA_ACCONTO") return "ACCONTO";
  if (s.origine === "COMMESSA_SALDO") return "SALDO";
  if (s.tipoDocumento === "TD02") return "ACCONTO";
  if (/\bacconto\b/i.test(s.descrizione ?? "")) return "ACCONTO";
  return "SALDO";
}

/** La fattura da citare: per l'acconto l'ultima fattura d'acconto (TD02), per il saldo l'ultima che non è acconto né nota di credito. */
export function fatturaPer(tipo: TipoIncasso, fatture: FatturaPerCausale[]): FatturaPerCausale | null {
  const adatte = fatture.filter((f) => (tipo === "ACCONTO" ? f.tipoDocumento === "TD02" : !["TD02", "TD04"].includes(f.tipoDocumento)));
  return adatte.sort((a, b) => b.data.getTime() - a.data.getTime())[0] ?? null;
}

export function causaleIncasso(tipo: TipoIncasso, numero?: string | null): string {
  return numero ? `${tipo} FT n. ${numero}` : tipo;
}

// Fattura cointestata (richiesta di Ugo 18/11/2026): due intestatari sulla stessa fattura (es. marito e moglie).
// La fattura elettronica ha un solo cessionario: il secondo intestatario va in causale (XML e copia di cortesia).
// Funzioni pure, testate in tests/fatturazione/cointestato.test.ts.

export type Cointestatario = {
  nome: string; cognome: string; codiceFiscale: string; partitaIva?: string;
  indirizzo?: string; cap?: string; comune?: string; provincia?: string; quota?: string;
};

const pulito = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Legge il secondo intestatario dal modulo; null se la spunta non c'è o non è stato scritto nulla. */
export function leggiCointestatario(get: (k: string) => string | null, attivo: boolean): Cointestatario | null {
  if (!attivo) return null;
  const v = (k: string) => pulito(get(`cointest_${k}`));
  const c: Cointestatario = {
    nome: v("nome"), cognome: v("cognome"), codiceFiscale: v("codiceFiscale").toUpperCase(), partitaIva: v("partitaIva") || undefined,
    indirizzo: v("indirizzo") || undefined, cap: v("cap") || undefined, comune: v("comune") || undefined, provincia: v("provincia").toUpperCase() || undefined, quota: v("quota") || undefined,
  };
  return c.nome || c.cognome || c.codiceFiscale ? c : null;
}

/** Il JSON salvato → oggetto sicuro (o null). */
export function cointestatarioDa(j: unknown): Cointestatario | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const c: Cointestatario = { nome: pulito(o.nome), cognome: pulito(o.cognome), codiceFiscale: pulito(o.codiceFiscale), partitaIva: pulito(o.partitaIva) || undefined, indirizzo: pulito(o.indirizzo) || undefined, cap: pulito(o.cap) || undefined, comune: pulito(o.comune) || undefined, provincia: pulito(o.provincia) || undefined, quota: pulito(o.quota) || undefined };
  return c.nome || c.cognome || c.codiceFiscale ? c : null;
}

/** Cosa manca per poter emettere una fattura cointestata. */
export function mancaCointestato(c: Cointestatario | null): string[] {
  if (!c) return [];
  const m: string[] = [];
  if (!c.nome || !c.cognome) m.push("nome e cognome del cointestatario");
  if (!c.codiceFiscale) m.push("codice fiscale del cointestatario");
  else if (!/^[A-Z0-9]{16}$/.test(c.codiceFiscale) && !/^\d{11}$/.test(c.codiceFiscale)) m.push("codice fiscale del cointestatario non valido (16 caratteri)");
  return m;
}

/** Riga di testo per causale e copia di cortesia: «Cointestata a: Mario Rossi, C.F. …, via … (quota 50%)». */
export function testoCointestato(c: Cointestatario | null): string | null {
  if (!c) return null;
  const nome = [c.nome, c.cognome].filter(Boolean).join(" ");
  const citta = ([c.cap, c.comune].filter(Boolean).join(" ") + (c.provincia ? ` (${c.provincia})` : "")).trim();
  const luogo = [c.indirizzo?.trim(), citta].filter(Boolean).join(", ");
  return [`Fattura cointestata a: ${nome}`, c.codiceFiscale ? `C.F. ${c.codiceFiscale}` : null, c.partitaIva ? `P.IVA ${c.partitaIva}` : null, luogo || null, c.quota ? `quota ${c.quota}` : null].filter(Boolean).join(", ");
}

/** Causale completa: testo scritto a mano + cointestatario. */
export function causaleConCointestato(causale: string | null | undefined, c: Cointestatario | null): string | null {
  const t = testoCointestato(c);
  return [causale?.trim() || null, t].filter(Boolean).join(" — ") || null;
}

// Costo per canale: quanto costa un lead, un appuntamento e un contratto di ogni provenienza (calcoli puri, testati).
import { FASI_APPUNTAMENTO } from "@/lib/automazioni/percorsi";

export type LeadPerCosti = { canale: string; fase: string; appuntamentoIl: Date | null; contratto: boolean; fatturato: number };
export type RigaCanale = { canale: string; lead: number; appuntamenti: number; contratti: number; fatturato: number; spesa: number; costoLead: number | null; costoAppuntamento: number | null; costoContratto: number | null; resa: number | null };

/** Ha avuto un appuntamento: data dell'appuntamento, fase di appuntamento (anche annullato dopo) o contratto. */
export const haAppuntamento = (l: Pick<LeadPerCosti, "fase" | "appuntamentoIl" | "contratto">) =>
  !!l.appuntamentoIl || FASI_APPUNTAMENTO.includes(l.fase) || l.fase === "APPUNTAMENTO_ANNULLATO" || l.contratto;

const div = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

/** Righe per canale (lead del periodo) con la spesa: costo per lead / appuntamento / contratto e resa (fatturato ÷ spesa). */
export function costiPerCanale(lead: LeadPerCosti[], spese: Record<string, number>): RigaCanale[] {
  const canali = new Set([...lead.map((l) => l.canale), ...Object.keys(spese).filter((k) => spese[k] > 0)]);
  return [...canali].map((canale) => {
    const ll = lead.filter((l) => l.canale === canale);
    const appuntamenti = ll.filter(haAppuntamento).length;
    const contratti = ll.filter((l) => l.contratto).length;
    const fatturato = Math.round(ll.reduce((t, l) => t + l.fatturato, 0) * 100) / 100;
    const spesa = spese[canale] ?? 0;
    return {
      canale, lead: ll.length, appuntamenti, contratti, fatturato, spesa,
      costoLead: spesa ? div(spesa, ll.length) : null, costoAppuntamento: spesa ? div(spesa, appuntamenti) : null, costoContratto: spesa ? div(spesa, contratti) : null,
      resa: spesa ? div(fatturato, spesa) : null,
    };
  }).sort((a, b) => b.spesa - a.spesa || b.lead - a.lead);
}

/** "2026-11" → primo giorno del mese e del mese dopo (UTC), per filtrare i lead creati nel mese. */
export function limitiMese(mese: string): { dal: Date; al: Date } {
  const [a, m] = mese.split("-").map(Number);
  return { dal: new Date(Date.UTC(a, m - 1, 1)), al: new Date(Date.UTC(a, m, 1)) };
}
export const meseValido = (s?: string | null) => !!s && /^20\d{2}-(0[1-9]|1[0-2])$/.test(s);

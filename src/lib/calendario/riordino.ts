// Riordino dopo l'importazione degli appuntamenti di BConsole (regole pure, senza database):
// 1) gli appuntamenti portati da BConsole che erano già stati fissati anche in P&C ONE (stessa persona, stesso giorno) sono doppioni;
// 2) i lead rimasti «appesi» (da chiamare, da richiamare…) la cui persona ha già un appuntamento fissato dopo l'ultimo esito
//    vanno avanzati come se la telefonista li avesse esitati a mano.
import { chiaveGiorno } from "./tempo";
import { normalizzaTelefono, chiaveNomeCliente } from "@/lib/clienti/bconsole";

export type AppRiordino = { id: string; chiaveImport: string | null; clienteId: string; utenteId: string; tipo?: string; dataOra: Date; stato: string; luogo: string | null; titolo: string | null; createdAt: Date };
export type ClienteRiordino = { id: string; nome: string; telefono: string | null; cellulare: string | null; email: string | null };
export type LeadRiordino = { id: string; nome: string; telefono: string | null; email: string | null; fase: string; createdAt: Date; clienteId: string | null; ultimoEsitoIl: Date | null };

/** Chiavi che identificano una persona: cliente, telefoni, email, nome e cognome (in qualsiasi ordine). */
export function chiaviPersona(p: { clienteId?: string | null; nome?: string | null; telefoni?: (string | null | undefined)[]; email?: string | null }): string[] {
  const out: string[] = [];
  if (p.clienteId) out.push(`C:${p.clienteId}`);
  for (const t of p.telefoni ?? []) { const n = normalizzaTelefono(t); if (n) out.push(`T:${n}`); }
  if (p.email?.trim()) out.push(`E:${p.email.trim().toLowerCase()}`);
  const k = chiaveNomeCliente(p.nome);
  if (k.includes(" ")) out.push(`N:${k}`);
  return out;
}

const chiaviCliente = (c: ClienteRiordino | undefined, id: string) =>
  chiaviPersona({ clienteId: id, nome: c?.nome, telefoni: [c?.telefono, c?.cellulare], email: c?.email });
const importato = (a: AppRiordino) => !!a.chiaveImport?.startsWith("BC|");

/**
 * Appuntamenti importati da BConsole che doppiano uno già fissato in P&C ONE: stessa persona e stesso giorno (ora di Roma).
 * Si tiene sempre quello di P&C ONE (ha il lead, gli inviti, lo storico). Un importato attivo non si toglie se quello di
 * P&C ONE è annullato: in quel caso l'appuntamento valido è proprio quello di BConsole.
 */
export function doppioniImportati(appuntamenti: AppRiordino[], clienti: ClienteRiordino[]): { id: string; tieni: string }[] {
  const perId = new Map(clienti.map((c) => [c.id, c]));
  const nativi = new Map<string, AppRiordino[]>();
  for (const a of appuntamenti.filter((x) => !importato(x)))
    for (const k of chiaviCliente(perId.get(a.clienteId), a.clienteId)) {
      const chiave = `${chiaveGiorno(a.dataOra)}|${k}`;
      nativi.set(chiave, [...(nativi.get(chiave) ?? []), a]);
    }
  const out: { id: string; tieni: string }[] = [];
  for (const a of appuntamenti.filter(importato)) {
    const candidati = [...new Set(chiaviCliente(perId.get(a.clienteId), a.clienteId).flatMap((k) => nativi.get(`${chiaveGiorno(a.dataOra)}|${k}`) ?? []))]
      .filter((n) => n.stato !== "ANNULLATO" || a.stato === "ANNULLATO")
      .sort((x, y) => Math.abs(x.dataOra.getTime() - a.dataOra.getTime()) - Math.abs(y.dataOra.getTime() - a.dataOra.getTime()));
    if (candidati[0]) out.push({ id: a.id, tieni: candidati[0].id });
  }
  return out;
}

/** Fasi del lead in cui la telefonista deve ancora fissare l'appuntamento. */
export const FASI_DA_FISSARE = ["NUOVO", "IN_TARGET", "CONTATTATO", "NON_RISPONDE", "DA_RICHIAMARE", "APPUNTAMENTO_ANNULLATO", "RECUPERO"];

export type LeadDaAvanzare = { leadId: string; appuntamentoId: string; esito: "APPUNTAMENTO_CASA" | "APPUNTAMENTO_SHOWROOM"; dataOra: Date; utenteId: string; luogo: string | null; clienteId: string };

/**
 * Lead appesi la cui persona ha già un appuntamento (non annullato) dopo l'arrivo del lead (dopo l'ultimo esito se è un ricontatto o un annullamento):
 * l'appuntamento più recente diventa quello del lead. In showroom se luogo o titolo lo dicono, altrimenti a casa.
 * `esclusi` = appuntamenti che stanno per essere tolti come doppioni; `centralino` = telefoniste: i loro «appuntamenti» (e quelli telefonici)
 * sono ricontatti, non visite del venditore, e non contano.
 */
export function leadDaAvanzare(leads: LeadRiordino[], appuntamenti: AppRiordino[], clienti: ClienteRiordino[], esclusi = new Set<string>(), centralino = new Set<string>()): LeadDaAvanzare[] {
  const perId = new Map(clienti.map((c) => [c.id, c]));
  const perChiave = new Map<string, AppRiordino[]>();
  for (const a of appuntamenti.filter((x) => x.stato !== "ANNULLATO" && !esclusi.has(x.id) && x.tipo !== "TELEFONICO" && !centralino.has(x.utenteId)))
    for (const k of chiaviCliente(perId.get(a.clienteId), a.clienteId)) perChiave.set(k, [...(perChiave.get(k) ?? []), a]);
  const out: LeadDaAvanzare[] = [];
  for (const l of leads.filter((x) => FASI_DA_FISSARE.includes(x.fase))) {
    // In migrazione conta l'arrivo del lead: le classificazioni fatte in blocco su P&C ONE dopo una visita già svolta non la annullano.
    // Fanno eccezione un ricontatto concordato o un annullamento registrati dopo: lì vale l'ultimo esito.
    const dopoEsito = (l.fase === "DA_RICHIAMARE" || l.fase === "APPUNTAMENTO_ANNULLATO") && l.ultimoEsitoIl && l.ultimoEsitoIl > l.createdAt;
    const da = dopoEsito ? l.ultimoEsitoIl! : new Date(l.createdAt.getTime() - 86_400_000);
    const chiavi = chiaviPersona({ clienteId: l.clienteId, nome: l.nome, telefoni: [l.telefono], email: l.email });
    const app = [...new Set(chiavi.flatMap((k) => perChiave.get(k) ?? []))]
      .filter((a) => a.dataOra.getTime() >= da.getTime())
      .sort((x, y) => y.dataOra.getTime() - x.dataOra.getTime())[0];
    if (!app) continue;
    const showroom = /show ?room|in sede|presso (la )?sede|negozio/i.test(`${app.luogo ?? ""} ${app.titolo ?? ""}`);
    out.push({ leadId: l.id, appuntamentoId: app.id, esito: showroom ? "APPUNTAMENTO_SHOWROOM" : "APPUNTAMENTO_CASA", dataOra: app.dataOra, utenteId: app.utenteId, luogo: app.luogo, clienteId: app.clienteId });
  }
  return out;
}

/** Diagnosi: per ogni lead, tutti gli appuntamenti della stessa persona (qualsiasi data, tipo e stato). */
export function appuntamentiDeiLead(leads: LeadRiordino[], appuntamenti: AppRiordino[], clienti: ClienteRiordino[]): Map<string, AppRiordino[]> {
  const perId = new Map(clienti.map((c) => [c.id, c]));
  const perChiave = new Map<string, AppRiordino[]>();
  for (const a of appuntamenti) for (const k of chiaviCliente(perId.get(a.clienteId), a.clienteId)) perChiave.set(k, [...(perChiave.get(k) ?? []), a]);
  const out = new Map<string, AppRiordino[]>();
  for (const l of leads) {
    const chiavi = chiaviPersona({ clienteId: l.clienteId, nome: l.nome, telefoni: [l.telefono], email: l.email });
    out.set(l.id, [...new Set(chiavi.flatMap((k) => perChiave.get(k) ?? []))].sort((x, y) => x.dataOra.getTime() - y.dataOra.getTime()));
  }
  return out;
}

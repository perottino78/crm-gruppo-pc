// Chi ha avuto un'offerta e chi ha già comprato (CRM + storico BConsole), per le campagne «offerta non chiusa» e simili.
import { prisma } from "@/lib/prisma";
import { clientiPerSituazione } from "./regole";

/** Clienti che hanno comprato: commessa (non annullata), offerta confermata, ordine BConsole, fattura di vendita (non nota di credito). */
export async function clientiCheHannoComprato(): Promise<Set<string>> {
  const [commesse, offerte, ordini, fatture] = await Promise.all([
    prisma.commessa.findMany({ where: { stato: { not: "ANNULLATA" } }, select: { clienteId: true } }),
    prisma.preventivo.findMany({ where: { OR: [{ stato: "ACCETTATO" }, { confermatoIl: { not: null } }] }, select: { clienteId: true } }),
    prisma.documentoBC.findMany({ where: { tipo: "ORDINE", clienteId: { not: null } }, select: { clienteId: true } }),
    prisma.fatturaVendita.findMany({ where: { clienteId: { not: null }, tipoDocumento: { not: "TD04" } }, select: { clienteId: true } }),
  ]);
  return new Set([...commesse, ...offerte, ...ordini, ...fatture].map((x) => x.clienteId!).filter(Boolean));
}

/** Clienti con un'offerta (CRM o BConsole) fatta nel periodo. */
export async function clientiConOfferta(dal?: Date | null, al?: Date | null): Promise<Set<string>> {
  const periodo = { ...(dal ? { gte: dal } : {}), ...(al ? { lte: al } : {}) };
  const [crm, bc] = await Promise.all([
    prisma.preventivo.findMany({ where: { createdAt: periodo, totaleNetto: { gt: 0 } }, select: { clienteId: true } }),
    prisma.documentoBC.findMany({ where: { tipo: "OFFERTA", clienteId: { not: null }, ...(dal || al ? { data: periodo } : {}) }, select: { clienteId: true } }),
  ]);
  return new Set([...crm, ...bc].map((x) => x.clienteId!).filter(Boolean));
}

/** Filtri aggiuntivi della campagna per la situazione scelta. */
export async function filtriSituazione(c: { situazione: string | null; offerteDal: Date | null; offerteAl: Date | null }) {
  if (!c.situazione) return {};
  const comprati = await clientiCheHannoComprato();
  const conOfferta = c.situazione === "OFFERTA_APERTA" ? await clientiConOfferta(c.offerteDal, c.offerteAl) : [];
  return clientiPerSituazione(c.situazione, conOfferta, comprati);
}

import { puo, type ConPermessi } from "@/lib/permessi/catalogo";
// Stato delle persone del team (attivo / in pausa / disattivato) e dati collegati che impediscono l'eliminazione.
import { prisma } from "@/lib/prisma";

export const STATI_UTENTE = [
  { chiave: "ATTIVO", nome: "Attivo", classe: "bg-emerald-100 text-emerald-800", spiega: "lavora nel CRM" },
  { chiave: "PAUSA", nome: "In pausa", classe: "bg-amber-100 text-amber-900", spiega: "assente per un periodo: non entra e non riceve lavoro nuovo, si riattiva quando torna" },
  { chiave: "DISATTIVATO", nome: "Disattivato", classe: "bg-neutral-200 text-neutral-700", spiega: "non lavora più con noi: non entra, i suoi dati e lo storico restano" },
] as const;
export const statoUtente = (s?: string | null) => STATI_UTENTE.find((x) => x.chiave === s) ?? STATI_UTENTE[0];

export const RUOLI_UTENTE = ["AMMINISTRATORE", "AMMINISTRATIVO", "COMMERCIALE", "TELEFONISTA", "MARKETING", "TECNICO", "POSATORE"];

/** Marketing: per ruolo o per ufficio (campagne email, filtri ed esportazione di tutti i clienti). */
export const eMarketing = (u: { ruolo?: string | null; ufficio?: string | null } | null | undefined) => !!u && (u.ruolo === "MARKETING" || u.ufficio === "MARKETING");

/** Amministratore o marketing: pubblicità e lead, listini e articoli, nuovi utenti (non amministratori). */
export const puoMarketing = (u: ConPermessi | null | undefined) => puo(u, "marketing");

/** Ruoli che il marketing può dare creando un utente: l'amministrazione e gli amministratori li crea solo l'amministratore. */
export const RUOLI_CREABILI_MARKETING = ["COMMERCIALE", "TELEFONISTA", "MARKETING", "TECNICO", "POSATORE"];

/** Lead che non vanno più lavorati: non si passano a un collega. */
export const LEAD_CHIUSI = ["NON_INTERESSATO", "FUORI_REGIONE", "APPUNTAMENTO_FISSATO"];

/** Per le tendine "assegna a…": solo chi è attivo (più chi è già assegnato, per non perderlo salvando). */
export const soloAttivi = <T extends { id: string; stato?: string | null }>(lista: T[], giaAssegnato?: string | null) =>
  lista.filter((u) => (u.stato ?? "ATTIVO") === "ATTIVO" || u.id === giaAssegnato);

export async function datiCollegati(id: string) {
  const [clienti, offerte, pratiche, lead, appuntamenti, rilievi, pose, task, assistenze, attivita, obiettivi, progettiSolaris] = await Promise.all([
    prisma.cliente.count({ where: { responsabileId: id } }),
    prisma.preventivo.count({ where: { commercialeId: id } }),
    prisma.commessa.count({ where: { responsabileId: id } }),
    prisma.lead.count({ where: { OR: [{ telefonistaId: id }, { venditoreId: id }] } }),
    prisma.appuntamento.count({ where: { utenteId: id } }),
    prisma.rilievo.count({ where: { tecnicoId: id } }),
    prisma.posa.count({ where: { assegnatoUtenteId: id } }),
    prisma.taskPratica.count({ where: { assegnatoUtenteId: id } }),
    prisma.assistenza.count({ where: { assegnatoUtenteId: id } }),
    prisma.attivita.count({ where: { utenteId: id } }),
    prisma.obiettivo.count({ where: { utenteId: id } }),
    prisma.solarisProgetto.count({ where: { commercialeId: id } }),
  ]);
  return { clienti, offerte, pratiche, lead, appuntamenti, rilievi, pose, task, assistenze, attivita, obiettivi, "progetti Solaris": progettiSolaris };
}
export const totaleCollegati = (c: Record<string, number>) => Object.values(c).reduce((t, v) => t + v, 0);

/**
 * Chi può comparire come commerciale di un'offerta: ruolo COMMERCIALE, ufficio commerciale, oppure chi fa già offerte
 * (es. l'amministratore che vende anche lui). Solo persone attive.
 */
export function commercialiAttivi() {
  return prisma.utente.findMany({
    where: { stato: "ATTIVO", OR: [{ ruolo: "COMMERCIALE" }, { ufficio: "COMMERCIALE" }, { preventivi: { some: {} } }] },
    orderBy: { nome: "asc" },
  });
}

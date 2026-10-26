// Funzioni lato server del modulo Amministrazione (accesso al database)
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { Utente } from "@prisma/client";
import { cent } from "./estratto";
import { GIORNI_ATTESA_ACCONTO } from "./costanti";

export function puoAmministrazione(utente: Pick<Utente, "ruolo"> | null | undefined): boolean {
  return utente?.ruolo === "AMMINISTRATORE" || utente?.ruolo === "AMMINISTRATIVO";
}

/** Utente corrente, solo se abilitato all'amministrazione (altrimenti null). */
export async function utenteAmministrazione() {
  const u = await getCurrentUser();
  return puoAmministrazione(u) ? u : null;
}

export async function registra(entita: string, entitaId: string | null, azione: string, dettaglio: string | null, utenteNome: string | null) {
  await prisma.registroAmministrazione.create({ data: { entita, entitaId, azione, dettaglio, utenteNome } });
}

/** Mese (anno, 1-12) della data, nel fuso italiano. */
export function meseDi(d: Date): { anno: number; mese: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).formatToParts(d);
  return { anno: Number(p.find((x) => x.type === "year")!.value), mese: Number(p.find((x) => x.type === "month")!.value) };
}

export async function mesiChiusi(): Promise<Set<string>> {
  const c = await prisma.chiusuraMese.findMany();
  return new Set(c.map((x) => `${x.anno}-${x.mese}`));
}

export async function eMeseChiuso(d: Date): Promise<boolean> {
  const { anno, mese } = meseDi(d);
  return !!(await prisma.chiusuraMese.findUnique({ where: { anno_mese: { anno, mese } } }));
}

/** Saldo contabile del conto: saldo iniziale + tutti i movimenti successivi alla data del saldo iniziale. */
export async function saldoConto(contoId: string, finoA?: Date): Promise<number> {
  const conto = await prisma.contoFinanziario.findUnique({ where: { id: contoId } });
  if (!conto) return 0;
  const agg = await prisma.movimentoFinanziario.aggregate({
    where: { contoId, data: { gt: conto.dataSaldoIniziale, ...(finoA ? { lte: finoA } : {}) } },
    _sum: { importo: true },
  });
  return cent(conto.saldoIniziale + (agg._sum.importo ?? 0));
}

/** Ricalcola lo stato di una scadenza dalla somma degli abbinamenti e della parte pagata a mano. */
export async function ricalcolaScadenza(scadenzaId: string) {
  const s = await prisma.scadenza.findUnique({ where: { id: scadenzaId }, include: { abbinamenti: true } });
  if (!s || s.stato === "ANNULLATA") return;
  const pagato = cent(s.abbinamenti.reduce((t, a) => t + a.importo, 0) + s.pagatoManuale);
  const stato = pagato <= 0.004 ? "APERTA" : pagato >= cent(s.importo) - 0.004 ? "PAGATA" : "PARZIALE";
  if (stato !== s.stato) await prisma.scadenza.update({ where: { id: s.id }, data: { stato } });
}

/** Ricalcola lo stato di un movimento: ABBINATO se gli abbinamenti coprono tutto l'importo. */
export async function ricalcolaMovimento(movimentoId: string) {
  const m = await prisma.movimentoFinanziario.findUnique({ where: { id: movimentoId }, include: { abbinamenti: true } });
  if (!m || m.stato === "REGISTRATO") return;
  const coperto = cent(m.abbinamenti.reduce((t, a) => t + a.importo, 0));
  const stato = coperto >= cent(Math.abs(m.importo)) - 0.004 ? "ABBINATO" : "DA_ABBINARE";
  if (stato !== m.stato) await prisma.movimentoFinanziario.update({ where: { id: m.id }, data: { stato } });
}

export function residuoScadenza(s: { importo: number; pagatoManuale: number; abbinamenti: { importo: number }[] }): number {
  return cent(s.importo - s.pagatoManuale - s.abbinamenti.reduce((t, a) => t + a.importo, 0));
}

export function residuoMovimento(m: { importo: number; abbinamenti: { importo: number }[] }): number {
  return cent(Math.abs(m.importo) - m.abbinamenti.reduce((t, a) => t + a.importo, 0));
}

/**
 * Crea/aggiorna le scadenze di incasso di acconto e saldo per ogni commessa.
 * Idempotente: si può chiamare a ogni apertura dello scadenzario.
 * - Non tocca mai una scadenza che ha già abbinamenti o pagamenti (salvo marcarla saldata).
 * - Se l'incasso è già segnato nella commessa (prima della prima nota), la scadenza risulta saldata
 *   "a mano" con l'importo registrato in commessa.
 */
export async function sincronizzaScadenzeCommesse(): Promise<number> {
  const [commesse, esistenti] = await Promise.all([
    prisma.commessa.findMany({ include: { cliente: { select: { nome: true } }, brand: { select: { nome: true } } } }),
    prisma.scadenza.findMany({ where: { commessaId: { not: null } }, include: { abbinamenti: true } }),
  ]);
  const mappa = new Map(esistenti.map((s) => [`${s.commessaId}|${s.origine}`, s]));
  let modifiche = 0;
  for (const c of commesse) {
    const numero = `C${c.anno}-${String(c.numero).padStart(3, "0")}`;
    const annullata = c.stato === "ANNULLATA";
    const conAcconto = c.accontoTipo !== "FINANZIAMENTO" && c.accontoImporto > 0;
    const acconto = conAcconto ? cent(c.accontoImportoIncassato ?? c.accontoImporto) : 0;
    const saldo = cent(Math.max(0, c.totaleVendita - acconto));
    const voci = [
      conAcconto && {
        origine: "COMMESSA_ACCONTO",
        descrizione: `Acconto commessa ${numero}`,
        importo: acconto,
        data: new Date(c.createdAt.getTime() + GIORNI_ATTESA_ACCONTO * 86400000),
        incassato: c.accontoIncassato,
        incassatoImporto: c.accontoImportoIncassato ?? c.accontoImporto,
      },
      saldo > 0 && {
        origine: "COMMESSA_SALDO",
        descrizione: `${c.accontoTipo === "FINANZIAMENTO" ? "Importo da finanziamento" : "Saldo"} commessa ${numero}`,
        importo: saldo,
        data: null as Date | null,
        incassato: c.saldoIncassato,
        incassatoImporto: c.saldoImporto ?? saldo,
      },
    ].filter(Boolean) as { origine: string; descrizione: string; importo: number; data: Date | null; incassato: boolean; incassatoImporto: number }[];

    for (const v of voci) {
      const s = mappa.get(`${c.id}|${v.origine}`);
      if (!s) {
        if (annullata) continue;
        await prisma.scadenza.create({
          data: {
            tipo: "INCASSO", origine: v.origine, commessaId: c.id, clienteId: c.clienteId, controparte: c.cliente.nome,
            descrizione: v.descrizione, importo: v.importo, dataScadenza: v.data, brand: c.brand.nome,
            pagatoManuale: v.incassato ? cent(Math.min(v.incassatoImporto, v.importo)) : 0,
            stato: v.incassato ? (v.incassatoImporto >= v.importo - 0.004 ? "PAGATA" : "PARZIALE") : "APERTA",
            note: v.incassato ? "Incasso già registrato nella commessa prima dell'uso della prima nota" : null,
          },
        });
        modifiche++;
        continue;
      }
      const toccata = s.abbinamenti.length > 0 || s.pagatoManuale > 0;
      if (annullata && !toccata && s.stato !== "ANNULLATA") {
        await prisma.scadenza.update({ where: { id: s.id }, data: { stato: "ANNULLATA", note: "Commessa annullata" } });
        modifiche++;
        continue;
      }
      const dati: Record<string, unknown> = {};
      if (!toccata && Math.abs(s.importo - v.importo) > 0.004) dati.importo = v.importo;
      if (!s.dataModificata && v.data && (!s.dataScadenza || s.dataScadenza.getTime() !== v.data.getTime())) dati.dataScadenza = v.data;
      if (s.controparte !== c.cliente.nome) dati.controparte = c.cliente.nome;
      // incasso segnato in commessa ma non ancora in prima nota: lo registriamo come pagato a mano
      if (v.incassato && s.abbinamenti.length === 0 && Math.abs(s.pagatoManuale - Math.min(v.incassatoImporto, v.importo)) > 0.004 && (s.pagatoManuale === 0 || (s.note ?? "").includes("commessa"))) {
        dati.pagatoManuale = cent(Math.min(v.incassatoImporto, v.importo));
        dati.note = "Incasso registrato nella commessa";
      }
      // incasso annullato nella commessa: togliamo il pagamento "a mano" che veniva da lì
      if (!v.incassato && s.abbinamenti.length === 0 && s.pagatoManuale > 0 && (s.note ?? "").includes("commessa")) {
        dati.pagatoManuale = 0;
        dati.note = null;
      }
      if (Object.keys(dati).length) {
        await prisma.scadenza.update({ where: { id: s.id }, data: dati });
        await ricalcolaScadenza(s.id);
        modifiche++;
      }
    }
  }
  return modifiche;
}

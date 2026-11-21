// Magazzino: funzioni lato server (numerazione bolle, righe da ricevere, giacenze, avvio commessa).
import { nomeIntervento } from "@/lib/pratica/interventi";
import { prisma } from "@/lib/prisma";
import type { Prisma, Utente } from "@prisma/client";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { statoDaArrivi } from "@/lib/ordini/calcoli";
import { numeroCommessa } from "@/lib/commesse";
import { pianoBolla, disponibilita, materialeCompleto } from "./calcoli";

type Tx = Prisma.TransactionClient;

export const puoMagazzino = (u: Pick<Utente, "ruolo"> | null | undefined) => puoGestireOrdini(u);

/** Prossimo numero di bolla d'entrata dell'anno (transazione bloccata: niente numeri doppi). */
export async function prossimoNumeroBolla(tx: Tx, anno: number): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"bolle-entrata-" + anno}))`;
  const ultimo = await tx.bollaEntrata.aggregate({ where: { anno }, _max: { numero: true } });
  return (ultimo._max.numero ?? 0) + 1;
}

/** Righe ordinate a un fornitore e non ancora arrivate del tutto (per comporre la bolla). */
export function righeDaRicevere(fornitoreId: string) {
  return prisma.rigaOrdine.findMany({
    where: { arrivato: false, ordineFornitore: { fornitoreId, stato: { notIn: ["ANNULLATO"] } } },
    include: {
      ordineFornitore: { select: { id: true, numero: true, anno: true, stato: true, consegnaConfermata: true, consegnaRichiesta: true, commessaId: true } },
      commessa: { select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } } },
    },
    orderBy: [{ ordineFornitore: { anno: "asc" } }, { ordineFornitore: { numero: "asc" } }, { createdAt: "asc" }],
  });
}

type RigaGiacenza = { articoloId: string; giacenza: number; qc: number; vc: number };

/** Giacenza, costo medio, impegnato e disponibile per articolo (tutti o quelli indicati). */
export async function giacenze(articoliIds?: string[]) {
  const filtro = articoliIds?.length ? prisma.$queryRaw<RigaGiacenza[]>`
      SELECT "articoloId", SUM(quantita)::float AS giacenza,
        SUM(CASE WHEN tipo='CARICO' AND quantita>0 AND "costoUnitario" IS NOT NULL THEN quantita ELSE 0 END)::float AS qc,
        SUM(CASE WHEN tipo='CARICO' AND quantita>0 AND "costoUnitario" IS NOT NULL THEN quantita*"costoUnitario" ELSE 0 END)::float AS vc
      FROM "MovimentoMagazzino" WHERE "articoloId" = ANY(${articoliIds}) GROUP BY "articoloId"`
    : prisma.$queryRaw<RigaGiacenza[]>`
      SELECT "articoloId", SUM(quantita)::float AS giacenza,
        SUM(CASE WHEN tipo='CARICO' AND quantita>0 AND "costoUnitario" IS NOT NULL THEN quantita ELSE 0 END)::float AS qc,
        SUM(CASE WHEN tipo='CARICO' AND quantita>0 AND "costoUnitario" IS NOT NULL THEN quantita*"costoUnitario" ELSE 0 END)::float AS vc
      FROM "MovimentoMagazzino" GROUP BY "articoloId"`;
  const [righe, imp] = await Promise.all([
    filtro,
    prisma.rigaOrdine.groupBy({
      by: ["articoloId"], _sum: { quantita: true },
      where: { daMagazzino: true, prelevatoIl: null, articoloId: articoliIds?.length ? { in: articoliIds } : { not: null }, commessa: { stato: { notIn: ["ANNULLATA", "CHIUSA"] } } },
    }),
  ]);
  const mappa = new Map<string, { giacenza: number; costoMedio: number | null; impegnato: number }>();
  for (const r of righe) {
    mappa.set(r.articoloId, { giacenza: Math.round(r.giacenza * 1000) / 1000, costoMedio: r.qc > 0 ? Math.round((r.vc / r.qc) * 100) / 100 : null, impegnato: 0 });
  }
  for (const i of imp) {
    if (!i.articoloId) continue;
    const g = mappa.get(i.articoloId) ?? { giacenza: 0, costoMedio: null, impegnato: 0 };
    g.impegnato = i._sum.quantita ?? 0;
    mappa.set(i.articoloId, g);
  }
  return mappa;
}

/** Elenco articoli gestiti a magazzino con giacenze, scorte e valore. */
export async function situazioneMagazzino() {
  const [articoli, g] = await Promise.all([
    prisma.articolo.findMany({
      where: { attivo: true },
      select: { id: true, codice: true, codiceFornitore: true, descrizione: true, um: true, costoAcquisto: true, scortaMinima: true, ubicazione: true, fornitoreId: true, fornitore: { select: { ragioneSociale: true } }, categoria: { select: { nome: true } } },
      orderBy: { codice: "asc" },
    }),
    giacenze(),
  ]);
  return articoli
    .filter((a) => g.has(a.id) || (a.scortaMinima ?? 0) > 0)
    .map((a) => {
      const x = g.get(a.id) ?? { giacenza: 0, costoMedio: null, impegnato: 0 };
      const costo = x.costoMedio ?? a.costoAcquisto ?? null;
      const d = disponibilita(x.giacenza, x.impegnato, a.scortaMinima);
      return { ...a, giacenza: x.giacenza, impegnato: x.impegnato, costoMedio: costo, valore: costo !== null ? Math.round(Math.max(0, x.giacenza) * costo * 100) / 100 : null, ...d };
    });
}

/**
 * Applica (o storna, segno -1) una bolla: quantità arrivate sulle righe d'ordine, stato degli ordini,
 * carichi a magazzino. Restituisce le commesse toccate (per l'avvio) e gli avvisi.
 */
export async function applicaBolla(tx: Tx, bollaId: string, segno: 1 | -1, nome: string) {
  const bolla = await tx.bollaEntrata.findUniqueOrThrow({ where: { id: bollaId }, include: { righe: true } });
  const idRighe = bolla.righe.map((r) => r.rigaOrdineId).filter(Boolean) as string[];
  const righeOrdine = idRighe.length ? await tx.rigaOrdine.findMany({ where: { id: { in: idRighe } } }) : [];
  const piano = pianoBolla(bolla.righe, righeOrdine, segno);
  const ora = new Date();
  for (const r of piano.righeOrdine) {
    const prima = righeOrdine.find((x) => x.id === r.id)!;
    await tx.rigaOrdine.update({
      where: { id: r.id },
      data: { quantitaArrivata: r.quantitaArrivata, arrivato: r.arrivato, arrivatoIl: r.arrivato ? (prima.arrivato ? prima.arrivatoIl : bolla.dataArrivo ?? ora) : null },
    });
  }
  if (segno === 1) {
    for (const c of piano.carichi) {
      const m = await tx.movimentoMagazzino.create({
        data: { data: bolla.dataArrivo, tipo: "CARICO", causale: bolla.causale === "OMAGGIO" ? "OMAGGIO" : bolla.causale === "RESO_CANTIERE" ? "RESO_CANTIERE" : "ACQUISTO", articoloId: c.articoloId, quantita: c.quantita, costoUnitario: bolla.causale === "OMAGGIO" ? 0 : c.costoUnitario, rigaOrdineId: c.rigaOrdineId, bollaId, note: `Bolla ${bolla.numero}/${bolla.anno}${bolla.numeroDdt ? ` (DDT ${bolla.numeroDdt})` : ""}`, creatoDaNome: nome },
      });
      await tx.rigaBolla.update({ where: { id: c.rigaBollaId }, data: { movimentoId: m.id } });
    }
  } else {
    await tx.movimentoMagazzino.deleteMany({ where: { bollaId, tipo: "CARICO" } });
    await tx.rigaBolla.updateMany({ where: { bollaId }, data: { movimentoId: null } });
  }
  // stato degli ordini toccati
  const ordini = [...new Set(piano.righeOrdine.map((r) => r.ordineFornitoreId).filter(Boolean))] as string[];
  for (const oid of ordini) {
    const o = await tx.ordineFornitore.findUnique({ where: { id: oid }, include: { righe: { select: { arrivato: true } } } });
    if (o) await tx.ordineFornitore.update({ where: { id: oid }, data: { stato: statoDaArrivi(o.stato, o.righe) } });
  }
  const commesse = new Set<string>();
  for (const r of piano.righeOrdine) if (r.commessaId) commesse.add(r.commessaId);
  for (const r of bolla.righe) if (r.commessaId) commesse.add(r.commessaId);
  return { commesse: [...commesse], ordini, avvisi: piano.avvisi };
}

/**
 * Avvio commessa: quando tutto il materiale è disponibile la commessa diventa «materiale completo»,
 * con un task per la fatturazione del saldo e uno per programmare la posa. Se torna a mancare
 * qualcosa (storno di una bolla) la marcatura si toglie.
 */
export async function verificaMaterialeCommessa(tx: Tx, commessaId: string, nome: string): Promise<"COMPLETO" | "RIAPERTO" | null> {
  const c = await tx.commessa.findUnique({ where: { id: commessaId }, include: { righeOrdine: { select: { arrivato: true, createdAt: true } }, cliente: { select: { nome: true } } } });
  if (!c || ["ANNULLATA", "CHIUSA"].includes(c.stato)) return null;
  // dopo una posa parziale per materiale (riordino) serve almeno una riga nuova, arrivata anche lei
  const completo = materialeCompleto(c.righeOrdine) && (!c.riordinoIl || c.righeOrdine.some((r) => r.createdAt >= c.riordinoIl!));
  const nr = numeroCommessa(c);
  if (completo && !c.materialeCompletoIl) {
    await tx.commessa.update({ where: { id: commessaId }, data: { materialeCompletoIl: new Date(), riordinoIl: null } });
    await tx.commessaEvento.create({ data: { commessaId, utenteNome: nome, testo: c.riordinoIl ? "Materiale riordinato dopo la posa parziale: tutto arrivato. Si fissa la data per finire il lavoro." : `Materiale completo: tutte le ${c.righeOrdine.length} righe sono arrivate o prelevate. Commessa pronta per saldo e posa.` } });
    const aperti = await tx.taskPratica.findMany({ where: { commessaId, faseChiave: { in: ["MATERIALE_COMPLETO", "POSA_APP"] }, completatoIl: null, stato: { notIn: ["COMPLETATO", "ESEGUITO", "ANNULLATO"] } }, select: { faseChiave: true } });
    if (!c.saldoIncassato && !aperti.some((t) => t.faseChiave === "MATERIALE_COMPLETO")) {
      await tx.taskPratica.create({ data: { commessaId, faseChiave: "MATERIALE_COMPLETO", ufficio: "FATTURAZIONE", titolo: "Materiale completo: fattura saldo e incasso", descrizione: `Commessa ${nr} di ${c.cliente.nome}: tutto il materiale è in magazzino. Emettere la fattura di saldo e registrare l'incasso prima dell'uscita del materiale.`, creatoDa: "Magazzino" } });
    }
    // flusso: il task del magazzino si chiude e il centralino (Alessia) fissa la posa con la squadra competente
    await tx.taskPratica.updateMany({ where: { commessaId, faseChiave: "MAGAZZINO", completatoIl: null, stato: { notIn: ["COMPLETATO", "ESEGUITO", "ANNULLATO"] } }, data: { stato: "COMPLETATO", completatoIl: new Date(), completatoDaNome: nome } });
    // interventi in attesa del materiale (es. fine posa dopo una posa parziale): tornano da fissare e il centralino li fissa
    const inAttesa = await tx.assistenza.findMany({ where: { commessaId, stato: "IN_ATTESA_RICAMBIO" }, select: { id: true, numero: true, tipo: true, descrizione: true } });
    if (inAttesa.length) {
      await tx.assistenza.updateMany({ where: { id: { in: inAttesa.map((x) => x.id) } }, data: { stato: "APERTA" } });
      for (const iv of inAttesa) await tx.taskPratica.create({ data: { commessaId, ufficio: "CENTRALINO", titolo: `Fissare l'intervento n.${iv.numero} (${nomeIntervento(iv.tipo).replace(/^\S+ /, "")})`, descrizione: `Pratica ${nr} di ${c.cliente.nome}: il materiale riordinato è arrivato. ${iv.descrizione}. Nella pratica, sezione Interventi: scegli chi va e il giorno (va nel suo calendario).`, creatoDa: "Magazzino" } });
    } else if (!aperti.some((t) => t.faseChiave === "POSA_APP")) await tx.taskPratica.create({ data: { commessaId, faseChiave: "POSA_APP", ufficio: "CENTRALINO", titolo: c.riordinoIl ? "Materiale riordinato arrivato: fissare la data per finire la posa" : "Materiale completo: fissare la posa con la squadra", descrizione: `Pratica ${nr} di ${c.cliente.nome}: materiale completo${c.saldoIncassato ? " e saldo già incassato" : " (la conferma del giorno arriva con il saldo incassato)"}. Nella pratica, sezione Posa: scegli la squadra e il giorno; parte la mail al cliente.`, creatoDa: "Magazzino" } });
    return "COMPLETO";
  }
  if (!completo && c.materialeCompletoIl) {
    await tx.commessa.update({ where: { id: commessaId }, data: { materialeCompletoIl: null } });
    await tx.commessaEvento.create({ data: { commessaId, utenteNome: nome, testo: "Materiale non più completo (bolla stornata o riga riaperta)." } });
    await tx.taskPratica.updateMany({ where: { commessaId, faseChiave: { in: ["MATERIALE_COMPLETO", "POSA_APP"] }, stato: "DA_INIZIARE" }, data: { stato: "ANNULLATO" } });
    return "RIAPERTO";
  }
  return null;
}

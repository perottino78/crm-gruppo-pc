// Stato della commessa nella fase acconto + rilievo: «In attesa acconto» finché non c'è la via libera (50% incassato, finanziamento
// approvato o sblocco dell'amministratore), poi «Rilievo da programmare» → «programmato» → «eseguito». Usato anche dopo ogni incasso
// (prima restava «in attesa acconto» anche a incasso fatto: segnalazione di Debora 23/11/2026).
import { prisma } from "@/lib/prisma";
import { statoSogliaRilievo } from "@/lib/pratica/soglia-server";

export async function ricalcolaStatoCommessa(commessaId: string): Promise<void> {
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { rilievi: true } });
  if (!c || ["ANNULLATA", "CHIUSA", "ORDINI", "POSA", "SALDO_INCASSATO", "LAVORI_ESEGUITI"].includes(c.stato)) return;
  const viaLibera = !!(await statoSogliaRilievo(c.id))?.viaLibera;
  let stato = "IN_ATTESA_ACCONTO";
  if (viaLibera) {
    const attivi = c.rilievi.filter((r) => r.stato !== "ANNULLATO");
    if (attivi.some((r) => r.stato === "ESEGUITO")) stato = "RILIEVO_ESEGUITO";
    else if (attivi.some((r) => r.stato === "PROGRAMMATO")) stato = "RILIEVO_PROGRAMMATO";
    else stato = "RILIEVO_DA_PROGRAMMARE";
  }
  if (stato !== c.stato) await prisma.commessa.update({ where: { id: c.id }, data: { stato } });
}

// Documenti: permessi di accesso in base all'entità a cui appartengono.
import { prisma } from "@/lib/prisma";
import type { Utente } from "@prisma/client";
import { scopeClienteWhere, scopePreventivoWhere } from "@/lib/scope";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { puoAmministrazione } from "@/lib/amministrazione/server";

export async function puoVedereEntita(u: Pick<Utente, "id" | "ruolo">, entita: string, entitaId: string): Promise<boolean> {
  if (u.ruolo === "AMMINISTRATORE") return true;
  switch (entita) {
    case "CLIENTE":
      return !!(await prisma.cliente.findFirst({ where: { id: entitaId, ...scopeClienteWhere(u) }, select: { id: true } }));
    case "PREVENTIVO":
      return !!(await prisma.preventivo.findFirst({ where: { id: entitaId, ...scopePreventivoWhere(u) }, select: { id: true } }));
    case "COMMESSA":
      if (u.ruolo !== "COMMERCIALE") return true;
      return !!(await prisma.commessa.findFirst({ where: { id: entitaId, preventivo: scopePreventivoWhere(u) }, select: { id: true } }));
    case "ORDINE_FORNITORE":
    case "ARTICOLO":
    case "BOLLA_ENTRATA":
      return puoGestireOrdini(u);
    case "FATTURA_ACQUISTO":
      return puoAmministrazione(u);
    default:
      return false;
  }
}

export const documentiDi = (entita: string, entitaId: string) =>
  prisma.documento.findMany({ where: { entita, entitaId }, select: { id: true, cartella: true, nome: true, mime: true, dimensione: true, caricatoDaNome: true, createdAt: true }, orderBy: [{ cartella: "asc" }, { createdAt: "desc" }] });

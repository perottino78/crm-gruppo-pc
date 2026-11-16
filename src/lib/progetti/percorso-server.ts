// Dati del percorso guidato di una commessa (progetto): legge il database e li passa alla logica pura di percorso.ts.
import { prisma } from "@/lib/prisma";
import { percorsoProgetto, praticaLegacy, type Percorso } from "./percorso";

export type PercorsoCommessa = Percorso & { legacy: boolean; progettoCreatoIl: Date | null; progettoCreatoDaNome: string | null; materialeConfermatoIl: Date | null; viaLibera: boolean };

export async function percorsoDiCommessa(commessaId: string): Promise<PercorsoCommessa | null> {
  const c = await prisma.commessa.findUnique({
    where: { id: commessaId },
    select: {
      accontoTipo: true, accontoIncassato: true, finanziamentoStato: true, progettoCreatoIl: true, progettoCreatoDaNome: true, materialeConfermatoIl: true, materialeCompletoIl: true, ordineBC: true,
      rilievi: { select: { stato: true } },
      righeOrdine: { select: { daMagazzino: true, fornitoreId: true, ordinato: true, arrivato: true } },
      ordiniFornitore: { select: { id: true } },
    },
  });
  if (!c) return null;
  const viaLibera = c.accontoTipo === "FINANZIAMENTO" ? c.finanziamentoStato === "APPROVATO" : c.accontoIncassato;
  const daOrdinare = c.righeOrdine.filter((r) => !r.daMagazzino);
  const legacy = praticaLegacy({ progettoCreatoIl: c.progettoCreatoIl, rilievi: c.rilievi.length, righe: c.righeOrdine.length, ordini: c.ordiniFornitore.length, ordineBC: !!c.ordineBC });
  const p = percorsoProgetto({
    viaLibera, progettoCreatoIl: c.progettoCreatoIl, materialeConfermatoIl: c.materialeConfermatoIl, legacy, rilievi: c.rilievi,
    righe: daOrdinare.length, righeSenzaFornitore: daOrdinare.filter((r) => !r.fornitoreId).length, righeOrdinate: daOrdinare.filter((r) => r.ordinato).length,
    righeArrivate: c.righeOrdine.filter((r) => r.arrivato || r.daMagazzino).length, righeTotali: c.righeOrdine.length, materialeCompleto: !!c.materialeCompletoIl,
  });
  return { ...p, legacy, progettoCreatoIl: c.progettoCreatoIl, progettoCreatoDaNome: c.progettoCreatoDaNome, materialeConfermatoIl: c.materialeConfermatoIl, viaLibera };
}

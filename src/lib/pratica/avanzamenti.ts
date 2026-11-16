// Avanzamenti automatici del flusso fra uffici, richiamabili dalle azioni e dai collaudi.
import { prisma } from "@/lib/prisma";
import { chiudiTaskFase } from "@/app/flusso-actions";

/** Con tutte le righe del progetto ordinate il task dell'ufficio ordini si chiude e passa al magazzino. */
export async function ordiniTuttiInviati(commessaId: string): Promise<boolean> {
  const righe = await prisma.rigaOrdine.findMany({ where: { commessaId, daMagazzino: false }, select: { ordinato: true } });
  if (!righe.length || !righe.every((r) => r.ordinato)) return false;
  return chiudiTaskFase(commessaId, "ORDINI");
}

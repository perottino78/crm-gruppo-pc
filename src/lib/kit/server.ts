// Raccolta punti kit al cliente (lato server): regole dalla Configurazione, consegne, kit ancora da consegnare.
import { prisma } from "@/lib/prisma";
import type { Utente } from "@prisma/client";
import { scopePreventivoWhere } from "@/lib/scope";
import { visibilitaDi } from "@/lib/permessi/catalogo";
import { eVenditore } from "@/lib/provvigioni/server";
import { numeroCommessa } from "@/lib/commesse";
import { CHIAVI_KIT, regoleDa, STATI_KIT, type RegoleKit } from "./punti";

export async function regoleKit(): Promise<RegoleKit> {
  const righe = await prisma.configurazione.findMany({ where: { chiave: { in: Object.values(CHIAVI_KIT) } } });
  return regoleDa(Object.fromEntries(righe.map((r) => [r.chiave, r.valore])));
}

/** Chi vende vede i suoi clienti; chi lavora in ufficio con «solo i suoi» (es. fine lavori) vede tutte le pratiche: è lui a mettere la spunta. */
export const vedeSoloISuoiKit = (u: Utente) => visibilitaDi(u) === "PROPRI" && eVenditore(u);

/** Pratiche a lavoro finito senza kit, fra quelle che l'utente vede (il commerciale: le sue). */
export async function praticheSenzaKit(u: Utente) {
  const commesse = await prisma.commessa.findMany({
    where: { stato: { in: STATI_KIT }, preventivo: vedeSoloISuoiKit(u) ? scopePreventivoWhere(u) : {} },
    select: {
      id: true, numero: true, anno: true, stato: true, chiusaIl: true, consegnaPrevista: true, clienteId: true,
      cliente: { select: { nome: true, comune: true } },
      preventivo: { select: { commerciale: { select: { nome: true } } } },
    },
    take: 300,
  });
  const fatte = new Set((await prisma.consegnaKit.findMany({ where: { commessaId: { in: commesse.map((c) => c.id) } }, select: { commessaId: true } })).map((k) => k.commessaId));
  return commesse
    .filter((c) => !fatte.has(c.id))
    .map((c) => ({ id: c.id, numero: numeroCommessa(c), stato: c.stato, clienteId: c.clienteId, cliente: c.cliente.nome, comune: c.cliente.comune, commerciale: c.preventivo.commerciale.nome, dataFine: c.chiusaIl ?? c.consegnaPrevista }))
    .sort((a, b) => (a.dataFine?.getTime() ?? 0) - (b.dataFine?.getTime() ?? 0));
}

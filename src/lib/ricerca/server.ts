// Ricerca che perdona gli errori, lato server: quando la ricerca esatta trova poco, si cercano i nomi più somiglianti
// fra i clienti/lead visibili (solo id, nome, email: leggero anche con molte migliaia di righe).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { trovaSimili } from "./fuzzy";

/** Sotto questo numero di risultati esatti si aggiungono i «forse cercavi». */
export const SOGLIA_FUZZY = 5;

export async function clientiSimili(q: string, where: Prisma.ClienteWhereInput, esclusi: string[], max = 15): Promise<string[]> {
  const righe = await prisma.cliente.findMany({ where, select: { id: true, nome: true, email: true }, take: 50000 });
  return trovaSimili(q, righe, (r) => `${r.nome} ${r.email ?? ""}`, max, new Set(esclusi));
}

export async function leadSimili(q: string, where: Prisma.LeadWhereInput, esclusi: string[], max = 15): Promise<string[]> {
  const righe = await prisma.lead.findMany({ where, select: { id: true, nome: true, email: true }, take: 50000 });
  return trovaSimili(q, righe, (r) => `${r.nome} ${r.email ?? ""}`, max, new Set(esclusi));
}

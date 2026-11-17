// Chi può aprire un task di cliente (Attivita TASK): chi lo ha creato, chi lo deve fare, chi è in copia, gli amministratori e chi vede il cliente.
import type { Utente } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scopeClienteWhere } from "@/lib/scope";

type Persona = Pick<Utente, "id" | "ruolo">;

export const coinvolti = (t: { utenteId: string | null; creatoDaId: string | null; inCopiaA: string[] }): string[] =>
  [...new Set([t.utenteId, t.creatoDaId, ...t.inCopiaA].filter((x): x is string => !!x))];

export async function puoVedereTask(u: Persona, attivitaId: string): Promise<boolean> {
  if (u.ruolo === "AMMINISTRATORE") return true;
  const t = await prisma.attivita.findFirst({ where: { id: attivitaId, tipo: "TASK" }, select: { utenteId: true, creatoDaId: true, inCopiaA: true, clienteId: true } });
  if (!t) return false;
  if (coinvolti(t).includes(u.id)) return true;
  return !!(await prisma.cliente.findFirst({ where: { id: t.clienteId, ...scopeClienteWhere(u) }, select: { id: true } }));
}

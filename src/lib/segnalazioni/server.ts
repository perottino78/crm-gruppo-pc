// Assistenza interna: chi riceve le segnalazioni del team e chi può gestirle.
import { prisma } from "@/lib/prisma";
import { isAmministratore } from "@/lib/auth";

export const CHIAVE_DESTINATARIO = "assistenza_destinatario";

/** Chi riceve le segnalazioni: quello scelto in Impostazioni; altrimenti il responsabile del Marketing (Rocco); altrimenti un amministratore. */
export async function destinatarioAssistenza(): Promise<{ id: string; nome: string; email: string } | null> {
  const sel = { id: true, nome: true, email: true } as const;
  const scelto = (await prisma.configurazione.findUnique({ where: { chiave: CHIAVE_DESTINATARIO } }))?.valore;
  if (scelto) {
    const u = await prisma.utente.findFirst({ where: { id: scelto, stato: "ATTIVO" }, select: sel });
    if (u) return u;
  }
  return (await prisma.utente.findFirst({ where: { stato: "ATTIVO", responsabileUfficio: true, ufficio: "MARKETING" }, select: sel, orderBy: { nome: "asc" } }))
    ?? (await prisma.utente.findFirst({ where: { stato: "ATTIVO", ruolo: "AMMINISTRATORE" }, select: sel, orderBy: { nome: "asc" } }));
}

/** Gestisce le segnalazioni (le vede tutte e le chiude): chi le riceve e gli amministratori. */
export const gestisceSegnalazioni = (u: { id: string; ruolo: string } | null | undefined, destinatarioId: string | null | undefined) =>
  !!u && (isAmministratore(u) || u.id === destinatarioId);

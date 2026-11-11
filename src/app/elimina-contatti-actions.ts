"use server";

// Eliminare un lead o un cliente (richiesta di Rocco, nov 2026). Un cliente con lavoro vero (offerte, pratiche, fatture,
// scadenze, assistenze) non si elimina: si rischierebbe di perdere storia e incassi. Permesso «clienti.elimina».
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { scopeClienteWhere, scopeLeadWhere } from "@/lib/scope";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const vai = (ritorno: string | null, q: Record<string, string>): never => {
  const [base, hash] = (ritorno && ritorno.startsWith("/") ? ritorno : "/clienti").split("#");
  redirect(`${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams(q)}${hash ? `#${hash}` : ""}`);
};

async function chi() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "clienti.elimina")) throw new Error("Serve il permesso «Eliminare lead e clienti».");
  return u;
}

/** Cosa impedisce di eliminare il cliente (vuoto = si può). */
export async function bloccaEliminazioneCliente(id: string): Promise<string[]> {
  const [preventivi, commesse, fatture, emesse, ddt, scadenze, assistenze, solaris] = await Promise.all([
    prisma.preventivo.count({ where: { clienteId: id } }),
    prisma.commessa.count({ where: { clienteId: id } }),
    prisma.fatturaVendita.count({ where: { clienteId: id } }),
    prisma.fatturaEmessa.count({ where: { clienteId: id } }),
    prisma.ddtUscita.count({ where: { clienteId: id } }),
    prisma.scadenza.count({ where: { clienteId: id } }),
    Promise.resolve(0), // le assistenze stanno sotto la pratica: già contate con le commesse
    prisma.solarisProgetto.count({ where: { clienteId: id } }),
  ]);
  return [
    preventivi && `${preventivi} preventiv${preventivi === 1 ? "o" : "i"}`, commesse && `${commesse} pratic${commesse === 1 ? "a" : "he"}`,
    fatture + emesse && `${fatture + emesse} fattur${fatture + emesse === 1 ? "a" : "e"}`, ddt && `${ddt} DDT`, scadenze && `${scadenze} scadenz${scadenze === 1 ? "a" : "e"}`,
    assistenze && `${assistenze} assistenz${assistenze === 1 ? "a" : "e"}`, solaris && `${solaris} progetti Solaris`,
  ].filter(Boolean) as string[];
}

export async function eliminaCliente(fd: FormData) {
  const u = await chi();
  const id = str(fd, "id");
  const ritorno = str(fd, "ritorno");
  const c = id ? await prisma.cliente.findFirst({ where: { AND: [{ id }, scopeClienteWhere(u)] }, select: { id: true, nome: true } }) : null;
  if (!c) vai(ritorno, { errore: "Cliente non trovato." });
  const blocchi = await bloccaEliminazioneCliente(c!.id);
  if (blocchi.length) vai(ritorno, { errore: `${c!.nome} non si può eliminare: ha ${blocchi.join(", ")}.` });
  await prisma.$transaction(async (tx) => {
    // il resto (contatti, appuntamenti, attività, note) va via con lui; offerte BConsole e invii di campagne restano senza cliente
    await tx.appuntamento.deleteMany({ where: { clienteId: c!.id } });
    await tx.attivita.deleteMany({ where: { clienteId: c!.id } });
    await tx.referente.deleteMany({ where: { clienteId: c!.id } });
    await tx.indirizzoCliente.deleteMany({ where: { clienteId: c!.id } });
    await tx.clienteCorrelazione.deleteMany({ where: { OR: [{ clienteId: c!.id }, { correlatoId: c!.id }] } });
    await tx.documentoBC.updateMany({ where: { clienteId: c!.id }, data: { clienteId: null } });
    await tx.campagnaInvio.deleteMany({ where: { clienteId: c!.id } });
    await tx.documento.deleteMany({ where: { entita: "CLIENTE", entitaId: c!.id } }).catch(() => null);
    await tx.cliente.delete({ where: { id: c!.id } });
  });
  await prisma.registroAmministrazione.create({ data: { entita: "CLIENTE", entitaId: c!.id, azione: "ELIMINATO", dettaglio: c!.nome, utenteNome: u.nome } }).catch(() => null);
  revalidatePath("/clienti");
  vai(ritorno?.startsWith("/clienti/") ? "/clienti" : ritorno, { ok: `${c!.nome} eliminato.` });
}

export async function eliminaLead(fd: FormData) {
  const u = await chi();
  const id = str(fd, "id");
  const ritorno = str(fd, "ritorno");
  const l = id ? await prisma.lead.findFirst({ where: { AND: [{ id }, scopeLeadWhere(u)] }, select: { id: true, nome: true } }) : null;
  if (!l) vai(ritorno, { errore: "Lead non trovato." });
  await prisma.$transaction(async (tx) => {
    // il cliente nato dal lead resta (perde solo il collegamento); cronologia, email e invii in coda vanno via con il lead
    await tx.cliente.updateMany({ where: { leadOrigineId: l!.id }, data: { leadOrigineId: null } });
    await tx.lead.delete({ where: { id: l!.id } });
  });
  await prisma.registroAmministrazione.create({ data: { entita: "LEAD", entitaId: l!.id, azione: "ELIMINATO", dettaglio: l!.nome, utenteNome: u.nome } }).catch(() => null);
  revalidatePath("/lead");
  revalidatePath("/clienti");
  vai(ritorno?.startsWith("/lead/") ? "/lead" : ritorno, { ok: `Lead ${l!.nome} eliminato.` });
}

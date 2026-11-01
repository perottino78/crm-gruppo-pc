"use server";

// Gestione del team (solo AMMINISTRATORE): stato (attivo / in pausa / disattivato), cambio di mansione,
// passaggio del lavoro aperto a un collega ed eliminazione di chi non ha dati collegati.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { nomeUfficio } from "@/lib/flusso";
import { getCurrentUser } from "@/lib/auth";
import { STATI_UTENTE, RUOLI_UTENTE, LEAD_CHIUSI, datiCollegati, totaleCollegati } from "@/lib/utenti/stato";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

async function amministratore() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.ruolo !== "AMMINISTRATORE") redirect("/commerciali?errore=" + encodeURIComponent("Solo l'amministratore può gestire il team."));
  return u;
}
const torna = (ritorno: string | null, p: Record<string, string>) => {
  const dove = ritorno && ritorno.startsWith("/") ? ritorno : "/commerciali";
  const [base, q] = dove.split("?");
  const u = new URLSearchParams(q); // si tengono i parametri della pagina (es. ?utente=…)
  u.delete("ok"); u.delete("errore");
  for (const [k, v] of Object.entries(p)) u.set(k, v);
  redirect(`${base}?${u}`);
};
const aggiorna = (id: string) => { revalidatePath("/commerciali"); revalidatePath(`/commerciali/${id}`); revalidatePath("/impostazioni"); };

/** Attivo / In pausa / Disattivato, con una nota (es. "maternità fino a marzo", "ha lasciato l'azienda"). */
export async function impostaStatoUtente(fd: FormData) {
  const admin = await amministratore();
  const id = str(fd, "utenteId"), stato = str(fd, "stato"), ritorno = str(fd, "ritorno");
  if (!id || !stato || !STATI_UTENTE.some((s) => s.chiave === stato)) return;
  const u = await prisma.utente.findUniqueOrThrow({ where: { id } });
  if (stato !== "ATTIVO") {
    if (id === admin.id) torna(ritorno, { errore: "Non puoi mettere in pausa o disattivare te stesso." });
    if (u.ruolo === "AMMINISTRATORE" && (await prisma.utente.count({ where: { ruolo: "AMMINISTRATORE", stato: "ATTIVO", id: { not: id } } })) === 0)
      torna(ritorno, { errore: "Deve restare almeno un amministratore attivo." });
  }
  const cambiato = stato !== u.stato;
  await prisma.utente.update({ where: { id }, data: { stato, statoNota: str(fd, "nota"), ...(cambiato ? { statoDal: new Date() } : {}) } });
  aggiorna(id);
  const nome = STATI_UTENTE.find((s) => s.chiave === stato)!.nome.toLowerCase();
  torna(ritorno, { ok: cambiato ? `${u.nome}: ${nome}.${stato === "ATTIVO" ? " Può di nuovo entrare nel CRM." : " Non può più entrare nel CRM e non compare nelle assegnazioni nuove."}` : "Nota salvata." });
}

/** Cambio di mansione: ruolo e ufficio. */
export async function cambiaMansioneUtente(fd: FormData) {
  const admin = await amministratore();
  const id = str(fd, "utenteId"), ruolo = str(fd, "ruolo"), ritorno = str(fd, "ritorno");
  if (!id || !ruolo || !RUOLI_UTENTE.includes(ruolo)) return;
  const u = await prisma.utente.findUniqueOrThrow({ where: { id } });
  if (u.ruolo === "AMMINISTRATORE" && ruolo !== "AMMINISTRATORE") {
    if (id === admin.id) torna(ritorno, { errore: "Non puoi togliere a te stesso il ruolo di amministratore." });
    if ((await prisma.utente.count({ where: { ruolo: "AMMINISTRATORE", stato: "ATTIVO", id: { not: id } } })) === 0) torna(ritorno, { errore: "Deve restare almeno un amministratore attivo." });
  }
  const ufficio = str(fd, "ufficio");
  const nuovoUfficio = ufficio === "__nessuno__" ? null : ufficio ?? u.ufficio;
  // email di lavoro: cambia con l'ufficio (es. ordini@ → promozionale@)
  const email = str(fd, "email")?.toLowerCase() ?? u.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) torna(ritorno, { errore: "Scrivi un indirizzo email valido." });
  const cambiaEmail = email !== u.email.toLowerCase();
  if (cambiaEmail) {
    const altro = await prisma.utente.findFirst({ where: { email: { equals: email, mode: "insensitive" }, id: { not: id } }, select: { nome: true } });
    if (altro) torna(ritorno, { errore: `${email} è già l'email di ${altro.nome}: cambia prima la sua (o lascia a lei/lui quella casella).` });
  }
  // la casella collegata era quella della vecchia email: va ricollegata con la password della nuova
  const vecchiaCasella = cambiaEmail && !!u.smtpPassword && (!u.smtpUtente || u.smtpUtente.toLowerCase() === u.email.toLowerCase());
  await prisma.utente.update({
    where: { id },
    data: {
      ruolo, ufficio: nuovoUfficio,
      ...(cambiaEmail ? { email } : {}),
      ...(vecchiaCasella ? { smtpPassword: null, smtpUtente: null, smtpVerificataIl: null, smtpErrore: null } : {}),
    },
  });
  aggiorna(id);
  const cambi = [u.ruolo !== ruolo ? `ruolo ${ruolo}` : "", (u.ufficio ?? null) !== nuovoUfficio ? `ufficio ${nuovoUfficio ? nomeUfficio(nuovoUfficio) : "nessuno"}` : "", cambiaEmail ? `email ${email}` : ""].filter(Boolean);
  torna(ritorno, { ok: `${u.nome}: ${cambi.length ? cambi.join(", ") : "nessuna modifica"}.${vecchiaCasella ? ` La casella collegata era ${u.email}: ricollegala con la password di ${email} (qui sotto o dal suo Profilo).` : ""}` });
}

/**
 * Passa il lavoro ancora aperto a un collega: clienti seguiti, offerte aperte, pratiche in corso, lead da lavorare,
 * appuntamenti/rilievi/pose futuri, task e assistenze aperti. Lo storico chiuso resta a nome di chi l'ha fatto.
 */
export async function passaLavoroUtente(fd: FormData) {
  await amministratore();
  const da = str(fd, "utenteId"), a = str(fd, "aUtenteId"), ritorno = str(fd, "ritorno");
  if (!da || !a) return;
  if (da === a) torna(ritorno, { errore: "Scegli un collega diverso." });
  const [dU, aU] = await Promise.all([prisma.utente.findUniqueOrThrow({ where: { id: da } }), prisma.utente.findUniqueOrThrow({ where: { id: a } })]);
  if (aU.stato !== "ATTIVO") torna(ritorno, { errore: `${aU.nome} non è attivo: scegli un collega attivo.` });
  const ora = new Date();
  const n = await prisma.$transaction(async (tx) => ({
    clienti: (await tx.cliente.updateMany({ where: { responsabileId: da }, data: { responsabileId: a } })).count,
    offerte: (await tx.preventivo.updateMany({ where: { commercialeId: da, stato: "APERTO", confermatoIl: null }, data: { commercialeId: a } })).count,
    pratiche: (await tx.commessa.updateMany({ where: { responsabileId: da, chiusaIl: null }, data: { responsabileId: a } })).count,
    lead: (await tx.lead.updateMany({ where: { telefonistaId: da, fase: { notIn: LEAD_CHIUSI } }, data: { telefonistaId: a } })).count
      + (await tx.lead.updateMany({ where: { venditoreId: da, fase: { notIn: LEAD_CHIUSI } }, data: { venditoreId: a } })).count,
    appuntamenti: (await tx.appuntamento.updateMany({ where: { utenteId: da, dataOra: { gte: ora }, stato: { in: ["PROGRAMMATO", "CONFERMATO"] } }, data: { utenteId: a } })).count,
    rilievi: (await tx.rilievo.updateMany({ where: { tecnicoId: da, dataOra: { gte: ora }, stato: "PROGRAMMATO" }, data: { tecnicoId: a } })).count,
    pose: (await tx.posa.updateMany({ where: { assegnatoUtenteId: da, dataInizio: { gte: ora }, stato: "PROGRAMMATA" }, data: { assegnatoUtenteId: a, assegnatoNome: aU.nome } })).count,
    task: (await tx.taskPratica.updateMany({ where: { assegnatoUtenteId: da, completatoIl: null }, data: { assegnatoUtenteId: a, assegnatoNome: aU.nome } })).count,
    assistenze: (await tx.assistenza.updateMany({ where: { assegnatoUtenteId: da, stato: { notIn: ["RISOLTA", "ANNULLATA"] } }, data: { assegnatoUtenteId: a, assegnatoNome: aU.nome } })).count,
    attivita: (await tx.attivita.updateMany({ where: { utenteId: da, completata: false }, data: { utenteId: a } })).count,
  }));
  const fatto = Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`);
  aggiorna(da); aggiorna(a);
  torna(ritorno, { ok: fatto.length ? `Passati a ${aU.nome}: ${fatto.join(", ")}. Lo storico chiuso resta a nome di ${dU.nome}.` : `${dU.nome} non aveva lavoro aperto da passare.` });
}

/** Elimina solo chi non ha nessun dato collegato (es. creato per sbaglio); per chi ha lavorato si usa "Disattivato". */
export async function eliminaUtente(fd: FormData) {
  const admin = await amministratore();
  const id = str(fd, "utenteId"), ritorno = str(fd, "ritorno");
  if (!id) return;
  if (id === admin.id) torna(ritorno, { errore: "Non puoi eliminare te stesso." });
  const u = await prisma.utente.findUniqueOrThrow({ where: { id } });
  const c = await datiCollegati(id);
  if (totaleCollegati(c)) torna(ritorno, { errore: `${u.nome} ha dati collegati (${Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ")}): non si può eliminare senza perdere lo storico. Mettilo "Disattivato".` });
  await prisma.utente.delete({ where: { id } });
  revalidatePath("/commerciali");
  revalidatePath("/impostazioni");
  redirect(`/commerciali?ok=${encodeURIComponent(`${u.nome} eliminato.`)}`);
}

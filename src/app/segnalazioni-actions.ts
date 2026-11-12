"use server";

// Assistenza interna (richiesta di Ugo, nov 2026): il team segnala un problema dal menu («🆘 Segnala un problema»);
// arriva a chi segue l'assistenza (Rocco) con l'amministratore in copia, con la pagina e le schermate.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { inviaMail, APP_URL } from "@/lib/mail/invio";
import { destinatarioAssistenza, gestisceSegnalazioni, CHIAVE_DESTINATARIO } from "@/lib/segnalazioni/server";

const MAX_TOTALE = 3.8 * 1024 * 1024; // le richieste a Vercel arrivano fino a 4,5 MB
const TIPI = /^(image\/(png|jpe?g|webp|gif|heic)|application\/pdf)$/i;

export type EsitoSegnalazione = { ok: boolean; messaggio: string; id?: string };

/** Invia la segnalazione (chiamata dalla finestra del menu, non cambia pagina). */
export async function inviaSegnalazione(fd: FormData): Promise<EsitoSegnalazione> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, messaggio: "Sessione scaduta: rientra in P&C ONE" };
  const testo = String(fd.get("testo") ?? "").trim();
  if (testo.length < 3) return { ok: false, messaggio: "Scrivi cosa non va (anche poche parole)" };
  const pagina = String(fd.get("pagina") ?? "").trim().slice(0, 500) || null;
  const file = fd.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0).slice(0, 5);
  for (const f of file) if (!TIPI.test(f.type)) return { ok: false, messaggio: `«${f.name}»: si possono allegare solo immagini o PDF` };
  if (file.reduce((s, f) => s + f.size, 0) > MAX_TOTALE) return { ok: false, messaggio: "Schermate troppo pesanti: togline qualcuna (in tutto massimo 3,8 MB)" };
  const allegati = await Promise.all(file.map(async (f) => ({ nome: f.name || "schermata.jpg", mime: f.type, contenuto: Buffer.from(await f.arrayBuffer()) })));

  const dest = await destinatarioAssistenza();
  const s = await prisma.segnalazione.create({
    data: {
      autoreId: u.id, autoreNome: u.nome, pagina, testo, destinatarioId: dest?.id ?? null,
      allegati: { create: allegati.map((a) => ({ nome: a.nome, mime: a.mime, dimensione: a.contenuto.length, contenuto: a.contenuto })) },
    },
  });

  // email a chi segue l'assistenza, con gli amministratori in copia (chi scrive non riceve la sua stessa email)
  const admin = await prisma.utente.findMany({ where: { stato: "ATTIVO", ruolo: "AMMINISTRATORE" }, select: { id: true, email: true } });
  const a = dest && dest.id !== u.id ? [dest.email] : [];
  const cc = admin.filter((x) => x.id !== u.id && x.id !== dest?.id).map((x) => x.email);
  const inCopia = a.length > 0 && cc.length > 0;
  const destinatari = a.length ? a : cc.splice(0, cc.length);
  if (destinatari.length) {
    await inviaMail({
      a: destinatari, cc,
      oggetto: `[CRM P&C] 🆘 Segnalazione di ${u.nome}: ${testo.split("\n")[0].slice(0, 70)}`,
      testo: `${u.nome} ha segnalato un problema in P&C ONE:\n\n${testo}\n\nPagina: ${pagina ?? "(non indicata)"}\n${allegati.length ? `Schermate allegate: ${allegati.length}\n` : ""}\nApri le segnalazioni: ${APP_URL}/segnalazioni#s-${s.id}\n`,
      allegati, rispondiA: u.email,
    });
  }
  revalidatePath("/segnalazioni");
  revalidatePath("/");
  return { ok: true, id: s.id, messaggio: `Inviata a ${dest && dest.id !== u.id ? dest.nome : "l'assistenza"}${inCopia ? " con l'amministratore in copia" : ""}: ti risponde appena possibile.` };
}

/** Chiude la segnalazione con una risposta che arriva via email a chi l'ha fatta. */
export async function risolviSegnalazione(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = String(fd.get("id") ?? "");
  const s = await prisma.segnalazione.findUnique({ where: { id } });
  if (!s) redirect("/segnalazioni");
  if (!gestisceSegnalazioni(u, (await destinatarioAssistenza())?.id ?? s!.destinatarioId)) redirect("/segnalazioni?errore=" + encodeURIComponent("Le segnalazioni le chiude chi segue l'assistenza"));
  const risposta = String(fd.get("risposta") ?? "").trim() || null;
  await prisma.segnalazione.update({ where: { id }, data: { stato: "RISOLTA", risposta, risoltaIl: new Date(), risoltaDaNome: u!.nome } });
  const autore = await prisma.utente.findUnique({ where: { id: s!.autoreId }, select: { email: true, nome: true } });
  if (autore?.email && s!.autoreId !== u!.id) {
    await inviaMail({
      a: [autore.email], daUtenteId: u!.id,
      oggetto: `[CRM P&C] ✅ La tua segnalazione è risolta`,
      testo: `Ciao ${autore.nome.split(" ")[0]},\n\nla tua segnalazione «${s!.testo.split("\n")[0].slice(0, 80)}» è stata risolta da ${u!.nome}.${risposta ? `\n\n${risposta}` : ""}\n\nLe tue segnalazioni: ${APP_URL}/segnalazioni\n`,
    });
  }
  revalidatePath("/segnalazioni");
  revalidatePath("/");
  redirect(`/segnalazioni?fatto=${encodeURIComponent(`Segnalazione di ${s!.autoreNome} risolta`)}`);
}

/** Riapre una segnalazione chiusa per sbaglio. */
export async function riapriSegnalazione(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = String(fd.get("id") ?? "");
  const s = await prisma.segnalazione.findUnique({ where: { id } });
  if (!s || !gestisceSegnalazioni(u, (await destinatarioAssistenza())?.id ?? s.destinatarioId)) redirect("/segnalazioni");
  await prisma.segnalazione.update({ where: { id }, data: { stato: "APERTA", risoltaIl: null, risoltaDaNome: null } });
  revalidatePath("/segnalazioni");
  redirect("/segnalazioni");
}

/** Chi riceve le segnalazioni (Impostazioni, solo amministratore). */
export async function salvaDestinatarioAssistenza(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || !isAmministratore(u)) redirect("/impostazioni");
  const id = String(fd.get("utenteId") ?? "");
  if (id) await prisma.configurazione.upsert({ where: { chiave: CHIAVE_DESTINATARIO }, create: { chiave: CHIAVE_DESTINATARIO, valore: id }, update: { valore: id } });
  else await prisma.configurazione.deleteMany({ where: { chiave: CHIAVE_DESTINATARIO } });
  revalidatePath("/impostazioni");
  redirect("/impostazioni?ok=" + encodeURIComponent("Destinatario delle segnalazioni salvato") + "#assistenza");
}

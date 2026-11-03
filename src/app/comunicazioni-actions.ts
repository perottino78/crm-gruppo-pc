"use server";

// Comunicazioni interne al team: le mandano l'amministratore e il marketing (Rocco), a chi scelgono; si può aggiungere un task.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAmministratore, hashPassword } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { inviaMail, APP_URL } from "@/lib/mail/invio";
import { firmaDi, firmaHtml, firmaTesto } from "@/lib/mail/firma";
import { riempi, valoriPer, usaPassword, emailComunicazione } from "@/lib/comunicazioni/testo";
import { passwordProvvisoria } from "@/lib/comunicazioni/password";
import { daOraRoma } from "@/lib/calendario/tempo";

/** Chi può mandare comunicazioni al team: amministratore, marketing o chi ha il permesso «comunicazioni». */
async function mittente() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u!;
}
const puoInviare = (u: Parameters<typeof puo>[0]) => puo(u, "comunicazioni") || puo(u, "marketing");
const vai = (p: Record<string, string>) => redirect(`/comunicazioni?${new URLSearchParams(p)}`);

export async function inviaComunicazione(fd: FormData) {
  const u = await mittente();
  if (!puoInviare(u)) vai({ errore: "Le comunicazioni al team le mandano l'amministratore e il marketing" });
  const oggetto = String(fd.get("oggetto") ?? "").trim();
  const testo = String(fd.get("testo") ?? "").trim();
  const prova = fd.get("prova") === "1";
  const conTask = fd.get("conTask") === "1";
  const titoloTask = String(fd.get("titoloTask") ?? "").trim() || oggetto;
  const scadenza = String(fd.get("scadenzaTask") ?? "").trim();
  const scadenzaTask = scadenza ? daOraRoma(`${scadenza}T18:00`) : null;
  // password provvisoria nuova: solo l'amministratore, e solo se il testo la usa
  const conPassword = fd.get("password") === "1" && usaPassword(testo);
  if (!oggetto || !testo) vai({ errore: "Scrivi oggetto e testo" });
  if (conPassword && !isAmministratore(u)) vai({ errore: "Solo l'amministratore può generare password provvisorie" });

  const ids = [...new Set(fd.getAll("destinatari").map(String).filter(Boolean))];
  const utenti = prova
    ? [u]
    : await prisma.utente.findMany({ where: { id: { in: ids }, stato: "ATTIVO" }, orderBy: { nome: "asc" } });
  if (!utenti.length) vai({ errore: "Scegli almeno una persona a cui mandarla" });

  const firma = firmaDi(u);
  const firmaH = firmaHtml(firma), firmaT = firmaTesto(firma);
  const esiti: { utenteId: string; nome: string; email: string; stato: string; motivo: string | null }[] = [];
  for (const d of utenti) {
    // la password si cambia solo se l'email parte davvero (altrimenti la persona resterebbe fuori); mai la propria
    const nuova = conPassword && !prova && d.id !== u.id ? passwordProvvisoria() : null;
    const valori = valoriPer(
      { id: d.id, nome: d.nome, email: d.email, username: d.username, ruolo: d.ruolo, ufficio: d.ufficio },
      { link: APP_URL, password: prova && conPassword ? "Pec-esempio23 (nella prova non cambia nulla)" : nuova },
    );
    const corpo = emailComunicazione({ testo: riempi(testo, valori), firmaHtml: firmaH, firmaTesto: firmaT });
    const esito = await inviaMail({ a: [d.email], oggetto: `${prova ? "[PROVA] " : ""}${riempi(oggetto, valori)}`, testo: corpo.testo, html: corpo.html, daUtenteId: u.id });
    if (esito.inviata && nuova) await prisma.utente.update({ where: { id: d.id }, data: { passwordHash: await hashPassword(nuova), mustChangePassword: true } });
    esiti.push({ utenteId: d.id, nome: d.nome, email: d.email, stato: esito.inviata ? "INVIATA" : "NON_INVIATA", motivo: esito.inviata ? null : esito.motivo ?? "non inviata" });
  }
  if (prova) {
    const e = esiti[0];
    vai(e.stato === "INVIATA" ? { ok: `Prova mandata a ${e.email}: controlla la tua casella` } : { errore: `Prova non partita: ${e.motivo}` });
  }

  const c = await prisma.comunicazione.create({
    data: {
      oggetto, testo, mittenteId: u.id, mittenteNome: u.nome, conTask, titoloTask: conTask ? titoloTask : null, scadenzaTask: conTask ? scadenzaTask : null, conPassword,
      destinatari: { create: esiti },
    },
  });
  const inviate = esiti.filter((e) => e.stato === "INVIATA").length;
  revalidatePath("/comunicazioni");
  vai({ inviata: c.id, ok: `Comunicazione inviata a ${inviate} di ${esiti.length}${conTask ? ", con il task per ognuno" : ""}${inviate < esiti.length ? ": controlla chi non l'ha ricevuta" : ""}` });
}

/** Segna come letta / fatta (solo la propria). */
export async function segnaComunicazione(fd: FormData) {
  const u = await mittente();
  const id = String(fd.get("id") ?? "");
  const cosa = String(fd.get("cosa") ?? "");
  const r = await prisma.comunicazioneDestinatario.findFirst({ where: { id, utenteId: u.id } });
  if (!r) vai({ errore: "Comunicazione non trovata" });
  const ora = new Date();
  const data = cosa === "fatto" ? { fattoIl: r!.fattoIl ? null : ora, lettaIl: r!.lettaIl ?? ora } : { lettaIl: ora };
  await prisma.comunicazioneDestinatario.update({ where: { id }, data });
  revalidatePath("/comunicazioni");
  revalidatePath("/");
  redirect(`/comunicazioni#r-${id}`);
}

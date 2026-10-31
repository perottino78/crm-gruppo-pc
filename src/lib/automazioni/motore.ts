// Motore dei percorsi automatici del lead: esiti, invii programmati, esecuzione.
// Regole (dalle automazioni Keap): ogni nuovo esito annulla le azioni future del ciclo precedente; un passo non viene
// mai eseguito due volte (chiave unica); gli invii in ritardo di oltre 24 ore non partono da soli; le email
// non bloccano mai il lavoro. Il passo successivo si programma quando il precedente è davvero concluso.
import { createHmac, randomUUID } from "crypto";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inviaMail, mailConfigurata, APP_URL } from "@/lib/mail/invio";
import { PERCORSI, ESITI, quandoPasso, esitiPossibili, scadenzaDopoEsito } from "./percorsi";
import { chiusuraGiornata, troppoInRitardo } from "./tempi";
import { componiEmail, htmlEmail, testoEmail, CONTATTI, type DatiLeadEmail } from "./email";

type Db = Prisma.TransactionClient | typeof prisma;
export const CHIAVE_ATTIVE = "automazioni_lead_attive";

/** Le email automatiche partono solo se accese in Impostazioni (finché Keap è attivo restano in pausa) e se c'è la posta. */
export async function statoAutomazioni(): Promise<{ attive: boolean; posta: boolean }> {
  const c = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE_ATTIVE } });
  return { attive: c?.valore === "1", posta: mailConfigurata() };
}

const SEGRETO = process.env.SESSION_SECRET || "gpc-2026-session-secret-x7f2-cambiami-in-produzione";
export const firmaDisiscrizione = (leadId: string) => createHmac("sha256", SEGRETO).update(`disiscrivi:${leadId}`).digest("hex").slice(0, 24);
export const linkDisiscrizione = (leadId: string) => `${APP_URL}/api/disiscrizione?l=${encodeURIComponent(leadId)}&t=${firmaDisiscrizione(leadId)}`;
export const linkLead = (leadId: string) => `${APP_URL}/lead?id=${encodeURIComponent(leadId)}`;

export async function evento(db: Db, leadId: string, tipo: string, testo: string, utenteNome?: string | null) {
  await db.leadEvento.create({ data: { leadId, tipo, testo, utenteNome: utenteNome ?? null } });
}

/** Apre un nuovo ciclo per il lead: annulla le azioni future rimaste e programma il primo passo del percorso. */
export async function avviaPercorso(db: Db, leadId: string, percorso: string, adesso: Date, richiamoIl?: Date | null) {
  await db.invioProgrammato.updateMany({ where: { leadId, stato: "IN_ATTESA" }, data: { stato: "ANNULLATO", errore: "superato da un nuovo esito" } });
  const passi = PERCORSI[percorso] ?? [];
  if (!passi.length) return;
  const run = randomUUID();
  await db.invioProgrammato.create({ data: { leadId, run, percorso, passo: 0, chiave: `${run}:0`, eseguiDopo: quandoPasso(passi[0].quando, adesso, richiamoIl) } });
}

/** Lead appena arrivato (Facebook, landing, form): scadenza alle 18:30 e avviso al centralino. */
export async function avviaNuovoLead(leadId: string, adesso = new Date()) {
  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.update({ where: { id: leadId }, data: { fase: "NUOVO", scadenzaAzione: chiusuraGiornata(adesso) } });
    await evento(tx, leadId, "lead.creato", `Nuovo lead (${lead.fonte}): da classificare in target o fuori regione.`);
    await avviaPercorso(tx, leadId, "NUOVO", adesso);
  });
}

export type EsitoLead = { leadId: string; esito: string; data?: Date | null; note?: string | null; utenteNome?: string | null };

/** Registra l'esito di una telefonata/classificazione e avvia il percorso corrispondente. Ritorna un errore leggibile. */
export async function registraEsito(e: EsitoLead, adesso = new Date()): Promise<{ ok: true } | { ok: false; errore: string }> {
  const def = ESITI[e.esito];
  if (!def) return { ok: false, errore: "Esito non valido." };
  const lead = await prisma.lead.findUnique({ where: { id: e.leadId } });
  if (!lead) return { ok: false, errore: "Lead non trovato." };
  if (!esitiPossibili(lead.fase).includes(e.esito)) return { ok: false, errore: `Da "${lead.fase}" non si può passare a "${def.nome}".` };
  if (def.serveData && !e.data) return { ok: false, errore: def.serveData === "richiamo" ? "Indica data e ora del ricontatto." : "Indica data e ora dell'appuntamento." };
  if (def.serveData && e.data && e.data.getTime() < adesso.getTime() - 60_000) return { ok: false, errore: "La data indicata è già passata." };
  const quando = e.data ? e.data.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }) : null;
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: e.leadId },
      data: {
        fase: e.esito,
        scadenzaAzione: scadenzaDopoEsito(e.esito, adesso, e.data),
        nonGestitoIl: null,
        ...(def.serveData === "richiamo" ? { richiamoIl: e.data } : {}),
        ...(def.serveData === "appuntamento" ? { appuntamentoIl: e.data } : {}),
        ...(e.note ? { note: [lead.note, `[${adesso.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} ${e.utenteNome ?? ""}] ${e.note}`].filter(Boolean).join("\n") } : {}),
      },
    });
    await evento(tx, e.leadId, "lead.esito", `${def.nome}${quando ? ` — ${quando}` : ""}${e.note ? ` · ${e.note}` : ""}`, e.utenteNome);
    await avviaPercorso(tx, e.leadId, e.esito, adesso, def.serveData === "richiamo" ? e.data : null);
  });
  return { ok: true };
}

/** Il ciclo valido del lead è l'ultimo aperto: un passo di un ciclo vecchio non va eseguito né proseguito. */
async function cicloCorrente(leadId: string): Promise<string | null> {
  return (await prisma.invioProgrammato.findFirst({ where: { leadId }, orderBy: [{ createdAt: "desc" }, { passo: "desc" }], select: { run: true } }))?.run ?? null;
}

function datiEmail(l: { nome: string; telefono: string | null; email: string | null; comune: string | null; cap: string | null; prodotto: string | null; fonte: string; richiamoIl: Date | null; brand: { nome: string } }): DatiLeadEmail {
  return { nome: l.nome, telefono: l.telefono, email: l.email, comune: l.comune, cap: l.cap, prodotto: l.prodotto, fonte: l.fonte, marchio: l.brand.nome, richiamoIl: l.richiamoIl };
}

export type Resoconto = { eseguiti: number; email: number; soppresse: number; fallite: number; annullati: number; daVerificare: number; motivo?: string };

/**
 * Esegue gli invii programmati arrivati a scadenza. Si chiama dopo ogni esito, dal controllo periodico e all'apertura
 * del CRM. Sicuro da chiamare più volte in parallelo: ogni invio viene "prenotato" da un solo esecutore.
 */
export async function eseguiInviiScaduti(opz: { adesso?: () => Date; max?: number; forza?: boolean } = {}): Promise<Resoconto> {
  const ora = opz.adesso ?? (() => new Date());
  const r: Resoconto = { eseguiti: 0, email: 0, soppresse: 0, fallite: 0, annullati: 0, daVerificare: 0 };
  const stato = await statoAutomazioni();
  if (!opz.forza && !stato.attive) return { ...r, motivo: "email automatiche in pausa" };
  if (!stato.posta) return { ...r, motivo: "posta (SMTP) non configurata" };
  // un invio rimasto "in corso" oltre la prenotazione: non si sa se è partito → da verificare, senza reinviare
  r.daVerificare += (await prisma.invioProgrammato.updateMany({ where: { stato: "IN_CORSO", bloccatoFino: { lt: ora() } }, data: { stato: "DA_VERIFICARE", errore: "interrotto durante l'invio: controllare prima di reinviare" } })).count;

  for (let giro = 0; giro < (opz.max ?? 25); giro++) {
    const job = await prisma.invioProgrammato.findFirst({ where: { stato: "IN_ATTESA", eseguiDopo: { lte: ora() } }, orderBy: { eseguiDopo: "asc" } });
    if (!job) break;
    const preso = await prisma.invioProgrammato.updateMany({ where: { id: job.id, stato: "IN_ATTESA" }, data: { stato: "IN_CORSO", bloccatoFino: new Date(ora().getTime() + 2 * 60_000), tentativi: { increment: 1 } } });
    if (preso.count !== 1) continue; // l'ha preso un altro esecutore
    r.eseguiti++;
    const chiudi = (data: Prisma.InvioProgrammatoUpdateInput) => prisma.invioProgrammato.update({ where: { id: job.id }, data: { eseguitoIl: ora(), bloccatoFino: null, ...data } });
    const passi = PERCORSI[job.percorso] ?? [];
    const passo = passi[job.passo];
    const lead = await prisma.lead.findUnique({ where: { id: job.leadId }, include: { brand: true } });
    if (!lead || !passo || lead.fase !== job.percorso || (await cicloCorrente(lead.id)) !== job.run) { await chiudi({ stato: "ANNULLATO", errore: "il lead ha cambiato fase" }); r.annullati++; continue; }
    if (troppoInRitardo(job.eseguiDopo, ora())) {
      await chiudi({ stato: "DA_VERIFICARE", errore: "in ritardo di oltre 24 ore: non inviato in automatico" });
      await evento(prisma, lead.id, "automazione.da_verificare", `"${passo.nome}" non inviato: in ritardo di oltre 24 ore.`);
      r.daVerificare++;
      continue;
    }

    if (passo.tipo === "TIMEOUT") {
      await prisma.lead.update({ where: { id: lead.id }, data: { nonGestitoIl: ora() } });
      await evento(prisma, lead.id, "lead.non_gestito", passo.nome);
      await chiudi({ stato: "FATTO" });
    } else {
      const link = { lead: linkLead(lead.id), disiscrizione: linkDisiscrizione(lead.id) };
      const e = componiEmail(passo.modello, datiEmail(lead), link, passo.variante);
      const a = passo.a === "CLIENTE" ? lead.email : CONTATTI.centralino;
      const da = passo.a === "CLIENTE" ? CONTATTI.mittenteClienti : CONTATTI.mittenteInterne;
      const soppressa = passo.a === "CLIENTE" && (!lead.email ? "il cliente non ha email" : lead.disiscritto ? "il cliente si è disiscritto" : null);
      const base = { leadId: lead.id, chiave: e.chiave, versione: e.versione, categoria: e.categoria, da, a, oggetto: e.oggetto, testo: testoEmail(e, link), html: htmlEmail(e, link) };
      const reg = await prisma.emailLead.upsert({ where: { chiaveIdempotenza: job.chiave }, create: { ...base, chiaveIdempotenza: job.chiave, stato: "PREPARATA" }, update: {} });
      if (reg.stato === "INVIATA") {
        await chiudi({ stato: "FATTO", emailId: reg.id }); // già partita in un tentativo precedente: non si rimanda
      } else if (soppressa) {
        await prisma.emailLead.update({ where: { id: reg.id }, data: { stato: "SOPPRESSA", motivo: soppressa } });
        await evento(prisma, lead.id, "email.soppressa", `${e.oggetto} — non inviata: ${soppressa}`);
        await chiudi({ stato: "FATTO", emailId: reg.id });
        r.soppresse++;
      } else {
        const esito = await inviaMail({ a: [a!], oggetto: reg.oggetto, testo: reg.testo, html: reg.html, da: reg.da ?? undefined });
        if (esito.inviata) {
          await prisma.emailLead.update({ where: { id: reg.id }, data: { stato: "INVIATA", inviataIl: ora(), motivo: null } });
          await evento(prisma, lead.id, "email.inviata", `${e.oggetto} → ${a}`);
          await chiudi({ stato: "FATTO", emailId: reg.id });
          r.email++;
        } else {
          await prisma.emailLead.update({ where: { id: reg.id }, data: { stato: "FALLITA", motivo: esito.motivo ?? "errore di invio" } });
          // al massimo tre tentativi: dopo 1 minuto e dopo 5 minuti, poi si ferma
          if (job.tentativi + 1 < 3) {
            await prisma.invioProgrammato.update({ where: { id: job.id }, data: { stato: "IN_ATTESA", bloccatoFino: null, errore: esito.motivo ?? null, eseguiDopo: new Date(ora().getTime() + (job.tentativi === 0 ? 1 : 5) * 60_000) } });
          } else {
            await chiudi({ stato: "FALLITO", errore: esito.motivo ?? "errore di invio" });
            await evento(prisma, lead.id, "email.fallita", `${e.oggetto} — non inviata: ${esito.motivo ?? "errore"}`);
          }
          r.fallite++;
          continue;
        }
      }
    }
    // passo concluso: si programma il successivo partendo da adesso (niente raffiche di arretrati)
    const prossimo = passi[job.passo + 1];
    if (prossimo && (await cicloCorrente(lead.id)) === job.run) {
      await prisma.invioProgrammato.create({ data: { leadId: lead.id, run: job.run, percorso: job.percorso, passo: job.passo + 1, chiave: `${job.run}:${job.passo + 1}`, eseguiDopo: quandoPasso(prossimo.quando, ora(), lead.richiamoIl) } }).catch(() => undefined);
    }
  }
  return r;
}

/** Disiscrizione dal link nell'email: il cliente non riceve più email automatiche (quelle interne continuano). */
export async function disiscrivi(leadId: string, firma: string): Promise<boolean> {
  if (!leadId || firma !== firmaDisiscrizione(leadId)) return false;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return false;
  if (!lead.disiscritto) {
    await prisma.lead.update({ where: { id: leadId }, data: { disiscritto: true, disiscrittoIl: new Date() } });
    await evento(prisma, leadId, "lead.disiscritto", "Il cliente ha chiesto di non ricevere più email.");
  }
  return true;
}

/** Esegue gli invii scaduti dopo aver risposto all'utente (fuori da una richiesta, ad es. nei collaudi, non fa nulla). */
export function eseguiDopoRisposta() {
  try {
    after(() => eseguiInviiScaduti().then(() => undefined, () => undefined));
  } catch {
    // fuori dal contesto di una richiesta Next: ci penserà il controllo periodico
  }
}

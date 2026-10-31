// Motore dei percorsi automatici del lead: esiti, invii programmati, esecuzione.
// Regole (dalle automazioni Keap): ogni nuovo esito annulla le azioni future del ciclo precedente; un passo non viene
// mai eseguito due volte (chiave unica); gli invii in ritardo di oltre 24 ore non partono da soli; le email
// non bloccano mai il lavoro. Il passo successivo si programma quando il precedente è davvero concluso.
import { createHmac, randomUUID } from "crypto";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inviaMail, mailConfigurata, APP_URL } from "@/lib/mail/invio";
import { PERCORSI, ESITI, quandoPasso, esitiPossibili, scadenzaDopoEsito, faseDelPercorso, daSaltare } from "./percorsi";
import { provenienzaDaFonte } from "@/lib/clienti/provenienza";
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

type DateLead = { richiamoIl?: Date | null; appuntamentoIl?: Date | null };

/**
 * Programma il prossimo passo utile del ciclo a partire da `da`. I passi da saltare (lettere troppo vicine
 * all'appuntamento, promemoria già superati) si decidono qui, subito, e restano nello storico come SALTATO:
 * così un'attesa lunga non fa mai scavalcare il promemoria del giorno prima.
 */
async function programmaDa(db: Db, leadId: string, run: string, percorso: string, da: number, riferimento: Date, date: DateLead) {
  const passi = PERCORSI[percorso] ?? [];
  for (let i = da; i < passi.length; i++) {
    const quando = quandoPasso(passi[i].quando, riferimento, date);
    const salta = passi[i].tipo === "EMAIL" ? daSaltare((passi[i] as { condizione?: Parameters<typeof daSaltare>[0] }).condizione, quando, riferimento, date.appuntamentoIl) : null;
    if (!salta) {
      await db.invioProgrammato.create({ data: { leadId, run, percorso, passo: i, chiave: `${run}:${i}`, eseguiDopo: quando } });
      return;
    }
    await db.invioProgrammato.create({ data: { leadId, run, percorso, passo: i, chiave: `${run}:${i}`, eseguiDopo: quando, stato: "SALTATO", errore: salta, eseguitoIl: riferimento } });
  }
}

/** Apre un nuovo ciclo per il lead: annulla le azioni future rimaste e programma il primo passo del percorso. */
export async function avviaPercorso(db: Db, leadId: string, percorso: string, adesso: Date, date: DateLead = {}) {
  await db.invioProgrammato.updateMany({ where: { leadId, stato: "IN_ATTESA" }, data: { stato: "ANNULLATO", errore: "superato da un nuovo esito" } });
  if (!(PERCORSI[percorso] ?? []).length) return;
  await programmaDa(db, leadId, randomUUID(), percorso, 0, adesso, date);
}

/** Lead appena arrivato (Facebook, landing, form): scadenza alle 18:30 e avviso al centralino. */
export async function avviaNuovoLead(leadId: string, adesso = new Date()) {
  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.update({ where: { id: leadId }, data: { fase: "NUOVO", scadenzaAzione: chiusuraGiornata(adesso) } });
    await evento(tx, leadId, "lead.creato", `Nuovo lead (${lead.fonte}): da classificare in target o fuori regione.`);
    await avviaPercorso(tx, leadId, "NUOVO", adesso);
  });
}

export type EsitoLead = { leadId: string; esito: string; data?: Date | null; note?: string | null; utenteNome?: string | null; venditoreId?: string | null; indirizzo?: string | null };

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
  const appuntamento = e.esito === "APPUNTAMENTO_CASA" || e.esito === "APPUNTAMENTO_SHOWROOM";
  const indirizzo = e.indirizzo?.trim() || (e.esito === "APPUNTAMENTO_CASA" ? [lead.cap, lead.comune].filter(Boolean).join(" ") : "") || null;
  if (e.esito === "APPUNTAMENTO_CASA" && !indirizzo) return { ok: false, errore: "Indica l'indirizzo dell'appuntamento a casa." };
  const venditore = appuntamento && e.venditoreId ? await prisma.utente.findUnique({ where: { id: e.venditoreId }, select: { id: true, nome: true } }) : null;
  if (appuntamento && e.venditoreId && !venditore) return { ok: false, errore: "Venditore non trovato." };
  // appuntamento senza venditore: prima il centralino lo assegna, poi partono conferme e lettere
  const percorso = appuntamento && !venditore ? e.esito.replace("APPUNTAMENTO_", "ASSEGNA_VENDITORE_") : e.esito;
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: e.leadId },
      data: {
        fase: e.esito,
        scadenzaAzione: scadenzaDopoEsito(e.esito, adesso, e.data),
        nonGestitoIl: null,
        ...(def.serveData === "richiamo" ? { richiamoIl: e.data } : {}),
        ...(def.serveData === "appuntamento" ? { appuntamentoIl: e.data, venditoreId: venditore?.id ?? null, indirizzoAppuntamento: e.esito === "APPUNTAMENTO_CASA" ? indirizzo : null } : {}),
        ...(e.note ? { note: [lead.note, `[${adesso.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}${e.utenteNome ? ` ${e.utenteNome}` : ""}] ${e.note}`].filter(Boolean).join("\n") } : {}),
      },
    });
    await evento(tx, e.leadId, "lead.esito", `${def.nome}${quando ? ` — ${quando}` : ""}${venditore ? ` con ${venditore.nome}` : appuntamento ? " (venditore da assegnare)" : ""}${e.note ? ` · ${e.note}` : ""}`, e.utenteNome);
    await avviaPercorso(tx, e.leadId, percorso, adesso, { richiamoIl: def.serveData === "richiamo" ? e.data : null, appuntamentoIl: def.serveData === "appuntamento" ? e.data : null });
  });
  if (appuntamento || e.esito === "APPUNTAMENTO_ANNULLATO") await sincronizzaCalendario(e.leadId, e.utenteNome);
  return { ok: true };
}

/** Il centralino assegna (o cambia) il venditore di un appuntamento: partono conferme, lettere e promemoria. */
export async function assegnaVenditore(leadId: string, venditoreId: string, utenteNome?: string | null, adesso = new Date()): Promise<{ ok: true } | { ok: false; errore: string }> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || (lead.fase !== "APPUNTAMENTO_CASA" && lead.fase !== "APPUNTAMENTO_SHOWROOM") || !lead.appuntamentoIl) return { ok: false, errore: "Il lead non ha un appuntamento fissato." };
  if (lead.appuntamentoIl.getTime() < adesso.getTime()) return { ok: false, errore: "L'appuntamento è già passato." };
  const venditore = await prisma.utente.findUnique({ where: { id: venditoreId }, select: { id: true, nome: true } });
  if (!venditore) return { ok: false, errore: "Venditore non trovato." };
  if (lead.venditoreId === venditore.id) return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: leadId }, data: { venditoreId: venditore.id } });
    await evento(tx, leadId, "lead.venditore", `Venditore dell'appuntamento: ${venditore.nome}`, utenteNome);
    await avviaPercorso(tx, leadId, lead.fase, adesso, { appuntamentoIl: lead.appuntamentoIl });
  });
  await sincronizzaCalendario(leadId, utenteNome);
  return { ok: true };
}

/**
 * Riporta l'appuntamento del lead nel calendario del venditore: crea il cliente (se il lead non lo è ancora) e
 * l'appuntamento, lo sposta se cambiano data/venditore, lo annulla se il cliente annulla. Non blocca mai l'esito.
 */
export async function sincronizzaCalendario(leadId: string, utenteNome?: string | null) {
  try {
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { clienteGenerato: { select: { id: true } } } });
    const esistente = lead.appuntamentoId ? await prisma.appuntamento.findUnique({ where: { id: lead.appuntamentoId } }) : null;
    if (lead.fase === "APPUNTAMENTO_ANNULLATO") {
      if (esistente) await prisma.appuntamento.update({ where: { id: esistente.id }, data: { stato: "ANNULLATO" } });
      return;
    }
    if ((lead.fase !== "APPUNTAMENTO_CASA" && lead.fase !== "APPUNTAMENTO_SHOWROOM") || !lead.venditoreId || !lead.appuntamentoIl) return;
    const casa = lead.fase === "APPUNTAMENTO_CASA";
    const clienteId = lead.clienteGenerato?.id ?? (await prisma.cliente.create({
      data: {
        nome: lead.nome, telefono: lead.telefono, email: lead.email, brandId: lead.brandId, leadOrigineId: lead.id,
        origine: provenienzaDaFonte(lead.fonte), categoria: "Lead", responsabileId: lead.venditoreId,
        comune: lead.comune, cap: lead.cap, indirizzo: casa ? lead.indirizzoAppuntamento : null,
      },
    })).id;
    const dati = {
      dataOra: lead.appuntamentoIl, utenteId: lead.venditoreId, stato: "PROGRAMMATO", durataMin: 90,
      titolo: `Appuntamento ${casa ? "a casa" : "in showroom"}${lead.prodotto ? ` — ${lead.prodotto}` : ""}`,
      luogo: casa ? lead.indirizzoAppuntamento : CONTATTI.showroom, note: lead.note,
    };
    if (esistente) await prisma.appuntamento.update({ where: { id: esistente.id }, data: dati });
    else {
      const a = await prisma.appuntamento.create({ data: { ...dati, clienteId, tipo: "COMMERCIALE", creatoDaNome: utenteNome ?? "Lead da lavorare" } });
      await prisma.lead.update({ where: { id: leadId }, data: { appuntamentoId: a.id } });
    }
  } catch (err) {
    await evento(prisma, leadId, "calendario.errore", `Calendario non aggiornato: ${(err as Error).message.slice(0, 150)}`).catch(() => undefined);
  }
}

/** Il ciclo valido del lead è l'ultimo aperto: un passo di un ciclo vecchio non va eseguito né proseguito. */
async function cicloCorrente(leadId: string): Promise<string | null> {
  return (await prisma.invioProgrammato.findFirst({ where: { leadId }, orderBy: [{ createdAt: "desc" }, { passo: "desc" }], select: { run: true } }))?.run ?? null;
}

type LeadPerEmail = { nome: string; telefono: string | null; email: string | null; comune: string | null; cap: string | null; prodotto: string | null; fonte: string; note: string | null; richiamoIl: Date | null; appuntamentoIl: Date | null; indirizzoAppuntamento: string | null; brand: { nome: string } };
function datiEmail(l: LeadPerEmail, venditore: { nome: string; telefono: string | null; email: string } | null): DatiLeadEmail {
  return {
    nome: l.nome, telefono: l.telefono, email: l.email, comune: l.comune, cap: l.cap, prodotto: l.prodotto, fonte: l.fonte, marchio: l.brand.nome,
    richiamoIl: l.richiamoIl, appuntamentoIl: l.appuntamentoIl, indirizzoAppuntamento: l.indirizzoAppuntamento, note: l.note,
    venditore: venditore ? { nome: venditore.nome, telefono: venditore.telefono, email: venditore.email } : null,
  };
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
    if (!lead || !passo || lead.fase !== faseDelPercorso(job.percorso) || (await cicloCorrente(lead.id)) !== job.run) { await chiudi({ stato: "ANNULLATO", errore: "il lead ha cambiato fase" }); r.annullati++; continue; }
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
      const venditore = lead.venditoreId ? await prisma.utente.findUnique({ where: { id: lead.venditoreId }, select: { nome: true, telefono: true, email: true } }) : null;
      const e = componiEmail(passo.modello, datiEmail(lead, venditore), link, passo.variante);
      const a = passo.a === "CLIENTE" ? lead.email : passo.a === "VENDITORE" ? venditore?.email ?? null : CONTATTI.centralino;
      const da = passo.a === "CLIENTE" ? CONTATTI.mittenteClienti : CONTATTI.mittenteInterne;
      const soppressa = passo.a === "CLIENTE"
        ? (!lead.email ? "il cliente non ha email" : lead.disiscritto ? "il cliente si è disiscritto" : null)
        : passo.a === "VENDITORE" && (!/.+@.+\..+/.test(a ?? "") || (a ?? "").endsWith(".invalid")) ? "il venditore non ha un'email valida" : null;
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
    if (passi[job.passo + 1] && (await cicloCorrente(lead.id)) === job.run) {
      await programmaDa(prisma, lead.id, job.run, job.percorso, job.passo + 1, ora(), { richiamoIl: lead.richiamoIl, appuntamentoIl: lead.appuntamentoIl }).catch(() => undefined);
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

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { daOraRoma } from "@/lib/calendario/tempo";
import { normalizzaTelefono } from "@/lib/clienti/bconsole";
import { PERCORSI, ESITI } from "@/lib/automazioni/percorsi";
import { CHIAVE_ATTIVE } from "@/lib/automazioni/motore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const roma = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });

type Ricontatto = { keapId: string; nome: string; email?: string | null; telefono?: string | null; data: string; clienteId?: string | null; abbinamento?: string | null };
type Corpo = { telefonista: string; ricontatti: Ricontatto[]; clientiConAppuntamento?: { keapId: string; clienteId: string }[]; escludiLead?: string[] };

/**
 * Passaggio da Keap a P&C ONE (una tantum). GET?/POST con lo stesso corpo: senza ?esegui=1 è una PROVA che non scrive nulla.
 * 1. Annulla tutta la coda delle email automatiche creata prima di adesso (non ha più valore: le comunicazioni le ha fatte Keap).
 * 2. Per i lead con appuntamento futuro a casa/in showroom (venditore assegnato) programma solo i promemoria del giorno prima,
 *    cliente e venditore (niente conferme né lettere di vendita); se l'ora del promemoria è già passata ma mancano almeno 3 ore,
 *    parte subito. Per i clienti con appuntamento solo in calendario (arrivati da BConsole) crea prima il lead.
 * 3. Crea i ricontatti concordati in Keap come lead «Appuntamento da fissare (ricontatto)» della telefonista, senza email al
 *    cliente, con l'ID Keap e l'abbinamento nelle note; collegati al cliente esistente se c'è.
 * 4. Con ?attiva=1 accende le email automatiche.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const esegui = req.nextUrl.searchParams.get("esegui") === "1";
  const attiva = esegui && req.nextUrl.searchParams.get("attiva") === "1";
  const corpo = (await req.json()) as Corpo;
  const adesso = new Date();
  const out = { prova: !esegui, ora: roma(adesso), codaAnnullata: 0, promemoria: [] as string[], promemoriaSaltati: [] as string[], leadCreatiPerAppuntamento: [] as string[], ricontattiCreati: [] as string[], ricontattiSaltati: [] as string[], attivate: false };

  const tel = await prisma.utente.findFirst({ where: { nome: { contains: corpo.telefonista, mode: "insensitive" }, ruolo: "TELEFONISTA" }, select: { id: true, nome: true } });
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!tel || !brand) return NextResponse.json({ error: "telefonista o marchio P&C non trovati" }, { status: 400 });

  // 1. coda di prima dello switch
  const vecchi = { stato: { in: ["IN_ATTESA", "IN_CORSO", "DA_VERIFICARE", "FALLITO"] }, createdAt: { lt: adesso } };
  out.codaAnnullata = await prisma.invioProgrammato.count({ where: vecchi });
  if (esegui) await prisma.invioProgrammato.updateMany({ where: vecchi, data: { stato: "ANNULLATO", bloccatoFino: null, errore: "programmato prima del passaggio da Keap: non inviato" } });

  // 2a. clienti con appuntamento solo in calendario: serve il lead per i promemoria
  for (const c of corpo.clientiConAppuntamento ?? []) {
    const cli = await prisma.cliente.findUnique({ where: { id: c.clienteId }, include: { leadOrigine: { select: { id: true } } } });
    const app = cli && await prisma.appuntamento.findFirst({ where: { clienteId: cli.id, dataOra: { gt: adesso }, stato: { not: "ANNULLATO" }, tipo: { not: "TELEFONICO" } }, orderBy: { dataOra: "asc" } });
    if (!cli || !app) { out.promemoriaSaltati.push(`${c.clienteId}: cliente o appuntamento futuro non trovato`); continue; }
    if (cli.leadOrigine) { out.promemoriaSaltati.push(`${cli.nome}: ha già un lead (usato quello)`); continue; }
    out.leadCreatiPerAppuntamento.push(`${cli.nome} — ${roma(app.dataOra)}`);
    if (!esegui) continue;
    const l = await prisma.lead.create({
      data: {
        nome: cli.nome, telefono: cli.telefono ?? cli.cellulare, email: cli.email, brandId: cli.brandId, fonte: "keap", fase: "APPUNTAMENTO_CASA", telefonistaId: tel.id,
        appuntamentoIl: app.dataOra, appuntamentoId: app.id, venditoreId: app.utenteId, indirizzoAppuntamento: app.luogo, scadenzaAzione: app.dataOra,
        note: `[${adesso.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} Switch da Keap] Keap ID ${c.keapId} · appuntamento già nel calendario (da BConsole), lead creato per i promemoria`,
      },
    });
    await prisma.cliente.update({ where: { id: cli.id }, data: { leadOrigineId: l.id } });
    await prisma.leadEvento.create({ data: { leadId: l.id, tipo: "lead.esito", utenteNome: "Automatico", testo: `${ESITI.APPUNTAMENTO_CASA.nome} — ${roma(app.dataOra)} · portato da Keap allo switch (Keap ID ${c.keapId})` } });
  }

  // 2b. promemoria degli appuntamenti futuri
  const appuntamenti = await prisma.lead.findMany({
    where: { fase: { in: ["APPUNTAMENTO_CASA", "APPUNTAMENTO_SHOWROOM"] }, appuntamentoIl: { gt: adesso }, id: { notIn: corpo.escludiLead ?? [] } },
    select: { id: true, nome: true, fase: true, venditoreId: true, appuntamentoIl: true },
  });
  for (const l of appuntamenti) {
    if (!l.venditoreId) { out.promemoriaSaltati.push(`${l.nome}: venditore da assegnare`); continue; }
    const passi = PERCORSI[l.fase];
    const iCli = passi.findIndex((p) => p.tipo === "EMAIL" && p.modello === "appointment-reminder-contact");
    const iVen = passi.findIndex((p) => p.tipo === "EMAIL" && p.modello === "appointment-reminder-seller");
    let quando = new Date(l.appuntamentoIl!.getTime() - 24 * 3600_000);
    if (quando < adesso) {
      if (l.appuntamentoIl!.getTime() - adesso.getTime() < 3 * 3600_000) { out.promemoriaSaltati.push(`${l.nome}: appuntamento fra meno di 3 ore`); continue; }
      quando = adesso;
    }
    out.promemoria.push(`${l.nome} — appuntamento ${roma(l.appuntamentoIl!)} · promemoria ${roma(quando)}`);
    if (!esegui) continue;
    const run = randomUUID();
    await prisma.invioProgrammato.createMany({ data: [iCli, iVen].map((passo) => ({ leadId: l.id, run, percorso: l.fase, passo, chiave: `${run}:${passo}`, eseguiDopo: quando })) });
  }

  // 3. ricontatti concordati in Keap
  const tutti = await prisma.lead.findMany({ select: { email: true, telefono: true } });
  const giaEmail = new Set(tutti.map((l) => l.email?.trim().toLowerCase()).filter(Boolean));
  const giaTel = new Set(tutti.map((l) => normalizzaTelefono(l.telefono)).filter(Boolean));
  for (const r of corpo.ricontatti) {
    const quando = daOraRoma(r.data);
    const t = normalizzaTelefono(r.telefono);
    if (!quando) { out.ricontattiSaltati.push(`${r.nome}: data non valida`); continue; }
    if ((r.email && giaEmail.has(r.email.trim().toLowerCase())) || (t && giaTel.has(t))) { out.ricontattiSaltati.push(`${r.nome}: c'è già un lead con la stessa email o telefono`); continue; }
    const cli = r.clienteId ? await prisma.cliente.findUnique({ where: { id: r.clienteId }, select: { id: true, nome: true, leadOrigineId: true } }) : null;
    const nota = `[${adesso.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} Switch da Keap] Keap ID ${r.keapId} · ricontatto concordato in Keap per il ${roma(quando)}` +
      (cli ? ` · cliente P&C ONE: ${cli.nome}${r.abbinamento ? ` (${r.abbinamento})` : ""}` : " · nessun cliente in P&C ONE");
    out.ricontattiCreati.push(`${r.nome} — ${roma(quando)}${cli ? ` → ${cli.nome}` : " (nuovo contatto)"}`);
    if (!esegui) continue;
    const l = await prisma.lead.create({
      data: { nome: r.nome, telefono: r.telefono || null, email: r.email || null, brandId: brand.id, fonte: "keap", fase: "DA_RICHIAMARE", telefonistaId: tel.id, richiamoIl: quando, scadenzaAzione: quando, note: nota },
    });
    await prisma.leadEvento.createMany({ data: [
      { leadId: l.id, tipo: "lead.creato", utenteNome: "Automatico", testo: `Portato da Keap allo switch (Keap ID ${r.keapId}).` },
      { leadId: l.id, tipo: "lead.esito", utenteNome: "Automatico", testo: `${ESITI.DA_RICHIAMARE.nome} — ${roma(quando)} · concordato in Keap, nessuna email al cliente` },
    ] });
    if (cli && !cli.leadOrigineId) await prisma.cliente.update({ where: { id: cli.id }, data: { leadOrigineId: l.id } });
    if (r.email) giaEmail.add(r.email.trim().toLowerCase());
    if (t) giaTel.add(t);
  }

  // 4. accensione
  if (attiva) {
    await prisma.configurazione.upsert({ where: { chiave: CHIAVE_ATTIVE }, update: { valore: "1" }, create: { chiave: CHIAVE_ATTIVE, valore: "1" } });
    out.attivate = true;
  }
  return NextResponse.json(out);
}

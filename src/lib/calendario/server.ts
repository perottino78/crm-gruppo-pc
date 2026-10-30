import { prisma } from "@/lib/prisma";
import { numeroCommessa } from "@/lib/commesse";
import { inviaMail, APP_URL, indirizzoMittente } from "@/lib/mail/invio";
import { calendarioIcs, type VoceIcs } from "./ics";
import { type EventoCal, type TipoEvento, nomeTipoAppuntamento, STILE_TIPO } from "./eventi";
import { chiaveGiorno, inizioGiorno, aggiungiGiorni, giornoBreve, oraRoma } from "./tempo";

const MIN = 60_000;
const indirizzoCliente = (c: { indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null }) =>
  [c.indirizzo, [c.cap, c.comune, c.provincia ? `(${c.provincia})` : null].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;

const incCliente = { include: { cliente: true } } as const;

/** Tutti gli impegni di un periodo, per tutti o per una persona */
export async function eventiPeriodo(o: { da: Date; a: Date; utenteId?: string | null; tipi?: TipoEvento[] }): Promise<EventoCal[]> {
  const vuoi = (t: TipoEvento) => !o.tipi || o.tipi.includes(t);
  const u = o.utenteId ?? undefined;
  const [app, ril, pose, ass] = await Promise.all([
    vuoi("APPUNTAMENTO")
      ? prisma.appuntamento.findMany({ where: { dataOra: { gte: new Date(o.da.getTime() - 12 * 3600_000), lt: o.a }, ...(u ? { utenteId: u } : {}) }, include: { cliente: true, utente: true } })
      : [],
    vuoi("RILIEVO")
      ? prisma.rilievo.findMany({ where: { dataOra: { gte: o.da, lt: o.a }, ...(u ? { tecnicoId: u } : {}) }, include: { commessa: incCliente, tecnico: true } })
      : [],
    vuoi("POSA")
      ? prisma.posa.findMany({ where: { dataInizio: { gte: new Date(o.da.getTime() - 40 * 86400_000), lt: o.a }, ...(u ? { assegnatoUtenteId: u } : {}) }, include: { commessa: incCliente } })
      : [],
    vuoi("ASSISTENZA")
      ? prisma.assistenza.findMany({ where: { dataIntervento: { gte: o.da, lt: o.a }, ...(u ? { assegnatoUtenteId: u } : {}) }, include: { commessa: incCliente } })
      : [],
  ]);
  const out: EventoCal[] = [
    ...app.map(daAppuntamento),
    ...ril.map(daRilievo),
    ...pose.map(daPosa),
    ...ass.map(daAssistenza),
  ].filter((e) => e.fine > o.da && e.inizio < o.a);
  return out.sort((x, y) => x.inizio.getTime() - y.inizio.getTime());
}

type AppConDati = Awaited<ReturnType<typeof prisma.appuntamento.findFirstOrThrow<{ include: { cliente: true; utente: true } }>>>;
export function daAppuntamento(a: AppConDati): EventoCal {
  return {
    id: `APPUNTAMENTO:${a.id}`, tipo: "APPUNTAMENTO", sottotipo: a.tipo,
    inizio: a.dataOra, fine: new Date(a.dataOra.getTime() + (a.durataMin || 60) * MIN), giornataIntera: false,
    titolo: a.titolo || `${nomeTipoAppuntamento(a.tipo)} · ${a.cliente.nome}`,
    cliente: a.cliente.nome, luogo: a.luogo || (a.tipo === "TELEFONICO" ? null : indirizzoCliente(a.cliente)), note: a.note,
    utenteId: a.utenteId, chi: a.utente.nome, stato: a.stato, href: `/calendario/appuntamento/${a.id}`,
  };
}

type RilConDati = Awaited<ReturnType<typeof prisma.rilievo.findFirstOrThrow<{ include: { commessa: { include: { cliente: true } }; tecnico: true } }>>>;
export function daRilievo(r: RilConDati): EventoCal {
  return {
    id: `RILIEVO:${r.id}`, tipo: "RILIEVO", inizio: r.dataOra, fine: new Date(r.dataOra.getTime() + 90 * MIN), giornataIntera: false,
    titolo: `Rilievo misure · ${r.commessa.cliente.nome}`, cliente: r.commessa.cliente.nome,
    luogo: r.indirizzo || indirizzoCliente(r.commessa.cliente), note: [numeroCommessa(r.commessa), r.note].filter(Boolean).join(" — "),
    utenteId: r.tecnicoId, chi: r.tecnico.nome, stato: r.stato, href: `/commesse/${r.commessaId}`,
  };
}

type PosaConDati = Awaited<ReturnType<typeof prisma.posa.findFirstOrThrow<{ include: { commessa: { include: { cliente: true } } } }>>>;
export function daPosa(p: PosaConDati): EventoCal {
  const g = chiaveGiorno(p.dataInizio);
  const giorni = Math.max(1, p.giorniPrevisti || 1);
  return {
    id: `POSA:${p.id}`, tipo: "POSA", inizio: inizioGiorno(g), fine: inizioGiorno(aggiungiGiorni(g, giorni)), giornataIntera: true,
    titolo: `Posa${giorni > 1 ? ` (${giorni} gg)` : ""} · ${p.commessa.cliente.nome}`, cliente: p.commessa.cliente.nome,
    luogo: p.indirizzo || indirizzoCliente(p.commessa.cliente),
    note: [numeroCommessa(p.commessa), p.squadra ? `Squadra: ${p.squadra}` : null, p.confermata ? "Confermata al cliente" : "Da confermare al cliente", p.note].filter(Boolean).join(" — "),
    utenteId: p.assegnatoUtenteId, chi: p.assegnatoNome, stato: p.stato, href: `/commesse/${p.commessaId}`,
  };
}

type AssConDati = Awaited<ReturnType<typeof prisma.assistenza.findFirstOrThrow<{ include: { commessa: { include: { cliente: true } } } }>>>;
export function daAssistenza(a: AssConDati): EventoCal {
  const d = a.dataIntervento ?? a.createdAt;
  return {
    id: `ASSISTENZA:${a.id}`, tipo: "ASSISTENZA", inizio: d, fine: new Date(d.getTime() + 120 * MIN), giornataIntera: false,
    titolo: `Assistenza n.${a.numero} · ${a.commessa.cliente.nome}`, cliente: a.commessa.cliente.nome,
    luogo: indirizzoCliente(a.commessa.cliente), note: [a.prodotto, a.descrizione].filter(Boolean).join(" — "),
    utenteId: a.assegnatoUtenteId, chi: a.assegnatoNome, stato: a.stato, href: `/assistenza`,
  };
}

/** Converte un evento in voce .ics (usata dal link calendario e dagli inviti) */
export function voceIcs(e: EventoCal): VoceIcs {
  return {
    uid: `${e.id.replace(":", "-").toLowerCase()}@crm-gruppo-pc`,
    inizio: e.inizio, fine: e.fine, giornataIntera: e.giornataIntera,
    titolo: `${STILE_TIPO[e.tipo].icona} ${e.titolo}`,
    descrizione: [e.chi ? `Incaricato: ${e.chi}` : null, e.note].filter(Boolean).join("\n"),
    luogo: e.luogo, url: `${APP_URL}${e.href}`, annullato: /^ANNULLAT/.test(e.stato),
    // la versione cresce a ogni invio: il telefono sostituisce l'appuntamento invece di duplicarlo
    sequenza: Math.floor(Date.now() / 1000) - 1_780_000_000,
    promemoriaMin: e.giornataIntera ? null : 60,
  };
}

async function evento(chiave: string): Promise<{ e: EventoCal; emailUtente: string | null; emailCliente: string | null; invitaCliente: boolean } | null> {
  const [tipo, id] = chiave.split(":");
  if (tipo === "APPUNTAMENTO") {
    const a = await prisma.appuntamento.findUnique({ where: { id }, include: { cliente: true, utente: true } });
    return a && { e: daAppuntamento(a), emailUtente: a.utente.email, emailCliente: a.cliente.email, invitaCliente: a.invitaCliente };
  }
  if (tipo === "RILIEVO") {
    const r = await prisma.rilievo.findUnique({ where: { id }, include: { commessa: incCliente, tecnico: true } });
    return r && { e: daRilievo(r), emailUtente: r.tecnico.email, emailCliente: null, invitaCliente: false };
  }
  if (tipo === "POSA") {
    const p = await prisma.posa.findUnique({ where: { id }, include: { commessa: incCliente } });
    if (!p) return null;
    const u = p.assegnatoUtenteId ? await prisma.utente.findUnique({ where: { id: p.assegnatoUtenteId } }) : null;
    let email = u?.email ?? null;
    if (!email && p.assegnatoSoggettoId) email = (await prisma.soggetto.findUnique({ where: { id: p.assegnatoSoggettoId } }))?.email ?? null;
    return { e: daPosa(p), emailUtente: email, emailCliente: null, invitaCliente: false };
  }
  return null;
}

/**
 * Manda l'invito di calendario (o l'annullamento) all'incaricato e, se richiesto, al cliente.
 * Non blocca mai: senza SMTP o senza indirizzo semplicemente non parte.
 */
export async function inviaInvito(chiave: string, metodo: "REQUEST" | "CANCEL" = "REQUEST", opz: { soloEmail?: string } = {}): Promise<{ inviati: string[]; motivo?: string }> {
  const x = await evento(chiave);
  if (!x) return { inviati: [], motivo: "evento non trovato" };
  const { e } = x;
  const v = voceIcs(e);
  const mittente = indirizzoMittente();
  const quando = e.giornataIntera ? giornoBreve(chiaveGiorno(e.inizio)) : `${giornoBreve(chiaveGiorno(e.inizio))} ore ${oraRoma(e.inizio)}`;
  const inviati: string[] = [];
  let motivo: string | undefined;
  const destinatari: { email: string; interno: boolean }[] = [];
  if (opz.soloEmail) destinatari.push({ email: opz.soloEmail, interno: true });
  else {
    if (x.emailUtente) destinatari.push({ email: x.emailUtente, interno: true });
    if (x.invitaCliente && x.emailCliente) destinatari.push({ email: x.emailCliente, interno: false });
  }
  for (const d of destinatari) {
    const vv: VoceIcs = d.interno
      ? { ...v, organizzatore: mittente ? { nome: "Gruppo P&C", email: mittente } : null, partecipanti: [{ nome: e.chi, email: d.email }] }
      : { ...v, titolo: e.tipo === "APPUNTAMENTO" ? `Appuntamento con Gruppo P&C` : v.titolo, descrizione: e.chi ? `Vi incontrerà: ${e.chi}` : null, url: null, organizzatore: mittente ? { nome: "Gruppo P&C", email: mittente } : null, partecipanti: [{ email: d.email }] };
    const annulla = metodo === "CANCEL";
    const esito = await inviaMail({
      a: [d.email],
      oggetto: `${annulla ? "ANNULLATO — " : ""}${d.interno ? e.titolo : "Appuntamento Gruppo P&C"} — ${quando}`,
      testo: d.interno
        ? [`${annulla ? "Annullato" : "Nuovo impegno in calendario"}: ${e.titolo}`, `Quando: ${quando}`, e.luogo ? `Dove: ${e.luogo}` : "", e.note ? `Note: ${e.note}` : "", "", `Apri nel CRM: ${APP_URL}${e.href}`].filter((r) => r !== null).join("\n")
        : [`Gentile cliente,`, annulla ? `l'appuntamento del ${quando} è stato annullato. La ricontatteremo per fissare una nuova data.` : `le confermiamo l'appuntamento del ${quando}${e.luogo ? ` presso ${e.luogo}` : ""}${e.chi ? ` con ${e.chi}` : ""}.`, "", "Per qualsiasi necessità può rispondere a questa email.", "", "Gruppo P&C"].join("\n"),
      invito: { metodo, ics: calendarioIcs([vv], { metodo }) },
    });
    if (esito.inviata) inviati.push(d.email);
    else motivo = esito.motivo;
  }
  if (!destinatari.length) motivo = "nessun indirizzo email per l'incaricato";
  if (chiave.startsWith("APPUNTAMENTO:") && inviati.length && !opz.soloEmail) {
    await prisma.appuntamento.update({ where: { id: chiave.split(":")[1] }, data: { invitoInviatoIl: new Date() } });
  }
  return { inviati, motivo };
}

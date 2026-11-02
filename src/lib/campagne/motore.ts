// Motore delle campagne email: coda di invio a blocchi, avvisi di scadenza (3-2-1 giorni prima), disiscrizione.
// Le campagne sono indipendenti dalla pausa delle email automatiche dei lead: servono solo la posta (SMTP) e il clic su Invia.
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { inviaMail, mailConfigurata, APP_URL } from "@/lib/mail/invio";
import { CONTATTI, htmlEmail, testoEmail, type EmailPronta } from "@/lib/automazioni/email";
import { whereCampagna, whereRaggiungibile, emailValida, personalizza, promemoriaDiOggi, leggiGiorniPromemoria, testoGiorni, type FiltriCampagna } from "./regole";
import { daOraRoma } from "@/lib/calendario/tempo";
import { conPreheader, conTracciamento, htmlCampagna, testoDaHtml } from "@/lib/mail/tracciamento";
import { controllaRimbalzi } from "@/lib/mail/rimbalzi-server";
import { INTESTAZIONE } from "@/lib/mail/rimbalzi";

/** L'indirizzo della scheda è quello già rimbalzato? (se qualcuno lo corregge, si torna a scrivergli) */
const uguali = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
export const rimbalzato = (c: { email?: string | null; emailRimbalzata?: string | null }) => !!c.email && !!c.emailRimbalzata && c.email.trim().toLowerCase() === c.emailRimbalzata.trim().toLowerCase();

export const CHIAVE_PROMEMORIA_GIORNI = "campagne_promemoria_giorni";
export const CHIAVE_PROMEMORIA_A = "campagne_promemoria_a";
const CHIAVE_PROMEMORIA_RECUPERO = "recupero_promo_promemoria";
const CHIAVE_PROMO_FINO = "recupero_promo_fino"; // stessa chiave della promozione del recupero (automazioni/motore)
export const PROMEMORIA_A_DEFAULT = "marketing@gruppopec.com";

const config = async (chiave: string) => (await prisma.configurazione.findUnique({ where: { chiave } }))?.valore ?? null;
const salvaConfig = (chiave: string, valore: string) => prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });

export async function impostazioniPromemoria() {
  const [g, a] = await Promise.all([config(CHIAVE_PROMEMORIA_GIORNI), config(CHIAVE_PROMEMORIA_A)]);
  return { giorni: leggiGiorniPromemoria(g), a: (a ?? PROMEMORIA_A_DEFAULT).split(/[,;\s]+/).filter(emailValida) };
}

const SEGRETO = process.env.SESSION_SECRET || "gpc-2026-session-secret-x7f2-cambiami-in-produzione";
export const firmaCliente = (clienteId: string) => createHmac("sha256", SEGRETO).update(`disiscrivi-cliente:${clienteId}`).digest("hex").slice(0, 24);
export const linkDisiscrizioneCliente = (clienteId: string) => `${APP_URL}/api/disiscrizione?c=${encodeURIComponent(clienteId)}&t=${firmaCliente(clienteId)}`;

export async function disiscriviCliente(clienteId: string, firma: string): Promise<boolean> {
  if (!clienteId || firma !== firmaCliente(clienteId)) return false;
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, disiscritto: true } });
  if (!c) return false;
  if (!c.disiscritto) await prisma.cliente.update({ where: { id: clienteId }, data: { disiscritto: true, disiscrittoIl: new Date() } });
  return true;
}

export const filtriDi = (c: { marchi: string[]; stati: string[]; categorie: string[]; provenienza: string | null; commercialeId: string | null; provincia: string | null }): FiltriCampagna =>
  ({ marchi: c.marchi, stati: c.stati, categorie: c.categorie, provenienza: c.provenienza, commercialeId: c.commercialeId, provincia: c.provincia });

/** Quanti clienti rientrano nei filtri e quanti si possono davvero raggiungere via email. */
export async function contaDestinatari(f: FiltriCampagna) {
  const base = whereCampagna(f);
  const [totale, raggiungibiliTutti, disiscritti, conRimbalzo] = await Promise.all([
    prisma.cliente.count({ where: base }),
    prisma.cliente.count({ where: { AND: [base, whereRaggiungibile] } }),
    prisma.cliente.count({ where: { AND: [base, { OR: [{ disiscritto: true }, { leadOrigine: { disiscritto: true } }] }] } }),
    prisma.cliente.findMany({ where: { AND: [base, whereRaggiungibile, { emailRimbalzata: { not: null } }] }, select: { email: true, emailRimbalzata: true } }),
  ]);
  const rimbalzati = conRimbalzo.filter(rimbalzato).length;
  const raggiungibili = raggiungibiliTutti - rimbalzati;
  return { totale, raggiungibili, disiscritti, rimbalzati, senzaEmail: Math.max(0, totale - raggiungibiliTutti - disiscritti) };
}

/** Mette in coda i destinatari della campagna (chi l'ha già ricevuta non la riceve di nuovo). Ritorna quanti nuovi. */
export async function accodaCampagna(campagnaId: string, adesso = new Date()): Promise<number> {
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id: campagnaId } });
  const clienti = await prisma.cliente.findMany({ where: { AND: [whereCampagna(filtriDi(c)), whereRaggiungibile] }, select: { id: true, email: true, emailRimbalzata: true } });
  const validi = clienti.filter((x) => emailValida(x.email) && !rimbalzato(x));
  const r = await prisma.campagnaInvio.createMany({ data: validi.map((x) => ({ campagnaId, clienteId: x.id, email: x.email!.trim().toLowerCase() })), skipDuplicates: true });
  await prisma.campagna.update({ where: { id: campagnaId }, data: { stato: "IN_INVIO", inviataIl: c.inviataIl ?? adesso } });
  return r.count;
}

type ContenutoCampagna = { oggetto: string; testo: string; preheader?: string | null; formato?: string | null; html?: string | null; tracciamento?: boolean | null };

/**
 * L'email della campagna per un cliente: oggetto e testo con {nome}, preheader, grafica P&C (o il template HTML
 * del marketing) e link per disiscriversi. Con `codiceTraccia` conta aperture e clic.
 */
export function emailCampagna(c: ContenutoCampagna, cliente: { id: string; nome: string; nomePersona?: string | null }, codiceTraccia?: string) {
  const pers = (t: string) => personalizza(t, cliente.nome, cliente.nomePersona);
  const link = { lead: "", disiscrizione: linkDisiscrizioneCliente(cliente.id) };
  const oggetto = pers(c.oggetto);
  let html: string, testo: string;
  if (c.formato === "HTML" && c.html?.trim()) {
    html = htmlCampagna(pers(c.html), link.disiscrizione);
    testo = `${testoDaHtml(html)}`;
  } else {
    const e: EmailPronta = { chiave: "campagna", versione: 1, categoria: "CLIENTE", oggetto, testo: pers(c.testo) };
    html = htmlEmail(e, link);
    testo = testoEmail(e, link);
  }
  html = conPreheader(html, c.preheader ? pers(c.preheader) : "");
  if (codiceTraccia && c.tracciamento !== false) html = conTracciamento(html, APP_URL, codiceTraccia);
  return { oggetto, testo, html };
}

export async function inviaProva(campagnaId: string, a: string): Promise<{ inviata: boolean; motivo?: string }> {
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id: campagnaId } });
  const m = emailCampagna(c, { id: "prova", nome: "Mario Rossi" });
  return inviaMail({ a: [a], oggetto: `[PROVA] ${m.oggetto}`, testo: m.testo, html: m.html, da: CONTATTI.mittenteClienti });
}

export type ResocontoCampagne = { inviate: number; fallite: number; saltate: number; promemoria: number; motivo?: string };

/** Avvisi di scadenza (campagne e promozione del recupero) e un blocco di invii in coda. Sicuro da chiamare più volte. */
export async function eseguiCampagne(opz: { adesso?: () => Date; max?: number } = {}): Promise<ResocontoCampagne> {
  const ora = opz.adesso ?? (() => new Date());
  const r: ResocontoCampagne = { inviate: 0, fallite: 0, saltate: 0, promemoria: 0 };
  if (!(await mailConfigurata())) return { ...r, motivo: "posta (SMTP) non configurata" };
  // email rimbalzate: la casella aziendale si legge al massimo ogni 10 minuti (un errore non ferma gli invii)
  await controllaRimbalzi({ adesso: ora }).catch(() => null);

  // 1. Avvisi di scadenza: "la campagna scade fra N giorni, aggiornala"
  const imp = await impostazioniPromemoria();
  if (imp.a.length && imp.giorni.length) {
    const attive = await prisma.campagna.findMany({ where: { stato: { not: "BOZZA" }, validaFino: { not: null } } });
    for (const c of attive) {
      const g = promemoriaDiOggi(c.validaFino, imp.giorni, c.promemoriaInviati, ora());
      if (g === null) continue;
      // si segna prima di spedire: due controlli insieme non mandano l'avviso due volte
      const segnato = await prisma.campagna.updateMany({ where: { id: c.id, NOT: { promemoriaInviati: { has: String(g) } } }, data: { promemoriaInviati: { push: String(g) } } });
      if (!segnato.count) continue;
      const fino = c.validaFino!.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
      await inviaMail({ a: imp.a, da: CONTATTI.mittenteInterne, oggetto: `[CRM P&C] La campagna "${c.nome}" scade ${testoGiorni(g)}`,
        testo: `Ciao,\n\nla campagna "${c.nome}" è valida fino al ${fino}: scade ${testoGiorni(g)}.\n\nAggiorna il testo e la scadenza, oppure preparane una nuova: ${APP_URL}/campagne/${c.id}\n\nGrazie,\nIl tuo assistente virtuale` });
      r.promemoria++;
    }
    // la promozione del recupero dei lead persi ha la stessa scadenza da tenere d'occhio
    const fino = await config(CHIAVE_PROMO_FINO);
    if (fino && /^\d{4}-\d{2}-\d{2}$/.test(fino)) {
      const inviati = (await config(CHIAVE_PROMEMORIA_RECUPERO) ?? "").split(",").filter((x) => x.startsWith(`${fino}:`)).map((x) => x.split(":")[1]);
      const g = promemoriaDiOggi(daOraRoma(`${fino}T12:00`), imp.giorni, inviati, ora());
      if (g !== null) {
        await salvaConfig(CHIAVE_PROMEMORIA_RECUPERO, [...inviati.map((x) => `${fino}:${x}`), `${fino}:${g}`].join(","));
        await inviaMail({ a: imp.a, da: CONTATTI.mittenteInterne, oggetto: `[CRM P&C] La promozione del recupero lead scade ${testoGiorni(g)}`,
          testo: `Ciao,\n\nla promozione usata per recuperare i lead persi scade ${testoGiorni(g)}. Senza una promozione valida i recuperi restano in attesa.\n\nAggiornala qui: ${APP_URL}/impostazioni/automazioni\n\nGrazie,\nIl tuo assistente virtuale` });
        r.promemoria++;
      }
    }
  }

  // 2. Un blocco di invii in coda (il resto al prossimo controllo: la posta non viene intasata)
  for (let i = 0; i < (opz.max ?? 40); i++) {
    const inv = await prisma.campagnaInvio.findFirst({ where: { stato: "IN_ATTESA", campagna: { stato: "IN_INVIO" } }, orderBy: { createdAt: "asc" }, include: { campagna: true } });
    if (!inv) break;
    const preso = await prisma.campagnaInvio.updateMany({ where: { id: inv.id, stato: "IN_ATTESA" }, data: { stato: "IN_CORSO", tentativi: { increment: 1 } } });
    if (!preso.count) continue;
    const cliente = await prisma.cliente.findUnique({ where: { id: inv.clienteId }, select: { id: true, nome: true, nomePersona: true, email: true, emailRimbalzata: true, disiscritto: true, leadOrigine: { select: { disiscritto: true } } } });
    if (!cliente || cliente.disiscritto || cliente.leadOrigine?.disiscritto || (rimbalzato(cliente) && uguali(cliente.email, inv.email))) {
      await prisma.campagnaInvio.update({ where: { id: inv.id }, data: { stato: "SOPPRESSA", motivo: !cliente ? "cliente non più presente" : cliente.disiscritto || cliente.leadOrigine?.disiscritto ? "si è disiscritto" : "email rimbalzata in precedenza" } });
      r.saltate++;
      continue;
    }
    const m = emailCampagna(inv.campagna, cliente, `c-${inv.id}`);
    const esito = await inviaMail({ a: [inv.email], oggetto: m.oggetto, testo: m.testo, html: m.html, da: CONTATTI.mittenteClienti, intestazioni: { [INTESTAZIONE]: `c-${inv.id}` } });
    if (esito.inviata) {
      await prisma.campagnaInvio.update({ where: { id: inv.id }, data: { stato: "INVIATA", inviataIl: ora(), motivo: null } });
      r.inviate++;
    } else {
      // tre tentativi (ai controlli successivi), poi resta "non inviata" con il motivo
      await prisma.campagnaInvio.update({ where: { id: inv.id }, data: { stato: inv.tentativi + 1 < 3 ? "IN_ATTESA" : "FALLITA", motivo: esito.motivo ?? "errore di invio" } });
      r.fallite++;
      if (inv.tentativi + 1 < 3) break; // probabilmente la posta non risponde: si riprova al prossimo controllo
    }
  }
  // campagne finite: niente più in coda
  const inInvio = await prisma.campagna.findMany({ where: { stato: "IN_INVIO" }, select: { id: true, _count: { select: { invii: { where: { stato: { in: ["IN_ATTESA", "IN_CORSO"] } } } } } } });
  for (const c of inInvio) if (!c._count.invii) await prisma.campagna.update({ where: { id: c.id }, data: { stato: "INVIATA" } });
  return r;
}

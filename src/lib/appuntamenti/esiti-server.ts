// Esito degli appuntamenti: dati, chiusura del lead quando il commerciale esita la visita, promemoria del giorno dopo, blocco facoltativo.
import { prisma } from "@/lib/prisma";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { inviaMail, mailConfigurata, APP_URL } from "@/lib/mail/invio";
import { bloccato, CHIAVI_ESITI, classifica, giorniPassati, inizioDal, leggiRegole, limiteGiorni, STATI_DA_ESITARE, type RegoleEsiti } from "./esiti";

export async function regoleEsiti(): Promise<RegoleEsiti> {
  const righe = await prisma.configurazione.findMany({ where: { chiave: { in: Object.values(CHIAVI_ESITI) } } });
  return leggiRegole(Object.fromEntries(righe.map((r) => [r.chiave, r.valore])));
}

export type AppSenzaEsito = { id: string; utenteId: string; utente: string; dataOra: Date; stato: string; tipo: string; titolo: string | null; cliente: string; clienteId: string; giorni: number };

/** Appuntamenti passati ancora senza esito da almeno `giorni` giorni (di un commerciale o di tutti). Le telefoniste non c'entrano. */
export async function appuntamentiSenzaEsito(opz: { giorni: number; utenteId?: string; regole?: RegoleEsiti; adesso?: Date }): Promise<AppSenzaEsito[]> {
  const r = opz.regole ?? (await regoleEsiti());
  const oggi = chiaveGiorno(opz.adesso ?? new Date());
  const righe = await prisma.appuntamento.findMany({
    where: { stato: { in: STATI_DA_ESITARE }, dataOra: { gte: inizioDal(r.dal), lt: limiteGiorni(oggi, opz.giorni) }, ...(opz.utenteId ? { utenteId: opz.utenteId } : {}), utente: { ruolo: { not: "TELEFONISTA" } } },
    select: { id: true, utenteId: true, dataOra: true, stato: true, tipo: true, titolo: true, clienteId: true, cliente: { select: { nome: true } }, utente: { select: { nome: true } } },
    orderBy: { dataOra: "asc" },
  });
  return righe.map((a) => ({ id: a.id, utenteId: a.utenteId, utente: a.utente.nome, dataOra: a.dataOra, stato: a.stato, tipo: a.tipo, titolo: a.titolo, cliente: a.cliente.nome, clienteId: a.clienteId, giorni: giorniPassati(a.dataOra, oggi) }));
}

/** Il centralino può dare un nuovo appuntamento a questo commerciale? Con il blocco acceso: no, se ha troppi appuntamenti senza esito. */
export async function controlloBlocco(venditoreId: string): Promise<string | null> {
  const r = await regoleEsiti();
  if (!r.bloccoAttivo) return null;
  const aperti = await appuntamentiSenzaEsito({ giorni: r.giorniPromemoria, utenteId: venditoreId, regole: r });
  if (!bloccato(venditoreId, aperti.length, r)) return null;
  const nome = aperti[0]?.utente ?? "Il commerciale";
  return `${nome} ha ${aperti.length} appuntamenti senza esito: prima deve esitarli (o l'amministratore lo sblocca in Impostazioni › Lead).`;
}

const FASI_VISITA = ["APPUNTAMENTO_CASA", "APPUNTAMENTO_SHOWROOM", "APPUNTAMENTO_FISSATO", "APPUNTAMENTO_TELEFONICO"];

/**
 * Il commerciale ha esitato la visita (svolta): il task del centralino sul lead si chiude da solo (fase APPUNTAMENTO_SVOLTO) e gli invii
 * ancora in coda (es. il «non gestito» che porterebbe al recupero) si annullano. Il lead è quello collegato all'appuntamento o, in mancanza,
 * quello da cui è nato il cliente con una visita dello stesso commerciale. Non lancia errori.
 */
export async function chiudiLeadDopoVisita(appuntamentoId: string, utenteNome?: string | null): Promise<number> {
  try {
    const a = await prisma.appuntamento.findUnique({ where: { id: appuntamentoId }, select: { id: true, utenteId: true, clienteId: true, esito: true, cliente: { select: { leadOrigineId: true } } } });
    if (!a) return 0;
    const leads = await prisma.lead.findMany({
      where: { fase: { in: FASI_VISITA }, OR: [{ appuntamentoId: a.id }, ...(a.cliente.leadOrigineId ? [{ id: a.cliente.leadOrigineId, venditoreId: a.utenteId }] : [])] },
      select: { id: true },
    });
    for (const l of leads) {
      await prisma.$transaction(async (tx) => {
        await tx.lead.update({ where: { id: l.id }, data: { fase: "APPUNTAMENTO_SVOLTO", scadenzaAzione: null, nonGestitoIl: null } });
        await tx.invioProgrammato.updateMany({ where: { leadId: l.id, stato: "IN_ATTESA" }, data: { stato: "ANNULLATO", errore: "appuntamento svolto" } });
        await tx.leadEvento.create({ data: { leadId: l.id, tipo: "lead.esito", testo: `Appuntamento svolto${a.esito ? ` · ${a.esito}` : ""}`, utenteNome: utenteNome ?? null } });
      });
    }
    return leads.length;
  } catch (e) {
    console.error("chiudiLeadDopoVisita", e);
    return 0;
  }
}

/** Una volta al giorno (giorni feriali): a ogni commerciale l'elenco dei suoi appuntamenti ancora da esitare. */
export async function inviaPromemoriaEsiti(opz: { adesso?: Date; forza?: boolean } = {}) {
  const ora = opz.adesso ?? new Date();
  const oggi = chiaveGiorno(ora);
  const r = { inviate: 0, errori: [] as string[], motivo: undefined as string | undefined };
  const ore = Number(ora.toLocaleString("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }));
  if (!opz.forza) {
    const dow = new Date(`${oggi}T12:00:00Z`).getUTCDay();
    if (dow === 0) return { ...r, motivo: "domenica" };
    if (ore < 8) return { ...r, motivo: "troppo presto" };
    const segnato = await prisma.configurazione.findUnique({ where: { chiave: CHIAVI_ESITI.mail } });
    if (segnato?.valore === oggi) return { ...r, motivo: "già mandato oggi" };
    await prisma.configurazione.upsert({ where: { chiave: CHIAVI_ESITI.mail }, update: { valore: oggi }, create: { chiave: CHIAVI_ESITI.mail, valore: oggi } });
  }
  if (!(await mailConfigurata())) return { ...r, motivo: "posta non configurata" };
  const regole = await regoleEsiti();
  const tutti = (await appuntamentiSenzaEsito({ giorni: regole.giorniPromemoria, regole, adesso: ora })).filter((a) => classifica(a, oggi, regole) !== "NIENTE");
  const perUtente = new Map<string, AppSenzaEsito[]>();
  for (const a of tutti) perUtente.set(a.utenteId, [...(perUtente.get(a.utenteId) ?? []), a]);
  const utenti = await prisma.utente.findMany({ where: { id: { in: [...perUtente.keys()] }, stato: "ATTIVO" }, select: { id: true, nome: true, email: true } });
  for (const u of utenti) {
    if (!u.email) continue;
    const lista = perUtente.get(u.id)!;
    const righe = lista.map((a) => `• ${a.dataOra.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — ${a.cliente}${a.titolo ? ` (${a.titolo})` : ""}\n  ${APP_URL}/calendario/appuntamento/${a.id}`);
    const testo = `Ciao ${u.nome.split(" ")[0]},\n\nhai ${lista.length === 1 ? "un appuntamento" : `${lista.length} appuntamenti`} ancora senza esito. Apri ognuno e scegli com'è andato (✅ Svolto, 📞 Da rifissare, ↪ Lo rifisso io): ` +
      `così il centralino sa che è fatto e non lo deve più seguire.\n\n${righe.join("\n")}\n\n${regole.giorniLista > regole.giorniPromemoria ? `Dopo ${regole.giorniLista} giorni senza esito l'appuntamento passa al centralino, che ti chiamerà.\n\n` : ""}Grazie!\nP&C ONE`;
    const e = await inviaMail({ a: [u.email], oggetto: `[CRM P&C] ${lista.length === 1 ? "1 appuntamento" : `${lista.length} appuntamenti`} da esitare`, testo });
    if (e.inviata) r.inviate++; else r.errori.push(`${u.nome}: ${e.motivo ?? "non inviata"}`);
  }
  return r;
}

// Controllo delle email rimbalzate: legge la casella aziendale (IMAP, stesso server e password della posta in uscita),
// riconosce i "mancato recapito" e segna invio, cliente e lead. Gira da solo con gli invii (al massimo ogni 10 minuti)
// o subito dal pulsante in Impostazioni › Email automatiche. Non blocca mai il lavoro: un errore resta scritto nell'esito.
import { prisma } from "@/lib/prisma";
import { postaAziendale } from "./invio";
import { leggiRimbalzo, type Rimbalzo } from "./rimbalzi";
import type { Casella } from "./caselle";

export const CHIAVE_UID = "rimbalzi_ultimo_uid";
export const CHIAVE_CONTROLLO = "rimbalzi_ultimo_controllo";
export const CHIAVE_ESITO = "rimbalzi_ultimo_esito";
const OGNI_MS = 10 * 60_000;

export type MessaggioGrezzo = { uid: number; sorgente: string };
export type EsitoRimbalzi = { controllati: number; rimbalzi: number; indirizzi: string[]; motivo?: string; quando: string };

const config = async (chiave: string) => (await prisma.configurazione.findUnique({ where: { chiave } }))?.valore ?? null;
const salva = (chiave: string, valore: string) => prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });

/** Legge i messaggi nuovi della casella (dopo l'ultimo letto; la prima volta quelli degli ultimi 30 giorni). */
async function leggiCasella(c: Casella, daUid: number | null): Promise<MessaggioGrezzo[]> {
  const finta = (globalThis as { __casellaFinta?: (daUid: number | null) => Promise<MessaggioGrezzo[]> }).__casellaFinta;
  if (finta) return finta(daUid); // collaudi: casella simulata
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || c.host, port: Number(process.env.IMAP_PORT) || 993, secure: true,
    auth: { user: c.utente, pass: c.password }, logger: false,
    ...(c.accettaCertificato ? { tls: { rejectUnauthorized: false } } : {}),
    socketTimeout: 30_000,
  });
  const out: MessaggioGrezzo[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = daUid
        ? ((await client.search({ uid: `${daUid + 1}:*` }, { uid: true })) || [])
        : ((await client.search({ since: new Date(Date.now() - 30 * 86400_000) }, { uid: true })) || []);
      const nuovi = uids.filter((u) => !daUid || u > daUid).slice(-300);
      if (nuovi.length) {
        for await (const m of client.fetch(nuovi, { uid: true, source: true, size: true }, { uid: true })) {
          if (m.source && (m.size ?? 0) < 2_000_000) out.push({ uid: m.uid, sorgente: m.source.toString("utf8") });
          else out.push({ uid: m.uid, sorgente: "" });
        }
      }
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
  return out;
}

const uguale = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Applica un rimbalzo: invio della campagna o email del lead "rimbalzata", e (se permanente) indirizzo da non usare più. */
async function applica(r: Rimbalzo, quando: Date): Promise<string[]> {
  const indirizzi = new Set(r.destinatari);
  const tipo = r.codice?.slice(0, 1), id = r.codice?.slice(2);
  if (tipo === "c" && id) {
    const inv = await prisma.campagnaInvio.findUnique({ where: { id } });
    if (inv) { indirizzi.add(inv.email.toLowerCase()); await prisma.campagnaInvio.update({ where: { id }, data: { stato: "RIMBALZATA", motivo: r.motivo } }); }
  } else if (tipo === "l" && id) {
    const em = await prisma.emailLead.findUnique({ where: { id } });
    if (em) { if (em.a) indirizzi.add(em.a.toLowerCase()); await prisma.emailLead.update({ where: { id }, data: { stato: "RIMBALZATA", motivo: r.motivo } }); }
  } else {
    // rimbalzo senza codice: l'ultimo invio a quell'indirizzo negli ultimi 30 giorni
    const da = new Date(quando.getTime() - 30 * 86400_000);
    for (const e of r.destinatari) {
      const inv = await prisma.campagnaInvio.findFirst({ where: { email: { equals: e, mode: "insensitive" }, stato: "INVIATA", inviataIl: { gte: da } }, orderBy: { inviataIl: "desc" } });
      if (inv) await prisma.campagnaInvio.update({ where: { id: inv.id }, data: { stato: "RIMBALZATA", motivo: r.motivo } });
      const em = await prisma.emailLead.findFirst({ where: { a: { equals: e, mode: "insensitive" }, stato: "INVIATA", createdAt: { gte: da } }, orderBy: { createdAt: "desc" } });
      if (em) await prisma.emailLead.update({ where: { id: em.id }, data: { stato: "RIMBALZATA", motivo: r.motivo } });
    }
  }
  // indirizzo da non usare più (solo se il problema è permanente: una casella piena si riprova la volta dopo)
  if (r.permanente) {
    for (const e of indirizzi) {
      await prisma.cliente.updateMany({ where: { email: { equals: e, mode: "insensitive" } }, data: { emailRimbalzata: e, emailRimbalzataIl: quando, rimbalzoMotivo: r.motivo } });
      await prisma.lead.updateMany({ where: { email: { equals: e, mode: "insensitive" } }, data: { emailRimbalzata: e, emailRimbalzataIl: quando, rimbalzoMotivo: r.motivo } });
    }
  }
  return [...indirizzi];
}

/** Controlla la casella aziendale. Senza `forza` lo fa al massimo ogni 10 minuti. */
export async function controllaRimbalzi(opz: { forza?: boolean; adesso?: () => Date } = {}): Promise<EsitoRimbalzi | null> {
  const ora = opz.adesso ?? (() => new Date());
  const ultimo = Number(await config(CHIAVE_CONTROLLO)) || 0;
  if (!opz.forza && ora().getTime() - ultimo < OGNI_MS) return null;
  await salva(CHIAVE_CONTROLLO, String(ora().getTime()));
  const esito: EsitoRimbalzi = { controllati: 0, rimbalzi: 0, indirizzi: [], quando: ora().toISOString() };
  try {
    const casella = await postaAziendale();
    if (!casella) { esito.motivo = "posta aziendale non collegata"; return esito; }
    const daUid = Number(await config(CHIAVE_UID)) || null;
    const messaggi = await leggiCasella(casella, daUid);
    let maxUid = daUid ?? 0;
    for (const m of messaggi) {
      maxUid = Math.max(maxUid, m.uid);
      esito.controllati++;
      const r = m.sorgente ? leggiRimbalzo(m.sorgente, { ignora: [casella.utente] }) : null;
      if (!r) continue;
      esito.rimbalzi++;
      esito.indirizzi.push(...(await applica(r, ora())));
    }
    if (maxUid) await salva(CHIAVE_UID, String(maxUid));
  } catch (e) {
    esito.motivo = `casella non leggibile: ${((e as Error).message || String(e)).slice(0, 200)}`;
  } finally {
    await salva(CHIAVE_ESITO, JSON.stringify({ ...esito, indirizzi: [...new Set(esito.indirizzi)].slice(0, 50) }));
  }
  return esito;
}

export async function ultimoEsitoRimbalzi(): Promise<EsitoRimbalzi | null> {
  try { return JSON.parse((await config(CHIAVE_ESITO)) ?? "null"); } catch { return null; }
}

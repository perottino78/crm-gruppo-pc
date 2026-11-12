// Sincronizzazione con i calendari Nextcloud (CalDAV), nei due sensi:
// - P&C ONE → Nextcloud: gli impegni di ogni persona (appuntamenti, rilievi, pose, assistenze, riunioni) vanno nel calendario
//   Nextcloud scelto per lei; spostati o annullati in P&C ONE si aggiornano anche lì;
// - Nextcloud → P&C ONE: un appuntamento o una riunione di P&C ONE spostati o cancellati su Nextcloud si aggiornano in P&C ONE;
//   gli impegni scritti solo su Nextcloud si vedono nel calendario di P&C ONE come «Da Nextcloud» (sola lettura).
// La configurazione (indirizzo, utente, password per app cifrata, abbinamento calendari → persone) sta in Configurazione.
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { cifra, decifra } from "@/lib/mail/caselle";
import { calendarioIcs } from "./ics";
import { eventiPeriodo, voceIcs } from "./server";
import type { EventoCal } from "./eventi";
import { cancellaEvento, elencaCalendari, esisteEvento, leggiPeriodo, scriviEvento, type ConfigDav } from "./caldav";
import { chiaveDaUid, eDiOne, uidOne, decisione } from "./ical";

export const CHIAVI_NC = { url: "nextcloud_url", utente: "nextcloud_utente", password: "nextcloud_password", calendari: "nextcloud_calendari", stato: "nextcloud_stato", ultima: "nextcloud_ultima" } as const;
export type CalendarioAbbinato = { href: string; nome: string; utenteId: string | null; scrivi: boolean };
export type StatoNc = { il: string; ok: boolean; messaggio: string };

const leggi = async (k: string) => (await prisma.configurazione.findUnique({ where: { chiave: k } }))?.valore ?? null;
const scrivi = (k: string, valore: string) => prisma.configurazione.upsert({ where: { chiave: k }, update: { valore }, create: { chiave: k, valore } });

export async function configNextcloud(): Promise<{ dav: ConfigDav | null; url: string | null; utente: string | null; haPassword: boolean; calendari: CalendarioAbbinato[]; stato: StatoNc | null }> {
  const [url, utente, pw, cal, st] = await Promise.all([leggi(CHIAVI_NC.url), leggi(CHIAVI_NC.utente), leggi(CHIAVI_NC.password), leggi(CHIAVI_NC.calendari), leggi(CHIAVI_NC.stato)]);
  const password = decifra(pw);
  const json = <T,>(s: string | null, d: T): T => { try { return s ? JSON.parse(s) as T : d; } catch { return d; } };
  return { dav: url && utente && password ? { url, utente, password } : null, url, utente, haPassword: !!password, calendari: json(cal, []), stato: json<StatoNc | null>(st, null) };
}

export async function salvaAccessoNextcloud(url: string, utente: string, password: string | null) {
  await scrivi(CHIAVI_NC.url, url.trim());
  await scrivi(CHIAVI_NC.utente, utente.trim());
  if (password) await scrivi(CHIAVI_NC.password, cifra(password));
}
export const salvaCalendariNextcloud = (c: CalendarioAbbinato[]) => scrivi(CHIAVI_NC.calendari, JSON.stringify(c));
export { elencaCalendari };

/** Il file .ics di un impegno di P&C ONE per Nextcloud (senza METHOD: è una risorsa del calendario, non un invito). */
function icsDi(e: EventoCal): { ics: string; impronta: string } {
  const v = { ...voceIcs(e), uid: uidOne(e.id), sequenza: 0, promemoriaMin: e.giornataIntera ? null : 60 };
  const ics = calendarioIcs([v]).replace(/^METHOD:.*\r\n/m, "");
  const impronta = createHash("sha1").update(ics.replace(/^DTSTAMP:.*$/m, "")).digest("hex");
  return { ics, impronta };
}

/** Cambio fatto su Nextcloud a un impegno di P&C ONE: si riportano giorno/ora (appuntamenti e riunioni) o l'annullamento. */
async function prendiDaNextcloud(chiave: string, ev: { inizio: Date; fine: Date; annullato: boolean } | null): Promise<string | null> {
  const [tipo, resto] = [chiave.split(":")[0], chiave.split(":").slice(1).join(":")];
  const id = tipo === "RIUNIONE" ? resto.split("-")[0] : resto;
  const durataMin = ev ? Math.max(15, Math.round((ev.fine.getTime() - ev.inizio.getTime()) / 60_000)) : 0;
  if (tipo === "APPUNTAMENTO") {
    const a = await prisma.appuntamento.findUnique({ where: { id } });
    if (!a) return null;
    if (!ev || ev.annullato) {
      if (a.stato === "ANNULLATO") return null;
      await prisma.appuntamento.update({ where: { id }, data: { stato: "ANNULLATO", esito: a.esito ?? "Cancellato sul calendario Nextcloud" } });
      return `annullato l'appuntamento del ${a.dataOra.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })} (cancellato su Nextcloud)`;
    }
    if (a.dataOra.getTime() === ev.inizio.getTime() && a.durataMin === durataMin) return null;
    await prisma.appuntamento.update({ where: { id }, data: { dataOra: ev.inizio, durataMin } });
    return `spostato un appuntamento al ${ev.inizio.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })} (da Nextcloud)`;
  }
  if (tipo === "RIUNIONE") {
    const r = await prisma.riunione.findUnique({ where: { id } });
    if (!r) return null;
    if (!ev || ev.annullato) {
      if (r.stato === "ANNULLATO") return null;
      await prisma.riunione.update({ where: { id }, data: { stato: "ANNULLATO" } });
      return `annullata la riunione «${r.titolo}» (cancellata su Nextcloud)`;
    }
    if (r.dataOra.getTime() === ev.inizio.getTime() && r.durataMin === durataMin) return null;
    await prisma.riunione.update({ where: { id }, data: { dataOra: ev.inizio, durataMin } });
    return `spostata la riunione «${r.titolo}» (da Nextcloud)`;
  }
  return null; // rilievi, pose, assistenze: comanda P&C ONE (si riscrivono su Nextcloud)
}

export type EsitoSync = { fatto: boolean; motivo?: string; scritti?: number; aggiornati?: number; cancellati?: number; daNextcloud?: string[]; esterni?: number; errori?: string[] };
let inCorso: Promise<EsitoSync> | null = null;

/**
 * Sincronizzazione completa (da 7 giorni fa a 4 mesi avanti). Al massimo ogni 5 minuti, salvo `forza`.
 * Non lancia errori: il risultato finisce in Configurazione (nextcloud_stato) e si vede in Impostazioni.
 */
export async function sincronizzaNextcloud(opz: { forza?: boolean; adesso?: Date } = {}): Promise<EsitoSync> {
  if (inCorso) return inCorso;
  inCorso = (async (): Promise<EsitoSync> => {
    const ora = opz.adesso ?? new Date();
    const cfg = await configNextcloud();
    if (!cfg.dav) return { fatto: false, motivo: "Nextcloud non collegato" };
    if (!opz.forza) {
      const ultima = await leggi(CHIAVI_NC.ultima);
      if (ultima && ora.getTime() - Number(ultima) < 5 * 60_000) return { fatto: false, motivo: "fatta da poco" };
    }
    await scrivi(CHIAVI_NC.ultima, String(ora.getTime()));
    const da = new Date(ora.getTime() - 7 * 86_400_000), a = new Date(ora.getTime() + 120 * 86_400_000);
    const r = { scritti: 0, aggiornati: 0, cancellati: 0, daNextcloud: [] as string[], esterni: 0, errori: [] as string[] };
    const dav = cfg.dav;
    for (const cal of cfg.calendari.filter((c) => c.utenteId)) {
      try {
        const remoti = await leggiPeriodo(dav, cal.href, da, a);
        // 1) impegni esterni (non scritti da P&C ONE)
        const esterni = remoti.flatMap((x) => x.eventi.filter((e) => !eDiOne(e.uid) && !e.annullato).map((e) => ({ x, e })));
        const visti = new Set<string>();
        for (const { x, e } of esterni) {
          const href = e.ricorrenza ? `${x.href}#${e.inizio.getTime()}` : x.href;
          visti.add(href);
          const dati = { calendario: cal.href, uid: e.uid, etag: x.etag, utenteId: cal.utenteId!, chiave: null, titolo: e.titolo.slice(0, 300), inizio: e.inizio, fine: e.fine, giornataIntera: e.giornataIntera, luogo: e.luogo, note: e.note?.slice(0, 2000) ?? null };
          await prisma.eventoNextcloud.upsert({ where: { href }, update: dati, create: { href, ...dati } });
        }
        r.esterni += esterni.length;
        await prisma.eventoNextcloud.deleteMany({ where: { calendario: cal.href, chiave: null, href: { notIn: [...visti] }, inizio: { gte: da, lt: a } } });

        // 2) impegni di P&C ONE della persona, nel calendario in cui si scrive
        if (!cal.scrivi) continue;
        const remotiOne = new Map(remoti.flatMap((x) => x.eventi.filter((e) => eDiOne(e.uid)).map((e) => [e.uid, { x, e }] as const)));
        const nostri = (await eventiPeriodo({ da, a, utenteId: cal.utenteId })).filter((e) => e.tipo !== "ESTERNO" && e.utenteId === cal.utenteId);
        const salvati = new Map((await prisma.eventoNextcloud.findMany({ where: { calendario: cal.href, chiave: { not: null } } })).map((s) => [s.uid, s]));
        const presenti = new Set<string>();
        for (const e of nostri) {
          const uid = uidOne(e.id);
          presenti.add(uid);
          const s = salvati.get(uid);
          const rem = remotiOne.get(uid);
          if (/^ANNULLAT/.test(e.stato)) {
            if (s || rem) { await cancellaEvento(dav, s?.href ?? rem!.x.href); r.cancellati++; }
            if (s) await prisma.eventoNextcloud.delete({ where: { id: s.id } });
            continue;
          }
          const { ics, impronta } = icsDi(e);
          let azione = decisione({ etagSalvato: s?.etag ?? null, etagNextcloud: rem?.x.etag ?? null, esisteSuNextcloud: !!rem, impronta, improntaSalvata: s?.impronta ?? null });
          if (azione === "CANCELLATO_SU_NEXTCLOUD" && s && (await esisteEvento(dav, s.href))) azione = "AGGIORNA_NEXTCLOUD"; // era solo fuori dalla lettura
          if (azione === "PRENDI_DA_NEXTCLOUD" || azione === "CANCELLATO_SU_NEXTCLOUD") {
            const chiave = chiaveDaUid(uid) ?? e.id;
            const cosa = await prendiDaNextcloud(chiave, azione === "PRENDI_DA_NEXTCLOUD" ? rem!.e : null);
            if (cosa) r.daNextcloud.push(`${cal.nome}: ${cosa}`);
            if (azione === "CANCELLATO_SU_NEXTCLOUD") {
              // rilievi/pose/assistenze cancellati su Nextcloud: si riscrivono (comanda P&C ONE); appuntamenti e riunioni ora sono annullati
              if (s) await prisma.eventoNextcloud.delete({ where: { id: s.id } });
              if (!cosa && !["APPUNTAMENTO", "RIUNIONE"].includes(chiave.split(":")[0])) { const w = await scriviEvento(dav, cal.href, uid, ics); await registra(cal, uid, e, w, impronta); r.scritti++; }
              continue;
            }
            // da qui in poi: salvo il nuovo etag; se P&C ONE è cambiato per davvero si riscrive al giro dopo
            const dati = { etag: rem!.x.etag, impronta: cosa ? null : impronta, inizio: rem!.e.inizio, fine: rem!.e.fine };
            if (s) await prisma.eventoNextcloud.update({ where: { id: s.id }, data: dati });
            else await registra(cal, uid, e, { href: rem!.x.href, etag: rem!.x.etag }, cosa ? null : impronta);
            continue;
          }
          if (azione === "CREA" || azione === "AGGIORNA_NEXTCLOUD") {
            const w = await scriviEvento(dav, cal.href, uid, ics, s?.href ?? rem?.x.href ?? null);
            await registra(cal, uid, e, w, impronta, s?.id);
            if (azione === "CREA") r.scritti++; else r.aggiornati++;
          }
        }
        // 3) scritti da P&C ONE ma non più suoi (passati a un collega, eliminati): via da questo calendario
        for (const s of salvati.values()) {
          if (presenti.has(s.uid) || s.inizio < da || s.inizio >= a) continue;
          await cancellaEvento(dav, s.href);
          await prisma.eventoNextcloud.delete({ where: { id: s.id } });
          r.cancellati++;
        }
      } catch (e) {
        r.errori.push(`${cal.nome}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const messaggio = r.errori.length ? `Problemi: ${r.errori.join(" · ")}`
      : `Scritti ${r.scritti}, aggiornati ${r.aggiornati}, tolti ${r.cancellati} · ${r.esterni} impegni letti da Nextcloud${r.daNextcloud.length ? ` · da Nextcloud: ${r.daNextcloud.join("; ")}` : ""}`;
    await scrivi(CHIAVI_NC.stato, JSON.stringify({ il: ora.toISOString(), ok: !r.errori.length, messaggio } satisfies StatoNc));
    return { fatto: true, ...r };
  })().finally(() => { inCorso = null; });
  return inCorso;
}

async function registra(cal: CalendarioAbbinato, uid: string, e: EventoCal, w: { href: string; etag: string | null }, impronta: string | null, id?: string) {
  const dati = { calendario: cal.href, href: w.href, uid, etag: w.etag, utenteId: cal.utenteId!, chiave: chiaveDaUid(uid) ?? e.id, impronta, titolo: e.titolo.slice(0, 300), inizio: e.inizio, fine: e.fine, giornataIntera: e.giornataIntera, luogo: e.luogo ?? null, note: null };
  if (id) await prisma.eventoNextcloud.update({ where: { id }, data: dati });
  else await prisma.eventoNextcloud.upsert({ where: { href: w.href }, update: dati, create: dati });
}

/** Dopo un cambio in P&C ONE: sincronizza subito, dopo aver risposto all'utente (fuori da una richiesta non fa nulla). */
export async function sincronizzaDopoRisposta() {
  try {
    const { after } = await import("next/server");
    after(async () => { await sincronizzaNextcloud({ forza: true }).catch(() => undefined); });
  } catch { /* ci pensa il controllo periodico */ }
}

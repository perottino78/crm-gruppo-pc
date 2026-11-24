// Backup sul NAS: lettura delle tabelle, chiave, resoconti e avviso agli amministratori.
// Solo letture sul database (mai scritture sui dati), a parte le chiavi «backup_*» in Configurazione.
import { prisma } from "@/lib/prisma";
import { inviaMail, APP_URL } from "@/lib/mail/invio";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import {
  chiaveGiusta, impronta, nomeValido, nuovaChiave, partiBackup, righePerVolta, statoBackup,
  type EsitoBackup, type TabellaDb, type TipoBackup,
} from "./regole";

export const CHIAVI = {
  impronta: "backup_chiave_impronta", chiaveDal: "backup_chiave_dal", ultimo: "backup_ultimo",
  riuscito: "backup_ultimo_riuscito", storico: "backup_storico", avviso: "backup_avviso_giorno",
};
const leggi = async (chiave: string) => (await prisma.configurazione.findUnique({ where: { chiave }, select: { valore: true } }))?.valore ?? null;
const scrivi = (chiave: string, valore: string) => prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
const json = <T>(s: string | null, vuoto: T): T => { try { return s ? (JSON.parse(s) as T) : vuoto; } catch { return vuoto; } };

/** Crea (o cambia) la chiave: si restituisce in chiaro una volta sola, nel database resta solo l'impronta. */
export async function creaChiaveBackup(): Promise<string> {
  const k = nuovaChiave();
  await scrivi(CHIAVI.impronta, impronta(k));
  await scrivi(CHIAVI.chiaveDal, new Date().toISOString());
  return k;
}

/** La chiave mandata dal NAS (intestazione X-Backup-Key) è quella giusta? */
export async function chiaveValida(req: Request): Promise<boolean> {
  const data = req.headers.get("x-backup-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return chiaveGiusta(data, await leggi(CHIAVI.impronta));
}

/** Le tabelle del database (schema public) con lo spazio occupato e se hanno la colonna «id». */
export async function tabelleDb(): Promise<TabellaDb[]> {
  const righe = await prisma.$queryRawUnsafe<{ nome: string; byte: bigint | number; haid: boolean }[]>(`
    SELECT c.relname AS nome, pg_total_relation_size(c.oid) AS byte,
      EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped) AS haid
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> '_prisma_migrations'`);
  return righe.map((r) => ({ nome: r.nome, byte: Number(r.byte), haId: r.haid }));
}

export async function elencoBackup(tipo: TipoBackup) {
  return partiBackup(await tabelleDb(), tipo);
}

/**
 * Una parte di una tabella in righe JSON (una per riga). Le righe si dividono fra le parti con un'impronta dell'id
 * (stabile, senza ordinare tutta la tabella) e si leggono a blocchi in ordine di id: poca memoria anche con le foto.
 */
export async function* righeTabella(tabella: string, parte: number, parti: number): AsyncGenerator<string> {
  const tabelle = await tabelleDb();
  const t = tabelle.find((x) => x.nome === tabella);
  if (!t || !nomeValido(tabella)) throw new Error("tabella sconosciuta");
  const q = `"${tabella}"`;
  if (!t.haId) {
    const tutte = await prisma.$queryRawUnsafe<{ j: string }[]>(`SELECT row_to_json(t)::text AS j FROM ${q} t`);
    for (const r of tutte) yield r.j;
    return;
  }
  const n = Math.max(1, Math.floor(parti)), p = Math.max(0, Math.floor(parte));
  if (p >= n) throw new Error("parte fuori elenco");
  const blocco = righePerVolta(tabella);
  let ultimo: string | null = null;
  for (;;) {
    const r: { id: string; j: string }[] = await prisma.$queryRawUnsafe(
      `SELECT t."id"::text AS id, row_to_json(t)::text AS j FROM ${q} t
       WHERE ((hashtext(t."id"::text) & 2147483647) % $1) = $2 ${ultimo === null ? "" : `AND t."id"::text > $4`}
       ORDER BY t."id"::text LIMIT $3`,
      ...(ultimo === null ? [n, p, blocco] : [n, p, blocco, ultimo]),
    );
    for (const x of r) yield x.j;
    if (r.length < blocco) return;
    ultimo = r[r.length - 1].id;
  }
}

/** Il resoconto mandato dal NAS alla fine: ultimo, ultimo riuscito e gli ultimi 20 in uno storico. */
export async function registraEsito(e: EsitoBackup) {
  await scrivi(CHIAVI.ultimo, JSON.stringify(e));
  if (e.errori === 0 && e.file > 0) await scrivi(CHIAVI.riuscito, e.il);
  const storico = json<EsitoBackup[]>(await leggi(CHIAVI.storico), []);
  await scrivi(CHIAVI.storico, JSON.stringify([e, ...storico].slice(0, 20)));
}

export async function situazioneBackup(adesso = new Date()) {
  const [imp, dal, ultimo, riuscito, storico] = await Promise.all(
    [CHIAVI.impronta, CHIAVI.chiaveDal, CHIAVI.ultimo, CHIAVI.riuscito, CHIAVI.storico].map(leggi),
  );
  const u = json<EsitoBackup | null>(ultimo, null);
  return {
    attivo: !!imp, chiaveDal: dal, ultimo: u, ultimoRiuscito: riuscito,
    storico: json<EsitoBackup[]>(storico, []),
    stato: statoBackup(riuscito, u, dal, adesso),
  };
}

async function amministratori(): Promise<string[]> {
  const a = await prisma.utente.findMany({ where: { ruolo: "AMMINISTRATORE", stato: "ATTIVO" }, select: { email: true } });
  return a.map((x) => x.email).filter((e): e is string => !!e && /.+@.+\..+/.test(e));
}

/**
 * Controllo periodico (in /api/automazioni/esegui): se il backup è stato impostato ma da 36 ore non ne arriva uno
 * riuscito (NAS spento, internet giù, chiave cambiata…) o l'ultimo ha avuto errori, email agli amministratori una volta al giorno.
 */
export async function controllaBackup(adesso = new Date()) {
  const s = await situazioneBackup(adesso);
  if (!s.attivo) return { motivo: "backup non impostato" };
  if (s.stato.livello === "ok" || s.stato.livello === "mai") return { livello: s.stato.livello };
  const oggi = chiaveGiorno(adesso);
  if ((await leggi(CHIAVI.avviso)) === oggi) return { livello: s.stato.livello, motivo: "già avvisato oggi" };
  const a = await amministratori();
  if (!a.length) return { livello: s.stato.livello, motivo: "nessun amministratore con email" };
  const quando = s.ultimoRiuscito ? new Date(s.ultimoRiuscito).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "full", timeStyle: "short" }) : "mai";
  const perche = s.stato.livello === "fermo"
    ? `da più di ${36} ore non arriva un backup dal NAS dell'ufficio (ultimo riuscito: ${quando}).`
    : `l'ultimo backup sul NAS ha avuto ${s.ultimo?.errori ?? "alcuni"} errori (cartella ${s.ultimo?.cartella ?? "?"}).`;
  const esito = await inviaMail({
    a, oggetto: "[CRM P&C] ⚠️ Backup sul NAS da controllare",
    testo: `Ciao,\n\n${perche}\n\nCose da guardare: il NAS è acceso? L'ufficio ha internet? Sul NAS, nella cartella «Backup P&C ONE/.one», il file «ultimo.log» dice cosa è successo l'ultima notte.\n\n` +
      `Situazione e istruzioni: ${APP_URL}/impostazioni/backup\n\nIl tuo assistente virtuale`,
  });
  if (esito.inviata) await scrivi(CHIAVI.avviso, oggi);
  return { livello: s.stato.livello, avvisati: esito.inviata ? a.length : 0, motivo: esito.inviata ? undefined : esito.motivo };
}

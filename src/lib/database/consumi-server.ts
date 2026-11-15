// Consumi del database (Impostazioni › Consumo del database): numeri dall'API di Neon, stima del costo, avvisi via email.
// La chiave dell'API di Neon si salva cifrata; senza chiave la pagina mostra solo le misure interne (spazio e tabelle più lette).
import { prisma } from "@/lib/prisma";
import { cifra, decifra } from "@/lib/mail/caselle";
import { inviaMail, APP_URL } from "@/lib/mail/invio";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { BUDGET_PREDEFINITO, consumoDaNeon, daAvvisare, stimaCosto, tabellePiuLette, valutaAvviso, type Avviso, type ConsumoNeon, type Livello, type Stima, type TabellaDb } from "./consumi";

export const CHIAVI = {
  apiKey: "neon_api_key", progetto: "neon_progetto", budget: "neon_budget", piano: "neon_piano",
  ultima: "neon_ultima_lettura", avviso: "neon_ultimo_avviso", destinatari: "neon_avvisi_a",
};
/** Il database del CRM (Vercel › Storage › neon-bistre-pocket, «Neon ID»). */
export const PROGETTO_PREDEFINITO = process.env.NEON_PROJECT_ID || "dry-frog-66834498";
const API = () => process.env.NEON_API_BASE || "https://console.neon.tech/api/v2";

const leggi = async (chiave: string) => (await prisma.configurazione.findUnique({ where: { chiave }, select: { valore: true } }))?.valore ?? null;
const scrivi = (chiave: string, valore: string) => prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });

export async function configConsumi() {
  const [k, progetto, budget, piano, a] = await Promise.all([leggi(CHIAVI.apiKey), leggi(CHIAVI.progetto), leggi(CHIAVI.budget), leggi(CHIAVI.piano), leggi(CHIAVI.destinatari)]);
  return {
    haChiave: !!decifra(k), progetto: progetto || PROGETTO_PREDEFINITO,
    budget: budget && Number(budget) > 0 ? Number(budget) : BUDGET_PREDEFINITO,
    piano: (piano === "FREE" ? "FREE" : "LAUNCH") as "FREE" | "LAUNCH",
    destinatari: a ?? "",
  };
}

export async function salvaConfigConsumi(d: { apiKey?: string | null; progetto?: string; budget?: number; piano?: string; destinatari?: string }) {
  if (d.apiKey) await scrivi(CHIAVI.apiKey, cifra(d.apiKey));
  if (d.progetto !== undefined) await scrivi(CHIAVI.progetto, d.progetto.trim());
  if (d.budget !== undefined && d.budget > 0) await scrivi(CHIAVI.budget, String(d.budget));
  if (d.piano) await scrivi(CHIAVI.piano, d.piano === "FREE" ? "FREE" : "LAUNCH");
  if (d.destinatari !== undefined) await scrivi(CHIAVI.destinatari, d.destinatari.trim());
}

export async function togliChiaveNeon() {
  await prisma.configurazione.deleteMany({ where: { chiave: CHIAVI.apiKey } });
}

/** Legge i consumi del periodo da Neon. Errore leggibile se la chiave manca o è sbagliata. */
export async function leggiNeon(chiave?: string, progetto?: string): Promise<{ ok: true; consumo: ConsumoNeon } | { ok: false; motivo: string }> {
  const cfg = await configConsumi();
  const k = chiave || decifra(await leggi(CHIAVI.apiKey));
  if (!k) return { ok: false, motivo: "manca la chiave dell'API di Neon" };
  try {
    const r = await fetch(`${API()}/projects/${encodeURIComponent(progetto || cfg.progetto)}`, { headers: { Authorization: `Bearer ${k}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (r.status === 401 || r.status === 403) return { ok: false, motivo: "Neon rifiuta la chiave (sbagliata o senza accesso a questo database)" };
    if (r.status === 404) return { ok: false, motivo: `Neon non trova il progetto «${progetto || cfg.progetto}»` };
    if (!r.ok) return { ok: false, motivo: `Neon ha risposto ${r.status}` };
    const c = consumoDaNeon(await r.json());
    return c ? { ok: true, consumo: c } : { ok: false, motivo: "risposta di Neon senza i consumi" };
  } catch (e) {
    return { ok: false, motivo: `Neon non risponde (${String(e).slice(0, 80)})` };
  }
}

/** Misure fatte dal database stesso: spazio occupato e tabelle più lette dall'ultimo riavvio delle statistiche. */
export async function misureInterne() {
  const [dim] = await prisma.$queryRawUnsafe<{ b: bigint }[]>("SELECT pg_database_size(current_database()) AS b");
  const righe = await prisma.$queryRawUnsafe<{ nome: string; righe: bigint; bytes: bigint; letture: bigint }[]>(
    `SELECT relname AS nome, n_live_tup AS righe, pg_total_relation_size(relid) AS bytes, (COALESCE(seq_tup_read,0) + COALESCE(idx_tup_fetch,0)) AS letture
     FROM pg_stat_user_tables`,
  );
  const tabelle: TabellaDb[] = righe.map((r) => ({ nome: r.nome, righe: Number(r.righe), bytes: Number(r.bytes), letture: Number(r.letture) }));
  return { spazioBytes: Number(dim?.b ?? 0), piuLette: tabellePiuLette(tabelle, 12), piuGrandi: [...tabelle].sort((a, b) => b.bytes - a.bytes).slice(0, 8) };
}

export type Lettura = { il: string; consumo: ConsumoNeon; stima: Stima; avviso: Avviso };

export async function ultimaLettura(): Promise<Lettura | null> {
  try {
    const v = await leggi(CHIAVI.ultima);
    if (!v) return null;
    const l = JSON.parse(v) as Lettura;
    l.consumo.inizio = new Date(l.consumo.inizio);
    l.consumo.fine = l.consumo.fine ? new Date(l.consumo.fine) : null;
    return l;
  } catch { return null; }
}

/** Legge Neon, salva la lettura e calcola stima e avviso. */
export async function aggiornaLettura(adesso = new Date()) {
  const r = await leggiNeon();
  if (!r.ok) return r;
  const cfg = await configConsumi();
  const stima = stimaCosto(r.consumo, adesso);
  const avviso = valutaAvviso(stima, cfg.budget, cfg.piano);
  const lettura: Lettura = { il: adesso.toISOString(), consumo: r.consumo, stima, avviso };
  await scrivi(CHIAVI.ultima, JSON.stringify(lettura));
  return { ok: true as const, lettura };
}

async function destinatariAvvisi(): Promise<string[]> {
  const cfg = await configConsumi();
  const scelti = cfg.destinatari.split(/[,;\s]+/).filter((x) => /.+@.+\..+/.test(x));
  if (scelti.length) return scelti;
  const admin = await prisma.utente.findMany({ where: { ruolo: "AMMINISTRATORE", stato: "ATTIVO" }, select: { email: true } });
  return admin.map((u) => u.email).filter((e): e is string => !!e && /.+@.+\..+/.test(e));
}

/**
 * Controllo periodico (in /api/automazioni/esegui): al massimo una lettura all'ora; se il costo previsto si avvicina al budget o
 * il traffico al limite, email agli amministratori (o agli indirizzi scelti), una volta al giorno per livello.
 */
export async function controllaConsumi(opz: { adesso?: Date; forza?: boolean } = {}) {
  const adesso = opz.adesso ?? new Date();
  if (!(await configConsumi()).haChiave) return { motivo: "chiave di Neon non inserita" };
  const prima = await ultimaLettura();
  if (!opz.forza && prima && adesso.getTime() - new Date(prima.il).getTime() < 55 * 60_000) return { motivo: "letto da poco" };
  const r = await aggiornaLettura(adesso);
  if (!r.ok) return { errore: r.motivo };
  const { stima, avviso } = r.lettura;
  const oggi = chiaveGiorno(adesso);
  let ultimo: { giorno: string; livello: Livello } | null = null;
  try { ultimo = JSON.parse((await leggi(CHIAVI.avviso)) ?? "null"); } catch { /* niente */ }
  if (!daAvvisare(avviso, ultimo, oggi)) return { livello: avviso.livello, costo: stima.costo.totale, proiezione: stima.proiezione.totale };
  const a = await destinatariAvvisi();
  const titolo = avviso.livello === "superato" ? "⚠️ Database: consumi oltre il limite" : "Database: consumi in aumento";
  const esito = await inviaMail({
    a, oggetto: `[CRM P&C] ${titolo}`,
    testo: `Ciao,\n\nil controllo dei consumi del database di P&C ONE segnala:\n\n${avviso.motivi.map((m) => `• ${m}`).join("\n")}\n\n` +
      `Fin qui (${stima.giorniPassati} giorni su ${stima.giorniTotali}): calcolo ${stima.cuOre} ore, traffico ${stima.trasferimentoGB} GB, spazio ${stima.spazioGB} GB, costo circa $${stima.costo.totale}.\n` +
      `Previsione a fine mese: circa $${stima.proiezione.totale}.\n\nDettagli e budget: ${APP_URL}/impostazioni/database\n\nIl tuo assistente virtuale`,
  });
  if (esito.inviata) await scrivi(CHIAVI.avviso, JSON.stringify({ giorno: oggi, livello: avviso.livello }));
  return { livello: avviso.livello, avvisati: esito.inviata ? a.length : 0, motivo: esito.inviata ? undefined : esito.motivo };
}

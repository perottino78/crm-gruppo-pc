// Backup sul NAS dell'ufficio (richiesta di Ugo, nov 2026): regole pure, senza database.
// Il NAS (rete privata, non raggiungibile da Vercel) ogni notte SCARICA da P&C ONE: elenco delle parti, poi ogni parte
// di ogni tabella (righe in JSON, una per riga, compresse gzip). La chiave si mostra una volta sola e si salva solo l'impronta.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Tabelle con i file (foto, PDF, allegati): pesanti, vanno solo nel backup completo della domenica. */
export const TABELLE_FILE = ["Documento", "SegnalazioneAllegato", "RilievoAllegato", "PosaFoto", "SolarisFoto"] as const;
/** Grandezza di una parte (dati nel database): sotto i 300 secondi di Vercel anche con una linea lenta. */
export const BYTE_PER_PARTE = 40 * 1024 ** 2;
export const ORE_SENZA_BACKUP = 36;

/** Quando fare il backup: la scelta è in P&C ONE (Impostazioni › Backup), il NAS chiama ogni notte e chiede se tocca. */
export type Frequenza = "OGNI_NOTTE" | "SETTIMANALE";
export const frequenza = (s: string | null | undefined): Frequenza => (s === "OGNI_NOTTE" ? "OGNI_NOTTE" : "SETTIMANALE");
export const FREQUENZE: Record<Frequenza, string> = {
  SETTIMANALE: "Una volta a settimana: la notte fra sabato e domenica, completo (dati, foto e documenti)",
  OGNI_NOTTE: "Ogni notte: i dati tutti i giorni, la domenica anche foto e documenti",
};
/** Ore senza backup riuscito prima dell'avviso: 36 se ogni notte, 8 giorni e mezzo se una volta a settimana. */
export const oreMassime = (f: Frequenza) => (f === "OGNI_NOTTE" ? ORE_SENZA_BACKUP : 8 * 24 + 12);

/** Giorno della settimana a Roma (0 = domenica). */
const giornoRoma = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
  d.toLocaleDateString("en-US", { timeZone: "Europe/Rome", weekday: "short" }));

/** Cosa fare quando chiama il NAS (alle 2 di notte): null = stanotte niente. La notte fra sabato e domenica = domenica alle 2. */
export function tipoDiStanotte(f: Frequenza, adesso: Date): TipoBackup | null {
  const domenica = giornoRoma(adesso) === 0;
  if (f === "SETTIMANALE") return domenica ? "completo" : null;
  return domenica ? "completo" : "dati";
}

export type TipoBackup = "dati" | "completo";
export const tipoBackup = (s: string | null | undefined): TipoBackup => (s === "completo" ? "completo" : "dati");

export interface TabellaDb { nome: string; byte: number; haId: boolean }
export interface Parte { tabella: string; parte: number; parti: number }

/** Nome di tabella accettabile in una query (solo lettere, cifre e «_»): il resto viene rifiutato. */
export const nomeValido = (n: string) => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(n);

export function partiDi(t: TabellaDb): number {
  if (!t.haId) return 1;
  return Math.max(1, Math.min(200, Math.ceil(t.byte / BYTE_PER_PARTE)));
}

/** Le parti da scaricare: nel backup «dati» senza le tabelle dei file. */
export function partiBackup(tabelle: TabellaDb[], tipo: TipoBackup): Parte[] {
  const out: Parte[] = [];
  for (const t of [...tabelle].sort((a, b) => a.nome.localeCompare(b.nome))) {
    if (!nomeValido(t.nome)) continue;
    if (tipo === "dati" && (TABELLE_FILE as readonly string[]).includes(t.nome)) continue;
    const n = partiDi(t);
    for (let p = 0; p < n; p++) out.push({ tabella: t.nome, parte: p, parti: n });
  }
  return out;
}

/** L'elenco in testo semplice per lo script del NAS: «tabella parte parti», una per riga (righe con # = note). */
export function elencoTesto(parti: Parte[], note: Record<string, string>): string {
  return [...Object.entries(note).map(([k, v]) => `# ${k} ${v}`), ...parti.map((p) => `${p.tabella} ${p.parte} ${p.parti}`)].join("\n") + "\n";
}

/** Righe da leggere per volta: poche per le tabelle dei file (ogni riga può pesare qualche MB). */
export const righePerVolta = (tabella: string) => ((TABELLE_FILE as readonly string[]).includes(tabella) ? 8 : 1000);

export const nuovaChiave = () => randomBytes(32).toString("base64url");
export const impronta = (chiave: string) => createHash("sha256").update(chiave.trim()).digest("hex");
export function chiaveGiusta(data: string | null | undefined, improntaSalvata: string | null | undefined): boolean {
  if (!data || !improntaSalvata) return false;
  const a = Buffer.from(impronta(data), "hex"), b = Buffer.from(improntaSalvata, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface EsitoBackup { il: string; tipo: TipoBackup; cartella: string; file: number; byte: number; errori: number; durata: number; liberoKB?: number }

/** Il resoconto che manda lo script alla fine (campi del modulo), ripulito. */
export function esitoDaModulo(d: Record<string, string | undefined>, adesso: Date): EsitoBackup {
  const n = (s?: string) => { const x = Math.floor(Number(s)); return Number.isFinite(x) && x >= 0 ? x : 0; };
  return {
    il: adesso.toISOString(), tipo: tipoBackup(d.tipo), cartella: String(d.cartella ?? "").replace(/[^0-9A-Za-z_.-]/g, "").slice(0, 60),
    file: n(d.file), byte: n(d.byte), errori: n(d.errori), durata: n(d.durata), liberoKB: d.libero ? n(d.libero) : undefined,
  };
}

export type StatoBackup = { livello: "mai" | "ok" | "errori" | "fermo"; ore: number | null };
/** Stato per la pagina e per l'avviso: «fermo» se da troppe ore (36, o 8 giorni e mezzo col backup settimanale) non arriva un backup riuscito. */
export function statoBackup(ultimoRiuscito: string | null, ultimo: EsitoBackup | null, chiaveDal: string | null, adesso: Date, oreMax = ORE_SENZA_BACKUP): StatoBackup {
  const ore = (s: string) => (adesso.getTime() - new Date(s).getTime()) / 3_600_000;
  if (!ultimoRiuscito) {
    if (chiaveDal && ore(chiaveDal) > oreMax) return { livello: "fermo", ore: null };
    return { livello: ultimo && ultimo.errori > 0 ? "errori" : "mai", ore: null };
  }
  const h = ore(ultimoRiuscito);
  if (h > oreMax) return { livello: "fermo", ore: h };
  if (ultimo && ultimo.errori > 0 && ultimo.il > ultimoRiuscito) return { livello: "errori", ore: h };
  return { livello: "ok", ore: h };
}

// Calcolatore dei consumi del database (richiesta di Ugo 15/11/2026, dopo il blocco di Neon per i 5 GB di traffico del piano gratuito).
// Modulo puro: legge i numeri che dà l'API di Neon, stima il costo del mese col piano Launch e decide se mandare un avviso.

/** Prezzi del piano Neon «Launch» (pagina del piano su Vercel, nov 2026). Dollari, tasse escluse. */
export const PREZZI_LAUNCH = {
  cuOra: 0.106, // un'ora di calcolo (CU-hour)
  gbMese: 0.35, // spazio occupato, al GB per mese
  trasferimentoInclusoGB: 500, // traffico verso internet compreso, per progetto
  trasferimentoGB: 0.1, // oltre il compreso (stima)
};

/** Limiti del piano gratuito: superati, Neon blocca il database (è quello che è successo il 15/11/2026). */
export const LIMITI_FREE = { cuOre: 100, trasferimentoGB: 5, spazioGB: 0.5 };

export const BUDGET_PREDEFINITO = 50; // dollari al mese
const GB = 1024 ** 3;

export type ConsumoNeon = {
  inizio: Date; // inizio del periodo di fatturazione
  fine: Date | null;
  cuSecondi: number; // tempo di calcolo (CU × secondi)
  attivoSecondi: number; // tempo in cui il database è rimasto acceso
  trasferimentoBytes: number; // dati usciti dal database (il limite che ci ha bloccato)
  scrittiBytes: number;
  spazioBytes: number;
};

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() && Number.isFinite(Number(x)) ? Number(x) : 0);

/** Dalla risposta di GET /projects/{id} dell'API di Neon. null se mancano i dati. */
export function consumoDaNeon(json: unknown): ConsumoNeon | null {
  const p = (json as { project?: Record<string, unknown> })?.project;
  if (!p || typeof p !== "object") return null;
  const inizio = p.consumption_period_start ? new Date(String(p.consumption_period_start)) : null;
  if (!inizio || Number.isNaN(inizio.getTime())) return null;
  const fine = p.consumption_period_end ? new Date(String(p.consumption_period_end)) : null;
  return {
    inizio, fine: fine && !Number.isNaN(fine.getTime()) ? fine : null,
    cuSecondi: num(p.compute_time_seconds), attivoSecondi: num(p.active_time_seconds),
    trasferimentoBytes: num(p.data_transfer_bytes), scrittiBytes: num(p.written_data_bytes),
    spazioBytes: num(p.synthetic_storage_size),
  };
}

/** Fine del periodo: quella di Neon o, se manca, il primo del mese dopo l'inizio. */
export function fineDelPeriodo(c: Pick<ConsumoNeon, "inizio" | "fine">): Date {
  if (c.fine && c.fine > c.inizio) return c.fine;
  return new Date(Date.UTC(c.inizio.getUTCFullYear(), c.inizio.getUTCMonth() + 1, 1));
}

export type Stima = {
  cuOre: number; trasferimentoGB: number; spazioGB: number;
  costo: { calcolo: number; spazio: number; trasferimento: number; totale: number }; // fin qui
  proiezione: { cuOre: number; trasferimentoGB: number; totale: number }; // a fine periodo, allo stesso ritmo
  giorniPassati: number; giorniTotali: number;
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const eur = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Costo fin qui e proiezione a fine periodo (stesso ritmo dei giorni passati). */
export function stimaCosto(c: ConsumoNeon, adesso: Date, prezzi = PREZZI_LAUNCH): Stima {
  const fine = fineDelPeriodo(c);
  const giorno = 86_400_000;
  const totali = Math.max(1, (fine.getTime() - c.inizio.getTime()) / giorno);
  const passati = Math.min(totali, Math.max(0.25, (adesso.getTime() - c.inizio.getTime()) / giorno)); // almeno 6 ore: niente proiezioni folli al primo giorno
  const fattore = totali / passati;
  const cuOre = c.cuSecondi / 3600, trasferimentoGB = c.trasferimentoBytes / GB, spazioGB = c.spazioBytes / GB;
  const extraTr = (gb: number) => Math.max(0, gb - prezzi.trasferimentoInclusoGB) * prezzi.trasferimentoGB;
  const spazioMese = spazioGB * prezzi.gbMese; // lo spazio si paga per il tempo: a fine mese circa lo spazio di oggi × 1 mese
  const calcolo = cuOre * prezzi.cuOra, spazio = spazioMese * (passati / totali), trasferimento = extraTr(trasferimentoGB);
  const pCu = cuOre * fattore, pTr = trasferimentoGB * fattore;
  return {
    cuOre: r2(cuOre), trasferimentoGB: r2(trasferimentoGB), spazioGB: r2(spazioGB),
    costo: { calcolo: r2(calcolo), spazio: r2(spazio), trasferimento: r2(trasferimento), totale: r2(calcolo + spazio + trasferimento) },
    proiezione: { cuOre: r2(pCu), trasferimentoGB: r2(pTr), totale: r2(pCu * prezzi.cuOra + spazioMese + extraTr(pTr)) },
    giorniPassati: Math.round(passati * 10) / 10, giorniTotali: Math.round(totali),
  };
}

export type Livello = "ok" | "attenzione" | "superato";

export type Avviso = { livello: Livello; motivi: string[] };

/**
 * Quando avvisare: proiezione del costo oltre l'80% del budget (attenzione) o oltre il budget (superato);
 * traffico verso l'80% di quello compreso; e, se si tornasse al piano gratuito, i suoi limiti (che bloccano il database).
 */
export function valutaAvviso(s: Stima, budget: number, piano: "LAUNCH" | "FREE" = "LAUNCH", prezzi = PREZZI_LAUNCH): Avviso {
  const motivi: string[] = [];
  let livello: Livello = "ok";
  const alza = (l: Livello) => { if (l === "superato" || (l === "attenzione" && livello === "ok")) livello = l; };
  if (piano === "FREE") {
    const voci: [string, number, number, string][] = [["traffico", s.trasferimentoGB, LIMITI_FREE.trasferimentoGB, "GB"], ["calcolo", s.cuOre, LIMITI_FREE.cuOre, "ore"], ["spazio", s.spazioGB, LIMITI_FREE.spazioGB, "GB"]];
    for (const [nome, usato, limite, u] of voci) {
      const pct = usato / limite;
      if (pct >= 1) { alza("superato"); motivi.push(`${nome}: ${usato} ${u} su ${limite} del piano gratuito, il database si blocca`); }
      else if (pct >= 0.7) { alza("attenzione"); motivi.push(`${nome}: ${usato} ${u} su ${limite} del piano gratuito (${Math.round(pct * 100)}%)`); }
    }
    return { livello, motivi };
  }
  if (budget > 0) {
    if (s.proiezione.totale > budget) { alza("superato"); motivi.push(`a questo ritmo il mese costerà circa $ ${eur(s.proiezione.totale)}, più del budget di $ ${eur(budget)}`); }
    else if (s.proiezione.totale >= budget * 0.8) { alza("attenzione"); motivi.push(`a questo ritmo il mese costerà circa $ ${eur(s.proiezione.totale)}, vicino al budget di $ ${eur(budget)}`); }
  }
  if (s.proiezione.trasferimentoGB >= prezzi.trasferimentoInclusoGB * 0.8) {
    alza("attenzione");
    motivi.push(`traffico: a fine mese circa ${s.proiezione.trasferimentoGB} GB su ${prezzi.trasferimentoInclusoGB} compresi`);
  }
  return { livello, motivi };
}

/** Da avvisare adesso? Una volta al giorno per livello (se peggiora si avvisa subito, anche lo stesso giorno). */
export function daAvvisare(a: Avviso, ultimo: { giorno: string; livello: Livello } | null, oggi: string): boolean {
  if (a.livello === "ok") return false;
  if (!ultimo || ultimo.giorno !== oggi) return true;
  return ultimo.livello === "attenzione" && a.livello === "superato";
}

/** Tabelle del database con la stima di quanto vengono lette (righe lette × peso medio della riga). */
export type TabellaDb = { nome: string; righe: number; bytes: number; letture: number };
export function tabellePiuLette(t: TabellaDb[], quante = 10) {
  return t
    .map((x) => ({ ...x, pesoRiga: x.righe > 0 ? Math.round(x.bytes / x.righe) : 0, lettoStimato: x.righe > 0 ? Math.round((x.bytes / x.righe) * x.letture) : 0 }))
    .filter((x) => x.lettoStimato > 0)
    .sort((a, b) => b.lettoStimato - a.lettoStimato)
    .slice(0, quante);
}

export const formatoBytes = (b: number) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

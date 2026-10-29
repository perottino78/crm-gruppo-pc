// Scheda cliente: per ogni offerta ricostruisce il suo flusso (come la barra di Bconsole).
// Offerta → fasi del flusso fra uffici (Impostazioni) → Conclusa. Logica pura, testabile.
import { STATI_CHE_AVANZANO, STATI_CHIUSI } from "@/lib/flusso";

export type StatoPasso = "fatto" | "corrente" | "futuro" | "stop";
export type Passo = { chiave: string; nome: string; ufficio: string | null; stato: StatoPasso };
export type Esito = "TRATTATIVA" | "IN_CORSO" | "CONCLUSA" | "PERSA" | "ANNULLATA";

export type FaseFlussoMin = { chiave: string; nome: string; ufficio: string };
export type TaskMin = { faseChiave: string | null; stato: string; ufficio?: string | null };
export type CommessaMin = { stato: string; tasks: TaskMin[] } | null;

const COMMESSA_FINITA = ["LAVORI_ESEGUITI", "CHIUSA"];
const OFFERTA_PERSA = ["SCADUTO", "RIFIUTATO", "PERSO"];

// Se la commessa non ha task (pratiche vecchie o flusso spento) si deduce la fase dallo stato commessa
const FASE_DA_STATO: Record<string, string> = {
  IN_ATTESA_ACCONTO: "FATT_ACCONTO",
  RILIEVO_DA_PROGRAMMARE: "RILIEVO",
  RILIEVO_PROGRAMMATO: "RILIEVO",
  RILIEVO_ESEGUITO: "ORDINI",
  ORDINI: "ORDINI",
  SALDO_INCASSATO: "POSA",
  POSA: "POSA",
};

export const ESITI: Record<Esito, { label: string; cls: string }> = {
  TRATTATIVA: { label: "In trattativa", cls: "bg-amber-100 text-amber-900 ring-amber-300" },
  IN_CORSO: { label: "Pratica in corso", cls: "bg-blue-100 text-blue-900 ring-blue-300" },
  CONCLUSA: { label: "Conclusa", cls: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  PERSA: { label: "Non accettata", cls: "bg-red-100 text-red-900 ring-red-300" },
  ANNULLATA: { label: "Annullata", cls: "bg-neutral-200 text-neutral-700 ring-neutral-300" },
};

export function passiPratica(input: { statoOfferta: string; commessa: CommessaMin; fasi: FaseFlussoMin[] }): {
  passi: Passo[]; esito: Esito; percentuale: number; corrente: Passo | null;
} {
  const { statoOfferta, commessa, fasi } = input;
  const passi: Passo[] = [];

  // 1. Offerta
  let statoOff: StatoPasso;
  if (commessa || statoOfferta === "ACCETTATO") statoOff = "fatto";
  else if (statoOfferta === "APERTO") statoOff = "corrente";
  else statoOff = "stop";
  passi.push({ chiave: "OFFERTA", nome: "Offerta", ufficio: "COMMERCIALE", stato: statoOff });

  // 2. Fasi del flusso
  const finita = !!commessa && COMMESSA_FINITA.includes(commessa.stato);
  const annullata = !!commessa && commessa.stato === "ANNULLATA";
  // I task nati fuori dal flusso (es. "materiale completo" dal magazzino) vanno sull'ultima fase dello stesso ufficio
  const chiavi = new Set(fasi.map((f) => f.chiave));
  const tasksNorm: TaskMin[] = (commessa?.tasks ?? []).map((x) => {
    if (!x.faseChiave || chiavi.has(x.faseChiave) || !x.ufficio) return x;
    const f = [...fasi].reverse().find((y) => y.ufficio === x.ufficio);
    return { ...x, faseChiave: f ? f.chiave : x.faseChiave };
  });
  const stati: StatoPasso[] = fasi.map((f) => {
    if (!commessa) return "futuro";
    if (finita) return "fatto";
    const t = tasksNorm.filter((x) => x.faseChiave === f.chiave);
    if (t.some((x) => !STATI_CHIUSI.includes(x.stato))) return "corrente";
    if (t.some((x) => STATI_CHE_AVANZANO.includes(x.stato))) return "fatto";
    return "futuro";
  });
  if (commessa && !finita) {
    const senzaTask = tasksNorm.every((x) => !x.faseChiave || !chiavi.has(x.faseChiave) || x.stato === "ANNULLATO");
    if (senzaTask) {
      const chiave = FASE_DA_STATO[commessa.stato];
      const i = fasi.findIndex((f) => f.chiave === chiave);
      if (i >= 0) stati[i] = "corrente";
      else if (fasi.length) stati[0] = "corrente";
    }
    // le fasi saltate prima dell'ultima raggiunta contano come fatte
    let ultima = -1;
    stati.forEach((s, i) => { if (s !== "futuro") ultima = i; });
    for (let i = 0; i < ultima; i++) if (stati[i] === "futuro") stati[i] = "fatto";
    if (annullata) {
      const i = stati.findIndex((s) => s !== "fatto");
      if (i >= 0) { stati[i] = "stop"; for (let j = i + 1; j < stati.length; j++) stati[j] = "futuro"; }
    }
  }
  fasi.forEach((f, i) => passi.push({ chiave: f.chiave, nome: f.nome, ufficio: f.ufficio, stato: stati[i] }));

  // 3. Conclusa
  passi.push({ chiave: "CONCLUSA", nome: "Conclusa", ufficio: null, stato: finita ? "fatto" : "futuro" });

  let esito: Esito;
  if (annullata || statoOfferta === "ANNULLATO") esito = "ANNULLATA";
  else if (finita) esito = "CONCLUSA";
  else if (commessa) esito = "IN_CORSO";
  else if (OFFERTA_PERSA.includes(statoOfferta)) esito = "PERSA";
  else if (statoOff === "fatto") esito = "IN_CORSO";
  else esito = statoOff === "stop" ? "PERSA" : "TRATTATIVA";

  const fatti = passi.filter((p) => p.stato === "fatto").length;
  const percentuale = Math.round((fatti / passi.length) * 100);
  const corrente = passi.find((p) => p.stato === "corrente") ?? null;
  return { passi, esito, percentuale, corrente };
}

/** Le pratiche attive in cima, poi le altre per data. */
export function ordinaPratiche<T extends { esito: Esito; data: Date }>(lista: T[]): T[] {
  const peso: Record<Esito, number> = { IN_CORSO: 0, TRATTATIVA: 1, CONCLUSA: 2, PERSA: 3, ANNULLATA: 4 };
  return [...lista].sort((a, b) => peso[a.esito] - peso[b.esito] || b.data.getTime() - a.data.getTime());
}

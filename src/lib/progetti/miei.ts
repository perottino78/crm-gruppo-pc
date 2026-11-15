// «I miei progetti»: il commerciale vede tutte le pratiche dei suoi clienti e a che punto sono
// (fasi fra uffici, consegna prevista, pagamenti del cliente). Logica pura, testata in tests/progetti/miei.test.ts.

export type Semaforo = "OK" | "VICINA" | "SCADUTA" | "NESSUNA" | "FINITA";

export type ProgettoMin = {
  stato: string; // stato della commessa
  consegnaPrevista: Date | null;
  totale: number; // totale IVA inclusa
  pagato: number; // quanto ha già pagato il cliente
  accontoIncassato: boolean;
  cliente: string;
  numero: string;
  oggetto: string | null;
  commerciale: string;
};

export const FINITE = ["LAVORI_ESEGUITI", "CHIUSA"];
export const GIORNI_VICINA = 7;
const GIORNO = 86400000;

/** Semaforo della consegna prevista: scaduta (rossa), entro 7 giorni (arancione), più avanti (verde). */
export function semaforoConsegna(p: Pick<ProgettoMin, "stato" | "consegnaPrevista">, oggi: Date): Semaforo {
  if (FINITE.includes(p.stato) || p.stato === "ANNULLATA") return "FINITA";
  if (!p.consegnaPrevista) return "NESSUNA";
  const giorni = Math.floor((p.consegnaPrevista.getTime() - oggi.getTime()) / GIORNO);
  if (giorni < 0) return "SCADUTA";
  if (giorni <= GIORNI_VICINA) return "VICINA";
  return "OK";
}

export type Vista = "CORSO" | "FINITI" | "TUTTI";
export const VISTE: { chiave: Vista; nome: string }[] = [
  { chiave: "CORSO", nome: "In corso" },
  { chiave: "FINITI", nome: "Conclusi" },
  { chiave: "TUTTI", nome: "Tutti" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtro per vista e ricerca libera (tutte le parole, senza accenti, su cliente, numero, oggetto e commerciale). */
export function filtraProgetti<T extends ProgettoMin>(lista: T[], vista: Vista, cerca: string): T[] {
  const parole = norm(cerca).split(/\s+/).filter(Boolean);
  return lista.filter((p) => {
    if (p.stato === "ANNULLATA" && vista !== "TUTTI") return false;
    const finito = FINITE.includes(p.stato);
    if (vista === "CORSO" && finito) return false;
    if (vista === "FINITI" && !finito) return false;
    if (!parole.length) return true;
    const testo = norm([p.cliente, p.numero, p.oggetto ?? "", p.commerciale].join(" "));
    return parole.every((w) => testo.includes(w));
  });
}

const PESO: Record<Semaforo, number> = { SCADUTA: 0, VICINA: 1, OK: 2, NESSUNA: 3, FINITA: 4 };

/** Prima le consegne scadute, poi quelle vicine, poi le altre per data di consegna; senza data e finite in fondo. */
export function ordinaProgetti<T extends ProgettoMin>(lista: T[], oggi: Date): T[] {
  return [...lista].sort((a, b) => {
    const d = PESO[semaforoConsegna(a, oggi)] - PESO[semaforoConsegna(b, oggi)];
    if (d) return d;
    const ta = a.consegnaPrevista?.getTime() ?? Infinity, tb = b.consegnaPrevista?.getTime() ?? Infinity;
    if (ta !== tb) return ta - tb;
    return a.cliente.localeCompare(b.cliente, "it");
  });
}

/** Percentuale pagata dal cliente (0-100, arrotondata). */
export function percentualePagata(p: Pick<ProgettoMin, "totale" | "pagato">): number {
  if (p.totale <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((p.pagato / p.totale) * 100)));
}

/** I numeri in alto: pratiche in corso, consegne vicine e scadute, in attesa di acconto, da incassare. */
export function riepilogoProgetti(lista: ProgettoMin[], oggi: Date) {
  const inCorso = lista.filter((p) => !FINITE.includes(p.stato) && p.stato !== "ANNULLATA");
  return {
    inCorso: inCorso.length,
    vicine: inCorso.filter((p) => semaforoConsegna(p, oggi) === "VICINA").length,
    scadute: inCorso.filter((p) => semaforoConsegna(p, oggi) === "SCADUTA").length,
    attesaAcconto: inCorso.filter((p) => !p.accontoIncassato).length,
    daIncassare: Math.round(inCorso.reduce((s, p) => s + Math.max(0, p.totale - p.pagato), 0) * 100) / 100,
  };
}

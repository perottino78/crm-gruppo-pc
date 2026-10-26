// Filtri condivisi fra pagine e esportazioni Excel
import type { Prisma } from "@prisma/client";

const GIORNO = 86400000;

export type ParametriScadenze = { tipo?: string; periodo?: string; stato?: string; q?: string };

export function oggiUtc(): Date {
  const o = new Date();
  return new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()));
}

export function whereScadenze(p: ParametriScadenze): Prisma.ScadenzaWhereInput {
  const oggi = oggiUtc();
  const w: Prisma.ScadenzaWhereInput = {};
  if (p.tipo === "INCASSO" || p.tipo === "PAGAMENTO") w.tipo = p.tipo;
  const stato = p.stato ?? "aperte";
  if (stato === "aperte") w.stato = { in: ["APERTA", "PARZIALE"] };
  else if (stato === "pagate") w.stato = "PAGATA";
  else if (stato === "annullate") w.stato = "ANNULLATA";
  const periodo = p.periodo ?? "tutte";
  const tra = (da: Date, a: Date) => ({ gte: da, lt: a });
  if (periodo === "scadute") w.dataScadenza = { lt: oggi };
  else if (periodo === "oggi") w.dataScadenza = { lt: new Date(oggi.getTime() + GIORNO) };
  else if (periodo === "settimana") w.dataScadenza = tra(oggi, new Date(oggi.getTime() + 7 * GIORNO));
  else if (periodo === "mese") w.dataScadenza = tra(new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1)), new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() + 1, 1)));
  else if (periodo === "30") w.dataScadenza = { lt: new Date(oggi.getTime() + 30 * GIORNO) };
  else if (periodo === "90") w.dataScadenza = { lt: new Date(oggi.getTime() + 90 * GIORNO) };
  else if (periodo === "senza-data") w.dataScadenza = null;
  if (p.q?.trim()) {
    const q = p.q.trim();
    w.OR = [
      { controparte: { contains: q, mode: "insensitive" } },
      { descrizione: { contains: q, mode: "insensitive" } },
      { numeroDocumento: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
    ];
  }
  return w;
}

export type ParametriMovimenti = { conto?: string; mese?: string; stato?: string; verso?: string; q?: string };

export function whereMovimenti(p: ParametriMovimenti): Prisma.MovimentoFinanziarioWhereInput {
  const w: Prisma.MovimentoFinanziarioWhereInput = {};
  if (p.conto) w.contoId = p.conto;
  if (p.stato && ["DA_ABBINARE", "ABBINATO", "REGISTRATO"].includes(p.stato)) w.stato = p.stato;
  if (p.verso === "entrate") w.importo = { gt: 0 };
  if (p.verso === "uscite") w.importo = { lt: 0 };
  if (p.mese && /^\d{4}-\d{2}$/.test(p.mese)) {
    const [a, m] = p.mese.split("-").map(Number);
    w.data = { gte: new Date(Date.UTC(a, m - 1, 1)), lt: new Date(Date.UTC(a, m, 1)) };
  }
  if (p.q?.trim()) {
    const q = p.q.trim();
    const n = Number(q.replace(/\./g, "").replace(",", "."));
    w.OR = [
      { descrizione: { contains: q, mode: "insensitive" } },
      { categoria: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
      ...(isFinite(n) && n !== 0 ? [{ importo: n }, { importo: -n }] : []),
    ];
  }
  return w;
}

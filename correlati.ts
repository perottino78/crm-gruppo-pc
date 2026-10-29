// Archivio documenti: tutto ciò che è collegato a un cliente (come le correlazioni di Bconsole).
// Cliente → preventivi → commesse → ordini fornitori → bolle d'entrata → fatture d'acquisto.
import { prisma } from "@/lib/prisma";
import type { Utente } from "@prisma/client";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { puoAmministrazione } from "@/lib/amministrazione/server";
import { numeroCommessa } from "@/lib/commesse";

export type Gruppo = { entita: string; entitaId: string; tipo: string; titolo: string; link: string; data: Date | null; documenti: { id: string; nome: string; cartella: string; mime: string; dimensione: number; createdAt: Date; caricatoDaNome: string | null }[] };

export const NOMI_ENTITA: Record<string, string> = {
  CLIENTE: "Cliente", PREVENTIVO: "Preventivi", COMMESSA: "Commesse", ORDINE_FORNITORE: "Ordini fornitori",
  BOLLA_ENTRATA: "Bolle d'entrata", FATTURA_ACQUISTO: "Fatture d'acquisto", ARTICOLO: "Articoli",
};

/** Entità collegate a un cliente, con i loro documenti. I gruppi senza documenti restano (per caricarli). */
export async function correlatiCliente(u: Pick<Utente, "ruolo">, clienteId: string): Promise<Gruppo[]> {
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nome: true, createdAt: true } });
  if (!cliente) return [];
  const preventivi = await prisma.preventivo.findMany({ where: { clienteId }, select: { id: true, numeroOfferta: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  const commesse = await prisma.commessa.findMany({ where: { clienteId }, select: { id: true, numero: true, anno: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  const idComm = commesse.map((c) => c.id);
  const vediAcquisti = puoGestireOrdini(u), vediFatture = puoAmministrazione(u);
  const [ordini, righeBolla, righeFatt] = await Promise.all([
    vediAcquisti && idComm.length ? prisma.ordineFornitore.findMany({ where: { commessaId: { in: idComm } }, select: { id: true, numero: true, anno: true, dataOrdine: true, fornitore: { select: { ragioneSociale: true } } }, orderBy: { dataOrdine: "desc" } }) : [],
    vediAcquisti && idComm.length ? prisma.rigaBolla.findMany({ where: { commessaId: { in: idComm } }, select: { bollaId: true } }) : [],
    vediFatture && idComm.length ? prisma.rigaFatturaAcquisto.findMany({ where: { commessaId: { in: idComm } }, select: { fatturaId: true } }) : [],
  ]);
  const bolle = righeBolla.length ? await prisma.bollaEntrata.findMany({ where: { id: { in: [...new Set(righeBolla.map((r) => r.bollaId))] } }, select: { id: true, numero: true, anno: true, numeroDdt: true, dataArrivo: true, fornitoreNome: true } }) : [];
  const fatture = righeFatt.length ? await prisma.fatturaAcquisto.findMany({ where: { id: { in: [...new Set(righeFatt.map((r) => r.fatturaId))] } }, select: { id: true, numero: true, data: true, fornitoreNome: true } }) : [];
  const gruppi: Omit<Gruppo, "documenti">[] = [
    { entita: "CLIENTE", entitaId: cliente.id, tipo: "Cliente", titolo: cliente.nome, link: `/clienti/${cliente.id}`, data: cliente.createdAt },
    ...preventivi.map((p) => ({ entita: "PREVENTIVO", entitaId: p.id, tipo: "Preventivo", titolo: `Preventivo ${p.numeroOfferta ?? p.id.slice(-6)} del ${p.createdAt.toLocaleDateString("it-IT")}`, link: `/preventivi/${p.id}`, data: p.createdAt })),
    ...commesse.map((c) => ({ entita: "COMMESSA", entitaId: c.id, tipo: "Commessa", titolo: `Commessa ${numeroCommessa(c)}`, link: `/commesse/${c.id}`, data: c.createdAt })),
    ...ordini.map((o) => ({ entita: "ORDINE_FORNITORE", entitaId: o.id, tipo: "Ordine fornitore", titolo: `Ordine ${o.numero}/${o.anno} — ${o.fornitore.ragioneSociale}`, link: `/ordini-fornitori/${o.id}`, data: o.dataOrdine })),
    ...bolle.map((b) => ({ entita: "BOLLA_ENTRATA", entitaId: b.id, tipo: "Bolla d'entrata", titolo: `Bolla ${b.numero}/${b.anno}${b.numeroDdt ? ` (DDT ${b.numeroDdt})` : ""} — ${b.fornitoreNome}`, link: `/magazzino/bolle/${b.id}`, data: b.dataArrivo })),
    ...fatture.map((f) => ({ entita: "FATTURA_ACQUISTO", entitaId: f.id, tipo: "Fattura d'acquisto", titolo: `Fattura ${f.numero} — ${f.fornitoreNome}`, link: `/amministrazione/fatture-acquisto/${f.id}`, data: f.data })),
  ];
  const docs = await prisma.documento.findMany({
    where: { OR: gruppi.map((g) => ({ entita: g.entita, entitaId: g.entitaId })) },
    select: { id: true, nome: true, cartella: true, mime: true, dimensione: true, createdAt: true, caricatoDaNome: true, entita: true, entitaId: true },
    orderBy: [{ cartella: "asc" }, { createdAt: "desc" }],
  });
  return gruppi.map((g) => ({ ...g, documenti: docs.filter((d) => d.entita === g.entita && d.entitaId === g.entitaId) }));
}

/** Titolo leggibile e link dell'entità a cui appartiene un documento (per la vista «per tipo»). */
export async function titoliEntita(voci: { entita: string; entitaId: string }[]) {
  const per = (e: string) => [...new Set(voci.filter((v) => v.entita === e).map((v) => v.entitaId))];
  const [cl, pr, co, or, bo, fa, ar] = await Promise.all([
    prisma.cliente.findMany({ where: { id: { in: per("CLIENTE") } }, select: { id: true, nome: true } }),
    prisma.preventivo.findMany({ where: { id: { in: per("PREVENTIVO") } }, select: { id: true, numeroOfferta: true, cliente: { select: { nome: true } } } }),
    prisma.commessa.findMany({ where: { id: { in: per("COMMESSA") } }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } } }),
    prisma.ordineFornitore.findMany({ where: { id: { in: per("ORDINE_FORNITORE") } }, select: { id: true, numero: true, anno: true, fornitore: { select: { ragioneSociale: true } } } }),
    prisma.bollaEntrata.findMany({ where: { id: { in: per("BOLLA_ENTRATA") } }, select: { id: true, numero: true, anno: true, fornitoreNome: true } }),
    prisma.fatturaAcquisto.findMany({ where: { id: { in: per("FATTURA_ACQUISTO") } }, select: { id: true, numero: true, fornitoreNome: true } }),
    prisma.articolo.findMany({ where: { id: { in: per("ARTICOLO") } }, select: { id: true, codice: true, descrizione: true } }),
  ]);
  const m = new Map<string, { titolo: string; link: string }>();
  cl.forEach((x) => m.set(`CLIENTE:${x.id}`, { titolo: x.nome, link: `/clienti/${x.id}` }));
  pr.forEach((x) => m.set(`PREVENTIVO:${x.id}`, { titolo: `Preventivo ${x.numeroOfferta ?? x.id.slice(-6)} — ${x.cliente?.nome ?? ""}`, link: `/preventivi/${x.id}` }));
  co.forEach((x) => m.set(`COMMESSA:${x.id}`, { titolo: `Commessa ${numeroCommessa(x)} — ${x.cliente.nome}`, link: `/commesse/${x.id}` }));
  or.forEach((x) => m.set(`ORDINE_FORNITORE:${x.id}`, { titolo: `Ordine ${x.numero}/${x.anno} — ${x.fornitore.ragioneSociale}`, link: `/ordini-fornitori/${x.id}` }));
  bo.forEach((x) => m.set(`BOLLA_ENTRATA:${x.id}`, { titolo: `Bolla ${x.numero}/${x.anno} — ${x.fornitoreNome}`, link: `/magazzino/bolle/${x.id}` }));
  fa.forEach((x) => m.set(`FATTURA_ACQUISTO:${x.id}`, { titolo: `Fattura ${x.numero} — ${x.fornitoreNome}`, link: `/amministrazione/fatture-acquisto/${x.id}` }));
  ar.forEach((x) => m.set(`ARTICOLO:${x.id}`, { titolo: `${x.codice} — ${x.descrizione}`, link: `/prodotti/articoli/${x.id}` }));
  return m;
}

/** Entità che l'utente può vedere nell'archivio «per tipo». */
export function entitaVisibili(u: Pick<Utente, "ruolo">): string[] {
  const out = ["CLIENTE", "PREVENTIVO", "COMMESSA"];
  if (puoGestireOrdini(u)) out.push("ORDINE_FORNITORE", "BOLLA_ENTRATA", "ARTICOLO");
  if (puoAmministrazione(u)) out.push("FATTURA_ACQUISTO");
  return out;
}

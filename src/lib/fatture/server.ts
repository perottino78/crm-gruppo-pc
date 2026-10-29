// Fatture d'acquisto: importazione (XML / PDF), abbinamento a ordini, bolle e commesse, registrazione.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { abbinaRighe } from "@/lib/magazzino/calcoli";
import { chiaveFattura, divisioneDaCliente, MODALITA_PAGAMENTO, type FatturaLetta } from "./fatturapa";

type Tx = Prisma.TransactionClient;
const cent = (n: number) => Math.round(n * 100) / 100;
const pivaNorm = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/^IT/, "").replace(/\s/g, "");
const data12 = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`);

/** Fornitore in anagrafica per partita IVA (o ragione sociale identica). */
export async function trovaFornitore(partitaIva: string | null, nome: string) {
  const p = pivaNorm(partitaIva);
  if (p) {
    const tutti = await prisma.soggetto.findMany({ where: { partitaIva: { contains: p } }, select: { id: true, ragioneSociale: true, giorniPagamento: true, partitaIva: true } });
    const esatto = tutti.find((s) => pivaNorm(s.partitaIva) === p);
    if (esatto) return esatto;
  }
  return prisma.soggetto.findFirst({ where: { ragioneSociale: { equals: nome.trim(), mode: "insensitive" } }, select: { id: true, ragioneSociale: true, giorniPagamento: true, partitaIva: true } });
}

/** Ordini fornitori citati nella fattura ("12/2026", "ord. 12", ecc.). */
export async function ordiniCitati(riferimenti: string[], fornitoreId: string | null) {
  const out = new Set<string>();
  for (const r of riferimenti) {
    const m = /(\d{1,5})\s*[/-]\s*(20\d{2})/.exec(r) ?? /(\d{1,5})/.exec(r);
    if (!m) continue;
    const numero = Number(m[1]), anno = m[2] ? Number(m[2]) : undefined;
    const o = await prisma.ordineFornitore.findFirst({ where: { numero, ...(anno ? { anno } : {}), ...(fornitoreId ? { fornitoreId } : {}) }, orderBy: { anno: "desc" }, select: { id: true } });
    if (o) out.add(o.id);
  }
  return [...out];
}

export type EsitoImport = { stato: "NUOVA" | "DOPPIA" | "ERRORE"; id?: string; titolo: string; messaggio?: string };

/** Crea la fattura d'acquisto (da verificare) a partire dai dati letti, con gli abbinamenti proposti. */
export async function importaFattura(f: FatturaLetta, opz: { xml: string | null; origine: "XML" | "PDF" | "MANUALE"; creatoDaNome: string; creaFornitore?: boolean }): Promise<EsitoImport> {
  const titolo = `${f.fornitore.denominazione} n. ${f.numero} del ${f.data.split("-").reverse().join("/")}`;
  if (!f.numero || !/^\d{4}-\d{2}-\d{2}/.test(f.data)) return { stato: "ERRORE", titolo, messaggio: "Mancano numero o data della fattura." };
  const chiave = chiaveFattura(pivaNorm(f.fornitore.partitaIva) || null, f.fornitore.denominazione, f.tipoDocumento, f.numero, f.data);
  const esiste = await prisma.fatturaAcquisto.findUnique({ where: { chiave }, select: { id: true } });
  if (esiste) return { stato: "DOPPIA", id: esiste.id, titolo, messaggio: "Già caricata." };
  let forn = await trovaFornitore(f.fornitore.partitaIva, f.fornitore.denominazione);
  if (!forn && opz.creaFornitore !== false && f.fornitore.partitaIva) {
    forn = await prisma.soggetto.create({
      data: { ragioneSociale: f.fornitore.denominazione, ruoli: ["FORNITORE"], partitaIva: pivaNorm(f.fornitore.partitaIva), codiceFiscale: f.fornitore.codiceFiscale, indirizzo: f.fornitore.indirizzo, cap: f.fornitore.cap, comune: f.fornitore.comune, provincia: f.fornitore.provincia, email: f.fornitore.email, note: `Creato dalla fattura ${f.numero} del ${f.data}` },
      select: { id: true, ragioneSociale: true, giorniPagamento: true, partitaIva: true },
    });
  }
  const segno = f.notaCredito ? -1 : 1;
  // abbinamenti: ordini citati → righe d'ordine; DDT citati → bolle del fornitore
  const ordini = await ordiniCitati(f.ordini.map((o) => o.numero), forn?.id ?? null);
  const candidate = ordini.length ? await prisma.rigaOrdine.findMany({ where: { ordineFornitoreId: { in: ordini } }, select: { id: true, codice: true, codiceFornitore: true, descrizione: true, quantita: true, commessaId: true } }) : [];
  const abb = abbinaRighe(f.righe.map((r) => ({ codice: r.codice, descrizione: r.descrizione })), candidate.map((c) => ({ ...c, residuo: c.quantita })));
  const commessaOrdine = ordini.length ? (await prisma.ordineFornitore.findMany({ where: { id: { in: ordini }, commessaId: { not: null } }, select: { commessaId: true } })).map((o) => o.commessaId!) : [];
  const unicaCommessa = [...new Set(commessaOrdine)].length === 1 ? commessaOrdine[0] : null;
  const bolle = forn && f.ddt.length ? await prisma.bollaEntrata.findMany({ where: { fornitoreId: forn.id, stato: { in: ["DA_FATTURARE", "APERTA"] }, numeroDdt: { in: f.ddt.map((d) => d.numero) } }, select: { id: true } }) : [];
  const fatt = await prisma.fatturaAcquisto.create({
    data: {
      chiave, fornitoreId: forn?.id ?? null, fornitoreNome: forn?.ragioneSociale ?? f.fornitore.denominazione, partitaIva: pivaNorm(f.fornitore.partitaIva) || null,
      tipoDocumento: f.tipoDocumento, numero: f.numero, data: data12(f.data), imponibile: cent(segno * Math.abs(f.imponibile)), iva: cent(segno * Math.abs(f.iva)), totale: cent(segno * Math.abs(f.totale)),
      divisione: divisioneDaCliente(f.cliente.partitaIva), origine: opz.origine, xml: opz.xml,
      riferimentiOrdine: f.ordini.map((o) => o.numero).join(", ") || null, riferimentiDdt: f.ddt.map((d) => `${d.numero}${d.data ? ` del ${d.data.split("-").reverse().join("/")}` : ""}`).join(", ") || null,
      scadenzePreviste: f.scadenze.length ? f.scadenze : undefined, note: f.causale || null, creatoDaNome: opz.creatoDaNome,
      righe: {
        create: f.righe.map((r, i) => {
          const ro = abb[i] ? candidate.find((c) => c.id === abb[i]) : undefined;
          return { posizione: r.posizione || i + 1, codice: r.codice, descrizione: r.descrizione.slice(0, 1000), quantita: r.quantita, um: r.um, prezzoUnitario: r.prezzoUnitario, importo: cent(segno * Math.abs(r.importo)), aliquotaIva: r.aliquotaIva, rigaOrdineId: ro?.id ?? null, commessaId: ro?.commessaId ?? unicaCommessa };
        }),
      },
      bolle: bolle.length ? { connect: bolle.map((b) => ({ id: b.id })) } : undefined,
    },
  });
  return { stato: "NUOVA", id: fatt.id, titolo };
}

/** Rate di pagamento della fattura: dall'XML se presenti, altrimenti una sola rata secondo i giorni del fornitore. */
export function ratePagamento(f: { totale: number; data: Date; scadenzePreviste: unknown }, giorniFornitore: number | null) {
  const prev = Array.isArray(f.scadenzePreviste) ? (f.scadenzePreviste as { data: string | null; importo: number; modalita: string | null }[]) : [];
  if (prev.length && prev.some((p) => p.importo > 0)) {
    return prev.filter((p) => p.importo > 0).map((p) => ({ data: p.data ? data12(p.data) : f.data, importo: cent(p.importo), modalita: p.modalita ? MODALITA_PAGAMENTO[p.modalita] ?? p.modalita : null }));
  }
  const d = new Date(f.data); d.setUTCDate(d.getUTCDate() + (giorniFornitore ?? 0));
  return [{ data: d, importo: cent(f.totale), modalita: null }];
}

/** Ricalcola il costo effettivo delle righe d'ordine dalle fatture registrate che le citano. */
async function ricalcolaCostiRighe(tx: Tx, righeOrdine: string[]) {
  for (const id of righeOrdine) {
    const somma = await tx.rigaFatturaAcquisto.aggregate({ where: { rigaOrdineId: id, fattura: { stato: "REGISTRATA" } }, _sum: { importo: true }, _count: true });
    await tx.rigaOrdine.update({ where: { id }, data: { costoEffettivo: somma._count ? cent(somma._sum.importo ?? 0) : null } });
  }
}

/**
 * Registra la fattura: costi reali su righe d'ordine e commesse, bolle collegate «fatturate»,
 * scadenze di pagamento nello scadenzario. Si può rifare: i costi e le scadenze aperte si rigenerano.
 */
export async function registraFattura(tx: Tx, id: string, nome: string) {
  const f = await tx.fatturaAcquisto.findUniqueOrThrow({ where: { id }, include: { righe: true, bolle: { select: { id: true } } } });
  await tx.fatturaAcquisto.update({ where: { id }, data: { stato: "REGISTRATA", registrataIl: new Date(), registrataDaNome: nome } });
  // costi: righe abbinate a una riga d'ordine → costo effettivo; righe solo su commessa → costo della commessa
  await tx.costoManuale.deleteMany({ where: { fatturaAcquistoId: id } });
  await ricalcolaCostiRighe(tx, [...new Set(f.righe.map((r) => r.rigaOrdineId).filter(Boolean))] as string[]);
  const perCommessa = new Map<string, number>();
  for (const r of f.righe) if (r.commessaId && !r.rigaOrdineId) perCommessa.set(r.commessaId, (perCommessa.get(r.commessaId) ?? 0) + r.importo);
  for (const [commessaId, importo] of perCommessa) {
    await tx.costoManuale.create({ data: { commessaId, categoria: "FATTURA_FORNITORE", descrizione: `Fattura ${f.numero} del ${f.data.toLocaleDateString("it-IT")} — ${f.fornitoreNome}`, importo: cent(importo), data: f.data, autoreNome: nome, fatturaAcquistoId: id } });
  }
  const commesse = new Set<string>([...perCommessa.keys(), ...(f.righe.map((r) => r.commessaId).filter(Boolean) as string[])]);
  for (const c of commesse) await tx.commessaEvento.create({ data: { commessaId: c, utenteNome: nome, testo: `Registrata fattura d'acquisto ${f.numero} di ${f.fornitoreNome} (costi reali aggiornati).` } });
  if (f.bolle.length) await tx.bollaEntrata.updateMany({ where: { id: { in: f.bolle.map((b) => b.id) }, stato: { in: ["DA_FATTURARE", "APERTA"] } }, data: { stato: "FATTURATA" } });
  // scadenze: si rigenerano quelle ancora aperte e senza pagamenti
  const vecchie = await tx.scadenza.findMany({ where: { chiaveImport: { startsWith: `FA:${id}:` } }, include: { abbinamenti: { select: { id: true } } } });
  const pagate = vecchie.filter((s) => s.abbinamenti.length || s.pagatoManuale > 0 || s.stato !== "APERTA");
  const avvisi: string[] = [];
  if (f.totale < 0) avvisi.push("Nota di credito: nessuna scadenza di pagamento creata (riduce il debito verso il fornitore).");
  else if (pagate.length) avvisi.push("Le scadenze avevano già pagamenti: lasciate com'erano.");
  else {
    await tx.scadenza.deleteMany({ where: { id: { in: vecchie.map((s) => s.id) } } });
    const forn = f.fornitoreId ? await tx.soggetto.findUnique({ where: { id: f.fornitoreId }, select: { giorniPagamento: true } }) : null;
    const rate = ratePagamento(f, forn?.giorniPagamento ?? null);
    for (const [i, r] of rate.entries()) {
      await tx.scadenza.create({
        data: { tipo: "PAGAMENTO", descrizione: `Fattura ${f.numero} del ${f.data.toLocaleDateString("it-IT")}${rate.length > 1 ? ` — rata ${i + 1}/${rate.length}` : ""}${r.modalita ? ` (${r.modalita})` : ""}`, controparte: f.fornitoreNome, soggettoId: f.fornitoreId, commessaId: null, origine: "FATTURA_ACQUISTO", chiaveImport: `FA:${id}:${i}`, importo: r.importo, dataScadenza: r.data, numeroDocumento: f.numero, categoria: "Acquisti", brand: f.divisione },
      });
    }
  }
  return { commesse: [...commesse], avvisi };
}

/** Riapre una fattura registrata (per correggerla): toglie costi, riporta le bolle «da fatturare», toglie le scadenze non pagate. */
export async function riapriFattura(tx: Tx, id: string) {
  const f = await tx.fatturaAcquisto.findUniqueOrThrow({ where: { id }, include: { righe: true, bolle: { select: { id: true } } } });
  const scad = await tx.scadenza.findMany({ where: { chiaveImport: { startsWith: `FA:${id}:` } }, include: { abbinamenti: { select: { id: true } } } });
  if (scad.some((s) => s.abbinamenti.length || s.pagatoManuale > 0 || s.stato !== "APERTA")) throw new Error("La fattura ha già pagamenti registrati: non si può riaprire.");
  await tx.scadenza.deleteMany({ where: { id: { in: scad.map((s) => s.id) } } });
  await tx.fatturaAcquisto.update({ where: { id }, data: { stato: "DA_VERIFICARE", registrataIl: null, registrataDaNome: null } });
  await tx.costoManuale.deleteMany({ where: { fatturaAcquistoId: id } });
  await ricalcolaCostiRighe(tx, [...new Set(f.righe.map((r) => r.rigaOrdineId).filter(Boolean))] as string[]);
  if (f.bolle.length) await tx.bollaEntrata.updateMany({ where: { id: { in: f.bolle.map((b) => b.id) }, stato: "FATTURATA" }, data: { stato: "DA_FATTURARE" } });
}

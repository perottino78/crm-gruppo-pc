// Fatture di vendita: emesse da Giorgia in BConsole (fino all'emissione dal CRM con SDI) e importate dagli XML.
// Servono per lo scaduto e per gli incassi (bonifico ordinario, per detrazione con ritenuta 11%, parziali, contanti, assegno…).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SOCIETA_GRUPPO, leggiFatturaPA, type FatturaLetta } from "./fatturapa";

const cent = (n: number) => Math.round(n * 100) / 100;
const pivaNorm = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/^IT/, "").replace(/\s/g, "");
const data12 = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`);
/** "ROSSI  MARIO" e "Mario Rossi" → "MARIO ROSSI" (parole in ordine alfabetico, per riconoscere lo stesso nome scritto al contrario). */
export const nomeNorm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

/** È una fattura emessa da una società del gruppo (cedente = P&C o Work & Services)? */
export const emessaDalGruppo = (f: FatturaLetta) => !!SOCIETA_GRUPPO[pivaNorm(f.fornitore.partitaIva)];

/** Lavoro con detrazione fiscale (bonifico "parlante" con ritenuta): lo si capisce dalla causale o dalle righe. */
export function conDetrazione(f: Pick<FatturaLetta, "causale" | "righe">): boolean {
  const t = `${f.causale} ${f.righe.map((r) => r.descrizione).join(" ")}`;
  return /detrazion|detraibil|ecobonus|bonus\s*casa|bonus\s*mobili|16[\s-]?bis|art\.?\s*1\s*comma\s*(344|345|346|347)|risparmio\s+energetico|ristrutturazion|50\s?%\s*(irpef)?|65\s?%/i.test(t);
}

/** Sezionale dal numero ("123/FV" → "FV", "45/2026/PF" → "PF"); null se il numero è solo cifre e anno. */
export function sezionaleDaNumero(numero: string): string | null {
  const parti = numero.split(/[/\-_ ]+/).filter(Boolean);
  const lettere = parti.filter((p) => /[A-Z]/i.test(p) && !/^xml$/i.test(p));
  return lettere.length ? lettere.join("/").toUpperCase().slice(0, 20) : null;
}

export const chiaveVendita = (f: { numero: string; data: string; tipoDocumento: string; cedente: string | null }) =>
  ["V", pivaNorm(f.cedente), f.tipoDocumento, f.numero.toUpperCase().replace(/\s+/g, ""), f.data.slice(0, 4)].join("|");

/** Rate di incasso: dall'XML se presenti, altrimenti una sola alla data della fattura. */
export function rateIncasso(f: Pick<FatturaLetta, "scadenze" | "totale" | "data">): { data: Date; importo: number }[] {
  const r = f.scadenze.filter((s) => s.importo > 0);
  if (r.length) return r.map((s) => ({ data: data12(s.data ?? f.data), importo: cent(s.importo) }));
  return [{ data: data12(f.data), importo: cent(Math.abs(f.totale)) }];
}

/** Stato di una fattura di vendita dalle sue scadenze. */
export function statoVendita(f: { totale: number; tipoDocumento: string }, scadenze: { importo: number; residuo: number; dataScadenza: Date | null; stato: string }[], oggi: Date) {
  if (f.totale < 0 || f.tipoDocumento === "TD04") return "NOTA_CREDITO";
  const vive = scadenze.filter((s) => s.stato !== "ANNULLATA");
  if (!vive.length) return "SENZA_SCADENZE";
  const residuo = cent(vive.reduce((t, s) => t + s.residuo, 0));
  if (residuo <= 0.004) return "SALDATA";
  if (vive.some((s) => s.residuo > 0.004 && s.dataScadenza && s.dataScadenza < oggi)) return "SCADUTA";
  return residuo < cent(vive.reduce((t, s) => t + s.importo, 0)) - 0.004 ? "PARZIALE" : "APERTA";
}
export const STATI_VENDITA: Record<string, { nome: string; cls: string }> = {
  APERTA: { nome: "Da incassare", cls: "bg-sky-100 text-sky-800" },
  PARZIALE: { nome: "Incassata in parte", cls: "bg-amber-100 text-amber-900" },
  SCADUTA: { nome: "Scaduta", cls: "bg-red-600 text-white" },
  SALDATA: { nome: "Saldata", cls: "bg-green-600 text-white" },
  NOTA_CREDITO: { nome: "Nota di credito", cls: "bg-neutral-200 text-neutral-700" },
  SENZA_SCADENZE: { nome: "Senza scadenze", cls: "bg-neutral-100 text-neutral-600" },
};

/** Cliente del CRM: per P.IVA, codice fiscale o nome (anche scritto "Cognome Nome"). */
export async function trovaCliente(f: { partitaIva: string | null; codiceFiscale: string | null; denominazione: string }) {
  const sel = { id: true, nome: true, brand: { select: { nome: true } } } as const;
  const p = pivaNorm(f.partitaIva);
  if (p) { const c = await prisma.cliente.findFirst({ where: { piva: { contains: p } }, select: sel }); if (c) return c; }
  const cf = (f.codiceFiscale ?? "").toUpperCase().trim();
  if (cf) { const c = await prisma.cliente.findFirst({ where: { codiceFiscale: { equals: cf, mode: "insensitive" } }, select: sel }); if (c) return c; }
  const n = nomeNorm(f.denominazione);
  if (!n) return null;
  const parole = n.split(" ");
  const cand = await prisma.cliente.findMany({ where: { AND: parole.slice(0, 3).map((w) => ({ nome: { contains: w, mode: "insensitive" as const } })) }, select: sel, take: 20 });
  const uguali = cand.filter((c) => nomeNorm(c.nome) === n);
  return uguali.length === 1 ? uguali[0] : null;
}

export type EsitoVendita = { stato: "NUOVA" | "DOPPIA" | "ERRORE"; id?: string; titolo: string; messaggio?: string };

/** Crea la fattura di vendita con le sue scadenze di incasso (o le aggancia a quelle già aperte dalla commessa). */
export async function importaFatturaVendita(f: FatturaLetta, opz: { xml: string | null; origine: "XML" | "MANUALE"; creatoDaNome: string }): Promise<EsitoVendita> {
  const titolo = `Fattura ${f.numero} del ${f.data.split("-").reverse().join("/")} — ${f.cliente.denominazione}`;
  if (!f.numero || !/^\d{4}-\d{2}-\d{2}/.test(f.data)) return { stato: "ERRORE", titolo, messaggio: "Mancano numero o data." };
  if (opz.origine === "XML" && !emessaDalGruppo(f)) return { stato: "ERRORE", titolo, messaggio: `Non è emessa da P&C o Work & Services (emessa da ${f.fornitore.denominazione}): è una fattura d'acquisto, caricala in Fatture d'acquisto.` };
  const chiave = chiaveVendita({ numero: f.numero, data: f.data, tipoDocumento: f.tipoDocumento, cedente: f.fornitore.partitaIva });
  const esiste = await prisma.fatturaVendita.findUnique({ where: { chiave }, select: { id: true } });
  if (esiste) return { stato: "DOPPIA", id: esiste.id, titolo, messaggio: "Già caricata." };
  const cliente = await trovaCliente(f.cliente);
  // commessa: quella aperta del cliente, se è una sola
  const commesse = cliente ? await prisma.commessa.findMany({ where: { clienteId: cliente.id, chiusaIl: null, stato: { notIn: ["ANNULLATA"] } }, select: { id: true, brand: { select: { nome: true } } } }) : [];
  const commessa = commesse.length === 1 ? commesse[0] : null;
  const segno = f.notaCredito ? -1 : 1;
  const fv = await prisma.$transaction(async (tx) => {
    const fv = await tx.fatturaVendita.create({
      data: {
        chiave, sezionale: sezionaleDaNumero(f.numero), tipoDocumento: f.tipoDocumento, numero: f.numero, data: data12(f.data),
        clienteId: cliente?.id ?? null, clienteNome: cliente?.nome ?? f.cliente.denominazione, partitaIva: pivaNorm(f.cliente.partitaIva) || null, codiceFiscale: f.cliente.codiceFiscale,
        commessaId: commessa?.id ?? null, divisione: SOCIETA_GRUPPO[pivaNorm(f.fornitore.partitaIva)] ?? "P&C", brand: commessa?.brand.nome ?? cliente?.brand.nome ?? null,
        imponibile: cent(segno * Math.abs(f.imponibile)), iva: cent(segno * Math.abs(f.iva)), totale: cent(segno * Math.abs(f.totale)),
        detrazione: conDetrazione(f), causale: f.causale || null, origine: opz.origine, xml: opz.xml, creatoDaNome: opz.creatoDaNome,
      },
    });
    if (!f.notaCredito) await creaScadenzeVendita(tx, fv.id);
    return fv;
  });
  return { stato: "NUOVA", id: fv.id, titolo };
}

/**
 * Scadenze di incasso della fattura. Se la commessa ha già l'incasso aperto (acconto/saldo) con lo stesso importo,
 * la fattura si aggancia a quello invece di crearne un altro: niente incassi contati due volte.
 */
export async function creaScadenzeVendita(tx: Prisma.TransactionClient, id: string) {
  const fv = await tx.fatturaVendita.findUniqueOrThrow({ where: { id } });
  const rate = fv.xml ? null : [{ data: fv.data, importo: cent(Math.abs(fv.totale)) }];
  let elenco = rate;
  if (!elenco) {
    const letta = leggiFatturaPA(fv.xml!).find((x) => x.numero === fv.numero) ?? leggiFatturaPA(fv.xml!)[0];
    elenco = rateIncasso({ scadenze: letta.scadenze, totale: fv.totale, data: fv.data.toISOString().slice(0, 10) });
  }
  const descr = `Fattura ${fv.numero} del ${fv.data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`;
  for (const [i, r] of elenco.entries()) {
    const gia = fv.commessaId ? await tx.scadenza.findFirst({
      where: { tipo: "INCASSO", commessaId: fv.commessaId, fatturaVenditaId: null, stato: { in: ["APERTA", "PARZIALE"] }, importo: { gte: r.importo - 1, lte: r.importo + 1 } },
    }) : null;
    if (gia) {
      await tx.scadenza.update({ where: { id: gia.id }, data: { fatturaVenditaId: fv.id, numeroDocumento: fv.numero, note: [gia.note, `${descr}: agganciata a questo incasso della commessa.`].filter(Boolean).join("\n") } });
      continue;
    }
    await tx.scadenza.create({
      data: {
        tipo: "INCASSO", descrizione: `${descr}${elenco.length > 1 ? ` — rata ${i + 1}/${elenco.length}` : ""}`, controparte: fv.clienteNome, clienteId: fv.clienteId,
        origine: "FATTURA_VENDITA", chiaveImport: `FV:${fv.id}:${i}`, importo: r.importo, dataScadenza: r.data, dataModificata: true,
        numeroDocumento: fv.numero, categoria: "Vendite", brand: fv.brand ?? fv.divisione, fatturaVenditaId: fv.id,
      },
    });
  }
}

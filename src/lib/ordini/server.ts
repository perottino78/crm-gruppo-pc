import { puo, type ConPermessi } from "@/lib/permessi/catalogo";
// Acquisti: funzioni lato server condivise (fornitore predefinito, costo previsto, permessi, numerazione).
import { prisma } from "@/lib/prisma";
import type { Prisma, Utente } from "@prisma/client";
import { costoPrevisto, numeroOrdine } from "./calcoli";
import type { DatiPdfOrdine } from "./pdfOrdine";
import { vociMateriale } from "./costi-materiale";

export const puoGestireOrdini = (u: ConPermessi | null | undefined) => puo(u, "ordini");

type RigaPrev = { id: string; prezzoUnitario: number; optionalPrezzo: number; quantita: number; prodotto: { brandId: string; tipologia: string } | null };

/** Per ogni riga venduta: fornitore predefinito del modello, codice fornitore, sconto e costo previsto. */
export async function datiAcquisto(righe: RigaPrev[]) {
  const chiavi = righe.filter((r) => r.prodotto).map((r) => ({ brandId: r.prodotto!.brandId, tipologia: r.prodotto!.tipologia }));
  const modelli = chiavi.length ? await prisma.modelloProdotto.findMany({ where: { OR: chiavi }, select: { brandId: true, tipologia: true, fornitoreId: true, codiceFornitore: true, scontoAcquisto: true } }) : [];
  const idForn = [...new Set(modelli.map((m) => m.fornitoreId).filter(Boolean))] as string[];
  const fornitori = idForn.length ? await prisma.soggetto.findMany({ where: { id: { in: idForn } }, select: { id: true, ragioneSociale: true, scontoFornitore: true } }) : [];
  const out = new Map<string, { fornitoreId: string | null; fornitoreNome: string | null; codiceFornitore: string | null; scontoAcquisto: number | null; costoPrevisto: number | null }>();
  for (const r of righe) {
    const m = r.prodotto ? modelli.find((x) => x.brandId === r.prodotto!.brandId && x.tipologia === r.prodotto!.tipologia) : undefined;
    const f = m?.fornitoreId ? fornitori.find((x) => x.id === m.fornitoreId) : undefined;
    const sconto = m?.scontoAcquisto ?? f?.scontoFornitore ?? null;
    out.set(r.id, {
      fornitoreId: f?.id ?? null, fornitoreNome: f?.ragioneSociale ?? null, codiceFornitore: m?.codiceFornitore ?? null,
      scontoAcquisto: f ? sconto : null, costoPrevisto: f ? costoPrevisto(r, sconto) : null,
    });
  }
  return out;
}

/** Prossimo numero d'ordine dell'anno, dentro una transazione bloccata (niente numeri doppi). */
export async function prossimoNumeroOrdine(tx: Prisma.TransactionClient, anno: number): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ordini-fornitori-" + anno}))`;
  const ultimo = await tx.ordineFornitore.aggregate({ where: { anno }, _max: { numero: true } });
  return (ultimo._max.numero ?? 0) + 1;
}

/** Dati dell'azienda che emette l'ordine, in base alla divisione. */
export function aziendaPerDivisione(divisione?: string | null) {
  if (divisione === "Work & Services") {
    return { ragioneSociale: "Work & Services S.r.l.", righe: ["Sede operativa: Corso Moncenisio 28 - 10090 Rosta (TO)", "Sede legale: Via Morghen 34 - 10143 Torino", "P.IVA 12059980016 - PEC workservices@cert.ica-net.it"] };
  }
  return { ragioneSociale: "P&C S.r.l.", righe: ["Corso Moncenisio 28 - 10090 Rosta (TO)", "P.IVA 10741080013 - PEC gruppopec@cert.ica-net.it", "Tel. 011 1988 7497 - info@gruppopec.com"] };
}

/** Dati per il PDF dell'ordine (usati anche dalla rotta di download). */
export async function datiPdfOrdine(id: string) {
  const o = await prisma.ordineFornitore.findUnique({ where: { id }, include: { fornitore: true, righe: { orderBy: { createdAt: "asc" } }, commessa: true } });
  if (!o) return null;
  const f = o.fornitore;
  const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "");
  return {
    ordine: o,
    dati: <DatiPdfOrdine>{
      numero: numeroOrdine(o), data: o.dataOrdine, azienda: aziendaPerDivisione(o.divisione),
      fornitore: { ragioneSociale: f.ragioneSociale, righe: [[f.indirizzo, [f.cap, f.comune, f.provincia ? `(${f.provincia})` : null].filter(Boolean).join(" ")].filter(Boolean).join(", "), f.partitaIva ? `P.IVA ${f.partitaIva}` : "", f.emailOrdini ?? f.email ?? ""].filter(Boolean) },
      testata: [
        ["Consegna richiesta", dataIt(o.consegnaRichiesta)], ["Commessa", o.commessa ? `${o.commessa.numero}/${o.commessa.anno}` : ""],
        ["Cliente finale", o.clienteFinale ?? ""], ["Riferimento", o.riferimento ?? ""],
        ["Indirizzo di consegna", o.indirizzoSpedizione ?? ""], ["Trasporto", o.trasporto ?? ""],
      ] as [string, string][],
      righe: o.righe.map((r) => ({ codice: r.codice, codiceFornitore: r.codiceFornitore, descrizione: r.descrizione + (r.note ? ` (${r.note})` : ""), quantita: r.quantita, um: r.um, prezzoAcquisto: r.prezzoAcquisto, scontoAcquisto: r.scontoAcquisto })),
      note: o.note, firma: o.creatoDaNome ? `${o.creatoDaNome} - Ufficio ordini` : "Ufficio ordini",
    },
  };
}


/**
 * Voci di costo del materiale per commessa (righe, conferme del fornitore, regola della fattura): vedi `vociMateriale`.
 * Un ordine è «fatturato» se una sua riga è in una fattura d'acquisto registrata, o se sulla commessa c'è una fattura
 * registrata dello stesso fornitore.
 */
export async function costiMaterialeCommesse(ids: string[]) {
  const out = new Map<string, ReturnType<typeof vociMateriale>>();
  if (!ids.length) return out;
  const [righe, ordini, manuali] = await Promise.all([
    prisma.rigaOrdine.findMany({ where: { commessaId: { in: ids } }, select: { id: true, commessaId: true, descrizione: true, fornitoreNome: true, costoEffettivo: true, ordineFornitoreId: true, arrivatoIl: true, ordinatoIl: true, createdAt: true } }),
    prisma.ordineFornitore.findMany({ where: { commessaId: { in: ids }, totaleConfermato: { not: null }, stato: { not: "ANNULLATO" } }, select: { id: true, numero: true, anno: true, commessaId: true, fornitoreId: true, totaleConfermato: true, totaleConfermatoIl: true, fornitore: { select: { ragioneSociale: true } } } }),
    prisma.costoManuale.findMany({ where: { commessaId: { in: ids }, categoria: { in: ["ACQUISTO_MATERIALE", "FATTURA_FORNITORE"] } }, select: { commessaId: true, categoria: true, fatturaAcquistoId: true } }),
  ]);
  const idRigheConfermate = righe.filter((r) => r.ordineFornitoreId && ordini.some((o) => o.id === r.ordineFornitoreId)).map((r) => r.id);
  const [righeFatturate, fatture] = await Promise.all([
    idRigheConfermate.length ? prisma.rigaFatturaAcquisto.findMany({ where: { rigaOrdineId: { in: idRigheConfermate }, fattura: { stato: "REGISTRATA" } }, select: { rigaOrdineId: true } }) : Promise.resolve([]),
    prisma.fatturaAcquisto.findMany({ where: { id: { in: manuali.map((m) => m.fatturaAcquistoId).filter(Boolean) as string[] }, stato: "REGISTRATA" }, select: { id: true, fornitoreId: true } }),
  ]);
  const rigaFatturata = new Set(righeFatturate.map((r) => r.rigaOrdineId));
  for (const id of ids) {
    const man = manuali.filter((m) => m.commessaId === id);
    const fornitoriFatturati = new Set(man.map((m) => fatture.find((f) => f.id === m.fatturaAcquistoId)?.fornitoreId).filter(Boolean));
    const rr = righe.filter((r) => r.commessaId === id);
    out.set(id, vociMateriale(
      rr.map((r) => ({ descrizione: r.descrizione, fornitoreNome: r.fornitoreNome, costoEffettivo: r.costoEffettivo, ordineFornitoreId: r.ordineFornitoreId, data: r.arrivatoIl ?? r.ordinatoIl ?? r.createdAt })),
      ordini.filter((o) => o.commessaId === id).map((o) => ({
        id: o.id, numero: `${o.numero}/${o.anno}`, fornitoreNome: o.fornitore.ragioneSociale, totaleConfermato: o.totaleConfermato, confermatoIl: o.totaleConfermatoIl,
        fatturato: fornitoriFatturati.has(o.fornitoreId) || rr.some((r) => r.ordineFornitoreId === o.id && rigaFatturata.has(r.id)),
      })),
      man.some((m) => m.categoria === "ACQUISTO_MATERIALE"),
    ));
  }
  return out;
}

/** Indirizzo dell'ufficio ordini: gli ordini partono da qui e le conferme dei fornitori tornano qui. */
export const EMAIL_ORDINI = () => process.env.EMAIL_ORDINI || "ordini@gruppopec.com";

/** File del rilievo della commessa (PDF e foto dei rilievi non annullati), da allegare all'ordine al fornitore. */
export async function fileRilievo(commessaId: string | null | undefined, conContenuto = true, soloId?: string[]) {
  if (!commessaId) return [];
  const righe = await prisma.rilievoAllegato.findMany({
    where: { rilievo: { commessaId, stato: { not: "ANNULLATO" } }, ...(soloId ? { id: { in: soloId } } : {}) },
    select: { id: true, nome: true, ...(conContenuto ? { dataUri: true } : {}) }, orderBy: { createdAt: "asc" },
  });
  return righe.map((r, i) => {
    const d = (r as { dataUri?: string }).dataUri ?? "";
    const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(d);
    const mime = m?.[1] || "image/jpeg";
    const est = mime === "application/pdf" ? "pdf" : mime.split("/")[1] ?? "jpg";
    const nome = (r.nome && /\.[a-z0-9]{2,4}$/i.test(r.nome) ? r.nome : `rilievo-${i + 1}.${est}`).replace(/[^\w.\- ]+/g, "_");
    return { id: r.id, nome, mime, contenuto: m ? (m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]))) : Buffer.alloc(0) };
  }).filter((f) => !conContenuto || f.contenuto.length > 0);
}

/** File delle cartelle del progetto (pratica e offerta) da allegare all'ordine o alla richiesta al fornitore. */
export async function documentiProgetto(commessaId: string | null | undefined, conContenuto = true, soloId?: string[]) {
  if (!commessaId) return [];
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, select: { preventivoId: true } });
  if (!c) return [];
  const docs = await prisma.documento.findMany({
    where: { OR: [{ entita: "COMMESSA", entitaId: commessaId }, { entita: "PREVENTIVO", entitaId: c.preventivoId }], ...(soloId ? { id: { in: soloId } } : {}) },
    select: { id: true, nome: true, cartella: true, mime: true, entita: true, ...(conContenuto ? { contenuto: true } : {}) },
    orderBy: [{ cartella: "asc" }, { createdAt: "asc" }],
  });
  return docs.map((d) => ({ id: d.id, nome: d.nome, cartella: d.entita === "PREVENTIVO" ? `Offerta · ${d.cartella}` : d.cartella, mime: d.mime, contenuto: Buffer.from((d as { contenuto?: Uint8Array }).contenuto ?? new Uint8Array()) }));
}

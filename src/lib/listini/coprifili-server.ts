// Carica/aggiorna il listino dei coprifili EXTE (INDOOR › SERRAMENTI › PVC — Coprifili e angolari). Usato dalla rotta admin e, una volta per versione,
// all'apertura di un'offerta (Ugo 22/11/2026: «non trovo il listino» = la rotta admin non era mai stata lanciata in produzione).
import { prisma } from "@/lib/prisma";
import { catalogoCoprifili, GRUPPO_COPRIFILI, PREFISSO_COPRIFILI, FORNITORE_COPRIFILI, SCONTO_ACQUISTO_COPRIFILI } from "@/lib/listini/coprifili";

export const VERSIONE_COPRIFILI = "2026-11-22";
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const norm = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(SRLS|SRL)$/, "");
const kP = (p: Riga) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;

/** Coprifili, angolari e listelli in PVC (INDOOR › COPRIFILI E ANGOLARI): prezzi al metro dal catalogo-listino EXTE 2023/2024.
 *  GET = prova, POST = carica (rilanciabile: aggiorna i prezzi, toglie le voci non più a listino se nessuna offerta le usa). */
export async function caricaCoprifili(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) return { error: "brand P&C non trovato" };
  const cat = catalogoCoprifili();
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, prodottiNonRimovibili: 0, modelliRimossi: 0 };
  // «_» nel LIKE vale «qualsiasi carattere»: si ricontrolla il prefisso esatto
  const esistenti = (await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_COPRIFILI } } }))
    .filter((p) => p.tipologia.startsWith(PREFISSO_COPRIFILI));
  const mappa = new Map(esistenti.map((p) => [kP(p), p]));
  const nuovi: Riga[] = [];
  for (const p of cat.prodotti) {
    const e = mappa.get(kP(p));
    if (!e) nuovi.push(p);
    else if (e.prezzoBase !== p.prezzoBase || e.coefficienteRicarico !== 1) {
      st.prodottiAggiornati++;
      if (!prova) await prisma.prodotto.update({ where: { id: e.id }, data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 } });
    }
  }
  st.prodottiCreati = nuovi.length;
  if (!prova && nuovi.length) await prisma.prodotto.createMany({ data: nuovi.map((p) => ({ brandId: brand.id, ...p, coefficienteRicarico: 1 })) });
  const chiavi = new Set(cat.prodotti.map(kP));
  for (const v of esistenti.filter((p) => !chiavi.has(kP(p)))) {
    if (prova) { st.prodottiRimossi++; continue; }
    try { await prisma.prodotto.delete({ where: { id: v.id } }); st.prodottiRimossi++; } catch { st.prodottiNonRimovibili++; }
  }
  // Fornitore EXTE: cercato per nome (senza doppioni), creato se manca. Sul modello: fornitore, codice e sconto d'acquisto
  // (vendita × 50% = listino EXTE → «costo previsto» negli ordini). Si riempiono solo se vuoti (mai sopra a scelte fatte a mano).
  const fornitori = await prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, select: { id: true, ragioneSociale: true } });
  let fornitore = fornitori.find((f) => norm(f.ragioneSociale) === norm(FORNITORE_COPRIFILI)) ?? null;
  const fornitoreCreato = !fornitore;
  if (!fornitore && !prova) fornitore = await prisma.soggetto.create({ data: { ragioneSociale: FORNITORE_COPRIFILI, ruoli: ["FORNITORE"] }, select: { id: true, ragioneSociale: true } });
  if (!prova) {
    for (const m of cat.modelli) {
      const dati = { descrizioneTecnica: m.descrizioneTecnica, famiglia: "INDOOR", gruppo: GRUPPO_COPRIFILI, modalitaCalcolo: "GRIGLIA", parametriCalcolo: {} };
      const acquisto = { fornitoreId: fornitore!.id, codiceFornitore: m.codiceFornitore, scontoAcquisto: SCONTO_ACQUISTO_COPRIFILI };
      const e = await prisma.modelloProdotto.findUnique({ where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } } });
      if (!e) await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia: m.tipologia, ...dati, ...acquisto } });
      else await prisma.modelloProdotto.update({
        where: { id: e.id },
        data: {
          ...dati,
          ...(e.fornitoreId ? {} : { fornitoreId: acquisto.fornitoreId }),
          ...(e.codiceFornitore ? {} : { codiceFornitore: acquisto.codiceFornitore }),
          ...(e.scontoAcquisto != null ? {} : { scontoAcquisto: acquisto.scontoAcquisto }),
        },
      });
    }
    // modelli di articoli tolti dal listino e senza più varianti
    const tipologie = new Set(cat.modelli.map((m) => m.tipologia));
    const vecchi = (await prisma.modelloProdotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_COPRIFILI } } })).filter((m) => m.tipologia.startsWith(PREFISSO_COPRIFILI) && !tipologie.has(m.tipologia));
    for (const m of vecchi) {
      if (await prisma.prodotto.count({ where: { brandId: brand.id, tipologia: m.tipologia } })) continue;
      await prisma.modelloProdotto.delete({ where: { id: m.id } });
      st.modelliRimossi++;
    }
  }
  return { ok: true, prova, prodotti: cat.prodotti.length, modelli: cat.modelli.length, fornitore: FORNITORE_COPRIFILI, fornitoreCreato, scontoAcquisto: SCONTO_ACQUISTO_COPRIFILI, ...st };
}


const CHIAVE = "coprifili_versione";
/** All'apertura dell'offerta e del listino per la pratica: lavora solo la prima volta dopo una nuova versione. */
export async function assicuraCoprifili() {
  const c = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE }, select: { valore: true } });
  if (c?.valore === VERSIONE_COPRIFILI) return null;
  try {
    const r = await caricaCoprifili(false);
    if ("ok" in r) {
      await prisma.configurazione.upsert({ where: { chiave: CHIAVE }, create: { chiave: CHIAVE, valore: VERSIONE_COPRIFILI }, update: { valore: VERSIONE_COPRIFILI } });
      const { svuotaCacheListino } = await import("@/lib/listini/cache");
      svuotaCacheListino();
    }
    return r;
  } catch (e) { console.error("assicuraCoprifili", e); return null; }
}

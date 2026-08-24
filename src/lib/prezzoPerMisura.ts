import { prisma } from "@/lib/prisma";
import type { Prodotto } from "@prisma/client";

/**
 * I listini fornitore sono matrici dense larghezza×altezza (o larghezza×sporgenza)
 * con un prezzo per ogni combinazione. Invece di far scegliere all'utente una riga
 * esatta da centinaia possibili, l'utente digita la misura reale e qui si trova
 * automaticamente la fascia di prezzo più vicina "per eccesso" (la prima misura di
 * listino uguale o superiore su entrambi i lati) — la tabella resta nascosta.
 */
export async function trovaFasciaPrezzo(opts: {
  brandId: string;
  tipologia: string;
  larghezza: number;
  altezza: number;
  colore?: string;
}): Promise<Prodotto | null> {
  const { brandId, tipologia, larghezza, altezza, colore } = opts;

  const candidati = await prisma.prodotto.findMany({
    where: {
      brandId,
      tipologia,
      ...(colore ? { colore } : {}),
      larghezzaMm: { gte: Math.round(larghezza) },
      altezzaMm: { gte: Math.round(altezza) },
    },
  });

  if (candidati.length === 0) return null;

  // fascia più piccola che copre la misura richiesta (area minima tra le fasce idonee).
  // Per gli articoli monodimensionali (venduti a lunghezza, altezzaMm sempre 0 — es.
  // profili a metraggio) l'area è sempre 0 per ogni candidato: in quel caso il
  // confronto ricade sulla somma larghezza+altezza, che seleziona comunque la fascia
  // più piccola invece di restituire arbitrariamente la prima riga trovata.
  return candidati.reduce((migliore, p) => {
    const areaP = p.larghezzaMm * p.altezzaMm;
    const areaMigliore = migliore.larghezzaMm * migliore.altezzaMm;
    if (areaP !== areaMigliore) return areaP < areaMigliore ? p : migliore;
    const sommaP = p.larghezzaMm + p.altezzaMm;
    const sommaMigliore = migliore.larghezzaMm + migliore.altezzaMm;
    return sommaP < sommaMigliore ? p : migliore;
  });
}

export async function rangePrezzo(brandId: string, tipologia: string) {
  const agg = await prisma.prodotto.aggregate({
    where: { brandId, tipologia },
    _min: { prezzoBase: true, larghezzaMm: true, altezzaMm: true },
    _max: { prezzoBase: true, larghezzaMm: true, altezzaMm: true },
    _count: { _all: true },
  });
  return agg;
}

// ---------------------------------------------------------------------------
// Calcolo "a formula" per listini che non sono griglie larghezza×altezza dense
// (es. vetrate scorrevoli BRILLANTE/SCINTILLA): il prezzo si ottiene applicando
// una tariffa a una misura reale arrotondata, invece di cercare una cella già
// pronta. Le righe Prodotto restano comunque la fonte della tariffa (una riga
// per fascia altezza per METRO_LINEARE, un'unica riga per MQ_CON_MINIMI), così
// la tariffa stessa resta modificabile da /prodotti senza toccare codice.
// ---------------------------------------------------------------------------

export type ParametriCalcolo = {
  arrotondamentoCm?: number;
  areaMinimaM2?: number;
  altezzaMinimaMm?: number;
};

function arrotondaSuPerEccesso(valoreCm: number, passoCm: number): number {
  if (passoCm <= 0) return valoreCm;
  return Math.ceil(valoreCm / passoCm) * passoCm;
}

export type EsitoCalcoloFormula = {
  prezzoUnitario: number;
  prodottoRiferimentoId: string;
  dettaglio: string;
};

/**
 * METRO_LINEARE (es. BRILLANTE): tariffa €/ml per fascia altezza (fascia più vicina
 * per eccesso tra le righe Prodotto di questa tipologia, che portano la tariffa in
 * prezzoBase) moltiplicata per la larghezza reale, arrotondata per eccesso al passo
 * indicato (default 5 cm) e convertita in metri.
 */
async function calcolaMetroLineare(
  brandId: string,
  tipologia: string,
  larghezzaCm: number,
  altezzaCm: number,
  parametri: ParametriCalcolo
): Promise<EsitoCalcoloFormula | null> {
  const passo = parametri.arrotondamentoCm ?? 5;
  // NB: per queste tipologie (in TIPOLOGIE_IN_CM) altezzaMm/larghezzaMm contengono
  // il valore in cm direttamente (convenzione già usata per gli altri cataloghi outdoor
  // con misura in cm), non in millimetri veri.
  const fasceAltezza = await prisma.prodotto.findMany({
    where: { brandId, tipologia, altezzaMm: { gte: Math.round(altezzaCm) } },
    orderBy: { altezzaMm: "asc" },
  });
  if (fasceAltezza.length === 0) return null;
  const fascia = fasceAltezza[0]; // la più piccola fra quelle che coprono l'altezza richiesta

  const larghezzaArrotondataCm = arrotondaSuPerEccesso(larghezzaCm, passo);
  const larghezzaM = larghezzaArrotondataCm / 100;
  const tariffaAlMetro = fascia.prezzoBase;
  const prezzoUnitario = Math.round(tariffaAlMetro * larghezzaM * 100) / 100;

  return {
    prezzoUnitario,
    prodottoRiferimentoId: fascia.id,
    dettaglio: `tariffa ${tariffaAlMetro.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}/ml (fascia altezza ${fascia.altezzaMm}cm) × ${larghezzaM}ml (larghezza arrotondata per eccesso da ${larghezzaCm}cm)`,
  };
}

/**
 * MQ_CON_MINIMI (es. SCINTILLA): tariffa fissa €/m² (unica riga Prodotto di questa
 * tipologia) applicata alla superficie fatturabile: larghezza e altezza reali
 * arrotondate per eccesso al passo indicato (default 5cm), con altezza minima
 * fatturabile ed eventuale area minima fatturabile applicate come da listino.
 */
async function calcolaMqConMinimi(
  brandId: string,
  tipologia: string,
  larghezzaCm: number,
  altezzaCm: number,
  parametri: ParametriCalcolo
): Promise<EsitoCalcoloFormula | null> {
  const passo = parametri.arrotondamentoCm ?? 5;
  const tariffaRiga = await prisma.prodotto.findFirst({ where: { brandId, tipologia } });
  if (!tariffaRiga) return null;

  // NB: altezzaMinimaMm nei parametriCalcolo è espresso in mm veri (es. 1500 = 1,5 ml)
  // per coerenza col nome campo, va quindi diviso per 10 per ottenere i cm.
  const larghezzaArrCm = arrotondaSuPerEccesso(larghezzaCm, passo);
  let altezzaArrCm = arrotondaSuPerEccesso(altezzaCm, passo);
  const altezzaMinimaCm = parametri.altezzaMinimaMm ? parametri.altezzaMinimaMm / 10 : 0;
  if (altezzaArrCm < altezzaMinimaCm) altezzaArrCm = altezzaMinimaCm;

  const areaRealeM2 = (larghezzaArrCm / 100) * (altezzaArrCm / 100);
  const areaMinimaM2 = parametri.areaMinimaM2 ?? 0;
  const areaFatturabileM2 = Math.max(areaRealeM2, areaMinimaM2);

  const tariffaAlMq = tariffaRiga.prezzoBase;
  const prezzoUnitario = Math.round(tariffaAlMq * areaFatturabileM2 * 100) / 100;

  return {
    prezzoUnitario,
    prodottoRiferimentoId: tariffaRiga.id,
    dettaglio: `tariffa ${tariffaAlMq.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}/m² × ${areaFatturabileM2.toFixed(2)}m² fatturabili (larghezza ${larghezzaArrCm / 100}ml × altezza ${altezzaArrCm / 100}ml${altezzaArrCm > arrotondaSuPerEccesso(altezzaCm, passo) ? ", altezza minima applicata" : ""}${areaFatturabileM2 > areaRealeM2 ? ", area minima applicata" : ""})`,
  };
}

export async function calcolaPrezzoAFormula(opts: {
  brandId: string;
  tipologia: string;
  modalitaCalcolo: string;
  parametriCalcolo: unknown;
  larghezzaCm: number;
  altezzaCm: number;
}): Promise<EsitoCalcoloFormula | null> {
  const parametri = (opts.parametriCalcolo ?? {}) as ParametriCalcolo;
  if (opts.modalitaCalcolo === "METRO_LINEARE") {
    return calcolaMetroLineare(opts.brandId, opts.tipologia, opts.larghezzaCm, opts.altezzaCm, parametri);
  }
  if (opts.modalitaCalcolo === "MQ_CON_MINIMI") {
    return calcolaMqConMinimi(opts.brandId, opts.tipologia, opts.larghezzaCm, opts.altezzaCm, parametri);
  }
  return null;
}

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

  // fascia più piccola che copre la misura richiesta (area minima tra le fasce idonee)
  return candidati.reduce((migliore, p) => {
    const areaP = p.larghezzaMm * p.altezzaMm;
    const areaMigliore = migliore.larghezzaMm * migliore.altezzaMm;
    return areaP < areaMigliore ? p : migliore;
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

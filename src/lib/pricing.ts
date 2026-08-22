import { prisma } from "./prisma";

const COLORI_STANDARD = new Set(["bianco", "avorio", "52"]);

export async function getConfigNumero(chiave: string, fallback: number): Promise<number> {
  const c = await prisma.configurazione.findUnique({ where: { chiave } });
  if (!c) return fallback;
  const n = Number(c.valore);
  return Number.isFinite(n) ? n : fallback;
}

export function aliquotaIvaPerPaese(paese: string): { aliquota: number; regime: string } {
  const UE = ["IT", "FR", "DE", "ES", "AT", "BE", "NL", "PT", "IE", "PL"];
  if (paese === "IT") return { aliquota: 22, regime: "IVA italiana standard" };
  if (UE.includes(paese)) return { aliquota: 0, regime: "Intra-UE (reverse charge)" };
  return { aliquota: 0, regime: "Extra-UE (esportazione, non imponibile)" };
}

export interface CalcoloPrezzo {
  prezzoBase: number;
  coefficiente: number;
  sovrapprezzoColore: number;
  prezzoVenditaNetto: number;
  aliquotaIva: number;
  regimeIva: string;
  prezzoFinale: number;
}

export async function calcolaPrezzo(params: {
  brandId: string;
  tipologia: string;
  colore: string;
  altezzaMm: number;
  larghezzaMm: number;
  paeseCliente: string;
}): Promise<CalcoloPrezzo | null> {
  const prodotto = await prisma.prodotto.findFirst({
    where: {
      brandId: params.brandId,
      tipologia: params.tipologia,
      colore: params.colore,
      altezzaMm: params.altezzaMm,
      larghezzaMm: params.larghezzaMm,
    },
  });
  if (!prodotto) return null;

  const coefficiente = prodotto.coefficienteRicarico ?? (await getConfigNumero("coefficiente_ricarico_default", 2.1));
  const sovrapprezzoColoreBase = await getConfigNumero("sovrapprezzo_colore_speciale", 35);
  const isColoreSpeciale = !COLORI_STANDARD.has(params.colore.toLowerCase());
  const sovrapprezzoColore = isColoreSpeciale ? sovrapprezzoColoreBase : 0;

  const prezzoVenditaNetto = prodotto.prezzoBase * coefficiente + sovrapprezzoColore;
  const { aliquota, regime } = aliquotaIvaPerPaese(params.paeseCliente);
  const prezzoFinale = prezzoVenditaNetto * (1 + aliquota / 100);

  return {
    prezzoBase: prodotto.prezzoBase,
    coefficiente,
    sovrapprezzoColore,
    prezzoVenditaNetto: Math.round(prezzoVenditaNetto * 100) / 100,
    aliquotaIva: aliquota,
    regimeIva: regime,
    prezzoFinale: Math.round(prezzoFinale * 100) / 100,
  };
}

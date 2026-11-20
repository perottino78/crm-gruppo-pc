// Articoli dei legni piallati (Articoli › Complementi vetrate › Legni piallati, nel listino OUTDOOR › VETRATE): creati una volta sola,
// solo quelli che mancano per codice; costo = sviluppo × prezzo indicativo al m³, vendita con la regola della categoria (ricarico ×2). Mai sopra prezzi cambiati a mano.
import { prisma } from "@/lib/prisma";
import { SEZIONI_LEGNO, PREZZO_M3_INDICATIVO, codiceLegno, descrizioneLegno, volumeBarra } from "./legno";

const CHIAVE = "legno_articoli_versione";

async function categoria(nome: string, padreId: string | null, dati: Record<string, unknown>) {
  const c = await prisma.categoriaArticolo.findFirst({ where: { nome, padreId } });
  return c ?? prisma.categoriaArticolo.create({ data: { nome, padreId, ...dati } });
}

export async function assicuraArticoliLegno(): Promise<number> {
  const fatto = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE }, select: { valore: true } });
  if (fatto?.valore === "1") return 0;
  const madre = await categoria("Complementi vetrate", null, { famiglia: "OUTDOOR", gruppoListino: "VETRATE" });
  const figlia = await categoria("Legni piallati", madre.id, { metodoPrezzo: "RICARICO", valore: 2 });
  const codici = SEZIONI_LEGNO.map((s) => codiceLegno(s));
  const esistenti = new Set((await prisma.articolo.findMany({ where: { codice: { in: codici } }, select: { codice: true } })).map((a) => a.codice));
  const nuovi = SEZIONI_LEGNO.filter((s) => !esistenti.has(codiceLegno(s))).map((s) => {
    const costo = Math.round(volumeBarra(s) * PREZZO_M3_INDICATIVO * 100) / 100;
    return {
    codice: codiceLegno(s), descrizione: descrizioneLegno(s), um: "pz", categoriaId: figlia.id,
    costoAcquisto: costo, prezzoVendita: Math.round(costo * 2 * 100) / 100,
    note: `Abete piallato 4 lati. Costo indicativo ${PREZZO_M3_INDICATIVO} €/m³ sullo sviluppo (${volumeBarra(s).toString().replace(".", ",")} m³ a barra): da confermare col fornitore.`,
    aggiornatoDaNome: "P&C ONE",
    };
  });
  if (nuovi.length) await prisma.articolo.createMany({ data: nuovi, skipDuplicates: true });
  await prisma.configurazione.upsert({ where: { chiave: CHIAVE }, update: { valore: "1" }, create: { chiave: CHIAVE, valore: "1" } });
  return nuovi.length;
}

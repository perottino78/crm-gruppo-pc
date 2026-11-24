// Carica una volta (per versione) gli accessori e ricambi delle vetrate in Articoli › Complementi vetrate › Accessori e ricambi › <sistema>.
// Se l'articolo c'è già (stesso codice, es. importato da BConsole) completa solo i campi vuoti: mai sopra prezzi o testi cambiati a mano.
import { prisma } from "@/lib/prisma";
import { CATEGORIA_MADRE, CATEGORIA_RICAMBI, RICAMBI_VETRATE, VERSIONE_RICAMBI_VETRATE } from "./ricambi-vetrate";

const CHIAVE = "ricambi_vetrate_versione";
const POSIZIONE = { famiglia: "OUTDOOR", gruppoListino: "VETRATE" };

async function categoria(nome: string, padreId: string | null) {
  const c = await prisma.categoriaArticolo.findFirst({ where: { nome, padreId } });
  if (c) {
    if (!c.famiglia && !c.gruppoListino) await prisma.categoriaArticolo.update({ where: { id: c.id }, data: POSIZIONE });
    return c;
  }
  return prisma.categoriaArticolo.create({ data: { nome, padreId, ...POSIZIONE } });
}

export async function assicuraRicambiVetrate(): Promise<{ creati: number; completati: number }> {
  const fatto = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE }, select: { valore: true } });
  if (fatto?.valore === VERSIONE_RICAMBI_VETRATE) return { creati: 0, completati: 0 };
  const madre = await categoria(CATEGORIA_MADRE, null);
  const ricambi = await categoria(CATEGORIA_RICAMBI, madre.id);
  let creati = 0, completati = 0;
  for (const r of RICAMBI_VETRATE) {
    const sistema = await categoria(r.sistema, ricambi.id);
    const gia = await prisma.articolo.findUnique({ where: { codice: r.codice } });
    if (!gia) {
      await prisma.articolo.create({ data: {
        codice: r.codice, descrizione: r.descrizione, descrizioneEstesa: r.descrizioneEstesa, um: r.um, categoriaId: sistema.id,
        costoAcquisto: r.costo, metodoPrezzo: "MANUALE", prezzoVendita: r.vendita, immagineUrl: r.immagine ?? null, aggiornatoDaNome: "P&C ONE",
      } });
      creati++;
      continue;
    }
    const dati: Record<string, unknown> = {};
    if (!gia.categoriaId) dati.categoriaId = sistema.id;
    if (!gia.descrizioneEstesa) dati.descrizioneEstesa = r.descrizioneEstesa;
    if (gia.costoAcquisto == null) dati.costoAcquisto = r.costo;
    if (gia.prezzoVendita == null) { dati.prezzoVendita = r.vendita; dati.metodoPrezzo = "MANUALE"; }
    if (!gia.immagineUrl && r.immagine) dati.immagineUrl = r.immagine;
    if (Object.keys(dati).length) { await prisma.articolo.update({ where: { id: gia.id }, data: dati }); completati++; }
  }
  await prisma.configurazione.upsert({ where: { chiave: CHIAVE }, update: { valore: VERSIONE_RICAMBI_VETRATE }, create: { chiave: CHIAVE, valore: VERSIONE_RICAMBI_VETRATE } });
  return { creati, completati };
}

// Carica una volta (per versione) gli accessori e ricambi delle vetrate in Articoli › OUTDOOR › VETRATE › Accessori e ricambi ›
// Vetrata scorrevole | Vetrata a pacchetto (le cartelle OUTDOOR › VETRATE sono quelle del listino, `assicuraCategorieListino`).
// Se l'articolo c'è già (stesso codice, es. importato da BConsole) completa solo i campi vuoti: mai sopra prezzi o testi cambiati a mano.
import { prisma } from "@/lib/prisma";
import { CATEGORIA_MADRE, CATEGORIA_RICAMBI, CATEGORIA_VECCHIA, DA_SPOSTARE, RICAMBI_VETRATE, SISTEMI_VETRATA, VERSIONE_RICAMBI_VETRATE } from "./ricambi-vetrate";

const CHIAVE = "ricambi_vetrate_versione";
const POSIZIONE = { famiglia: "OUTDOOR", gruppoListino: "VETRATE" };
const uguali = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Cartella per nome (maiuscole indifferenti) sotto `padreId`; se manca la crea nella posizione del listino. */
async function cartella(nome: string, padreId: string | null, dati: Record<string, unknown> = POSIZIONE) {
  const tutte = await prisma.categoriaArticolo.findMany({ where: { padreId }, select: { id: true, nome: true } });
  const c = tutte.find((x) => uguali(x.nome, nome));
  return c ?? prisma.categoriaArticolo.create({ data: { nome, padreId, ...dati }, select: { id: true, nome: true } });
}

/** Toglie una cartella e le sue sottocartelle se non hanno più articoli. */
async function togliSeVuota(id: string) {
  for (const f of await prisma.categoriaArticolo.findMany({ where: { padreId: id }, select: { id: true } })) await togliSeVuota(f.id);
  const [art, figlie] = await Promise.all([prisma.articolo.count({ where: { categoriaId: id } }), prisma.categoriaArticolo.count({ where: { padreId: id } })]);
  if (!art && !figlie) await prisma.categoriaArticolo.delete({ where: { id } });
}

export async function assicuraRicambiVetrate(): Promise<{ creati: number; completati: number; spostati: number }> {
  const fatto = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE }, select: { valore: true } });
  if (fatto?.valore === VERSIONE_RICAMBI_VETRATE) return { creati: 0, completati: 0, spostati: 0 };
  // OUTDOOR › VETRATE come le crea il listino, poi «Accessori e ricambi» e una cartella per tipo di vetrata
  const outdoor = await cartella("OUTDOOR", null, { famiglia: "OUTDOOR" });
  const vetrate = await cartella("VETRATE", outdoor.id);
  const ricambi = await cartella(CATEGORIA_RICAMBI, vetrate.id);
  const cartelle = new Map<string, string>();
  for (const s of SISTEMI_VETRATA) cartelle.set(s, (await cartella(s, ricambi.id)).id);
  let creati = 0, completati = 0, spostati = 0;

  // prima versione: «Complementi vetrate › Accessori e ricambi › Scorrevole parallelo | <tipo>» → nelle cartelle nuove, poi via le vuote
  const madriVecchie = (await prisma.categoriaArticolo.findMany({ where: { padreId: null }, select: { id: true, nome: true } })).filter((c) => uguali(c.nome, CATEGORIA_MADRE));
  for (const m of madriVecchie) {
    const vecchie = (await prisma.categoriaArticolo.findMany({ where: { padreId: m.id }, select: { id: true, nome: true } })).find((c) => uguali(c.nome, CATEGORIA_RICAMBI));
    if (!vecchie) continue;
    for (const f of await prisma.categoriaArticolo.findMany({ where: { padreId: vecchie.id }, select: { id: true, nome: true } })) {
      const dest = uguali(f.nome, CATEGORIA_VECCHIA) ? cartelle.get("Vetrata scorrevole")! : cartelle.get(SISTEMI_VETRATA.find((x) => uguali(x, f.nome)) ?? "") ?? ricambi.id;
      spostati += (await prisma.articolo.updateMany({ where: { categoriaId: f.id }, data: { categoriaId: dest } })).count;
    }
    spostati += (await prisma.articolo.updateMany({ where: { categoriaId: vecchie.id }, data: { categoriaId: ricambi.id } })).count;
    await togliSeVuota(vecchie.id);
  }
  // gli articoli caricati a mano da Ugo nella cartella «complementi»
  for (const d of DA_SPOSTARE) {
    spostati += (await prisma.articolo.updateMany({ where: { codice: d.codice }, data: { categoriaId: cartelle.get(d.sistema)! } })).count;
  }

  for (const r of RICAMBI_VETRATE) {
    const categoriaId = cartelle.get(r.sistema)!;
    const gia = await prisma.articolo.findUnique({ where: { codice: r.codice } });
    if (!gia) {
      await prisma.articolo.create({ data: {
        codice: r.codice, descrizione: r.descrizione, descrizioneEstesa: r.descrizioneEstesa, um: r.um, categoriaId,
        costoAcquisto: r.costo, metodoPrezzo: "MANUALE", prezzoVendita: r.vendita, immagineUrl: r.immagine ?? null, aggiornatoDaNome: "P&C ONE",
      } });
      creati++;
      continue;
    }
    const dati: Record<string, unknown> = {};
    if (!gia.categoriaId) dati.categoriaId = categoriaId;
    if (!gia.descrizioneEstesa) dati.descrizioneEstesa = r.descrizioneEstesa;
    if (gia.costoAcquisto == null) dati.costoAcquisto = r.costo;
    if (gia.prezzoVendita == null) { dati.prezzoVendita = r.vendita; dati.metodoPrezzo = "MANUALE"; }
    if (!gia.immagineUrl && r.immagine) dati.immagineUrl = r.immagine;
    if (Object.keys(dati).length) { await prisma.articolo.update({ where: { id: gia.id }, data: dati }); completati++; }
  }
  await prisma.configurazione.upsert({ where: { chiave: CHIAVE }, update: { valore: VERSIONE_RICAMBI_VETRATE }, create: { chiave: CHIAVE, valore: VERSIONE_RICAMBI_VETRATE } });
  return { creati, completati, spostati };
}

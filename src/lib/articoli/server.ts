// Anagrafica articoli: funzioni lato server (permessi, categorie, ricalcolo prezzi, codici).
import { prisma } from "@/lib/prisma";
import type { Prisma, Utente } from "@prisma/client";
import { calcolaArticolo, type CategoriaRegola } from "./prezzi";
import type { Esistente } from "./importa";

/** Consultare il catalogo (costi compresi): tutti tranne i commerciali. */
export const puoVedereArticoli = (u: Pick<Utente, "ruolo"> | null | undefined) => !!u && u.ruolo !== "COMMERCIALE";
/** Inserire, modificare, importare: solo gli amministratori. */
export const puoModificareArticoli = (u: Pick<Utente, "ruolo"> | null | undefined) => u?.ruolo === "AMMINISTRATORE";

type Db = Prisma.TransactionClient | typeof prisma;

export const categorieRegola = (db: Db = prisma): Promise<CategoriaRegola[]> =>
  db.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true, metodoPrezzo: true, valore: true, arrotondamento: true, margineMinimo: true } });

/** Nome completo "Categoria › Sottocategoria". */
export function nomeCategoria(id: string | null | undefined, cat: { id: string; nome: string; padreId: string | null }[]): string {
  const c = cat.find((x) => x.id === id);
  if (!c) return "";
  const p = c.padreId ? cat.find((x) => x.id === c.padreId) : undefined;
  return p ? `${p.nome} › ${c.nome}` : c.nome;
}

/** Id della categoria e di tutte le sue sottocategorie. */
export function conFiglie(id: string, cat: { id: string; padreId: string | null }[]): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of cat) if (c.padreId === out[i] && !out.includes(c.id)) out.push(c.id);
  return out;
}

export const CAMPI_ESISTENTE = {
  id: true, codice: true, codiceFornitore: true, fornitoreId: true, descrizione: true, descrizioneEstesa: true, categoriaId: true, marca: true,
  divisione: true, um: true, aliquotaIva: true, prezzoListino: true, sconti: true, costoAcquisto: true, metodoPrezzo: true, valorePrezzo: true,
  prezzoVendita: true, ean: true, immagineUrl: true, note: true, attivo: true,
} satisfies Prisma.ArticoloSelect;

export const articoliPerConfronto = (db: Db = prisma): Promise<Esistente[]> => db.articolo.findMany({ select: CAMPI_ESISTENTE });

/**
 * Ricalcola il prezzo di vendita (e il costo, se c'è il listino) degli articoli indicati secondo la regola attuale.
 * Gli articoli con prezzo a mano non si toccano. Ogni variazione finisce nello storico prezzi.
 */
export async function ricalcolaArticoli(where: Prisma.ArticoloWhereInput, utenteNome: string, nota: string, db: Db = prisma): Promise<{ controllati: number; cambiati: number }> {
  const [cat, lista] = await Promise.all([categorieRegola(db), db.articolo.findMany({ where, select: CAMPI_ESISTENTE })]);
  let cambiati = 0;
  for (const a of lista) {
    const c = calcolaArticolo(a, cat);
    const costo = a.prezzoListino !== null ? c.costo : a.costoAcquisto;
    const vendita = c.regola && c.regola.metodo !== "MANUALE" && c.vendita !== null ? c.vendita : a.prezzoVendita;
    if (costo === a.costoAcquisto && vendita === a.prezzoVendita) continue;
    cambiati++;
    await db.articolo.update({ where: { id: a.id }, data: { costoAcquisto: costo, prezzoVendita: vendita, aggiornatoDaNome: utenteNome } });
    await db.storicoPrezzoArticolo.create({ data: { articoloId: a.id, prezzoListino: a.prezzoListino, costoAcquisto: costo, prezzoVendita: vendita, origine: "REGOLA", nota, utenteNome } });
  }
  return { controllati: lista.length, cambiati };
}

/** Prossimo codice libero ART-00001, ART-00002 … (dentro una transazione bloccata). */
export async function prossimiCodici(tx: Prisma.TransactionClient, quanti: number): Promise<string[]> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('articoli-codici'))`;
  const ultimi = await tx.$queryRaw<{ n: number | null }[]>`SELECT MAX(CAST(SUBSTRING("codice" FROM 5) AS INTEGER)) AS n FROM "Articolo" WHERE "codice" ~ '^ART-[0-9]+$'`;
  const da = (ultimi[0]?.n ?? 0) + 1;
  return Array.from({ length: quanti }, (_, i) => `ART-${String(da + i).padStart(5, "0")}`);
}

export type FiltriArticoli = { q?: string; categoria?: string; fornitore?: string; divisione?: string; stato?: string; senzaPrezzo?: string };

/** Filtro comune a elenco ed esportazione. */
export function filtroArticoli(p: FiltriArticoli, cat: { id: string; padreId: string | null }[]): Prisma.ArticoloWhereInput {
  const parole = (p.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  return {
    ...(p.stato === "tutti" ? {} : p.stato === "disattivi" ? { attivo: false } : { attivo: true }),
    ...(p.categoria === "nessuna" ? { categoriaId: null } : p.categoria ? { categoriaId: { in: conFiglie(p.categoria, cat) } } : {}),
    ...(p.fornitore === "nessuno" ? { fornitoreId: null } : p.fornitore ? { fornitoreId: p.fornitore } : {}),
    ...(p.divisione ? { divisione: p.divisione } : {}),
    ...(p.senzaPrezzo ? { prezzoVendita: null } : {}),
    ...(parole.length ? { AND: parole.map((w) => ({ OR: [{ codice: { contains: w, mode: "insensitive" as const } }, { codiceFornitore: { contains: w, mode: "insensitive" as const } }, { descrizione: { contains: w, mode: "insensitive" as const } }, { marca: { contains: w, mode: "insensitive" as const } }, { ean: { contains: w } }] })) } : {}),
  };
}

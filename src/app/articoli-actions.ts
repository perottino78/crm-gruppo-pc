"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { leggiNumero, leggiSconti, scriviSconti, calcolaArticolo, scontoEquivalente } from "@/lib/articoli/prezzi";
import { leggiFile, type Tabella } from "@/lib/articoli/foglio";
import { analizzaListino, mappaColonne, contaAnteprima, DIVISIONI, type Opzioni, type DatiArticolo } from "@/lib/articoli/importa";
import { puoModificareArticoli, categorieRegola, ricalcolaArticoli, conFiglie, prossimiCodici, articoliPerConfronto, CAMPI_ESISTENTE } from "@/lib/articoli/server";
import { MAX_DOCUMENTO, nomeFileSicuro } from "@/lib/ordini/calcoli";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const num = (fd: FormData, k: string) => leggiNumero(str(fd, k));

async function amministratore() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoModificareArticoli(u)) throw new Error("Solo gli amministratori possono modificare l'anagrafica articoli.");
  return u;
}
const aggiorna = (id?: string) => {
  revalidatePath("/prodotti/articoli");
  if (id) revalidatePath(`/prodotti/articoli/${id}`);
};

// ---------------- Articolo ----------------

export type EsitoArticolo = { ok: boolean; messaggio: string } | null;

/** Crea o modifica un articolo dalla scheda. */
export async function salvaArticolo(_: EsitoArticolo, fd: FormData): Promise<EsitoArticolo> {
  const u = await amministratore();
  const id = str(fd, "id");
  const descrizione = str(fd, "descrizione");
  if (!descrizione) return { ok: false, messaggio: "La descrizione è obbligatoria." };
  const scontiTesto = str(fd, "sconti");
  const sconti = leggiSconti(scontiTesto);
  if (sconti === null) return { ok: false, messaggio: `Sconti «${scontiTesto}» non leggibili: scrivi ad esempio 50+10.` };
  const metodo = str(fd, "metodoPrezzo");
  if (metodo && !["RICARICO", "MARGINE", "MANUALE"].includes(metodo)) return { ok: false, messaggio: "Metodo di prezzo non valido." };
  const valore = num(fd, "valorePrezzo");
  if (metodo === "RICARICO" && (valore === null || valore < 1)) return { ok: false, messaggio: "Il ricarico è un coefficiente sul costo, almeno 1 (es. 3,3)." };
  if (metodo === "MARGINE" && (valore === null || valore < 0 || valore >= 100)) return { ok: false, messaggio: "Il margine va tra 0 e 99%." };
  const listino = num(fd, "prezzoListino");
  const dati = {
    codiceFornitore: str(fd, "codiceFornitore"), ean: str(fd, "ean"), descrizione, descrizioneEstesa: str(fd, "descrizioneEstesa"),
    divisione: DIVISIONI.includes(str(fd, "divisione") ?? "") ? str(fd, "divisione") : null,
    categoriaId: str(fd, "categoriaId"), fornitoreId: str(fd, "fornitoreId"), marca: str(fd, "marca"), um: str(fd, "um") ?? "pz",
    aliquotaIva: num(fd, "aliquotaIva") ?? 22, prezzoListino: listino, sconti: sconti.length ? scriviSconti(sconti) : null,
    costoAcquisto: listino === null ? num(fd, "costoAcquisto") : null,
    metodoPrezzo: metodo, valorePrezzo: metodo === "RICARICO" || metodo === "MARGINE" ? valore : null,
    prezzoVendita: num(fd, "prezzoVendita"), immagineUrl: str(fd, "immagineUrl"), note: str(fd, "note"), attivo: fd.get("attivo") === "1",
  };
  const cat = await categorieRegola();
  const c = calcolaArticolo(dati, cat);
  dati.costoAcquisto = c.costo;
  if (c.regola && c.regola.metodo !== "MANUALE" && c.vendita !== null) dati.prezzoVendita = c.vendita;
  let codice = str(fd, "codice")?.toUpperCase().replace(/\s+/g, "") ?? null;
  const doppio = codice ? await prisma.articolo.findFirst({ where: { codice, ...(id ? { NOT: { id } } : {}) }, select: { descrizione: true } }) : null;
  if (doppio) return { ok: false, messaggio: `Il codice ${codice} è già usato da «${doppio.descrizione}».` };
  let nuovoId = id;
  if (id) {
    const prima = await prisma.articolo.findUnique({ where: { id } });
    if (!prima) return { ok: false, messaggio: "Articolo non trovato." };
    await prisma.articolo.update({ where: { id }, data: { ...dati, ...(codice ? { codice } : {}), aggiornatoDaNome: u.nome } });
    if (prima.prezzoListino !== dati.prezzoListino || prima.costoAcquisto !== dati.costoAcquisto || prima.prezzoVendita !== dati.prezzoVendita)
      await prisma.storicoPrezzoArticolo.create({ data: { articoloId: id, prezzoListino: dati.prezzoListino, costoAcquisto: dati.costoAcquisto, prezzoVendita: dati.prezzoVendita, origine: "MANUALE", utenteNome: u.nome } });
  } else {
    const a = await prisma.$transaction(async (tx) => {
      if (!codice) codice = (await prossimiCodici(tx, 1))[0];
      const a = await tx.articolo.create({ data: { ...dati, codice, aggiornatoDaNome: u.nome } });
      await tx.storicoPrezzoArticolo.create({ data: { articoloId: a.id, prezzoListino: a.prezzoListino, costoAcquisto: a.costoAcquisto, prezzoVendita: a.prezzoVendita, origine: "MANUALE", nota: "creato", utenteNome: u.nome } });
      return a;
    });
    nuovoId = a.id;
  }
  aggiorna(nuovoId!);
  if (!id) redirect(`/prodotti/articoli/${nuovoId}?creato=1`);
  return { ok: true, messaggio: c.sottoMinimo ? `Salvato. Attenzione: margine ${String(c.margine).replace(".", ",")}% sotto il minimo della categoria.` : "Salvato." };
}

/** Copia di un articolo (nuovo codice), per inserire varianti simili. */
export async function duplicaArticolo(fd: FormData) {
  const u = await amministratore();
  const a = await prisma.articolo.findUnique({ where: { id: str(fd, "id") ?? "" }, select: CAMPI_ESISTENTE });
  if (!a) return;
  const { id: _id, codice: _c, ...resto } = a;
  void _id; void _c;
  const nuovo = await prisma.$transaction(async (tx) => {
    const [codice] = await prossimiCodici(tx, 1);
    return tx.articolo.create({ data: { ...resto, codice, descrizione: `${a.descrizione} (copia)`, codiceFornitore: null, ean: null, aggiornatoDaNome: u.nome } });
  });
  aggiorna();
  redirect(`/prodotti/articoli/${nuovo.id}?creato=1`);
}

/** Elimina un articolo; se è già stato usato negli ordini viene solo disattivato. */
export async function eliminaArticolo(fd: FormData) {
  await amministratore();
  const id = str(fd, "id");
  if (!id) return;
  const usato = await prisma.rigaOrdine.count({ where: { articoloId: id } });
  if (usato) await prisma.articolo.update({ where: { id }, data: { attivo: false } });
  else await prisma.articolo.delete({ where: { id } });
  aggiorna();
  redirect(`/prodotti/articoli?${usato ? "disattivato" : "eliminato"}=1`);
}

/** Foto dell'articolo: salvata tra i documenti (cartella Foto) e usata come immagine principale. */
export async function caricaFotoArticolo(fd: FormData) {
  const u = await amministratore();
  const id = str(fd, "id");
  const f = fd.get("foto");
  if (!id || !(f instanceof File) || !f.size) return;
  if (f.size > MAX_DOCUMENTO || !/^image\/(jpeg|png|webp|gif)$/.test(f.type)) return;
  const d = await prisma.documento.create({ data: { entita: "ARTICOLO", entitaId: id, cartella: "Foto", nome: nomeFileSicuro(f.name), mime: f.type, dimensione: f.size, contenuto: Buffer.from(await f.arrayBuffer()), caricatoDaNome: u.nome } });
  await prisma.articolo.update({ where: { id }, data: { immagineUrl: `/api/documenti/${d.id}` } });
  aggiorna(id);
}

// ---------------- Categorie e regole ----------------

/** Crea o modifica una categoria (o sottocategoria) con la sua regola di prezzo. */
export async function salvaCategoria(fd: FormData) {
  const u = await amministratore();
  const id = str(fd, "id");
  const nome = str(fd, "nome");
  if (!nome) return;
  const metodo = str(fd, "metodoPrezzo");
  const valore = num(fd, "valore");
  const dati = {
    nome, padreId: str(fd, "padreId"), divisione: str(fd, "divisione"),
    metodoPrezzo: metodo === "RICARICO" || metodo === "MARGINE" ? metodo : null,
    valore: metodo === "RICARICO" ? (valore && valore >= 1 ? valore : null) : metodo === "MARGINE" ? (valore !== null && valore >= 0 && valore < 100 ? valore : null) : null,
    arrotondamento: num(fd, "arrotondamento"), margineMinimo: num(fd, "margineMinimo"),
  };
  if (id && dati.padreId === id) dati.padreId = null;
  let catId = id;
  try {
    if (id) await prisma.categoriaArticolo.update({ where: { id }, data: dati });
    else catId = (await prisma.categoriaArticolo.create({ data: dati })).id;
  } catch {
    redirect(`/prodotti/articoli/categorie?errore=${encodeURIComponent(`Esiste già una categoria «${nome}» in quella posizione.`)}`);
  }
  let msg = "Categoria salvata.";
  if (id && fd.get("ricalcola") === "1") {
    const cat = await prisma.categoriaArticolo.findMany({ select: { id: true, padreId: true } });
    const r = await ricalcolaArticoli({ categoriaId: { in: conFiglie(catId!, cat) } }, u.nome, `regola categoria «${nome}»`);
    msg += ` Ricalcolati ${r.cambiati} prezzi su ${r.controllati} articoli.`;
  }
  aggiorna();
  revalidatePath("/prodotti/articoli/categorie");
  redirect(`/prodotti/articoli/categorie?ok=${encodeURIComponent(msg)}`);
}

export async function eliminaCategoria(fd: FormData) {
  await amministratore();
  const id = str(fd, "id");
  if (!id) return;
  const [art, figlie] = await Promise.all([prisma.articolo.count({ where: { categoriaId: id } }), prisma.categoriaArticolo.count({ where: { padreId: id } })]);
  if (art || figlie) redirect(`/prodotti/articoli/categorie?errore=${encodeURIComponent("Non si può eliminare: contiene articoli o sottocategorie. Spostali prima.")}`);
  await prisma.categoriaArticolo.delete({ where: { id } });
  revalidatePath("/prodotti/articoli/categorie");
  redirect(`/prodotti/articoli/categorie?ok=${encodeURIComponent("Categoria eliminata.")}`);
}

/** Ricalcola i prezzi di tutto il catalogo con le regole attuali. */
export async function ricalcolaTutto() {
  const u = await amministratore();
  const r = await ricalcolaArticoli({}, u.nome, "ricalcolo generale");
  aggiorna();
  redirect(`/prodotti/articoli/categorie?ok=${encodeURIComponent(`Ricalcolati ${r.cambiati} prezzi su ${r.controllati} articoli.`)}`);
}

/**
 * Aggiornamento in blocco degli articoli filtrati (fornitore e/o categoria):
 * variazione % del listino/costo (es. aumento fornitore +4,5%), nuovi sconti, spostamento di categoria.
 */
export async function aggiornamentoInBlocco(fd: FormData) {
  const u = await amministratore();
  const fornitoreId = str(fd, "fornitoreId"), categoriaId = str(fd, "categoriaId");
  if (!fornitoreId && !categoriaId) redirect(`/prodotti/articoli?errore=${encodeURIComponent("Scegli almeno un fornitore o una categoria per l'aggiornamento in blocco.")}`);
  const cat = await prisma.categoriaArticolo.findMany({ select: { id: true, padreId: true } });
  const where: Prisma.ArticoloWhereInput = { ...(fornitoreId ? { fornitoreId } : {}), ...(categoriaId ? { categoriaId: { in: conFiglie(categoriaId, cat) } } : {}) };
  const variazione = num(fd, "variazione");
  const scontiTesto = str(fd, "sconti");
  const sconti = scontiTesto ? leggiSconti(scontiTesto) : [];
  if (sconti === null) redirect(`/prodotti/articoli?errore=${encodeURIComponent(`Sconti «${scontiTesto}» non leggibili.`)}`);
  const nuovaCat = str(fd, "nuovaCategoriaId");
  if (variazione === null && !scontiTesto && !nuovaCat) redirect(`/prodotti/articoli?errore=${encodeURIComponent("Indica una variazione %, nuovi sconti o una nuova categoria.")}`);
  if (variazione !== null && (variazione <= -90 || variazione > 300)) redirect(`/prodotti/articoli?errore=${encodeURIComponent("Variazione fuori misura.")}`);
  const lista = await prisma.articolo.findMany({ where, select: { id: true, prezzoListino: true, costoAcquisto: true, sconti: true } });
  const f = variazione !== null ? 1 + variazione / 100 : 1;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  await prisma.$transaction(async (tx) => {
    for (const a of lista) {
      await tx.articolo.update({
        where: { id: a.id },
        data: {
          ...(variazione !== null && a.prezzoListino !== null ? { prezzoListino: r2(a.prezzoListino * f) } : {}),
          ...(variazione !== null && a.prezzoListino === null && a.costoAcquisto !== null ? { costoAcquisto: r2(a.costoAcquisto * f) } : {}),
          ...(scontiTesto ? { sconti: sconti!.length ? scriviSconti(sconti!) : null } : {}),
          ...(nuovaCat ? { categoriaId: nuovaCat } : {}),
          aggiornatoDaNome: u.nome,
        },
      });
    }
  }, { timeout: 120000 });
  const nota = [variazione !== null ? `listino ${variazione > 0 ? "+" : ""}${String(variazione).replace(".", ",")}%` : "", scontiTesto ? `sconti ${scontiTesto}` : "", nuovaCat ? "cambio categoria" : ""].filter(Boolean).join(", ");
  const r = await ricalcolaArticoli({ id: { in: lista.map((a) => a.id) } }, u.nome, `aggiornamento in blocco: ${nota}`);
  // per gli articoli a prezzo manuale lo storico registra comunque il nuovo costo
  aggiorna();
  redirect(`/prodotti/articoli?ok=${encodeURIComponent(`Aggiornati ${lista.length} articoli (${nota}); ${r.cambiati} prezzi ricalcolati.`)}`);
}

// ---------------- Importazione ----------------

function opzioniDa(fd: FormData): Opzioni {
  return { fornitoreId: str(fd, "fornitoreId"), divisione: str(fd, "divisione"), categoriaId: str(fd, "categoriaId"), soloAggiornamento: fd.get("soloAggiornamento") === "1" };
}

/** Sceglie il foglio giusto: il primo in cui si riconoscono le colonne. */
function scegliFoglio(fogli: { nome: string; righe: Tabella }[], scelto: string | null) {
  if (scelto) { const f = fogli.find((x) => x.nome === scelto); if (f) return f; }
  return fogli.find((f) => mappaColonne(f.righe)) ?? fogli.find((f) => f.righe.length > 1) ?? fogli[0];
}

/** Carica un Excel/CSV e apre l'anteprima (nessun articolo viene ancora modificato). */
export async function caricaListino(fd: FormData) {
  const u = await amministratore();
  const f = fd.get("file");
  if (!(f instanceof File) || !f.size) redirect(`/prodotti/articoli/importa?errore=${encodeURIComponent("Scegli un file Excel (.xlsx) o CSV.")}`);
  if (f.size > 5 * 1024 * 1024) redirect(`/prodotti/articoli/importa?errore=${encodeURIComponent("File oltre 5 MB: dividilo in più parti.")}`);
  let fogli;
  try { fogli = leggiFile(f.name, Buffer.from(await f.arrayBuffer())); }
  catch (e) { redirect(`/prodotti/articoli/importa?errore=${encodeURIComponent((e as Error).message)}`); }
  const foglio = scegliFoglio(fogli, str(fd, "foglio"));
  if (!foglio || foglio.righe.length < 2) redirect(`/prodotti/articoli/importa?errore=${encodeURIComponent("Il file non contiene righe.")}`);
  if (foglio.righe.length > 20001) redirect(`/prodotti/articoli/importa?errore=${encodeURIComponent("Più di 20.000 righe: dividi il file.")}`);
  const imp = await prisma.importazioneArticoli.create({
    data: { nomeFile: `${f.name}${fogli.length > 1 ? ` — foglio «${foglio.nome}»` : ""}`, origine: "FILE", opzioni: { ...opzioniDa(fd), fogli: fogli.map((x) => x.nome) } as Prisma.InputJsonValue, righe: foglio.righe as Prisma.InputJsonValue, creataDaNome: u.nome },
  });
  redirect(`/prodotti/articoli/importa/${imp.id}`);
}

/** Cambia le opzioni (fornitore, divisione…) dell'anteprima. */
export async function aggiornaOpzioniImportazione(fd: FormData) {
  await amministratore();
  const id = str(fd, "id");
  const imp = id ? await prisma.importazioneArticoli.findUnique({ where: { id } }) : null;
  if (!imp || imp.stato !== "ANTEPRIMA") return;
  await prisma.importazioneArticoli.update({ where: { id: imp.id }, data: { opzioni: { ...(imp.opzioni as object), ...opzioniDa(fd) } as Prisma.InputJsonValue, controlloAi: null } });
  revalidatePath(`/prodotti/articoli/importa/${imp.id}`);
}

/** Conferma: ricalcola l'anteprima sui dati attuali e scrive nuovi e modificati (le righe con errori si saltano). */
export async function confermaImportazione(fd: FormData) {
  const u = await amministratore();
  const id = str(fd, "id");
  const imp = id ? await prisma.importazioneArticoli.findUnique({ where: { id } }) : null;
  if (!imp || imp.stato !== "ANTEPRIMA") redirect("/prodotti/articoli/importa");
  const [esistenti, fornitori, categorie] = await Promise.all([
    articoliPerConfronto(), prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, select: { id: true, ragioneSociale: true, scontoFornitore: true } }), categorieRegola(),
  ]);
  const an = analizzaListino(imp.righe as Tabella, imp.opzioni as Opzioni, esistenti, fornitori, categorie);
  if (an.errore) redirect(`/prodotti/articoli/importa/${imp.id}`);
  const da = an.righe.filter((r) => r.azione === "NUOVO" || r.azione === "MODIFICA");
  const conta = contaAnteprima(an.righe);
  await prisma.$transaction(async (tx) => {
    // categorie nuove
    const cache = new Map<string, string>();
    const idCategoria = async (dati: DatiArticolo): Promise<string | null | undefined> => {
      if (!dati.categoriaNome) return dati.categoriaId;
      const chiave = `${dati.categoriaNome.toUpperCase()}|${(dati.sottocategoriaNome ?? "").toUpperCase()}`;
      if (cache.has(chiave)) return cache.get(chiave);
      const trova = (nome: string, padreId: string | null) => tx.categoriaArticolo.findFirst({ where: { nome: { equals: nome, mode: "insensitive" }, padreId } });
      const madre = (await trova(dati.categoriaNome, null)) ?? (await tx.categoriaArticolo.create({ data: { nome: dati.categoriaNome, divisione: (imp!.opzioni as Opzioni).divisione ?? null } }));
      let fin = madre.id;
      if (dati.sottocategoriaNome) fin = ((await trova(dati.sottocategoriaNome, madre.id)) ?? (await tx.categoriaArticolo.create({ data: { nome: dati.sottocategoriaNome, padreId: madre.id } }))).id;
      cache.set(chiave, fin);
      return fin;
    };
    const nuovi = da.filter((r) => r.azione === "NUOVO");
    const usati = new Set((await tx.articolo.findMany({ select: { codice: true } })).map((a) => a.codice.toUpperCase()));
    const generati = nuovi.length ? await prossimiCodici(tx, nuovi.length) : [];
    // prima si creano tutte le categorie nuove, poi si leggono le regole (una sottocategoria nuova eredita quella della madre)
    const categoriaDi = new Map<number, string | null | undefined>();
    for (const r of da) categoriaDi.set(r.riga, await idCategoria(r.dati));
    const regole = await categorieRegola(tx);
    for (const r of da) {
      const { categoriaNome: _cn, sottocategoriaNome: _sn, ...dati } = r.dati;
      void _cn; void _sn;
      const categoriaId = categoriaDi.get(r.riga);
      if (r.azione === "MODIFICA" && r.articoloId) {
        let a = await tx.articolo.update({ where: { id: r.articoloId }, data: { ...dati, ...(categoriaId !== undefined ? { categoriaId } : {}), aggiornatoDaNome: u.nome } });
        const c = calcolaArticolo(a, regole);
        if (c.regola && c.regola.metodo !== "MANUALE" && c.vendita !== null && (c.vendita !== a.prezzoVendita || c.costo !== a.costoAcquisto))
          a = await tx.articolo.update({ where: { id: a.id }, data: { prezzoVendita: c.vendita, costoAcquisto: c.costo } });
        if (["prezzoListino", "sconti", "costoAcquisto", "prezzoVendita"].some((k) => k in dati))
          await tx.storicoPrezzoArticolo.create({ data: { articoloId: a.id, prezzoListino: a.prezzoListino, costoAcquisto: a.costoAcquisto, prezzoVendita: a.prezzoVendita, origine: "IMPORTAZIONE", nota: imp!.nomeFile.slice(0, 180), utenteNome: u.nome } });
      } else {
        let codice = (r.codice ?? "").toUpperCase().replace(/\s+/g, "");
        if (!codice) { const cf = (r.dati.codiceFornitore ?? "").toUpperCase().replace(/\s+/g, ""); codice = cf && !usati.has(cf) && cf.length <= 40 ? cf : generati.shift()!; }
        else if (usati.has(codice)) codice = generati.shift()!;
        usati.add(codice);
        const c = calcolaArticolo({ ...dati, categoriaId: categoriaId ?? null }, regole);
        const a = await tx.articolo.create({
          data: {
            ...dati, codice, descrizione: dati.descrizione ?? r.descrizione, categoriaId: categoriaId ?? null,
            costoAcquisto: c.costo, prezzoVendita: c.regola && c.regola.metodo !== "MANUALE" && c.vendita !== null ? c.vendita : dati.prezzoVendita ?? null, aggiornatoDaNome: u.nome,
          },
        });
        await tx.storicoPrezzoArticolo.create({ data: { articoloId: a.id, prezzoListino: a.prezzoListino, costoAcquisto: a.costoAcquisto, prezzoVendita: a.prezzoVendita, origine: "IMPORTAZIONE", nota: `creato da ${imp!.nomeFile}`.slice(0, 180), utenteNome: u.nome } });
      }
    }
    await tx.importazioneArticoli.update({ where: { id: imp!.id }, data: { stato: "ESEGUITA", eseguitaIl: new Date(), creati: conta.nuovi, aggiornati: conta.modificati, invariati: conta.invariati, scartati: conta.errori + conta.saltate } });
  }, { timeout: 280000, maxWait: 20000 });
  aggiorna();
  redirect(`/prodotti/articoli/importa/${imp.id}`);
}

export async function annullaImportazione(fd: FormData) {
  await amministratore();
  const id = str(fd, "id");
  if (id) await prisma.importazioneArticoli.updateMany({ where: { id, stato: "ANTEPRIMA" }, data: { stato: "ANNULLATA" } });
  redirect("/prodotti/articoli/importa");
}

// ---------------- Ordini fornitori ----------------

/** Aggiunge all'ordine fornitore una riga presa dall'anagrafica articoli. */
export async function aggiungiArticoloAOrdine(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoGestireOrdini(u)) throw new Error("Non autorizzato.");
  const ordineId = str(fd, "ordineId");
  const testo = str(fd, "articolo");
  if (!ordineId || !testo) return;
  const o = await prisma.ordineFornitore.findUnique({ where: { id: ordineId }, include: { fornitore: true } });
  if (!o || !["BOZZA", "INVIATO", "CONFERMATO"].includes(o.stato)) return;
  const codice = testo.split(" — ")[0].trim();
  const a = await prisma.articolo.findFirst({ where: { OR: [{ id: testo }, { codice: { equals: codice, mode: "insensitive" } }] } });
  if (!a) return;
  const q = num(fd, "quantita");
  const prezzo = a.prezzoListino ?? a.costoAcquisto;
  const sconto = a.prezzoListino !== null ? scontoEquivalente(a.sconti) : 0;
  await prisma.rigaOrdine.create({
    data: {
      ordineFornitoreId: o.id, commessaId: o.commessaId, articoloId: a.id, descrizione: a.descrizione, quantita: q && q > 0 ? Math.round(q) : 1, um: a.um,
      codice: a.codice, codiceFornitore: a.codiceFornitore, prezzoAcquisto: prezzo, scontoAcquisto: sconto,
      fornitoreId: o.fornitoreId, fornitoreNome: o.fornitore.ragioneSociale, ordinato: o.stato !== "BOZZA", ordinatoIl: o.stato !== "BOZZA" ? new Date() : null, ordinatoDaNome: u.nome,
    },
  });
  revalidatePath(`/ordini-fornitori/${o.id}`);
  if (o.commessaId) revalidatePath(`/commesse/${o.commessaId}`);
}

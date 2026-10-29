"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prossimoNumeroOrdine } from "@/lib/ordini/server";
import { prezzoNetto, statoDaArrivi } from "@/lib/ordini/calcoli";
import { scontoEquivalente } from "@/lib/articoli/prezzi";
import { puoMagazzino, prossimoNumeroBolla, applicaBolla, verificaMaterialeCommessa, giacenze } from "@/lib/magazzino/server";
import { leggiQuantita, righeDaControllare, numeroBolla, CAUSALI_BOLLA, CAUSALI_SENZA_FATTURA, differenzaInventario, quantitaUtile } from "@/lib/magazzino/calcoli";

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
const num = (fd: FormData, k: string) => leggiQuantita(str(fd, k));
const data = (fd: FormData, k: string) => { const v = str(fd, k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : null; };

async function utente() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoMagazzino(u)) throw new Error("Non autorizzato al magazzino.");
  return u;
}
function aggiorna(bollaId?: string, commesse: string[] = []) {
  revalidatePath("/magazzino");
  revalidatePath("/magazzino/bolle");
  revalidatePath("/magazzino/giacenze");
  revalidatePath("/ordini-fornitori");
  if (bollaId) revalidatePath(`/magazzino/bolle/${bollaId}`);
  for (const c of commesse) revalidatePath(`/commesse/${c}`);
}
/** Articolo scritto come "CODICE — descrizione" (datalist) oppure id. */
async function articoloDa(testo: string | null) {
  if (!testo) return null;
  const codice = testo.split(" — ")[0].trim();
  return prisma.articolo.findFirst({ where: { OR: [{ id: testo }, { codice: { equals: codice, mode: "insensitive" } }] } });
}

// ===================== BOLLE D'ENTRATA =====================

export async function creaBolla(fd: FormData) {
  const u = await utente();
  const fornitoreId = str(fd, "fornitoreId");
  const forn = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { id: true, ragioneSociale: true } }) : null;
  const fornitoreNome = forn?.ragioneSociale ?? str(fd, "fornitoreNome");
  if (!fornitoreNome) throw new Error("Indica il fornitore della bolla.");
  const causale = str(fd, "causale") ?? "ACQUISTO";
  const anno = new Date().getFullYear();
  const b = await prisma.$transaction(async (tx) => {
    const numero = await prossimoNumeroBolla(tx, anno);
    return tx.bollaEntrata.create({
      data: { numero, anno, fornitoreId: forn?.id ?? null, fornitoreNome, numeroDdt: str(fd, "numeroDdt"), dataDdt: data(fd, "dataDdt"), dataArrivo: data(fd, "dataArrivo") ?? new Date(), causale: causale in CAUSALI_BOLLA ? causale : "ALTRO", riferimento: str(fd, "riferimento"), note: str(fd, "note"), creatoDaNome: u.nome },
    });
  });
  aggiorna(b.id);
  redirect(`/magazzino/bolle/${b.id}`);
}

export async function salvaTestataBolla(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  if (!id) return;
  const b = await prisma.bollaEntrata.findUnique({ where: { id } });
  if (!b || b.stato === "ANNULLATA") return;
  const causale = str(fd, "causale") ?? b.causale;
  await prisma.bollaEntrata.update({
    where: { id },
    data: { numeroDdt: str(fd, "numeroDdt"), dataDdt: data(fd, "dataDdt"), dataArrivo: data(fd, "dataArrivo") ?? b.dataArrivo, riferimento: str(fd, "riferimento"), note: str(fd, "note"), ...(b.stato === "APERTA" ? { causale: causale in CAUSALI_BOLLA ? causale : b.causale } : {}) },
  });
  aggiorna(id);
}

/** Aggiunge alla bolla le righe d'ordine spuntate, con la quantità ancora da ricevere. */
export async function aggiungiRigheDaOrdini(fd: FormData) {
  await utente();
  const bollaId = str(fd, "bollaId");
  const ids = fd.getAll("rigaOrdine").map(String).filter(Boolean);
  if (!bollaId || !ids.length) return;
  const b = await prisma.bollaEntrata.findUnique({ where: { id: bollaId }, include: { righe: { select: { rigaOrdineId: true, posizione: true } } } });
  if (!b || b.stato !== "APERTA") return;
  const gia = new Set(b.righe.map((r) => r.rigaOrdineId));
  const righe = await prisma.rigaOrdine.findMany({ where: { id: { in: ids.filter((i) => !gia.has(i)) } }, orderBy: { createdAt: "asc" } });
  let pos = b.righe.reduce((m, r) => Math.max(m, r.posizione), 0);
  for (const r of righe) {
    const residuo = Math.max(0, r.quantita - r.quantitaArrivata);
    await prisma.rigaBolla.create({
      data: { bollaId, posizione: ++pos, rigaOrdineId: r.id, ordineFornitoreId: r.ordineFornitoreId, commessaId: r.commessaId, articoloId: r.articoloId, codice: r.codice, codiceFornitore: r.codiceFornitore, descrizione: r.descrizione, um: r.um, quantitaBolla: residuo || r.quantita, destinazione: r.commessaId ? "COMMESSA" : "MAGAZZINO", prezzo: prezzoNetto(r.prezzoAcquisto, r.scontoAcquisto) },
    });
  }
  aggiorna(bollaId);
}

/** Riga non ordinata (o ordinata fuori dal CRM): da catalogo articoli o descrizione libera. */
export async function aggiungiRigaBolla(fd: FormData) {
  await utente();
  const bollaId = str(fd, "bollaId");
  if (!bollaId) return;
  const b = await prisma.bollaEntrata.findUnique({ where: { id: bollaId }, include: { righe: { select: { posizione: true } } } });
  if (!b || b.stato !== "APERTA") return;
  const a = await articoloDa(str(fd, "articolo"));
  const descrizione = str(fd, "descrizione") ?? a?.descrizione;
  if (!descrizione) return;
  const commessaId = str(fd, "commessaId");
  await prisma.rigaBolla.create({
    data: {
      bollaId, posizione: b.righe.reduce((m, r) => Math.max(m, r.posizione), 0) + 1, articoloId: a?.id ?? null, codice: a?.codice ?? str(fd, "codice"), codiceFornitore: a?.codiceFornitore ?? null,
      descrizione, um: a?.um ?? str(fd, "um") ?? "pz", quantitaBolla: num(fd, "quantita") ?? 1, commessaId, destinazione: commessaId ? "COMMESSA" : "MAGAZZINO",
      prezzo: num(fd, "prezzo") ?? (a ? a.costoAcquisto ?? (a.prezzoListino !== null ? Math.round(a.prezzoListino * (1 - scontoEquivalente(a.sconti) / 100) * 100) / 100 : null) : null),
    },
  });
  aggiorna(bollaId);
}

/** Spunta: quantità ricevuta, esito e destinazione di ogni riga. Con «tuttoOk» le righe da controllare diventano OK. */
export async function salvaSpunta(fd: FormData) {
  await utente();
  const bollaId = str(fd, "bollaId");
  if (!bollaId) return;
  const b = await prisma.bollaEntrata.findUnique({ where: { id: bollaId }, include: { righe: true } });
  if (!b || b.stato !== "APERTA") return;
  const tuttoOk = fd.get("tuttoOk") === "1";
  for (const r of b.righe) {
    let esito = str(fd, `esito_${r.id}`) ?? r.esito;
    if (tuttoOk && esito === "DA_CONTROLLARE") esito = "OK";
    const ricevuta = fd.has(`q_${r.id}`) ? num(fd, `q_${r.id}`) : r.quantitaRicevuta;
    // quantità ricevuta inferiore alla bolla con esito OK → parziale
    if (esito === "OK" && ricevuta !== null && ricevuta + 1e-9 < r.quantitaBolla) esito = "PARZIALE";
    if (esito === "MANCANTE") esito = "MANCANTE";
    const dest = str(fd, `dest_${r.id}`) ?? r.destinazione;
    await prisma.rigaBolla.update({
      where: { id: r.id },
      data: { esito, quantitaRicevuta: esito === "MANCANTE" ? 0 : ricevuta, destinazione: ["COMMESSA", "MAGAZZINO"].includes(dest) ? dest : r.destinazione, note: fd.has(`note_${r.id}`) ? str(fd, `note_${r.id}`) : r.note, prezzo: fd.has(`prezzo_${r.id}`) ? num(fd, `prezzo_${r.id}`) : r.prezzo },
    });
  }
  aggiorna(bollaId);
}

export async function togliRigaBolla(fd: FormData) {
  await utente();
  const id = str(fd, "rigaId");
  if (!id) return;
  const r = await prisma.rigaBolla.findUnique({ where: { id }, include: { bolla: { select: { stato: true } } } });
  if (!r || r.bolla.stato !== "APERTA") return;
  await prisma.rigaBolla.delete({ where: { id } });
  aggiorna(r.bollaId);
}

/** Registra la bolla: aggiorna ordini, commesse (avvio se il materiale è completo) e magazzino. */
export async function registraBolla(fd: FormData): Promise<void> {
  const u = await utente();
  const id = str(fd, "bollaId");
  if (!id) return;
  const b = await prisma.bollaEntrata.findUnique({ where: { id }, include: { righe: true } });
  if (!b || b.stato !== "APERTA") return;
  if (!b.righe.length) throw new Error("La bolla non ha righe: aggiungile prima di registrarla.");
  if (righeDaControllare(b.righe)) throw new Error("Ci sono righe ancora da controllare: spunta ogni riga (OK, parziale, mancante o danneggiata).");
  const esito = await prisma.$transaction(async (tx) => {
    const r = await applicaBolla(tx, id, 1, u.nome);
    await tx.bollaEntrata.update({ where: { id }, data: { stato: CAUSALI_SENZA_FATTURA.includes(b.causale) ? "CHIUSA" : "DA_FATTURARE", registrataIl: new Date(), registrataDaNome: u.nome } });
    const avvii: string[] = [];
    for (const c of r.commesse) {
      const righeC = b.righe.filter((x) => x.commessaId === c);
      const arrivate = righeC.filter((x) => quantitaUtile(x) > 0).map((x) => x.descrizione);
      const problemi = righeC.filter((x) => ["MANCANTE", "DANNEGGIATO", "PARZIALE"].includes(x.esito)).map((x) => `${x.descrizione} (${x.esito.toLowerCase()})`);
      await tx.commessaEvento.create({ data: { commessaId: c, utenteNome: u.nome, testo: `Bolla ${numeroBolla(b)} di ${b.fornitoreNome}${b.numeroDdt ? ` (DDT ${b.numeroDdt})` : ""}: arrivato ${arrivate.join("; ").slice(0, 300) || "nulla"}.${problemi.length ? ` Da sollecitare: ${problemi.join("; ").slice(0, 300)}.` : ""}` } });
      if ((await verificaMaterialeCommessa(tx, c, u.nome)) === "COMPLETO") avvii.push(c);
    }
    return { ...r, avvii };
  });
  aggiorna(id, esito.commesse);
}

/** Riapre una bolla registrata (non ancora fatturata) per correggerla: storna arrivi e carichi. */
export async function riapriBolla(fd: FormData) {
  const u = await utente();
  const id = str(fd, "bollaId");
  if (!id) return;
  const b = await prisma.bollaEntrata.findUnique({ where: { id } });
  if (!b || !["DA_FATTURARE", "CHIUSA"].includes(b.stato)) return;
  const commesse = await prisma.$transaction(async (tx) => {
    const r = await applicaBolla(tx, id, -1, u.nome);
    await tx.bollaEntrata.update({ where: { id }, data: { stato: "APERTA", registrataIl: null, registrataDaNome: null } });
    for (const c of r.commesse) {
      await tx.commessaEvento.create({ data: { commessaId: c, utenteNome: u.nome, testo: `Bolla ${numeroBolla(b)} riaperta per correzione: arrivi stornati.` } });
      await verificaMaterialeCommessa(tx, c, u.nome);
    }
    return r.commesse;
  });
  aggiorna(id, commesse);
}

export async function annullaBolla(fd: FormData) {
  await utente();
  const id = str(fd, "bollaId");
  if (!id) return;
  const b = await prisma.bollaEntrata.findUnique({ where: { id } });
  if (!b || b.stato !== "APERTA") return;
  await prisma.bollaEntrata.update({ where: { id }, data: { stato: "ANNULLATA", note: [b.note, str(fd, "motivo") ? `Annullata: ${str(fd, "motivo")}` : "Annullata"].filter(Boolean).join("\n") } });
  aggiorna(id);
  redirect("/magazzino/bolle");
}

// ===================== MOVIMENTI, INVENTARIO, SCORTE =====================

/** Carico, scarico o rettifica manuale (anche prelievo per una commessa senza riga di materiale). */
export async function movimentoManuale(fd: FormData) {
  const u = await utente();
  const a = await articoloDa(str(fd, "articolo"));
  const q = num(fd, "quantita");
  const tipo = str(fd, "tipo") ?? "CARICO";
  if (!a || !q || q <= 0 || !["CARICO", "SCARICO", "RETTIFICA_PIU", "RETTIFICA_MENO"].includes(tipo)) throw new Error("Indica articolo, tipo e quantità maggiore di zero.");
  const commessaId = str(fd, "commessaId");
  const segno = tipo === "SCARICO" || tipo === "RETTIFICA_MENO" ? -1 : 1;
  await prisma.movimentoMagazzino.create({
    data: {
      tipo: tipo.startsWith("RETTIFICA") ? "RETTIFICA" : tipo, causale: tipo === "SCARICO" ? (commessaId ? "PRELIEVO_COMMESSA" : str(fd, "causale") ?? "RESO_FORNITORE") : tipo === "CARICO" ? str(fd, "causale") ?? "ACQUISTO" : "RETTIFICA",
      articoloId: a.id, quantita: segno * q, costoUnitario: tipo === "CARICO" ? num(fd, "costo") ?? a.costoAcquisto : null, commessaId, data: data(fd, "data") ?? new Date(), note: str(fd, "note"), creatoDaNome: u.nome,
    },
  });
  if (commessaId) await prisma.commessaEvento.create({ data: { commessaId, utenteNome: u.nome, testo: `Prelievo da magazzino: ${q} ${a.um} ${a.codice} — ${a.descrizione}.` } });
  aggiorna(undefined, commessaId ? [commessaId] : []);
  revalidatePath("/magazzino/movimenti");
}

/** Inventario: si inserisce la quantità contata, il CRM registra la differenza. */
export async function registraInventario(fd: FormData) {
  const u = await utente();
  const ids = fd.getAll("articoloId").map(String);
  const g = await giacenze(ids);
  for (const id of ids) {
    const contata = num(fd, `contata_${id}`);
    if (contata === null) continue;
    const diff = differenzaInventario(g.get(id)?.giacenza ?? 0, contata);
    if (Math.abs(diff) < 1e-9) continue;
    await prisma.movimentoMagazzino.create({ data: { tipo: "INVENTARIO", causale: "INVENTARIO", articoloId: id, quantita: diff, note: `Conta inventario: ${contata}`, creatoDaNome: u.nome } });
  }
  aggiorna();
  revalidatePath("/magazzino/movimenti");
}

export async function salvaScorta(fd: FormData) {
  await utente();
  const id = str(fd, "articoloId");
  if (!id) return;
  await prisma.articolo.update({ where: { id }, data: { scortaMinima: num(fd, "scortaMinima"), ubicazione: str(fd, "ubicazione") } });
  aggiorna();
}

/** Mette a magazzino un articolo (scorta minima) così compare in giacenze anche senza movimenti. */
export async function aggiungiArticoloAScorta(fd: FormData) {
  await utente();
  const a = await articoloDa(str(fd, "articolo"));
  if (!a) throw new Error("Articolo non trovato in anagrafica.");
  await prisma.articolo.update({ where: { id: a.id }, data: { scortaMinima: num(fd, "scortaMinima") ?? a.scortaMinima ?? 1, ubicazione: str(fd, "ubicazione") ?? a.ubicazione } });
  aggiorna();
}

/** Crea gli ordini (bozza) per riportare a scorta gli articoli scelti: uno per fornitore. */
export async function creaOrdiniRiordino(fd: FormData) {
  const u = await utente();
  const ids = fd.getAll("articoloId").map(String);
  const articoli = await prisma.articolo.findMany({ where: { id: { in: ids } }, include: { fornitore: true } });
  const perForn = new Map<string, typeof articoli>();
  const senza: string[] = [];
  for (const a of articoli) {
    const q = num(fd, `q_${a.id}`);
    if (!q || q <= 0) continue;
    if (!a.fornitoreId) { senza.push(a.codice); continue; }
    perForn.set(a.fornitoreId, [...(perForn.get(a.fornitoreId) ?? []), a]);
  }
  const anno = new Date().getFullYear();
  const creati: string[] = [];
  for (const [fornitoreId, lista] of perForn) {
    const o = await prisma.$transaction(async (tx) => {
      const numero = await prossimoNumeroOrdine(tx, anno);
      return tx.ordineFornitore.create({ data: { numero, anno, fornitoreId, divisione: "P&C", creatoDaNome: u.nome, indirizzoSpedizione: "Sede di Rosta, Corso Moncenisio 28", riferimento: "Riordino scorte di magazzino" } });
    });
    for (const a of lista) {
      const q = num(fd, `q_${a.id}`)!;
      await prisma.rigaOrdine.create({
        data: { ordineFornitoreId: o.id, articoloId: a.id, descrizione: a.descrizione, quantita: Math.max(1, Math.ceil(q)), um: a.um, codice: a.codice, codiceFornitore: a.codiceFornitore, prezzoAcquisto: a.prezzoListino ?? a.costoAcquisto, scontoAcquisto: a.prezzoListino !== null ? scontoEquivalente(a.sconti) : 0, fornitoreId, fornitoreNome: a.fornitore?.ragioneSociale ?? null },
      });
    }
    creati.push(o.id);
  }
  aggiorna();
  if (senza.length && !creati.length) throw new Error(`Articoli senza fornitore in anagrafica: ${senza.join(", ")}.`);
  redirect(creati.length === 1 ? `/ordini-fornitori/${creati[0]}` : "/ordini-fornitori");
}

// ===================== COMMESSA: MATERIALE DA MAGAZZINO =====================

/** Segna una riga materiale della commessa come «da magazzino» (impegna la scorta) collegandola a un articolo. */
export async function impegnaDaMagazzino(fd: FormData) {
  const u = await utente();
  const id = str(fd, "rigaId");
  if (!id) return;
  const r = await prisma.rigaOrdine.findUnique({ where: { id } });
  if (!r || !r.commessaId || r.ordineFornitoreId || r.arrivato) return;
  const a = (await articoloDa(str(fd, "articolo"))) ?? (r.articoloId ? await prisma.articolo.findUnique({ where: { id: r.articoloId } }) : null);
  if (!a) throw new Error("Scegli l'articolo del magazzino da usare.");
  await prisma.rigaOrdine.update({ where: { id }, data: { daMagazzino: true, articoloId: a.id, codice: r.codice ?? a.codice, um: r.um ?? a.um, costoPrevisto: r.costoPrevisto ?? (a.costoAcquisto !== null ? Math.round(a.costoAcquisto * r.quantita * 100) / 100 : null) } });
  await prisma.commessaEvento.create({ data: { commessaId: r.commessaId, utenteNome: u.nome, testo: `«${r.descrizione}» sarà preso dal magazzino (${a.codice}).` } });
  aggiorna(undefined, [r.commessaId]);
}

export async function togliImpegno(fd: FormData) {
  await utente();
  const id = str(fd, "rigaId");
  const r = id ? await prisma.rigaOrdine.findUnique({ where: { id } }) : null;
  if (!r || !r.daMagazzino || r.prelevatoIl) return;
  await prisma.rigaOrdine.update({ where: { id: r.id }, data: { daMagazzino: false } });
  aggiorna(undefined, r.commessaId ? [r.commessaId] : []);
}

/** Prelievo: scarica il magazzino e segna la riga disponibile per la commessa. */
export async function prelevaDaMagazzino(fd: FormData) {
  const u = await utente();
  const id = str(fd, "rigaId");
  if (!id) return;
  const r = await prisma.rigaOrdine.findUnique({ where: { id } });
  if (!r || !r.commessaId || !r.daMagazzino || !r.articoloId || r.prelevatoIl) return;
  const g = (await giacenze([r.articoloId])).get(r.articoloId);
  await prisma.$transaction(async (tx) => {
    await tx.movimentoMagazzino.create({ data: { tipo: "SCARICO", causale: "PRELIEVO_COMMESSA", articoloId: r.articoloId!, quantita: -r.quantita, commessaId: r.commessaId, rigaOrdineId: r.id, costoUnitario: g?.costoMedio ?? null, creatoDaNome: u.nome } });
    const ora = new Date();
    await tx.rigaOrdine.update({ where: { id }, data: { prelevatoIl: ora, arrivato: true, arrivatoIl: ora, quantitaArrivata: r.quantita, ordinato: true, ordinatoIl: r.ordinatoIl ?? ora, ordinatoDaNome: r.ordinatoDaNome ?? u.nome, costoEffettivo: r.costoEffettivo ?? (g?.costoMedio != null ? Math.round(g.costoMedio * r.quantita * 100) / 100 : null) } });
    await tx.commessaEvento.create({ data: { commessaId: r.commessaId!, utenteNome: u.nome, testo: `Prelevato dal magazzino: ${r.quantita} ${r.um ?? "pz"} «${r.descrizione}».${g && g.giacenza - r.quantita < 0 ? " ATTENZIONE: giacenza negativa, verificare il magazzino." : ""}` } });
    await verificaMaterialeCommessa(tx, r.commessaId!, u.nome);
  });
  aggiorna(undefined, [r.commessaId]);
}

/** Annulla un prelievo: la merce torna a magazzino. */
export async function annullaPrelievo(fd: FormData) {
  const u = await utente();
  const id = str(fd, "rigaId");
  const r = id ? await prisma.rigaOrdine.findUnique({ where: { id } }) : null;
  if (!r || !r.prelevatoIl || !r.commessaId) return;
  await prisma.$transaction(async (tx) => {
    await tx.movimentoMagazzino.deleteMany({ where: { rigaOrdineId: r.id, causale: "PRELIEVO_COMMESSA" } });
    await tx.rigaOrdine.update({ where: { id: r.id }, data: { prelevatoIl: null, arrivato: false, arrivatoIl: null, quantitaArrivata: 0 } });
    await tx.commessaEvento.create({ data: { commessaId: r.commessaId!, utenteNome: u.nome, testo: `Prelievo annullato: «${r.descrizione}» torna a magazzino.` } });
    await verificaMaterialeCommessa(tx, r.commessaId!, u.nome);
  });
  aggiorna(undefined, [r.commessaId]);
}

/** Spunta manuale di una riga materiale arrivata fuori bolla (es. consegnata direttamente in cantiere). */
export async function segnaArrivatoInCantiere(fd: FormData) {
  const u = await utente();
  const id = str(fd, "rigaId");
  const r = id ? await prisma.rigaOrdine.findUnique({ where: { id } }) : null;
  if (!r || !r.commessaId || r.arrivato) return;
  await prisma.$transaction(async (tx) => {
    const ora = new Date();
    await tx.rigaOrdine.update({ where: { id: r.id }, data: { arrivato: true, arrivatoIl: ora, quantitaArrivata: r.quantita } });
    if (r.ordineFornitoreId) {
      const o = await tx.ordineFornitore.findUnique({ where: { id: r.ordineFornitoreId }, include: { righe: { select: { arrivato: true } } } });
      if (o) await tx.ordineFornitore.update({ where: { id: o.id }, data: { stato: statoDaArrivi(o.stato, o.righe) } });
    }
    await tx.commessaEvento.create({ data: { commessaId: r.commessaId!, utenteNome: u.nome, testo: `Spuntato a mano come arrivato: «${r.descrizione}»${str(fd, "nota") ? ` (${str(fd, "nota")})` : ""}.` } });
    await verificaMaterialeCommessa(tx, r.commessaId!, u.nome);
  });
  aggiorna(undefined, [r.commessaId]);
}

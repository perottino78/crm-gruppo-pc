"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puoAmministrazione, registra as registraLog } from "@/lib/amministrazione/server";
import { leggiFileFatture, chiaveFattura } from "@/lib/fatture/fatturapa";
import { importaFattura, registraFattura, riapriFattura, ordiniCitati, trasferisciProforma, type EsitoImport } from "@/lib/fatture/server";
import { abbinaRighe, leggiQuantita } from "@/lib/magazzino/calcoli";
import { numeroCommessa } from "@/lib/commesse";
import { MAX_DOCUMENTO, nomeFileSicuro } from "@/lib/ordini/calcoli";

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
const num = (fd: FormData, k: string) => leggiQuantita(str(fd, k));
const data = (fd: FormData, k: string) => { const v = str(fd, k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : null; };
const cent = (n: number) => Math.round(n * 100) / 100;

async function utente() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoAmministrazione(u)) throw new Error("Area riservata all'amministrazione.");
  return u;
}
function aggiorna(id?: string, commesse: string[] = []) {
  revalidatePath("/amministrazione/fatture-acquisto");
  revalidatePath("/amministrazione/scadenzario");
  revalidatePath("/magazzino/bolle");
  if (id) revalidatePath(`/amministrazione/fatture-acquisto/${id}`);
  for (const c of commesse) revalidatePath(`/commesse/${c}`);
}

export type EsitoCaricamento = { ok: boolean; messaggio: string; voci: EsitoImport[] };

/** Carica uno o più file XML / P7M / ZIP del cassetto fiscale o dell'SDI. */
export async function caricaFattureXml(_: EsitoCaricamento | null, fd: FormData): Promise<EsitoCaricamento> {
  const u = await getCurrentUser();
  if (!u || !puoAmministrazione(u)) return { ok: false, messaggio: "Non autorizzato.", voci: [] };
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, messaggio: "Scegli almeno un file XML, P7M o ZIP.", voci: [] };
  const voci: EsitoImport[] = [];
  for (const f of files) {
    if (f.size > 20 * 1024 * 1024) { voci.push({ stato: "ERRORE", titolo: f.name, messaggio: "File oltre 20 MB." }); continue; }
    let letti;
    try { letti = leggiFileFatture(f.name, Buffer.from(await f.arrayBuffer())); }
    catch (e) { voci.push({ stato: "ERRORE", titolo: f.name, messaggio: (e as Error).message }); continue; }
    if (!letti.length) voci.push({ stato: "ERRORE", titolo: f.name, messaggio: "Nessuna fattura trovata nel file." });
    for (const l of letti) {
      if (l.errore) { voci.push({ stato: "ERRORE", titolo: l.nome, messaggio: l.errore }); continue; }
      for (const fat of l.fatture) {
        try { voci.push(await importaFattura(fat, { xml: l.xml, origine: "XML", creatoDaNome: u.nome })); }
        catch (e) { voci.push({ stato: "ERRORE", titolo: l.nome, messaggio: (e as Error).message.slice(0, 200) }); }
      }
    }
  }
  const nuove = voci.filter((v) => v.stato === "NUOVA").length, doppie = voci.filter((v) => v.stato === "DOPPIA").length, errori = voci.filter((v) => v.stato === "ERRORE").length;
  if (nuove) await registraLog("FATTURA_ACQUISTO", null, "IMPORTAZIONE_XML", `${nuove} nuove, ${doppie} già presenti, ${errori} errori`, u.nome);
  aggiorna();
  return { ok: nuove > 0, messaggio: `${nuove} fatture caricate${doppie ? `, ${doppie} già presenti` : ""}${errori ? `, ${errori} non lette` : ""}.`, voci };
}

/** "C2026-012 · ROSSI MARIO" (scelto dalla ricerca) o "12/2026" → id della commessa. */
async function commessaDaTesto(t: string | null): Promise<string | null> {
  if (!t) return null;
  const a = /^\s*C(20\d{2})-(\d{1,5})/i.exec(t), b = /^\s*(\d{1,5})\s*\/\s*(20\d{2})/.exec(t);
  const [anno, numero] = a ? [Number(a[1]), Number(a[2])] : b ? [Number(b[2]), Number(b[1])] : [0, 0];
  if (!anno) return null;
  return (await prisma.commessa.findUnique({ where: { anno_numero: { anno, numero } }, select: { id: true } }))?.id ?? null;
}

/** Fattura da PDF (o cartacea) inserita a mano: testata, importi e, se c'è, il PDF. */
export async function creaFatturaManuale(fd: FormData) {
  const u = await utente();
  const fornitoreId = str(fd, "fornitoreId");
  const forn = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { id: true, ragioneSociale: true, partitaIva: true, centroCosto: true } }) : null;
  const fornitoreNome = forn?.ragioneSociale ?? str(fd, "fornitoreNome");
  const numero = str(fd, "numero"), d = data(fd, "data");
  if (!fornitoreNome || !numero || !d) throw new Error("Servono fornitore, numero e data della fattura.");
  const imponibile = num(fd, "imponibile") ?? 0, iva = num(fd, "iva") ?? 0;
  const totale = num(fd, "totale") ?? cent(imponibile + iva);
  const tipo = str(fd, "tipoDocumento") ?? "TD01";
  const segno = tipo === "TD04" ? -1 : 1;
  const commessaId = str(fd, "commessaId") ?? (await commessaDaTesto(str(fd, "commessa")));
  const chiave = chiaveFattura(forn?.partitaIva ?? null, fornitoreNome, tipo, numero, d.toISOString());
  const doppia = await prisma.fatturaAcquisto.findUnique({ where: { chiave }, select: { id: true } });
  if (doppia) redirect(`/amministrazione/fatture-acquisto/${doppia.id}`);
  const scad = data(fd, "scadenza");
  const f = await prisma.fatturaAcquisto.create({
    data: {
      chiave, fornitoreId: forn?.id ?? null, fornitoreNome, partitaIva: forn?.partitaIva ?? null, tipoDocumento: tipo, numero, data: d,
      imponibile: cent(segno * Math.abs(imponibile)), iva: cent(segno * Math.abs(iva)), totale: cent(segno * Math.abs(totale)), divisione: str(fd, "divisione"), origine: "PDF", creatoDaNome: u.nome,
      modoPagamento: str(fd, "modoPagamento"), bancaPrevista: str(fd, "bancaPrevista"), centroCosto: forn?.centroCosto ?? null, note: str(fd, "note"),
      scadenzePreviste: scad ? [{ data: scad.toISOString().slice(0, 10), importo: Math.abs(totale), modalita: null }] : undefined,
      righe: { create: [{ posizione: 1, descrizione: str(fd, "descrizione") ?? (tipo === "PROFORMA" ? "Totale proforma" : "Totale fattura"), importo: cent(segno * Math.abs(imponibile)), commessaId }] },
    },
  });
  const pdf = fd.get("pdf");
  if (pdf instanceof File && pdf.size > 0 && pdf.size <= MAX_DOCUMENTO) {
    await prisma.documento.create({ data: { entita: "FATTURA_ACQUISTO", entitaId: f.id, cartella: "Fattura", nome: nomeFileSicuro(pdf.name), mime: pdf.type || "application/pdf", dimensione: pdf.size, contenuto: Buffer.from(await pdf.arrayBuffer()), caricatoDaNome: u.nome } });
  }
  aggiorna(f.id);
  redirect(`/amministrazione/fatture-acquisto/${f.id}`);
}

export async function salvaTestataFattura(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id } }) : null;
  if (!f || f.stato !== "DA_VERIFICARE") return;
  const fornitoreId = str(fd, "fornitoreId");
  const forn = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { id: true, ragioneSociale: true } }) : null;
  const scad = data(fd, "scadenza");
  await prisma.fatturaAcquisto.update({
    where: { id: f.id },
    data: {
      ...(forn ? { fornitoreId: forn.id, fornitoreNome: forn.ragioneSociale } : {}),
      divisione: str(fd, "divisione"), note: str(fd, "note"),
      ...(f.origine !== "XML" ? { numero: str(fd, "numero") ?? f.numero, data: data(fd, "data") ?? f.data, imponibile: num(fd, "imponibile") ?? f.imponibile, iva: num(fd, "iva") ?? f.iva, totale: num(fd, "totale") ?? f.totale } : {}),
      ...(scad ? { scadenzePreviste: [{ data: scad.toISOString().slice(0, 10), importo: Math.abs(num(fd, "totale") ?? f.totale), modalita: null }] } : {}),
    },
  });
  aggiorna(f.id);
}

/** Abbinamento delle righe a commesse e righe d'ordine (costo reale), più eventuali modifiche alle righe manuali. */
export async function salvaRigheFattura(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id }, include: { righe: true } }) : null;
  if (!f || f.stato !== "DA_VERIFICARE") return;
  for (const r of f.righe) {
    if (!fd.has(`commessa_${r.id}`)) continue;
    let rigaOrdineId = str(fd, `riga_${r.id}`);
    let commessaId = str(fd, `commessa_${r.id}`);
    if (rigaOrdineId) {
      const ro = await prisma.rigaOrdine.findUnique({ where: { id: rigaOrdineId }, select: { commessaId: true } });
      if (!ro) rigaOrdineId = null; else commessaId = ro.commessaId ?? commessaId;
    }
    await prisma.rigaFatturaAcquisto.update({
      where: { id: r.id },
      data: { commessaId, rigaOrdineId, ...(f.origine !== "XML" ? { descrizione: str(fd, `descr_${r.id}`) ?? r.descrizione, importo: num(fd, `importo_${r.id}`) ?? r.importo } : {}) },
    });
  }
  aggiorna(f.id);
}

export async function aggiungiRigaFattura(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id }, include: { righe: { select: { posizione: true } } } }) : null;
  if (!f || f.stato !== "DA_VERIFICARE") return;
  const importo = num(fd, "importo");
  if (importo === null) return;
  await prisma.rigaFatturaAcquisto.create({ data: { fatturaId: f.id, posizione: f.righe.reduce((m, r) => Math.max(m, r.posizione), 0) + 1, descrizione: str(fd, "descrizione") ?? "Riga", importo, commessaId: str(fd, "commessaId") } });
  aggiorna(f.id);
}

export async function togliRigaFattura(fd: FormData) {
  await utente();
  const r = await prisma.rigaFatturaAcquisto.findUnique({ where: { id: str(fd, "rigaId") ?? "" }, include: { fattura: { select: { stato: true, origine: true } } } });
  if (!r || r.fattura.stato !== "DA_VERIFICARE" || r.fattura.origine === "XML") return;
  await prisma.rigaFatturaAcquisto.delete({ where: { id: r.id } });
  aggiorna(r.fatturaId);
}

/** Collega le bolle del fornitore (da fatturare) e propone l'abbinamento delle righe. */
export async function collegaBolle(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id } }) : null;
  if (!f || f.stato !== "DA_VERIFICARE") return;
  const bolle = fd.getAll("bolla").map(String);
  await prisma.fatturaAcquisto.update({ where: { id: f.id }, data: { bolle: { set: bolle.map((b) => ({ id: b })) } } });
  await abbinaAutomaticamente(f.id);
  aggiorna(f.id);
}

/** Abbinamento automatico: righe della fattura ↔ righe d'ordine delle bolle collegate e degli ordini citati. */
async function abbinaAutomaticamente(id: string) {
  const f = await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id }, include: { righe: { orderBy: { posizione: "asc" } }, bolle: { include: { righe: true } } } });
  const daBolle = f.bolle.flatMap((b) => b.righe.map((r) => r.rigaOrdineId).filter(Boolean)) as string[];
  const ordini = f.riferimentiOrdine ? await ordiniCitati(f.riferimentiOrdine.split(",").map((s) => s.trim()), f.fornitoreId) : [];
  const candidate = await prisma.rigaOrdine.findMany({ where: { OR: [{ id: { in: daBolle } }, ...(ordini.length ? [{ ordineFornitoreId: { in: ordini } }] : [])] }, select: { id: true, codice: true, codiceFornitore: true, descrizione: true, quantita: true, commessaId: true } });
  const libere = f.righe.filter((r) => !r.rigaOrdineId);
  const abb = abbinaRighe(libere.map((r) => ({ codice: r.codice, descrizione: r.descrizione })), candidate.filter((c) => !f.righe.some((r) => r.rigaOrdineId === c.id)).map((c) => ({ ...c, residuo: c.quantita })));
  for (const [i, r] of libere.entries()) {
    if (!abb[i]) continue;
    const c = candidate.find((x) => x.id === abb[i])!;
    await prisma.rigaFatturaAcquisto.update({ where: { id: r.id }, data: { rigaOrdineId: c.id, commessaId: c.commessaId ?? r.commessaId } });
  }
  // righe ancora senza commessa: se tutte le bolle/ordini sono di un'unica commessa, va lì
  const commesse = [...new Set(candidate.map((c) => c.commessaId).filter(Boolean))];
  if (commesse.length === 1) await prisma.rigaFatturaAcquisto.updateMany({ where: { fatturaId: id, commessaId: null }, data: { commessaId: commesse[0] } });
}

export async function abbinaFattura(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  if (!id) return;
  await abbinaAutomaticamente(id);
  aggiorna(id);
}

export async function registraFatturaAcquisto(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id } }) : null;
  if (!f || f.stato !== "DA_VERIFICARE") return;
  const r = await prisma.$transaction((tx) => registraFattura(tx, f.id, u.nome));
  await registraLog("FATTURA_ACQUISTO", f.id, "REGISTRATA", `${f.fornitoreNome} n. ${f.numero}`, u.nome);
  aggiorna(f.id, r.commesse);
  if (r.avvisi.length) redirect(`/amministrazione/fatture-acquisto/${f.id}?ok=${encodeURIComponent(`Registrata. ${r.avvisi.join(" ")}`)}`);
}

export async function riapriFatturaAcquisto(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id }, include: { righe: { select: { commessaId: true } } } }) : null;
  if (!f || f.stato !== "REGISTRATA") return;
  await prisma.$transaction((tx) => riapriFattura(tx, f.id));
  await registraLog("FATTURA_ACQUISTO", f.id, "RIAPERTA", `${f.fornitoreNome} n. ${f.numero}`, u.nome);
  aggiorna(f.id, f.righe.map((r) => r.commessaId).filter(Boolean) as string[]);
}

/** Elimina una fattura non ancora registrata (es. caricata per errore). */
export async function eliminaFatturaAcquisto(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id } }) : null;
  if (!f || f.stato !== "DA_VERIFICARE") return;
  await prisma.$transaction([prisma.documento.deleteMany({ where: { entita: "FATTURA_ACQUISTO", entitaId: f.id } }), prisma.fatturaAcquisto.delete({ where: { id: f.id } })]);
  await registraLog("FATTURA_ACQUISTO", f.id, "ELIMINATA", `${f.fornitoreNome} n. ${f.numero}`, u.nome);
  aggiorna();
  redirect("/amministrazione/fatture-acquisto");
}

/** La fattura definitiva sostituisce una proforma: se è già registrata i pagamenti passano subito, altrimenti alla registrazione. */
export async function collegaProforma(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id"), proformaId = str(fd, "proformaId");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id } }) : null;
  const pf = proformaId ? await prisma.fatturaAcquisto.findUnique({ where: { id: proformaId } }) : null;
  if (!f || !pf || pf.tipoDocumento !== "PROFORMA" || pf.stato !== "REGISTRATA" || f.tipoDocumento === "PROFORMA") return;
  await prisma.fatturaAcquisto.update({ where: { id: f.id }, data: { proformaId: pf.id } });
  let msg = "Collegata: i pagamenti della proforma passeranno sulla fattura quando la registri.";
  if (f.stato === "REGISTRATA") msg = (await prisma.$transaction((tx) => trasferisciProforma(tx, f.id, u.nome))) ?? msg;
  await registraLog("FATTURA_ACQUISTO", f.id, "PROFORMA COLLEGATA", `${f.fornitoreNome} fattura ${f.numero} ← proforma ${pf.numero}`, u.nome);
  aggiorna(f.id);
  aggiorna(pf.id);
  redirect(`/amministrazione/fatture-acquisto/${f.id}?ok=${encodeURIComponent(msg)}`);
}

export async function scollegaProforma(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id } }) : null;
  if (!f?.proformaId) return;
  const pf = await prisma.fatturaAcquisto.findUnique({ where: { id: f.proformaId } });
  if (pf?.stato === "SOSTITUITA") return; // pagamenti già spostati: non si torna indietro
  await prisma.fatturaAcquisto.update({ where: { id: f.id }, data: { proformaId: null } });
  aggiorna(f.id);
}

/** Tutte le righe della fattura sulla stessa commessa (cercata per numero o nome del cliente). */
export async function assegnaCommessaATutte(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id } }) : null;
  if (!f || f.stato !== "DA_VERIFICARE") return;
  const commessaId = await commessaDaTesto(str(fd, "commessa"));
  if (!commessaId && str(fd, "commessa")) redirect(`/amministrazione/fatture-acquisto/${f.id}?errore=${encodeURIComponent("Commessa non trovata: sceglila dall'elenco che compare mentre scrivi.")}`);
  await prisma.rigaFatturaAcquisto.updateMany({ where: { fatturaId: f.id, rigaOrdineId: null }, data: { commessaId } });
  aggiorna(f.id);
}

/** Centro di costo della fattura (si propone quello del fornitore); con la spunta diventa anche quello abituale del fornitore. */
export async function salvaCentroCostoFattura(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  if (!id) return;
  const f = await prisma.fatturaAcquisto.findUnique({ where: { id }, select: { id: true, fornitoreId: true, fornitoreNome: true, numero: true } });
  if (!f) return;
  const centro = str(fd, "centroCosto");
  await prisma.fatturaAcquisto.update({ where: { id }, data: { centroCosto: centro } });
  if (fd.get("alFornitore") === "on" && f.fornitoreId) await prisma.soggetto.update({ where: { id: f.fornitoreId }, data: { centroCosto: centro } });
  await registraLog("FATTURA_ACQUISTO", id, "CENTRO DI COSTO", `${f.fornitoreNome} n. ${f.numero}: ${centro ?? "—"}${fd.get("alFornitore") === "on" ? " (anche sul fornitore)" : ""}`, u.nome);
  revalidatePath(`/amministrazione/fatture-acquisto/${id}`);
  revalidatePath("/amministrazione/fatture-acquisto");
}

// ======================= TIPO, NUMERO E CORRELAZIONI (richieste di Ugo 24/11/2026) =======================

const TIPI_SCELTA = ["PROFORMA", "TD01", "TD04", "SPESE", "ENTRATA_MERCE", "TD06", "AVVISO_PARCELLA"];

function conMessaggio(id: string, p: { ok?: string; errore?: string }): never {
  redirect(`/amministrazione/fatture-acquisto/${id}?${p.errore ? "errore" : "ok"}=${encodeURIComponent((p.errore ?? p.ok) as string)}`);
}

/** Prossimo numero «Fattura spese» dell'anno (1, 2, 3…): si parte dal più alto già usato. */
export async function prossimoNumeroSpese(anno: number): Promise<number> {
  const dal = new Date(Date.UTC(anno, 0, 1)), al = new Date(Date.UTC(anno + 1, 0, 1));
  const gia = await prisma.fatturaAcquisto.findMany({ where: { tipoDocumento: "SPESE", data: { gte: dal, lt: al } }, select: { numero: true } });
  return gia.reduce((m, x) => { const n = parseInt(x.numero, 10); return Number.isFinite(n) && n > m ? n : m; }, 0) + 1;
}

/**
 * «Modifica» della fattura d'acquisto: tipo (proforma, nota di credito, fattura spese, entrata merce, parcella, avviso di parcella),
 * numero e numero del fornitore. Scegliendo «Fattura spese» il numero diventa il progressivo dell'anno (il numero scritto dal
 * fornitore passa in «N. fattura del fornitore»). La nota di credito ha gli importi in negativo.
 */
export async function modificaTipoFattura(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id }, include: { righe: true } }) : null;
  if (!f) return;
  if (f.stato !== "DA_VERIFICARE") conMessaggio(f.id, { errore: "La fattura è già registrata: premi «Riapri per correggere», poi modificala." });
  const tipo = str(fd, "tipoDocumento") ?? f.tipoDocumento;
  if (!TIPI_SCELTA.includes(tipo) && tipo !== f.tipoDocumento) conMessaggio(f.id, { errore: "Tipo di documento non valido." });
  if (tipo === "PROFORMA" && f.proformaId) conMessaggio(f.id, { errore: "Questa fattura sostituisce una proforma: scollegala prima di farla tornare proforma." });
  const numeroScritto = str(fd, "numero"), numeroForn = str(fd, "numeroFornitore");
  let numero = numeroScritto ?? f.numero;
  let numeroFornitore = numeroForn ?? f.numeroFornitore;
  let messaggio = `Tipo: ${TIPI_DOCUMENTO_NOMI[tipo] ?? tipo}.`;
  if (tipo === "SPESE" && f.tipoDocumento !== "SPESE" && (numeroScritto === null || numeroScritto === f.numero)) {
    // il numero del fornitore (es. 5890/26) non si perde: va nel suo campo
    if (!numeroFornitore && f.numero && f.numero !== "0") numeroFornitore = f.numero;
    const anno = f.data.getUTCFullYear();
    numero = String(await prossimoNumeroSpese(anno));
    messaggio = `Fattura spese n. ${numero}/${anno}: il numero è il progressivo dell'anno.`;
  }
  // proforma = numero 0 se non indicato; ritorno da «spese» a un altro tipo: si rimette il numero del fornitore
  if (f.tipoDocumento === "SPESE" && tipo !== "SPESE" && numeroScritto === null && f.numeroFornitore) { numero = f.numeroFornitore; numeroFornitore = null; }
  const segno = tipo === "TD04" ? -1 : 1;
  const cambiaSegno = (tipo === "TD04") !== (f.tipoDocumento === "TD04");
  await prisma.$transaction(async (tx) => {
    await tx.fatturaAcquisto.update({
      where: { id: f.id },
      data: {
        tipoDocumento: tipo, numero, numeroFornitore,
        ...(cambiaSegno ? { imponibile: cent(segno * Math.abs(f.imponibile)), iva: cent(segno * Math.abs(f.iva)), totale: cent(segno * Math.abs(f.totale)) } : {}),
      },
    });
    if (cambiaSegno) for (const r of f.righe) await tx.rigaFatturaAcquisto.update({ where: { id: r.id }, data: { importo: cent(segno * Math.abs(r.importo)) } });
  });
  await registraLog("FATTURA_ACQUISTO", f.id, "TIPO MODIFICATO", `${f.fornitoreNome}: ${f.tipoDocumento} ${f.numero} → ${tipo} ${numero}`, u.nome);
  aggiorna(f.id);
  conMessaggio(f.id, { ok: `${messaggio} Ora puoi registrare la fattura.` });
}

const TIPI_DOCUMENTO_NOMI: Record<string, string> = {
  PROFORMA: "Fattura proforma", TD01: "Fattura", TD04: "Nota di credito (TD04)", SPESE: "Fattura spese", ENTRATA_MERCE: "Entrata merce", TD06: "Parcella (TD06)", AVVISO_PARCELLA: "Avviso di parcella",
};

/** «Nuova correlazione»: collega la fattura a un ordine del fornitore o al progetto (pratica) del cliente. */
export async function aggiungiCorrelazioneFattura(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id"), tipo = str(fd, "tipo"), rif = str(fd, "riferimentoId");
  const f = id ? await prisma.fatturaAcquisto.findUnique({ where: { id }, select: { id: true, stato: true, fornitoreNome: true, numero: true } }) : null;
  if (!f) return;
  if (!tipo || !rif || !["ORDINE_FORNITORE", "PROGETTO"].includes(tipo)) conMessaggio(f.id, { errore: "Scegli che cosa collegare." });
  if (await prisma.correlazioneFatturaAcquisto.findFirst({ where: { fatturaId: f.id, tipo: tipo!, riferimentoId: rif! } })) conMessaggio(f.id, { errore: "È già collegato." });
  let descrizione = "", avviso = "";
  if (tipo === "ORDINE_FORNITORE") {
    const o = await prisma.ordineFornitore.findUnique({ where: { id: rif! }, include: { fornitore: { select: { ragioneSociale: true } }, commessa: { select: { numero: true, anno: true, cliente: { select: { nome: true } } } } } });
    if (!o) conMessaggio(f.id, { errore: "Ordine non trovato." });
    descrizione = `Ordine fornitore ${o!.numero}/${o!.anno} · ${o!.fornitore.ragioneSociale}${o!.commessa ? ` · ${o!.commessa.cliente.nome}` : ""}`;
  } else {
    const c = await prisma.commessa.findUnique({ where: { id: rif! }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } } });
    if (!c) conMessaggio(f.id, { errore: "Progetto non trovato." });
    descrizione = `Progetto ${numeroCommessa(c!)} · ${c!.cliente.nome}`;
    // fattura ancora da registrare: le righe senza progetto vanno su questo, così i costi arrivano alla commessa
    if (f.stato === "DA_VERIFICARE") {
      const n = await prisma.rigaFatturaAcquisto.updateMany({ where: { fatturaId: f.id, commessaId: null }, data: { commessaId: c!.id } });
      if (n.count) avviso = ` Le ${n.count} righe senza progetto sono state messe su questo progetto (costi reali alla registrazione).`;
    }
  }
  await prisma.correlazioneFatturaAcquisto.create({ data: { fatturaId: f.id, tipo: tipo!, riferimentoId: rif!, descrizione, creatoDaNome: u.nome } });
  await registraLog("FATTURA_ACQUISTO", f.id, "CORRELATA", `${f.fornitoreNome} n. ${f.numero} ↔ ${descrizione}`, u.nome);
  aggiorna(f.id);
  conMessaggio(f.id, { ok: `Correlata: ${descrizione}.${avviso}` });
}

export async function togliCorrelazioneFattura(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const c = id ? await prisma.correlazioneFatturaAcquisto.findUnique({ where: { id } }) : null;
  if (!c) return;
  await prisma.correlazioneFatturaAcquisto.delete({ where: { id: c.id } });
  await registraLog("FATTURA_ACQUISTO", c.fatturaId, "CORRELAZIONE TOLTA", c.descrizione, u.nome);
  aggiorna(c.fatturaId);
}

"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puoAmministrazione, registra as registraLog } from "@/lib/amministrazione/server";
import { leggiFileFatture, chiaveFattura } from "@/lib/fatture/fatturapa";
import { importaFattura, registraFattura, riapriFattura, ordiniCitati, type EsitoImport } from "@/lib/fatture/server";
import { abbinaRighe, leggiQuantita } from "@/lib/magazzino/calcoli";
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

/** Fattura da PDF (o cartacea) inserita a mano: testata, importi e, se c'è, il PDF. */
export async function creaFatturaManuale(fd: FormData) {
  const u = await utente();
  const fornitoreId = str(fd, "fornitoreId");
  const forn = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { id: true, ragioneSociale: true, partitaIva: true } }) : null;
  const fornitoreNome = forn?.ragioneSociale ?? str(fd, "fornitoreNome");
  const numero = str(fd, "numero"), d = data(fd, "data");
  if (!fornitoreNome || !numero || !d) throw new Error("Servono fornitore, numero e data della fattura.");
  const imponibile = num(fd, "imponibile") ?? 0, iva = num(fd, "iva") ?? 0;
  const totale = num(fd, "totale") ?? cent(imponibile + iva);
  const tipo = str(fd, "tipoDocumento") ?? "TD01";
  const segno = tipo === "TD04" ? -1 : 1;
  const chiave = chiaveFattura(forn?.partitaIva ?? null, fornitoreNome, tipo, numero, d.toISOString());
  const doppia = await prisma.fatturaAcquisto.findUnique({ where: { chiave }, select: { id: true } });
  if (doppia) redirect(`/amministrazione/fatture-acquisto/${doppia.id}`);
  const scad = data(fd, "scadenza");
  const f = await prisma.fatturaAcquisto.create({
    data: {
      chiave, fornitoreId: forn?.id ?? null, fornitoreNome, partitaIva: forn?.partitaIva ?? null, tipoDocumento: tipo, numero, data: d,
      imponibile: cent(segno * Math.abs(imponibile)), iva: cent(segno * Math.abs(iva)), totale: cent(segno * Math.abs(totale)), divisione: str(fd, "divisione"), origine: "PDF", creatoDaNome: u.nome,
      scadenzePreviste: scad ? [{ data: scad.toISOString().slice(0, 10), importo: Math.abs(totale), modalita: null }] : undefined,
      righe: { create: [{ posizione: 1, descrizione: str(fd, "descrizione") ?? "Totale fattura", importo: cent(segno * Math.abs(imponibile)), commessaId: str(fd, "commessaId") }] },
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

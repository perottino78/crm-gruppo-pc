"use server";

// Fatture di vendita (fatte in BConsole): caricamento XML, inserimento a mano, collegamento a cliente e commessa.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoAmministrazione, registra as registraLog } from "@/lib/amministrazione/server";
import { leggiFileFatture } from "@/lib/fatture/fatturapa";
import { importaFatturaVendita, creaScadenzeVendita, type EsitoVendita } from "@/lib/fatture/vendite";
import { leggiQuantita } from "@/lib/magazzino/calcoli";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const num = (fd: FormData, k: string) => leggiQuantita(str(fd, k));
const cent = (n: number) => Math.round(n * 100) / 100;

async function utente() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoAmministrazione(u)) throw new Error("Area riservata all'amministrazione.");
  return u;
}
function aggiorna(id?: string) {
  revalidatePath("/amministrazione/fatture-vendita");
  revalidatePath("/amministrazione/scadenzario");
  if (id) revalidatePath(`/amministrazione/fatture-vendita/${id}`);
}

/** "C2026-012 · ROSSI MARIO" → commessa; "ROSSI MARIO" → cliente (nome esatto dall'elenco). */
async function commessaDaTesto(t: string | null) {
  const m = t ? /^\s*C(20\d{2})-(\d{1,5})/i.exec(t) : null;
  return m ? prisma.commessa.findUnique({ where: { anno_numero: { anno: Number(m[1]), numero: Number(m[2]) } }, select: { id: true, clienteId: true, cliente: { select: { nome: true } }, brand: { select: { nome: true } } } }) : null;
}
async function clienteDaTesto(t: string | null) {
  return t ? prisma.cliente.findFirst({ where: { nome: { equals: t.trim(), mode: "insensitive" } }, select: { id: true, nome: true } }) : null;
}

export type EsitoCaricamentoVendite = { ok: boolean; messaggio: string; voci: EsitoVendita[] };

/** Carica gli XML (o lo zip) delle fatture emesse in BConsole. */
export async function caricaFattureVendita(_: EsitoCaricamentoVendite | null, fd: FormData): Promise<EsitoCaricamentoVendite> {
  const u = await getCurrentUser();
  if (!u || !puoAmministrazione(u)) return { ok: false, messaggio: "Non autorizzato.", voci: [] };
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, messaggio: "Scegli almeno un file XML, P7M o ZIP.", voci: [] };
  const voci: EsitoVendita[] = [];
  for (const f of files) {
    if (f.size > 20 * 1024 * 1024) { voci.push({ stato: "ERRORE", titolo: f.name, messaggio: "File oltre 20 MB." }); continue; }
    let letti;
    try { letti = leggiFileFatture(f.name, Buffer.from(await f.arrayBuffer())); }
    catch (e) { voci.push({ stato: "ERRORE", titolo: f.name, messaggio: (e as Error).message }); continue; }
    if (!letti.length) voci.push({ stato: "ERRORE", titolo: f.name, messaggio: "Nessuna fattura trovata nel file." });
    for (const l of letti) {
      if (l.errore) { voci.push({ stato: "ERRORE", titolo: l.nome, messaggio: l.errore }); continue; }
      for (const fat of l.fatture) {
        try { voci.push(await importaFatturaVendita(fat, { xml: l.xml, origine: "XML", creatoDaNome: u.nome })); }
        catch (e) { voci.push({ stato: "ERRORE", titolo: l.nome, messaggio: (e as Error).message.slice(0, 200) }); }
      }
    }
  }
  const nuove = voci.filter((v) => v.stato === "NUOVA").length, doppie = voci.filter((v) => v.stato === "DOPPIA").length, errori = voci.filter((v) => v.stato === "ERRORE").length;
  if (nuove) await registraLog("FATTURA_VENDITA", null, "IMPORTAZIONE_XML", `${nuove} nuove, ${doppie} già presenti, ${errori} errori`, u.nome);
  aggiorna();
  return { ok: nuove > 0, messaggio: `${nuove} fatture caricate${doppie ? `, ${doppie} già presenti` : ""}${errori ? `, ${errori} non lette` : ""}.`, voci };
}

/** Fattura di vendita inserita a mano (es. non presente negli XML). */
export async function creaFatturaVenditaManuale(fd: FormData) {
  const u = await utente();
  const numero = str(fd, "numero"), data = str(fd, "data");
  if (!numero || !data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) redirect(`/amministrazione/fatture-vendita?errore=${encodeURIComponent("Servono numero e data della fattura.")}`);
  const comm = await commessaDaTesto(str(fd, "commessa"));
  const cli = comm ? { id: comm.clienteId, nome: comm.cliente.nome } : await clienteDaTesto(str(fd, "cliente"));
  const nomeCliente = cli?.nome ?? str(fd, "cliente");
  if (!nomeCliente) redirect(`/amministrazione/fatture-vendita?errore=${encodeURIComponent("Scegli il cliente (o la commessa).")}`);
  const imponibile = num(fd, "imponibile") ?? 0, iva = num(fd, "iva") ?? 0;
  const totale = num(fd, "totale") ?? cent(imponibile + iva);
  const tipo = str(fd, "tipoDocumento") ?? "TD01";
  const nota = tipo === "TD04";
  const r = await importaFatturaVendita({
    fornitore: { denominazione: "P&C", partitaIva: null, codiceFiscale: null, indirizzo: null, cap: null, comune: null, provincia: null, email: null },
    cliente: { denominazione: nomeCliente!, partitaIva: null, codiceFiscale: null, indirizzo: null, comune: null },
    tipoDocumento: tipo, notaCredito: nota, numero: numero!, data: data!, divisa: "EUR", totale, imponibile, iva, causale: str(fd, "note") ?? "",
    righe: [], scadenze: str(fd, "scadenza") ? [{ data: str(fd, "scadenza"), importo: totale, modalita: null }] : [], ddt: [], ordini: [],
  }, { xml: null, origine: "MANUALE", creatoDaNome: u.nome });
  if (r.stato === "ERRORE") redirect(`/amministrazione/fatture-vendita?errore=${encodeURIComponent(r.messaggio ?? "Errore")}`);
  if (r.stato === "NUOVA" && r.id) {
    await prisma.fatturaVendita.update({
      where: { id: r.id },
      data: { clienteId: cli?.id ?? undefined, commessaId: comm?.id ?? undefined, brand: str(fd, "brand") ?? comm?.brand.nome ?? undefined, detrazione: fd.get("detrazione") === "on", divisione: str(fd, "divisione") ?? "P&C" },
    });
    // scadenza con la data scelta (la manuale non ha XML: una sola rata)
    const sc = str(fd, "scadenza");
    if (sc) await prisma.scadenza.updateMany({ where: { chiaveImport: `FV:${r.id}:0` }, data: { dataScadenza: new Date(`${sc}T12:00:00Z`) } });
  }
  aggiorna(r.id);
  redirect(`/amministrazione/fatture-vendita/${r.id}`);
}

/** Collega cliente e commessa, marchio, detrazione, note. */
export async function salvaFatturaVendita(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaVendita.findUnique({ where: { id } }) : null;
  if (!f) return;
  const comm = await commessaDaTesto(str(fd, "commessa"));
  if (str(fd, "commessa") && !comm) redirect(`/amministrazione/fatture-vendita/${f.id}?errore=${encodeURIComponent("Commessa non trovata: sceglila dall'elenco mentre scrivi.")}`);
  const cli = comm ? { id: comm.clienteId, nome: comm.cliente.nome } : await clienteDaTesto(str(fd, "cliente"));
  if (str(fd, "cliente") && !cli && !comm) redirect(`/amministrazione/fatture-vendita/${f.id}?errore=${encodeURIComponent("Cliente non trovato: sceglilo dall'elenco mentre scrivi.")}`);
  const commessaPrima = f.commessaId;
  await prisma.fatturaVendita.update({
    where: { id: f.id },
    data: {
      clienteId: cli?.id ?? (str(fd, "cliente") ? f.clienteId : null), commessaId: comm?.id ?? null,
      brand: str(fd, "brand"), detrazione: fd.get("detrazione") === "on", note: str(fd, "note"), sezionale: str(fd, "sezionale"),
    },
  });
  await prisma.scadenza.updateMany({ where: { fatturaVenditaId: f.id, origine: "FATTURA_VENDITA" }, data: { clienteId: cli?.id ?? f.clienteId, brand: str(fd, "brand") ?? f.divisione } });
  // nuova commessa e nessun incasso ancora registrato: le scadenze si rifanno (così si agganciano all'acconto/saldo della commessa)
  if (comm && comm.id !== commessaPrima) {
    const scad = await prisma.scadenza.findMany({ where: { chiaveImport: { startsWith: `FV:${f.id}:` } }, include: { abbinamenti: { select: { id: true } } } });
    if (!scad.some((s) => s.abbinamenti.length || s.pagatoManuale > 0 || s.ritenuta > 0)) {
      await prisma.$transaction(async (tx) => { await tx.scadenza.deleteMany({ where: { id: { in: scad.map((s) => s.id) } } }); await creaScadenzeVendita(tx, f.id); });
    }
  }
  await registraLog("FATTURA_VENDITA", f.id, "MODIFICATA", `Fattura ${f.numero} — ${cli?.nome ?? f.clienteNome}`, u.nome);
  aggiorna(f.id);
  redirect(`/amministrazione/fatture-vendita/${f.id}?ok=${encodeURIComponent("Salvato.")}`);
}

/** Elimina una fattura caricata per errore (solo senza incassi). */
export async function eliminaFatturaVendita(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const f = id ? await prisma.fatturaVendita.findUnique({ where: { id } }) : null;
  if (!f) return;
  const scad = await prisma.scadenza.findMany({ where: { fatturaVenditaId: f.id }, include: { abbinamenti: { select: { id: true } } } });
  const proprie = scad.filter((s) => s.chiaveImport?.startsWith(`FV:${f.id}:`));
  if (proprie.some((s) => s.abbinamenti.length || s.pagatoManuale > 0 || s.ritenuta > 0))
    redirect(`/amministrazione/fatture-vendita/${f.id}?errore=${encodeURIComponent("Ha già incassi registrati: annullali prima di eliminarla.")}`);
  await prisma.$transaction([
    prisma.scadenza.deleteMany({ where: { id: { in: proprie.map((s) => s.id) } } }),
    prisma.scadenza.updateMany({ where: { fatturaVenditaId: f.id }, data: { fatturaVenditaId: null } }),
    prisma.fatturaVendita.delete({ where: { id: f.id } }),
  ]);
  await registraLog("FATTURA_VENDITA", f.id, "ELIMINATA", `Fattura ${f.numero} — ${f.clienteNome}`, u.nome);
  aggiorna();
  redirect(`/amministrazione/fatture-vendita?ok=${encodeURIComponent(`Fattura ${f.numero} eliminata.`)}`);
}

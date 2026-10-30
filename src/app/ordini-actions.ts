"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { datiAcquisto, prossimoNumeroOrdine, puoGestireOrdini, datiPdfOrdine } from "@/lib/ordini/server";
import { numeroOrdine, statoDaArrivi } from "@/lib/ordini/calcoli";
import { pdfOrdineFornitore } from "@/lib/ordini/pdfOrdine";
import { verificaMaterialeCommessa } from "@/lib/magazzino/server";
import { configEmail, inviaEmail, linkMailto, emailValida } from "@/lib/ordini/email";

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function num(fd: FormData, k: string): number | null {
  const v = str(fd, k);
  if (v === null) return null;
  const n = Number(v.replace(/\./g, (m, i, t) => (t.includes(",") ? "" : m)).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
const data = (fd: FormData, k: string) => { const v = str(fd, k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : null; };

async function utente() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoGestireOrdini(u)) throw new Error("Non autorizzato a gestire gli ordini fornitori.");
  return u;
}
async function logCommessa(commessaId: string | null | undefined, testo: string, nome: string) {
  if (commessaId) await prisma.commessaEvento.create({ data: { commessaId, testo, utenteNome: nome } });
}
function aggiorna(ordineId?: string, commessaId?: string | null) {
  revalidatePath("/ordini-fornitori");
  if (ordineId) revalidatePath(`/ordini-fornitori/${ordineId}`);
  if (commessaId) revalidatePath(`/commesse/${commessaId}`);
}

/** Compila fornitore, codice e costo previsto sulle righe della commessa che non li hanno ancora. */
export async function applicaFornitoriPredefiniti(fd: FormData) {
  const u = await utente();
  const commessaId = str(fd, "commessaId");
  if (!commessaId) return;
  const righe = await prisma.rigaOrdine.findMany({ where: { commessaId, ordineFornitoreId: null, rigaPreventivoId: { not: null } } });
  const prev = await prisma.rigaPreventivo.findMany({ where: { id: { in: righe.map((r) => r.rigaPreventivoId!) } }, include: { prodotto: true } });
  const acq = await datiAcquisto(prev);
  let n = 0;
  for (const r of righe) {
    const a = acq.get(r.rigaPreventivoId!);
    if (!a) continue;
    const dati: Record<string, unknown> = {};
    if (!r.fornitoreId && a.fornitoreId) { dati.fornitoreId = a.fornitoreId; dati.fornitoreNome = a.fornitoreNome; }
    if (!r.codiceFornitore && a.codiceFornitore) dati.codiceFornitore = a.codiceFornitore;
    if (r.costoPrevisto === null && a.costoPrevisto !== null && (r.fornitoreId ?? a.fornitoreId) === a.fornitoreId) { dati.costoPrevisto = a.costoPrevisto; dati.scontoAcquisto = a.scontoAcquisto; }
    if (Object.keys(dati).length) { await prisma.rigaOrdine.update({ where: { id: r.id }, data: dati }); n++; }
  }
  if (n) await logCommessa(commessaId, `Fornitori predefiniti applicati a ${n} righe.`, u.nome);
  aggiorna(undefined, commessaId);
}

/** Crea l'ordine per un fornitore con tutte le righe della commessa assegnate a lui e non ancora ordinate. */
export async function creaOrdineDaCommessa(fd: FormData) {
  const u = await utente();
  const commessaId = str(fd, "commessaId"), fornitoreId = str(fd, "fornitoreId");
  if (!commessaId || !fornitoreId) return;
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: true, brand: true, preventivo: true } });
  if (!c) return;
  const righe = await prisma.rigaOrdine.findMany({ where: { commessaId, fornitoreId, ordineFornitoreId: null, ordinato: false } });
  if (!righe.length) return;
  const anno = new Date().getFullYear();
  const cl = c.cliente;
  const indirizzoCliente = [cl.indirizzo, cl.cap, cl.comune, cl.provincia ? `(${cl.provincia})` : null].filter(Boolean).join(" ");
  const ordine = await prisma.$transaction(async (tx) => {
    const numero = await prossimoNumeroOrdine(tx, anno);
    const o = await tx.ordineFornitore.create({
      data: {
        numero, anno, fornitoreId, commessaId, divisione: c.brand.nome, creatoDaNome: u.nome,
        clienteFinale: cl.nome + (indirizzoCliente ? ` - ${indirizzoCliente}` : ""),
        riferimento: `Commessa ${c.numero}/${c.anno}${c.preventivo?.oggetto ? ` - ${c.preventivo.oggetto}` : ""}`.slice(0, 200),
        indirizzoSpedizione: "Sede di Rosta, Corso Moncenisio 28",
      },
    });
    await tx.rigaOrdine.updateMany({ where: { id: { in: righe.map((r) => r.id) } }, data: { ordineFornitoreId: o.id } });
    return o;
  });
  await logCommessa(commessaId, `Creato ordine fornitore ${numeroOrdine(ordine)} (${righe.length} righe).`, u.nome);
  aggiorna(ordine.id, commessaId);
  redirect(`/ordini-fornitori/${ordine.id}`);
}

/** Ordine senza commessa (materiale a scorta, consumabili). */
export async function creaOrdineLibero(fd: FormData) {
  const u = await utente();
  const fornitoreId = str(fd, "fornitoreId");
  if (!fornitoreId) return;
  const anno = new Date().getFullYear();
  const o = await prisma.$transaction(async (tx) => {
    const numero = await prossimoNumeroOrdine(tx, anno);
    return tx.ordineFornitore.create({ data: { numero, anno, fornitoreId, divisione: str(fd, "divisione") ?? "P&C", creatoDaNome: u.nome, indirizzoSpedizione: "Sede di Rosta, Corso Moncenisio 28" } });
  });
  aggiorna(o.id);
  redirect(`/ordini-fornitori/${o.id}`);
}

export async function salvaTestataOrdine(fd: FormData) {
  await utente();
  const id = str(fd, "id");
  if (!id) return;
  const o = await prisma.ordineFornitore.update({
    where: { id },
    data: {
      consegnaRichiesta: data(fd, "consegnaRichiesta"), clienteFinale: str(fd, "clienteFinale"), indirizzoSpedizione: str(fd, "indirizzoSpedizione"),
      trasporto: str(fd, "trasporto"), riferimento: str(fd, "riferimento"), note: str(fd, "note"), divisione: str(fd, "divisione"),
    },
  });
  aggiorna(id, o.commessaId);
}

export async function salvaRigaOrdineFornitore(fd: FormData) {
  await utente();
  const id = str(fd, "rigaId");
  if (!id) return;
  const q = num(fd, "quantita");
  const r = await prisma.rigaOrdine.update({
    where: { id },
    data: {
      codice: str(fd, "codice"), codiceFornitore: str(fd, "codiceFornitore"), descrizione: str(fd, "descrizione") ?? "Riga",
      quantita: q !== null && q > 0 ? Math.round(q) : 1, um: str(fd, "um"), prezzoAcquisto: num(fd, "prezzoAcquisto"), scontoAcquisto: num(fd, "scontoAcquisto"), note: str(fd, "note"),
    },
  });
  aggiorna(r.ordineFornitoreId ?? undefined, r.commessaId);
}

export async function aggiungiRigaAOrdine(fd: FormData) {
  await utente();
  const ordineId = str(fd, "ordineId");
  const descrizione = str(fd, "descrizione");
  if (!ordineId || !descrizione) return;
  const o = await prisma.ordineFornitore.findUnique({ where: { id: ordineId }, include: { fornitore: true } });
  if (!o || !["BOZZA", "INVIATO", "CONFERMATO"].includes(o.stato)) return;
  const q = num(fd, "quantita");
  await prisma.rigaOrdine.create({
    data: {
      ordineFornitoreId: ordineId, commessaId: o.commessaId, descrizione, quantita: q && q > 0 ? Math.round(q) : 1, um: str(fd, "um"),
      codice: str(fd, "codice"), codiceFornitore: str(fd, "codiceFornitore"), prezzoAcquisto: num(fd, "prezzoAcquisto"), scontoAcquisto: num(fd, "scontoAcquisto") ?? o.fornitore.scontoFornitore,
      fornitoreId: o.fornitoreId, fornitoreNome: o.fornitore.ragioneSociale, ordinato: o.stato !== "BOZZA", ordinatoIl: o.stato !== "BOZZA" ? new Date() : null,
    },
  });
  aggiorna(ordineId, o.commessaId);
}

/** Toglie una riga dall'ordine: se viene da una commessa torna «da ordinare», se era aggiunta a mano viene eliminata. */
export async function togliRigaDaOrdine(fd: FormData) {
  const u = await utente();
  const id = str(fd, "rigaId");
  if (!id) return;
  const r = await prisma.rigaOrdine.findUnique({ where: { id }, include: { ordineFornitore: true } });
  if (!r?.ordineFornitore || r.ordineFornitore.stato !== "BOZZA") return;
  if (r.rigaPreventivoId) await prisma.rigaOrdine.update({ where: { id }, data: { ordineFornitoreId: null } });
  else await prisma.rigaOrdine.delete({ where: { id } });
  await logCommessa(r.commessaId, `Riga «${r.descrizione}» tolta dall'ordine ${numeroOrdine(r.ordineFornitore)}.`, u.nome);
  aggiorna(r.ordineFornitoreId!, r.commessaId);
}

async function segnaInviato(id: string, modalita: "EMAIL" | "MANUALE", a: string | null, nome: string) {
  const o = await prisma.ordineFornitore.update({ where: { id }, data: { stato: "INVIATO", inviatoIl: new Date(), inviatoA: a, inviatoDaNome: nome, modalitaInvio: modalita } });
  await prisma.rigaOrdine.updateMany({ where: { ordineFornitoreId: id, ordinato: false }, data: { ordinato: true, ordinatoIl: new Date(), ordinatoDaNome: nome } });
  await logCommessa(o.commessaId, `Ordine fornitore ${numeroOrdine(o)} inviato${a ? ` a ${a}` : ""} (${modalita === "EMAIL" ? "email dal CRM" : "inviato a mano"}).`, nome);
  aggiorna(id, o.commessaId);
}

export async function segnaOrdineInviatoAMano(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  if (!id) return;
  const o = await prisma.ordineFornitore.findUnique({ where: { id }, include: { righe: true } });
  if (!o || o.stato !== "BOZZA" || !o.righe.length) return;
  await segnaInviato(id, "MANUALE", str(fd, "a"), u.nome);
}

export type EsitoInvio = { ok: boolean; messaggio: string; mailto?: string };

/** Invia l'ordine per email con il PDF allegato. Se l'invio non è configurato restituisce il link mailto di riserva. */
export async function inviaOrdineEmail(id: string, destinatari: string, cc: string, oggetto: string, testo: string): Promise<EsitoInvio> {
  const u = await getCurrentUser();
  if (!u || !puoGestireOrdini(u)) return { ok: false, messaggio: "Non autorizzato." };
  const a = destinatari.split(/[,;\s]+/).filter(Boolean), copia = cc.split(/[,;\s]+/).filter(Boolean);
  if (!a.length || ![...a, ...copia].every(emailValida)) return { ok: false, messaggio: "Controlla gli indirizzi email." };
  const p = await datiPdfOrdine(id);
  if (!p) return { ok: false, messaggio: "Ordine non trovato." };
  if (!p.ordine.righe.length) return { ok: false, messaggio: "L'ordine non ha righe." };
  if (p.ordine.stato === "ANNULLATO") return { ok: false, messaggio: "L'ordine è annullato." };
  const cfg = configEmail();
  if (!cfg) return { ok: false, messaggio: "Invio automatico non ancora configurato: si apre la tua posta con il messaggio pronto. Allega il PDF scaricato e poi premi «Segna come inviato».", mailto: linkMailto({ a, cc: copia, oggetto, testo }) };
  const pdf = pdfOrdineFornitore(p.dati);
  const esito = await inviaEmail(cfg, { a, cc: copia, oggetto, testo, rispondiA: u.email ?? undefined, allegati: [{ nome: `Ordine ${p.dati.numero.replace("/", "-")} ${p.ordine.fornitore.ragioneSociale}.pdf`.replace(/[^\w.\- ]+/g, "_"), contenuto: pdf, mime: "application/pdf" }] });
  if (!esito.ok) return { ok: false, messaggio: esito.errore ?? "Invio non riuscito." };
  if (p.ordine.stato === "BOZZA") await segnaInviato(id, "EMAIL", a.join(", "), u.nome);
  else { await logCommessa(p.ordine.commessaId, `Ordine ${p.dati.numero} reinviato a ${a.join(", ")}.`, u.nome); aggiorna(id, p.ordine.commessaId); }
  return { ok: true, messaggio: `Ordine inviato a ${a.join(", ")}${copia.length ? ` (copia a ${copia.join(", ")})` : ""}.` };
}

export async function registraConfermaFornitore(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  if (!id) return;
  const prima = await prisma.ordineFornitore.findUnique({ where: { id }, include: { righe: true } });
  if (!prima || ["ANNULLATO", "BOZZA"].includes(prima.stato)) return;
  const consegna = data(fd, "consegnaConfermata");
  const o = await prisma.ordineFornitore.update({
    where: { id },
    data: { numeroConfermaFornitore: str(fd, "numeroConfermaFornitore"), consegnaConfermata: consegna, stato: prima.stato === "INVIATO" ? "CONFERMATO" : prima.stato },
  });
  await logCommessa(o.commessaId, `Ordine ${numeroOrdine(o)} confermato dal fornitore${o.numeroConfermaFornitore ? ` (conferma n. ${o.numeroConfermaFornitore})` : ""}${consegna ? `, consegna prevista ${consegna.toLocaleDateString("it-IT")}` : ""}.`, u.nome);
  aggiorna(id, o.commessaId);
}

/** Arrivo merce: le righe spuntate risultano arrivate; lo stato dell'ordine si aggiorna da solo. */
export async function registraArrivi(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  if (!id) return;
  const o = await prisma.ordineFornitore.findUnique({ where: { id }, include: { righe: true } });
  if (!o || ["ANNULLATO", "BOZZA"].includes(o.stato)) return;
  const arrivate = new Set(fd.getAll("arrivata").map(String));
  const ora = new Date();
  const nuove: string[] = [];
  for (const r of o.righe) {
    const arr = arrivate.has(r.id);
    if (arr === r.arrivato) continue;
    await prisma.rigaOrdine.update({ where: { id: r.id }, data: { arrivato: arr, arrivatoIl: arr ? ora : null, quantitaArrivata: arr ? Math.max(r.quantitaArrivata, r.quantita) : 0 } });
    if (arr) nuove.push(r.descrizione);
  }
  const stato = statoDaArrivi(o.stato, o.righe.map((r) => ({ arrivato: arrivate.has(r.id) })));
  await prisma.ordineFornitore.update({ where: { id }, data: { stato } });
  if (nuove.length) await logCommessa(o.commessaId, `Merce arrivata (ordine ${numeroOrdine(o)}): ${nuove.join("; ").slice(0, 400)}.${stato === "EVASO" ? " Ordine completo." : ""}`, u.nome);
  if (o.commessaId) await prisma.$transaction((tx) => verificaMaterialeCommessa(tx, o.commessaId!, u.nome));
  aggiorna(id, o.commessaId);
}

export async function annullaOrdine(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const motivo = str(fd, "motivo");
  if (!id) return;
  const o = await prisma.ordineFornitore.findUnique({ where: { id }, include: { righe: true } });
  if (!o || o.stato === "ANNULLATO") return;
  if (o.righe.some((r) => r.arrivato)) throw new Error("Ci sono righe già arrivate: togli prima la spunta di arrivo.");
  await prisma.$transaction([
    prisma.rigaOrdine.updateMany({ where: { ordineFornitoreId: id, rigaPreventivoId: { not: null } }, data: { ordineFornitoreId: null, ordinato: false, ordinatoIl: null, ordinatoDaNome: null } }),
    prisma.rigaOrdine.deleteMany({ where: { ordineFornitoreId: id, rigaPreventivoId: null } }),
    prisma.ordineFornitore.update({ where: { id }, data: { stato: "ANNULLATO", note: [o.note, `Annullato da ${u.nome}${motivo ? `: ${motivo}` : ""}`].filter(Boolean).join("\n") } }),
  ]);
  await logCommessa(o.commessaId, `Ordine fornitore ${numeroOrdine(o)} annullato${motivo ? ` (${motivo})` : ""}: le righe tornano da ordinare.`, u.nome);
  aggiorna(id, o.commessaId);
}

/** Fornitore predefinito sui modelli di listino (singolo o in blocco per famiglia). */
export async function salvaFornitoreModelli(fd: FormData) {
  await utente();
  const ids = fd.getAll("modelloId").map(String).filter(Boolean);
  if (!ids.length) return;
  const scelta = str(fd, "fornitoreId");
  const fornitoreId = scelta === "__nessuno__" ? null : scelta;
  const dati: { fornitoreId: string | null; codiceFornitore?: string | null; scontoAcquisto?: number | null } = { fornitoreId };
  if (ids.length === 1) { dati.codiceFornitore = str(fd, "codiceFornitore"); dati.scontoAcquisto = num(fd, "scontoAcquisto"); }
  const r = await prisma.modelloProdotto.updateMany({ where: { id: { in: ids } }, data: dati });
  revalidatePath("/prodotti/fornitori");
  // torna alla stessa pagina (filtri compresi) con la conferma di cosa è stato salvato
  const ritorno = str(fd, "ritorno");
  if (ritorno?.startsWith("?")) {
    const nome = fornitoreId ? (await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { ragioneSociale: true } }))?.ragioneSociale : null;
    const testo = `${r.count === 1 ? "1 modello" : `${r.count} modelli`} → ${nome ?? "senza fornitore"}`;
    redirect(`/prodotti/fornitori${ritorno}${ritorno.length > 1 ? "&" : ""}fatto=${encodeURIComponent(testo)}`);
  }
}

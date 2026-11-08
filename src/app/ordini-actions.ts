"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { datiAcquisto, prossimoNumeroOrdine, puoGestireOrdini, datiPdfOrdine, fileRilievo, EMAIL_ORDINI } from "@/lib/ordini/server";
import { inviaMail } from "@/lib/mail/invio";
import { numeroOrdine, statoDaArrivi } from "@/lib/ordini/calcoli";
import { pdfOrdineFornitore, senzaPrezzi } from "@/lib/ordini/pdfOrdine";
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
  const righe = await prisma.rigaOrdine.findMany({ where: { commessaId, fornitoreId, ordineFornitoreId: null, ordinato: false }, select: { id: true } });
  if (!righe.length) return;
  const ordine = await nuovoOrdineConRighe(u.nome, commessaId, fornitoreId, righe.map((r) => r.id));
  if (!ordine) return;
  redirect(`/ordini-fornitori/${ordine.id}`);
}

/** Crea l'ordine al fornitore con le righe della commessa indicate (testata dai dati del cliente e della commessa). */
async function nuovoOrdineConRighe(nome: string, commessaId: string, fornitoreId: string, idRighe: string[]) {
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: true, brand: true, preventivo: true } });
  if (!c || !idRighe.length) return null;
  const anno = new Date().getFullYear();
  const cl = c.cliente;
  const indirizzoCliente = [cl.indirizzo, cl.cap, cl.comune, cl.provincia ? `(${cl.provincia})` : null].filter(Boolean).join(" ");
  const ordine = await prisma.$transaction(async (tx) => {
    const numero = await prossimoNumeroOrdine(tx, anno);
    const o = await tx.ordineFornitore.create({
      data: {
        numero, anno, fornitoreId, commessaId, divisione: c.brand.nome, creatoDaNome: nome,
        clienteFinale: cl.nome + (indirizzoCliente ? ` - ${indirizzoCliente}` : ""),
        riferimento: `Commessa ${c.numero}/${c.anno}${c.preventivo?.oggetto ? ` - ${c.preventivo.oggetto}` : ""}`.slice(0, 200),
        indirizzoSpedizione: "Sede di Rosta, Corso Moncenisio 28",
      },
    });
    await tx.rigaOrdine.updateMany({ where: { id: { in: idRighe } }, data: { ordineFornitoreId: o.id } });
    return o;
  });
  await logCommessa(commessaId, `Creato ordine fornitore ${numeroOrdine(ordine)} (${idRighe.length} righe).`, nome);
  aggiorna(ordine.id, commessaId);
  return ordine;
}

/**
 * Dal rilievo (come «Crea → Ordine fornitore» dell'ordine cliente in BConsole): le righe spuntate dello stesso fornitore
 * diventano un ordine in bozza, pronto da inviare con la lista senza prezzi e il rilievo allegato.
 */
export async function creaOrdineDaRighe(fd: FormData) {
  const u = await utente();
  const commessaId = str(fd, "commessaId");
  if (!commessaId) return;
  const torna = (avviso: string) => redirect(`/commesse/${commessaId}?avviso=${encodeURIComponent(avviso)}#materiale-pratica`);
  const ids = [...new Set(fd.getAll("riga").map(String))];
  if (!ids.length) torna("Spunta le righe da ordinare.");
  const righe = await prisma.rigaOrdine.findMany({ where: { id: { in: ids }, commessaId, ordineFornitoreId: null, ordinato: false, daMagazzino: false } });
  if (!righe.length) torna("Le righe spuntate sono già in un ordine.");
  const scelto = str(fd, "fornitoreId");
  const loro = [...new Set(righe.map((r) => r.fornitoreId).filter(Boolean))] as string[];
  if (!scelto && loro.length !== 1) torna(loro.length ? "Le righe spuntate sono di fornitori diversi: spunta quelle di un solo fornitore o scegli il fornitore." : "Scegli il fornitore.");
  if (!scelto && righe.some((r) => !r.fornitoreId)) torna("Alcune righe spuntate non hanno il fornitore: sceglilo nella tendina.");
  const fornitoreId = scelto ?? loro[0];
  const f = await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { id: true, ragioneSociale: true, scontoFornitore: true } });
  if (!f) torna("Fornitore non trovato.");
  // righe di un altro fornitore (o senza): passano al fornitore scelto, senza i prezzi del vecchio
  for (const r of righe.filter((x) => x.fornitoreId !== fornitoreId)) {
    await prisma.rigaOrdine.update({ where: { id: r.id }, data: { fornitoreId, fornitoreNome: f!.ragioneSociale, ...(r.fornitoreId ? { prezzoAcquisto: null, codiceFornitore: null, costoPrevisto: null, scontoAcquisto: f!.scontoFornitore ?? null } : {}) } });
  }
  const ordine = await nuovoOrdineConRighe(u.nome, commessaId, fornitoreId, righe.map((r) => r.id));
  if (!ordine) torna("Ordine non creato.");
  redirect(`/ordini-fornitori/${ordine!.id}#invia`);
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

/**
 * Prima dell'invio: sposta una riga a un altro fornitore (non disponibile dal solito, o più conveniente).
 * La riga va nella bozza già aperta per quel fornitore e quella commessa, altrimenti in un nuovo ordine con gli stessi dati.
 * Prezzo e codice del vecchio fornitore non valgono per il nuovo: si azzerano e si applica lo sconto del nuovo fornitore.
 * Il fornitore predefinito del prodotto non cambia.
 */
export async function spostaRigaAFornitore(fd: FormData) {
  const u = await utente();
  const rigaId = str(fd, "rigaId"), fornitoreId = str(fd, "nuovoFornitoreId");
  if (!rigaId || !fornitoreId) return;
  const r = await prisma.rigaOrdine.findUnique({ where: { id: rigaId }, include: { ordineFornitore: true } });
  const da = r?.ordineFornitore;
  if (!r || !da) return;
  if (da.stato !== "BOZZA") redirect(`/ordini-fornitori/${da.id}?errore=${encodeURIComponent("L'ordine è già stato inviato: per cambiare fornitore annullalo o togli la riga.")}`);
  if (da.fornitoreId === fornitoreId) return;
  const f = await prisma.soggetto.findUnique({ where: { id: fornitoreId } });
  if (!f) return;
  const { verso, nuovo } = await prisma.$transaction(async (tx) => {
    // per una commessa si riusa la bozza già aperta per quel fornitore; un ordine senza commessa ne apre sempre uno nuovo
    let verso = da.commessaId ? await tx.ordineFornitore.findFirst({ where: { fornitoreId, stato: "BOZZA", commessaId: da.commessaId }, orderBy: { createdAt: "desc" } }) : null;
    let nuovo = false;
    if (!verso) {
      const numero = await prossimoNumeroOrdine(tx, da.anno);
      verso = await tx.ordineFornitore.create({
        data: {
          numero, anno: da.anno, fornitoreId, commessaId: da.commessaId, divisione: da.divisione, creatoDaNome: u.nome,
          clienteFinale: da.clienteFinale, riferimento: da.riferimento, indirizzoSpedizione: da.indirizzoSpedizione,
          consegnaRichiesta: da.consegnaRichiesta, trasporto: da.trasporto,
        },
      });
      nuovo = true;
    }
    await tx.rigaOrdine.update({
      where: { id: r.id },
      data: { ordineFornitoreId: verso.id, fornitoreId, fornitoreNome: f.ragioneSociale, codiceFornitore: null, prezzoAcquisto: null, costoPrevisto: null, scontoAcquisto: f.scontoFornitore ?? null },
    });
    return { verso, nuovo };
  });
  // la bozza rimasta vuota non serve più
  const rimaste = await prisma.rigaOrdine.count({ where: { ordineFornitoreId: da.id } });
  const docs = rimaste ? 1 : await prisma.documento.count({ where: { entita: "ORDINE_FORNITORE", entitaId: da.id } });
  if (!rimaste && !docs) await prisma.ordineFornitore.delete({ where: { id: da.id } });
  await logCommessa(da.commessaId, `Riga «${r.descrizione}» spostata da ${r.fornitoreNome ?? "?"} (ordine ${numeroOrdine(da)}) a ${f.ragioneSociale} (ordine ${numeroOrdine(verso)}${nuovo ? ", nuovo" : ""}).`, u.nome);
  aggiorna(verso.id, da.commessaId);
  revalidatePath(`/ordini-fornitori/${da.id}`);
  const msg = `«${r.descrizione}» spostata a ${f.ragioneSociale} nell'ordine ${numeroOrdine(verso)}${nuovo ? " (nuovo)" : ""}: controlla prezzo e codice del fornitore.`;
  redirect(rimaste || docs ? `/ordini-fornitori/${da.id}?ok=${encodeURIComponent(msg)}` : `/ordini-fornitori/${verso.id}?ok=${encodeURIComponent(msg + " L'ordine di prima era vuoto ed è stato eliminato.")}`);
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

/**
 * Invia l'ordine per email con il PDF allegato, dalla casella dell'ufficio ordini (ordini@gruppopec.com: le conferme del
 * fornitore tornano lì). Come in BConsole: lista prodotti senza prezzi e rilievo della pratica allegato, se scelti.
 * Se la posta non è configurata restituisce il link mailto di riserva.
 */
export async function inviaOrdineEmail(id: string, destinatari: string, cc: string, oggetto: string, testo: string, opz: { senzaPrezzi?: boolean; conRilievo?: boolean } = {}): Promise<EsitoInvio> {
  const u = await getCurrentUser();
  if (!u || !puoGestireOrdini(u)) return { ok: false, messaggio: "Non autorizzato." };
  const a = destinatari.split(/[,;\s]+/).filter(Boolean), copia = cc.split(/[,;\s]+/).filter(Boolean);
  if (!a.length || ![...a, ...copia].every(emailValida)) return { ok: false, messaggio: "Controlla gli indirizzi email." };
  const p = await datiPdfOrdine(id);
  if (!p) return { ok: false, messaggio: "Ordine non trovato." };
  if (!p.ordine.righe.length) return { ok: false, messaggio: "L'ordine non ha righe." };
  if (p.ordine.stato === "ANNULLATO") return { ok: false, messaggio: "L'ordine è annullato." };
  const pdf = pdfOrdineFornitore(opz.senzaPrezzi ? senzaPrezzi(p.dati) : p.dati);
  const rilievo = opz.conRilievo ? await fileRilievo(p.ordine.commessaId) : [];
  const allegati = [
    { nome: `Ordine ${p.dati.numero.replace("/", "-")} ${p.ordine.fornitore.ragioneSociale}.pdf`.replace(/[^\w.\- ]+/g, "_"), contenuto: Buffer.from(pdf), mime: "application/pdf" },
    ...rilievo.map((f) => ({ nome: f.nome, contenuto: f.contenuto, mime: f.mime })),
  ];
  const ordini = EMAIL_ORDINI();
  const casellaOrdini = await prisma.utente.findFirst({ where: { email: { equals: ordini, mode: "insensitive" } }, select: { id: true } });
  const esito = await inviaMail({ a, cc: copia, oggetto, testo, da: `Ufficio ordini ${p.dati.azienda.ragioneSociale} <${ordini}>`, rispondiA: ordini, daUtenteId: casellaOrdini?.id, allegati });
  let da = esito.da ?? ordini;
  if (!esito.inviata) {
    // riserva: servizio di invio via API, se configurato su Vercel
    const cfg = configEmail();
    if (!cfg) return { ok: false, messaggio: `Invio automatico non riuscito (${esito.motivo ?? "posta non configurata"}): si apre la tua posta con il messaggio pronto. Allega il PDF scaricato${rilievo.length ? " e il rilievo" : ""} e poi premi «Segna come inviato».`, mailto: linkMailto({ a, cc: copia, oggetto, testo }) };
    const e2 = await inviaEmail(cfg, { a, cc: copia, oggetto, testo, rispondiA: ordini, allegati: allegati.map((x) => ({ nome: x.nome, contenuto: new Uint8Array(x.contenuto), mime: x.mime })) });
    if (!e2.ok) return { ok: false, messaggio: e2.errore ?? "Invio non riuscito." };
    da = cfg.mittente;
  }
  const cosa = `${opz.senzaPrezzi ? "lista senza prezzi" : "con i prezzi"}${rilievo.length ? `, rilievo allegato (${rilievo.length} file)` : ""}`;
  if (p.ordine.stato === "BOZZA") { await segnaInviato(id, "EMAIL", a.join(", "), u.nome); await logCommessa(p.ordine.commessaId, `Ordine ${p.dati.numero} inviato da ${da} (${cosa}).`, u.nome); }
  else { await logCommessa(p.ordine.commessaId, `Ordine ${p.dati.numero} reinviato a ${a.join(", ")} da ${da} (${cosa}).`, u.nome); aggiorna(id, p.ordine.commessaId); }
  return { ok: true, messaggio: `Ordine inviato a ${a.join(", ")}${copia.length ? ` (copia a ${copia.join(", ")})` : ""} da ${da}: ${cosa}. Le conferme del fornitore arriveranno a ${ordini}.` };
}

export async function registraConfermaFornitore(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  if (!id) return;
  const prima = await prisma.ordineFornitore.findUnique({ where: { id }, include: { righe: true } });
  if (!prima || ["ANNULLATO", "BOZZA"].includes(prima.stato)) return;
  const consegna = data(fd, "consegnaConfermata");
  // totale imponibile della conferma: diventa il costo della commessa per questo ordine (finché non arriva la fattura)
  const totale = num(fd, "totaleConfermato");
  const totaleCambiato = totale !== prima.totaleConfermato;
  const o = await prisma.ordineFornitore.update({
    where: { id },
    data: {
      numeroConfermaFornitore: str(fd, "numeroConfermaFornitore"), consegnaConfermata: consegna, stato: prima.stato === "INVIATO" ? "CONFERMATO" : prima.stato,
      ...(totaleCambiato ? { totaleConfermato: totale !== null && totale >= 0 ? Math.round(totale * 100) / 100 : null, totaleConfermatoIl: totale !== null ? new Date() : null, totaleConfermatoDaNome: totale !== null ? u.nome : null } : {}),
    },
  });
  await logCommessa(o.commessaId, `Ordine ${numeroOrdine(o)} confermato dal fornitore${o.numeroConfermaFornitore ? ` (conferma n. ${o.numeroConfermaFornitore})` : ""}${consegna ? `, consegna prevista ${consegna.toLocaleDateString("it-IT")}` : ""}${totaleCambiato && o.totaleConfermato !== null ? `: totale confermato ${o.totaleConfermato.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} caricato nei costi della commessa` : ""}.`, u.nome);
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

"use server";

// Schede di produzione in HTML per il fornitore: modelli (editor) e compilazione sull'ordine con le misure definitive.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { numeroOrdine } from "@/lib/ordini/calcoli";
import { descriviCampi, compilaScheda, tabellaRighe } from "@/lib/ordini/scheda-produzione";
import { PREFISSO_LEGNO, PREZZO_M3_INDICATIVO, righeDaValori } from "@/lib/ordini/legno";
import { PREFISSO_ANGOLARI, righeDaAngolari } from "@/lib/ordini/angolari";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

async function addetto() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoGestireOrdini(u)) throw new Error("Non autorizzato.");
  return u;
}

export async function salvaModelloScheda(fd: FormData) {
  const u = await addetto();
  const id = str(fd, "id"), nome = str(fd, "nome"), html = typeof fd.get("html") === "string" ? (fd.get("html") as string) : "";
  if (!nome || !html.trim()) redirect(`/ordini-fornitori/schede?errore=${encodeURIComponent("Servono il nome e il testo HTML.")}${id ? `&modifica=${id}` : "&nuovo=1"}`);
  const dati = { nome, html, fornitoreId: str(fd, "fornitoreId"), attivo: fd.get("attivo") !== "0" };
  const m = id ? await prisma.schedaProduzioneModello.update({ where: { id }, data: dati }) : await prisma.schedaProduzioneModello.create({ data: { ...dati, creatoDaNome: u.nome } });
  revalidatePath("/ordini-fornitori/schede");
  redirect(`/ordini-fornitori/schede?salvato=${m.id}`);
}

export async function eliminaModelloScheda(fd: FormData) {
  await addetto();
  const id = str(fd, "id");
  if (id) await prisma.schedaProduzioneModello.deleteMany({ where: { id } });
  revalidatePath("/ordini-fornitori/schede");
  redirect("/ordini-fornitori/schede?eliminato=1");
}

/** Compila il modello con i dati dell'ordine e le misure inserite, e lo salva tra i documenti della pratica («Schede produzione»): si allega poi all'invio dell'ordine. */
export async function creaSchedaProduzione(fd: FormData) {
  const u = await addetto();
  const ordineId = str(fd, "ordineId"), modelloId = str(fd, "modelloId");
  if (!ordineId || !modelloId) return;
  const ok = await compilaESalva(ordineId, modelloId, fd, u.nome, false);
  if (!ok) return;
  revalidatePath(`/ordini-fornitori/${ordineId}`);
  redirect(`/ordini-fornitori/${ordineId}?ok=${encodeURIComponent("Scheda di produzione creata: la trovi tra i documenti da allegare all'invio dell'ordine (cartella «Schede produzione»).")}#scheda-produzione`);
}

async function compilaESalva(ordineId: string, modelloId: string, fd: FormData, chi: string, sostituisci: boolean) {
  const [o, m] = await Promise.all([
    prisma.ordineFornitore.findUnique({ where: { id: ordineId }, include: { fornitore: true, commessa: { include: { cliente: true } }, righe: { orderBy: { createdAt: "asc" } } } }),
    prisma.schedaProduzioneModello.findUnique({ where: { id: modelloId } }),
  ]);
  if (!o || !m) return false;
  const rilievi = o.commessaId ? await prisma.rilievo.findMany({ where: { commessaId: o.commessaId, misure: { not: null } }, orderBy: { dataOra: "asc" }, select: { misure: true } }) : [];
  const valori: Record<string, string> = {
    ordine: numeroOrdine(o), data: o.dataOrdine.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }), fornitore: o.fornitore.ragioneSociale,
    cliente: o.clienteFinale ?? o.commessa?.cliente.nome ?? "", commessa: o.commessa ? `${o.commessa.numero}/${o.commessa.anno}` : "",
    indirizzo: o.indirizzoSpedizione ?? "", consegna: o.consegnaRichiesta ? o.consegnaRichiesta.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "",
    misure_rilievo: rilievi.map((r) => r.misure).join("\n\n"),
  };
  for (const c of descriviCampi(m.html)) {
    // scelte multiple: più valori con lo stesso nome, uniti da «|»
    valori[c.nome] = c.tipo === "multi" ? fd.getAll(`campo_${c.nome}`).filter((x): x is string => typeof x === "string").join("|") : typeof fd.get(`campo_${c.nome}`) === "string" ? (fd.get(`campo_${c.nome}`) as string) : "";
  }
  // colonne nuove dei moduli (es. misure e angolo degli angolari) anche se il modello salvato è di prima
  for (const [k, x] of fd.entries()) if (typeof x === "string" && k.startsWith("campo_tab_") && !(k.slice(6) in valori)) valori[k.slice(6)] = x;
  const html = compilaScheda(m.html, valori, tabellaRighe(o.righe.map((r) => ({ descrizione: r.descrizione, quantita: r.quantita, um: r.um, codice: r.codiceFornitore ?? r.codice, note: r.note }))));
  const contenuto = Buffer.from(html, "utf-8");
  const nome = `Scheda produzione ${numeroOrdine(o).replace("/", "-")} ${o.fornitore.ragioneSociale}.html`.replace(/[^\w.\- ]+/g, "_");
  const dove = o.commessaId ? { entita: "COMMESSA", entitaId: o.commessaId, cartella: "Schede produzione" } : { entita: "ORDINE_FORNITORE", entitaId: o.id, cartella: "Generale" };
  // dal pulsante del legno la scheda si aggiorna: quella vecchia con lo stesso nome va via (niente doppioni da allegare)
  if (sostituisci) await prisma.documento.deleteMany({ where: { ...dove, nome } });
  await prisma.documento.create({ data: { ...dove, nome, mime: "text/html", dimensione: contenuto.length, contenuto, caricatoDaNome: chi } });
  return true;
}

/**
 * «💾 Salva il legno nell'ordine» (richiesta di Ugo 20/11/2026): dal modulo del legno piallato le righe dell'ordine con i codici LEGNO-…
 * si riscrivono (una per sezione, prezzo a barra = sviluppo × prezzo al m³, articolo collegato) e la scheda per il fornitore si aggiorna,
 * così all'invio l'ordine ha già il totale dei legni e la scheda è tra gli allegati. Le righe già arrivate non si toccano.
 */
export async function salvaLegnoInOrdine(fd: FormData) {
  const u = await addetto();
  const ordineId = str(fd, "ordineId"), modelloId = str(fd, "modelloId");
  if (!ordineId) return;
  const torna = (p: Record<string, string>) => `/ordini-fornitori/${ordineId}?${new URLSearchParams({ ...(modelloId ? { scheda: modelloId } : {}), ...p })}#scheda-produzione`;
  const o = await prisma.ordineFornitore.findUnique({ where: { id: ordineId }, include: { fornitore: true } });
  if (!o) return;
  if (!["BOZZA", "INVIATO", "CONFERMATO"].includes(o.stato)) redirect(torna({ errore: "L'ordine è già arrivato o annullato: il legno non si può più cambiare." }));
  const valori: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && k.startsWith("campo_")) valori[k.slice(6)] = v;
  const prezzoM3 = Number((valori.prezzo_m3 ?? "").replace(",", ".")) || PREZZO_M3_INDICATIVO;
  const nuove = righeDaValori(valori, prezzoM3);
  const articoli = await prisma.articolo.findMany({ where: { codice: { in: nuove.map((r) => r.codice) } }, select: { id: true, codice: true } });
  const idArticolo = new Map(articoli.map((a) => [a.codice, a.id]));
  await prisma.$transaction([
    prisma.rigaOrdine.deleteMany({ where: { ordineFornitoreId: o.id, codice: { startsWith: PREFISSO_LEGNO }, arrivato: false, quantitaArrivata: 0 } }),
    prisma.rigaOrdine.createMany({
      data: nuove.map((r) => ({
        ordineFornitoreId: o.id, commessaId: o.commessaId, descrizione: r.descrizione, quantita: r.quantita, um: "pz", codice: r.codice,
        prezzoAcquisto: r.prezzo, scontoAcquisto: 0, articoloId: idArticolo.get(r.codice) ?? null, complemento: !!o.commessaId,
        fornitoreId: o.fornitoreId, fornitoreNome: o.fornitore.ragioneSociale, ordinato: o.stato !== "BOZZA", ordinatoIl: o.stato !== "BOZZA" ? new Date() : null,
      })),
    }),
  ]);
  if (modelloId) await compilaESalva(o.id, modelloId, fd, u.nome, true);
  const totale = Math.round(nuove.reduce((t, r) => t + r.prezzo * r.quantita, 0) * 100) / 100;
  revalidatePath(`/ordini-fornitori/${o.id}`);
  if (o.commessaId) revalidatePath(`/commesse/${o.commessaId}`);
  redirect(torna({ ok: nuove.length
    ? `Legno salvato nell'ordine: ${nuove.length} righe, ${nuove.reduce((t, r) => t + r.quantita, 0)} pezzi, totale ${totale.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${modelloId ? "; scheda per il fornitore aggiornata" : ""}.`
    : "Nessun pezzo nel modulo: le righe del legno sono state tolte dall'ordine." }));
}

/**
 * «💾 Salva gli angolari nell'ordine» (richiesta di Ugo 20/11/2026): come il legno, le righe ANGALL-… dell'ordine si riscrivono dal modulo
 * (una per riga, prezzo d'acquisto = costo di Il Mastro a barra) e la scheda per il fornitore si aggiorna. Le righe già arrivate non si toccano.
 */
export async function salvaAngolariInOrdine(fd: FormData) {
  const u = await addetto();
  const ordineId = str(fd, "ordineId"), modelloId = str(fd, "modelloId");
  if (!ordineId) return;
  const torna = (p: Record<string, string>) => `/ordini-fornitori/${ordineId}?${new URLSearchParams({ ...(modelloId ? { scheda: modelloId } : {}), ...p })}#scheda-produzione`;
  const o = await prisma.ordineFornitore.findUnique({ where: { id: ordineId }, include: { fornitore: true } });
  if (!o) return;
  if (!["BOZZA", "INVIATO", "CONFERMATO"].includes(o.stato)) redirect(torna({ errore: "L'ordine è già arrivato o annullato: gli angolari non si possono più cambiare." }));
  const valori: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && k.startsWith("campo_")) valori[k.slice(6)] = v;
  const nuove = righeDaAngolari(valori);
  await prisma.$transaction([
    prisma.rigaOrdine.deleteMany({ where: { ordineFornitoreId: o.id, codice: { startsWith: PREFISSO_ANGOLARI }, arrivato: false, quantitaArrivata: 0 } }),
    prisma.rigaOrdine.createMany({
      data: nuove.map((r) => ({
        ordineFornitoreId: o.id, commessaId: o.commessaId, descrizione: r.descrizione, quantita: r.quantita, um: "pz", codice: r.codice,
        prezzoAcquisto: r.prezzo, scontoAcquisto: 0, complemento: !!o.commessaId,
        fornitoreId: o.fornitoreId, fornitoreNome: o.fornitore.ragioneSociale, ordinato: o.stato !== "BOZZA", ordinatoIl: o.stato !== "BOZZA" ? new Date() : null,
      })),
    }),
  ]);
  if (modelloId) await compilaESalva(o.id, modelloId, fd, u.nome, true);
  const totale = Math.round(nuove.reduce((t, r) => t + r.prezzo * r.quantita, 0) * 100) / 100;
  revalidatePath(`/ordini-fornitori/${o.id}`);
  if (o.commessaId) revalidatePath(`/commesse/${o.commessaId}`);
  redirect(torna({ ok: nuove.length
    ? `Angolari salvati nell'ordine: ${nuove.length} righe, ${nuove.reduce((t, r) => t + r.quantita, 0)} pezzi, costo ${totale.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${modelloId ? "; scheda per il fornitore aggiornata" : ""}.`
    : "Nessun angolare nel modulo: le righe degli angolari sono state tolte dall'ordine." }));
}

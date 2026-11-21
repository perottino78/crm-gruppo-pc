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

/** Chi carica il rilievo (anche il tecnico) compila il modulo del fornitore: basta essere collegati. */
async function rilevatore() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
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

// ============ DAL «CARICA RILIEVO» DELLA PRATICA (Ugo 20/11/2026) ============
// Il modulo del fornitore si compila al rilievo, senza aspettare l'ordine: la scheda va nei documenti della pratica («Schede produzione»)
// e all'invio dell'ordine a quel fornitore è già lì, spuntata. Legno e angolari diventano materiale della pratica (complementi con costo).

async function compilaPerPratica(commessaId: string, modelloId: string, fd: FormData, chi: string) {
  const [c, m] = await Promise.all([
    prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: true } }),
    prisma.schedaProduzioneModello.findUnique({ where: { id: modelloId }, include: { fornitore: { select: { id: true, ragioneSociale: true } } } }),
  ]);
  if (!c || !m) return null;
  const [rilievi, righe] = await Promise.all([
    prisma.rilievo.findMany({ where: { commessaId, misure: { not: null } }, orderBy: { dataOra: "asc" }, select: { misure: true } }),
    prisma.rigaOrdine.findMany({ where: { commessaId, ordineFornitoreId: null, ...(m.fornitoreId ? { OR: [{ fornitoreId: m.fornitoreId }, { fornitoreId: null }] } : {}) }, orderBy: { createdAt: "asc" } }),
  ]);
  const it = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  const valori: Record<string, string> = {
    ordine: "da emettere", data: it(new Date()), fornitore: m.fornitore?.ragioneSociale ?? "", cliente: c.cliente.nome, commessa: `${c.numero}/${c.anno}`,
    indirizzo: "", consegna: c.consegnaPrevista ? it(c.consegnaPrevista) : "", misure_rilievo: rilievi.map((r) => r.misure).join("\n\n"),
  };
  for (const x of descriviCampi(m.html)) {
    valori[x.nome] = x.tipo === "multi" ? fd.getAll(`campo_${x.nome}`).filter((v): v is string => typeof v === "string").join("|") : typeof fd.get(`campo_${x.nome}`) === "string" ? (fd.get(`campo_${x.nome}`) as string) : "";
  }
  for (const [k, x] of fd.entries()) if (typeof x === "string" && k.startsWith("campo_tab_") && !(k.slice(6) in valori)) valori[k.slice(6)] = x;
  const html = compilaScheda(m.html, valori, tabellaRighe(righe.map((r) => ({ descrizione: r.descrizione, quantita: r.quantita, um: r.um, codice: r.codiceFornitore ?? r.codice, note: r.note }))));
  const contenuto = Buffer.from(html, "utf-8");
  const nome = `Scheda produzione ${m.nome}${m.fornitore ? ` - ${m.fornitore.ragioneSociale}` : ""} - ${c.numero}-${c.anno}.html`.replace(/[^\w.\- ]+/g, "_");
  const dove = { entita: "COMMESSA", entitaId: commessaId, cartella: "Schede produzione" };
  await prisma.documento.deleteMany({ where: { ...dove, nome } });
  await prisma.documento.create({ data: { ...dove, nome, mime: "text/html", dimensione: contenuto.length, contenuto, caricatoDaNome: chi } });
  return { nome, fornitoreId: m.fornitoreId, fornitoreNome: m.fornitore?.ragioneSociale ?? null };
}

const tornaRilievo = (commessaId: string, modelloId: string | null, p: Record<string, string>) =>
  `/commesse/${commessaId}?${new URLSearchParams({ passo: "RILIEVO", ...(modelloId ? { scheda: modelloId } : {}), ...p })}#modulo-fornitore`;

async function logPratica(commessaId: string, testo: string, chi: string) {
  await prisma.commessaEvento.create({ data: { commessaId, testo, utenteNome: chi } }).catch(() => undefined);
}

/** «📄 Salva il modulo» dal rilievo: compila la scheda con le misure scritte e la tiene nei documenti della pratica. */
export async function creaSchedaDaRilievo(fd: FormData) {
  const u = await rilevatore();
  const commessaId = str(fd, "commessaId"), modelloId = str(fd, "modelloId");
  if (!commessaId || !modelloId) return;
  const r = await compilaPerPratica(commessaId, modelloId, fd, u.nome);
  if (!r) redirect(tornaRilievo(commessaId, modelloId, { erroreScheda: "Modulo non trovato." }));
  await logPratica(commessaId, `Modulo del fornitore compilato al rilievo («${r.nome}»): sarà allegato all'ordine.`, u.nome);
  revalidatePath(`/commesse/${commessaId}`);
  redirect(tornaRilievo(commessaId, modelloId, { okScheda: "Modulo salvato: resta tra i documenti della pratica («Schede produzione») e all'invio dell'ordine è già pronto da allegare." }));
}

/** «💾 Salva il legno nella pratica»: le righe LEGNO-… del materiale non ancora ordinato si riscrivono dal modulo (costo a barra) e la scheda si aggiorna. */
export async function salvaLegnoInPratica(fd: FormData) {
  const u = await rilevatore();
  const commessaId = str(fd, "commessaId"), modelloId = str(fd, "modelloId");
  if (!commessaId) return;
  const valori: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && k.startsWith("campo_")) valori[k.slice(6)] = v;
  const prezzoM3 = Number((valori.prezzo_m3 ?? "").replace(",", ".")) || PREZZO_M3_INDICATIVO;
  const nuove = righeDaValori(valori, prezzoM3);
  const m = modelloId ? await prisma.schedaProduzioneModello.findUnique({ where: { id: modelloId }, select: { fornitoreId: true, fornitore: { select: { ragioneSociale: true } } } }) : null;
  const articoli = await prisma.articolo.findMany({ where: { codice: { in: nuove.map((r) => r.codice) } }, select: { id: true, codice: true, fornitoreId: true } });
  const art = new Map(articoli.map((a) => [a.codice, a]));
  const fornitori = await prisma.soggetto.findMany({ where: { id: { in: [...new Set([m?.fornitoreId, ...articoli.map((a) => a.fornitoreId)].filter(Boolean) as string[])] } }, select: { id: true, ragioneSociale: true } });
  const nomeForn = new Map(fornitori.map((f) => [f.id, f.ragioneSociale]));
  await prisma.$transaction([
    prisma.rigaOrdine.deleteMany({ where: { commessaId, ordineFornitoreId: null, complemento: true, codice: { startsWith: PREFISSO_LEGNO }, arrivato: false, quantitaArrivata: 0 } }),
    prisma.rigaOrdine.createMany({
      data: nuove.map((r) => {
        const a = art.get(r.codice), fid = m?.fornitoreId ?? a?.fornitoreId ?? null;
        return { commessaId, descrizione: r.descrizione, quantita: r.quantita, um: "pz", codice: r.codice, prezzoAcquisto: r.prezzo, scontoAcquisto: 0, costoPrevisto: Math.round(r.prezzo * r.quantita * 100) / 100, articoloId: a?.id ?? null, complemento: true, fornitoreId: fid, fornitoreNome: fid ? nomeForn.get(fid) ?? null : null };
      }),
    }),
  ]);
  if (modelloId) await compilaPerPratica(commessaId, modelloId, fd, u.nome);
  const pezzi = nuove.reduce((t, r) => t + r.quantita, 0);
  await logPratica(commessaId, nuove.length ? `Legno aggiunto al materiale dal modulo del rilievo: ${nuove.length} righe, ${pezzi} pezzi.` : "Legno tolto dal materiale (modulo del rilievo vuoto).", u.nome);
  revalidatePath(`/commesse/${commessaId}`);
  redirect(tornaRilievo(commessaId, modelloId, { okScheda: nuove.length ? `Legno nel materiale della pratica: ${nuove.length} righe, ${pezzi} pezzi (costo previsto calcolato). Lo trovi in «Materiale e ordini».` : "Nessun pezzo nel modulo: legno tolto dal materiale." }));
}

/** «💾 Salva gli angolari nella pratica»: come il legno, con il costo a peso di Il Mastro. */
export async function salvaAngolariInPratica(fd: FormData) {
  const u = await rilevatore();
  const commessaId = str(fd, "commessaId"), modelloId = str(fd, "modelloId");
  if (!commessaId) return;
  const valori: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && k.startsWith("campo_")) valori[k.slice(6)] = v;
  const nuove = righeDaAngolari(valori);
  const mastro = await prisma.soggetto.findFirst({ where: { ragioneSociale: { contains: "mastro", mode: "insensitive" }, ruoli: { has: "FORNITORE" } }, select: { id: true, ragioneSociale: true } });
  await prisma.$transaction([
    prisma.rigaOrdine.deleteMany({ where: { commessaId, ordineFornitoreId: null, complemento: true, codice: { startsWith: PREFISSO_ANGOLARI }, arrivato: false, quantitaArrivata: 0 } }),
    prisma.rigaOrdine.createMany({
      data: nuove.map((r) => ({ commessaId, descrizione: r.descrizione, quantita: r.quantita, um: "pz", codice: r.codice, prezzoAcquisto: r.prezzo, scontoAcquisto: 0, costoPrevisto: Math.round(r.prezzo * r.quantita * 100) / 100, complemento: true, fornitoreId: mastro?.id ?? null, fornitoreNome: mastro?.ragioneSociale ?? null })),
    }),
  ]);
  if (modelloId) await compilaPerPratica(commessaId, modelloId, fd, u.nome);
  const pezzi = nuove.reduce((t, r) => t + r.quantita, 0);
  await logPratica(commessaId, nuove.length ? `Angolari aggiunti al materiale dal modulo del rilievo: ${nuove.length} righe, ${pezzi} pezzi.` : "Angolari tolti dal materiale (modulo del rilievo vuoto).", u.nome);
  revalidatePath(`/commesse/${commessaId}`);
  redirect(tornaRilievo(commessaId, modelloId, { okScheda: nuove.length ? `Angolari nel materiale della pratica: ${nuove.length} righe, ${pezzi} pezzi (fornitore Il Mastro). Lo trovi in «Materiale e ordini».` : "Nessun angolare nel modulo: tolti dal materiale." }));
}

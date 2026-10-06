"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function flt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  return isNaN(n) ? null : n;
}

async function log(commessaId: string, testo: string) {
  const u = await getCurrentUser();
  await prisma.commessaEvento.create({ data: { commessaId, testo, utenteNome: u?.nome ?? null } });
}

// Ruoli che possono registrare l'incasso dell'acconto / approvazione finanziamento
function puoGestireIncassi(ruolo?: string | null) {
  return ruolo === "AMMINISTRATORE" || ruolo === "AMMINISTRATIVO";
}

// Ricalcola lo stato della commessa nella fase acconto + rilievo
async function ricalcolaStato(commessaId: string) {
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { rilievi: true } });
  if (!c || ["ANNULLATA", "CHIUSA", "ORDINI", "POSA"].includes(c.stato)) return;
  const viaLibera =
    c.accontoTipo === "FINANZIAMENTO" ? c.finanziamentoStato === "APPROVATO" : c.accontoIncassato;
  let stato = "IN_ATTESA_ACCONTO";
  if (viaLibera) {
    const attivi = c.rilievi.filter((r) => r.stato !== "ANNULLATO");
    if (attivi.some((r) => r.stato === "ESEGUITO")) stato = "RILIEVO_ESEGUITO";
    else if (attivi.some((r) => r.stato === "PROGRAMMATO")) stato = "RILIEVO_PROGRAMMATO";
    else stato = "RILIEVO_DA_PROGRAMMARE";
  }
  if (stato !== c.stato) await prisma.commessa.update({ where: { id: c.id }, data: { stato } });
}

export async function creaCommessaDaPreventivo(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const preventivoId = str(formData, "preventivoId");
  if (!preventivoId) return;
  const p = await prisma.preventivo.findUnique({ where: { id: preventivoId }, include: { commessa: true } });
  if (!p || p.stato !== "ACCETTATO") return;
  if (p.commessa) redirect(`/commesse/${p.commessa.id}`);
  const anno = new Date().getFullYear();
  const ultimo = await prisma.commessa.findFirst({ where: { anno }, orderBy: { numero: "desc" } });
  const numero = (ultimo?.numero ?? 0) + 1;
  const totale = p.totaleNetto + p.totaleIva;
  const c = await prisma.commessa.create({
    data: {
      numero,
      anno,
      preventivoId: p.id,
      clienteId: p.clienteId,
      brandId: p.brandId,
      responsabileId: p.commercialeId,
      totaleVendita: totale,
      totaleImponibile: p.totaleNetto,
      accontoTipo: "ACCONTO",
      accontoPercentuale: 50,
      accontoImporto: Math.round(totale * 50) / 100,
    },
  });
  await creaFasiStandard(c.id);
  await log(c.id, `Commessa creata dal preventivo accettato (totale ${totale.toFixed(2)} € IVA incl.).`);
  redirect(`/commesse/${c.id}`);
}

// Solo l'amministratore (responsabile) può modificare le condizioni di acconto
export async function aggiornaCondizioniAcconto(formData: FormData) {
  const utente = await getCurrentUser();
  if (!isAmministratore(utente)) return;
  const id = str(formData, "id");
  if (!id) return;
  const c = await prisma.commessa.findUnique({ where: { id } });
  if (!c) return;
  const tipo = str(formData, "accontoTipo") === "FINANZIAMENTO" ? "FINANZIAMENTO" : "ACCONTO";
  const perc = flt(formData, "accontoPercentuale") ?? c.accontoPercentuale;
  const importoManuale = flt(formData, "accontoImporto");
  const importo = importoManuale ?? Math.round(c.totaleVendita * perc) / 100;
  await prisma.commessa.update({
    where: { id },
    data: {
      accontoTipo: tipo,
      accontoPercentuale: perc,
      accontoImporto: importo,
      finanziamentoSocieta: tipo === "FINANZIAMENTO" ? str(formData, "finanziamentoSocieta") : null,
      finanziamentoStato: tipo === "FINANZIAMENTO" ? (c.finanziamentoStato ?? "IN_ISTRUTTORIA") : null,
    },
  });
  await log(id, tipo === "FINANZIAMENTO"
    ? `Condizione modificata: FINANZIAMENTO${str(formData, "finanziamentoSocieta") ? " (" + str(formData, "finanziamentoSocieta") + ")" : ""}.`
    : `Condizione modificata: acconto ${perc}% = ${importo.toFixed(2)} €.`);
  await ricalcolaStato(id);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

export async function registraIncassoAcconto(formData: FormData) {
  const utente = await getCurrentUser();
  if (!puoGestireIncassi(utente?.ruolo)) return;
  const id = str(formData, "id");
  if (!id) return;
  const c = await prisma.commessa.findUnique({ where: { id } });
  if (!c) return;
  const importo = flt(formData, "importo") ?? c.accontoImporto;
  const modalita = str(formData, "modalita");
  await prisma.commessa.update({
    where: { id },
    data: {
      accontoIncassato: true,
      accontoIncassatoIl: new Date(),
      accontoImportoIncassato: importo,
      accontoModalita: modalita,
      accontoNote: str(formData, "note"),
    },
  });
  await log(id, `Acconto incassato: ${importo.toFixed(2)} €${modalita ? " (" + modalita + ")" : ""}. Rilievo sbloccato.`);
  await ricalcolaStato(id);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

export async function annullaIncassoAcconto(formData: FormData) {
  const utente = await getCurrentUser();
  if (!isAmministratore(utente)) return;
  const id = str(formData, "id");
  if (!id) return;
  await prisma.commessa.update({
    where: { id },
    data: { accontoIncassato: false, accontoIncassatoIl: null, accontoImportoIncassato: null, accontoModalita: null },
  });
  await log(id, "Incasso acconto annullato dal responsabile.");
  await ricalcolaStato(id);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

export async function aggiornaFinanziamento(formData: FormData) {
  const utente = await getCurrentUser();
  if (!puoGestireIncassi(utente?.ruolo)) return;
  const id = str(formData, "id");
  const stato = str(formData, "finanziamentoStato");
  if (!id || !stato || !["IN_ISTRUTTORIA", "APPROVATO", "RIFIUTATO"].includes(stato)) return;
  await prisma.commessa.update({
    where: { id },
    data: { finanziamentoStato: stato, finanziamentoNote: str(formData, "finanziamentoNote") },
  });
  await log(id, `Finanziamento: ${stato.replace("_", " ").toLowerCase()}.${stato === "APPROVATO" ? " Rilievo sbloccato." : ""}`);
  await ricalcolaStato(id);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

export async function programmaRilievo(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const commessaId = str(formData, "commessaId");
  const tecnicoId = str(formData, "tecnicoId");
  const dataStr = str(formData, "dataOra");
  if (!commessaId || !tecnicoId || !dataStr) return;
  const dataOra = new Date(dataStr);
  if (isNaN(dataOra.getTime())) return;
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: true } });
  if (!c) return;
  const viaLibera = c.accontoTipo === "FINANZIAMENTO" ? c.finanziamentoStato === "APPROVATO" : c.accontoIncassato;
  if (!viaLibera) return; // blocco: rilievo solo dopo acconto/finanziamento
  const indirizzo =
    str(formData, "indirizzo") ??
    [c.cliente.indirizzo, c.cliente.cap, c.cliente.comune, c.cliente.provincia].filter(Boolean).join(", ");
  const r = await prisma.rilievo.create({
    data: { commessaId, tecnicoId, dataOra, indirizzo: indirizzo || null, note: str(formData, "note") },
    include: { tecnico: true },
  });
  await log(commessaId, `Rilievo programmato il ${dataOra.toLocaleString("it-IT")} con ${r.tecnico.nome}.`);
  await ricalcolaStato(commessaId);
  revalidatePath(`/commesse/${commessaId}`);
  revalidatePath("/commesse");
}

export async function annullaRilievo(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const id = str(formData, "rilievoId");
  if (!id) return;
  const r = await prisma.rilievo.update({ where: { id }, data: { stato: "ANNULLATO" } });
  await log(r.commessaId, "Rilievo annullato.");
  await ricalcolaStato(r.commessaId);
  revalidatePath(`/commesse/${r.commessaId}`);
  revalidatePath("/commesse");
}

// Caricamento rilievo: misure, note e foto (array JSON di data URI)
export async function caricaRilievo(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const id = str(formData, "rilievoId");
  if (!id) return;
  const misure = str(formData, "misure");
  const note = str(formData, "note");
  let foto: { nome: string; dataUri: string }[] = [];
  try {
    const raw = str(formData, "foto");
    if (raw) foto = JSON.parse(raw);
  } catch {
    foto = [];
  }
  const r = await prisma.rilievo.update({
    where: { id },
    data: { misure, note: note ?? undefined, stato: "ESEGUITO", eseguitoIl: new Date() },
  });
  if (foto.length) {
    await prisma.rilievoAllegato.createMany({
      data: foto
        .filter((f) => typeof f.dataUri === "string" && f.dataUri.startsWith("data:"))
        .slice(0, 12)
        .map((f) => ({ rilievoId: id, nome: f.nome ?? null, dataUri: f.dataUri })),
    });
  }
  await log(r.commessaId, `Rilievo eseguito e caricato${foto.length ? ` (${foto.length} foto)` : ""}.`);
  await ricalcolaStato(r.commessaId);
  revalidatePath(`/commesse/${r.commessaId}`);
  revalidatePath("/commesse");
}

export async function aggiungiNotaCommessa(formData: FormData) {
  const id = str(formData, "id");
  const testo = str(formData, "testo");
  if (!id || !testo) return;
  await log(id, testo);
  revalidatePath(`/commesse/${id}`);
}

// ============ ANAGRAFICA (Impostazioni) ============
const RUOLI_SOGGETTO = ["FORNITORE", "POSATORE_ESTERNO", "TECNICO_INTERNO", "ALTRO"];

function datiSoggetto(fd: FormData) {
  const ruoli = RUOLI_SOGGETTO.filter((r) => fd.get(`ruolo_${r}`) === "on");
  const giorni = flt(fd, "giorniPagamento");
  const d = (k: string) => {
    const v = str(fd, k);
    if (!v) return null;
    const x = new Date(v);
    return isNaN(x.getTime()) ? null : x;
  };
  return {
    ragioneSociale: str(fd, "ragioneSociale") ?? "Senza nome",
    tipo: str(fd, "tipo") === "PERSONA" ? "PERSONA" : "AZIENDA",
    ruoli,
    attivo: fd.get("attivo") === "on",
    partitaIva: str(fd, "partitaIva"),
    codiceFiscale: str(fd, "codiceFiscale"),
    codiceSdi: str(fd, "codiceSdi"),
    pec: str(fd, "pec"),
    indirizzo: str(fd, "indirizzo"),
    cap: str(fd, "cap"),
    comune: str(fd, "comune"),
    provincia: str(fd, "provincia"),
    telefono: str(fd, "telefono"),
    email: str(fd, "email"),
    emailOrdini: str(fd, "emailOrdini"),
    referente: str(fd, "referente"),
    banca: str(fd, "banca"),
    iban: str(fd, "iban")?.replace(/\s+/g, "").toUpperCase() ?? null,
    bic: str(fd, "bic"),
    intestatario: str(fd, "intestatario"),
    metodoPagamento: str(fd, "metodoPagamento"),
    condizioniPagamento: str(fd, "condizioniPagamento"),
    giorniPagamento: giorni === null ? null : Math.round(giorni),
    scontoFornitore: flt(fd, "scontoFornitore"),
    listiniForniti: str(fd, "listiniForniti"),
    tariffaPosa: flt(fd, "tariffaPosa"),
    tariffaTipo: str(fd, "tariffaTipo"),
    costoOrario: flt(fd, "costoOrario"),
    zonaOperativa: str(fd, "zonaOperativa"),
    scadenzaDurc: d("scadenzaDurc"),
    scadenzaAssicurazione: d("scadenzaAssicurazione"),
    utenteId: str(fd, "utenteId"),
    note: str(fd, "note"),
  };
}

function puoGestireAnagrafica(ruolo?: string | null) {
  return ruolo === "AMMINISTRATORE" || ruolo === "AMMINISTRATIVO";
}

export async function creaSoggetto(formData: FormData) {
  const u = await getCurrentUser();
  if (!puoGestireAnagrafica(u?.ruolo)) return;
  const dati = datiSoggetto(formData);
  const clienteId = str(formData, "clienteOrigineId");
  let extra: Record<string, string | null> = {};
  if (clienteId) {
    const c = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (c) {
      extra = {
        clienteOrigineId: c.id,
        indirizzo: dati.indirizzo ?? c.indirizzo,
        cap: dati.cap ?? c.cap,
        comune: dati.comune ?? c.comune,
        provincia: dati.provincia ?? c.provincia,
        telefono: dati.telefono ?? c.telefono,
        email: dati.email ?? c.email,
      };
      if (dati.ragioneSociale === "Senza nome") dati.ragioneSociale = c.nome;
    }
  }
  const s = await prisma.soggetto.create({ data: { ...dati, ...extra, attivo: true } });
  revalidatePath("/impostazioni/anagrafica");
  redirect(`/impostazioni/anagrafica/${s.id}`);
}

export async function aggiornaSoggetto(formData: FormData) {
  const u = await getCurrentUser();
  if (!puoGestireAnagrafica(u?.ruolo)) return;
  const id = str(formData, "id");
  if (!id) return;
  await prisma.soggetto.update({ where: { id }, data: datiSoggetto(formData) });
  revalidatePath("/impostazioni/anagrafica");
  revalidatePath(`/impostazioni/anagrafica/${id}`);
}

export async function eliminaSoggetto(formData: FormData) {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) return;
  const id = str(formData, "id");
  if (!id) return;
  await prisma.soggetto.delete({ where: { id } });
  revalidatePath("/impostazioni/anagrafica");
  redirect("/impostazioni/anagrafica");
}

// ============ FASI ============
const FASI_STANDARD: { tipo: string; nome: string }[] = [
  { tipo: "RILIEVO", nome: "Rilievo misure" },
  { tipo: "ORDINI", nome: "Ordini ai fornitori" },
  { tipo: "ARRIVO_MERCE", nome: "Arrivo e controllo merce" },
  { tipo: "POSA", nome: "Posa in opera" },
  { tipo: "FINE_LAVORI", nome: "Fine lavori e collaudo" },
];

async function creaFasiStandard(commessaId: string) {
  const esistenti = await prisma.faseCommessa.count({ where: { commessaId } });
  if (esistenti > 0) return;
  await prisma.faseCommessa.createMany({
    data: FASI_STANDARD.map((f, i) => ({ commessaId, ordine: i + 1, tipo: f.tipo, nome: f.nome })),
  });
}

export async function generaFasiStandard(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  if (!id) return;
  await creaFasiStandard(id);
  revalidatePath(`/commesse/${id}`);
}

export async function aggiungiFase(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  const nome = str(formData, "nome");
  if (!commessaId || !nome) return;
  const ult = await prisma.faseCommessa.findFirst({ where: { commessaId }, orderBy: { ordine: "desc" } });
  await prisma.faseCommessa.create({ data: { commessaId, nome, tipo: "ALTRO", ordine: (ult?.ordine ?? 0) + 1 } });
  revalidatePath(`/commesse/${commessaId}`);
}

export async function assegnaFase(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const faseId = str(formData, "faseId");
  if (!faseId) return;
  const sel = str(formData, "assegnatario") ?? ""; // "U:<id>" | "S:<id>" | ""
  let data: { assegnatoUtenteId: string | null; assegnatoSoggettoId: string | null; assegnatoNome: string | null } = {
    assegnatoUtenteId: null, assegnatoSoggettoId: null, assegnatoNome: null,
  };
  if (sel.startsWith("U:")) {
    const ut = await prisma.utente.findUnique({ where: { id: sel.slice(2) } });
    if (ut) data = { assegnatoUtenteId: ut.id, assegnatoSoggettoId: null, assegnatoNome: ut.nome };
  } else if (sel.startsWith("S:")) {
    const so = await prisma.soggetto.findUnique({ where: { id: sel.slice(2) } });
    if (so) data = { assegnatoUtenteId: null, assegnatoSoggettoId: so.id, assegnatoNome: so.ragioneSociale };
  }
  const f = await prisma.faseCommessa.update({ where: { id: faseId }, data: { ...data, stato: "IN_CORSO" } });
  await log(f.commessaId, `Fase "${f.nome}" assegnata a ${data.assegnatoNome ?? "nessuno"}.`);
  revalidatePath(`/commesse/${f.commessaId}`);
}

// Chiusura fase: chi esegue inserisce ore e costo orario (oppure un forfait); il costo entra nella commessa
export async function chiudiFase(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const faseId = str(formData, "faseId");
  if (!faseId) return;
  const f = await prisma.faseCommessa.findUnique({ where: { id: faseId } });
  if (!f || f.stato === "CHIUSA") return;
  const autorizzato = f.assegnatoUtenteId === u.id || ["AMMINISTRATORE", "AMMINISTRATIVO"].includes(u.ruolo) || !f.assegnatoUtenteId;
  if (!autorizzato) return;
  const ore = flt(formData, "ore");
  const costoOrario = flt(formData, "costoOrario");
  const forfait = flt(formData, "forfait");
  const costoTotale = forfait ?? (ore !== null && costoOrario !== null ? Math.round(ore * costoOrario * 100) / 100 : 0);
  await prisma.faseCommessa.update({
    where: { id: faseId },
    data: {
      stato: "CHIUSA",
      ore, costoOrario, forfait, costoTotale,
      note: str(formData, "note") ?? f.note,
      chiusaIl: new Date(),
      chiusaDaNome: u.nome,
    },
  });
  await log(f.commessaId, `Fase "${f.nome}" chiusa da ${u.nome}: ${costoTotale.toFixed(2)} €${forfait === null && ore !== null ? ` (${ore} h × ${costoOrario ?? 0} €/h)` : forfait !== null ? " (forfait)" : ""}.`);
  revalidatePath(`/commesse/${f.commessaId}`);
}

export async function riapriFase(formData: FormData) {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) return;
  const faseId = str(formData, "faseId");
  if (!faseId) return;
  const f = await prisma.faseCommessa.update({ where: { id: faseId }, data: { stato: "IN_CORSO", chiusaIl: null, chiusaDaNome: null, costoTotale: 0, ore: null, costoOrario: null, forfait: null } });
  await log(f.commessaId, `Fase "${f.nome}" riaperta dal responsabile.`);
  revalidatePath(`/commesse/${f.commessaId}`);
}

// ============ RIGHE ORDINE (vidimazione) ============
export async function generaRigheOrdine(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  if (!id) return;
  const c = await prisma.commessa.findUnique({
    where: { id },
    include: { righeOrdine: true, preventivo: { include: { righe: { include: { prodotto: true }, orderBy: [{ ordine: "asc" }, { id: "asc" }] } } } },
  });
  if (!c) return;
  const giaPresenti = new Set(c.righeOrdine.map((r) => r.rigaPreventivoId).filter(Boolean));
  const nuove = c.preventivo.righe
    .filter((r) => !giaPresenti.has(r.id))
    .map((r) => {
      let desc = r.testoLibero ?? (r.prodotto ? r.prodotto.tipologia.replace(/_/g, " ") : "Riga");
      if (r.prodotto && r.prodotto.colore && !/TARIFFA|Prezzo a/.test(r.prodotto.colore)) desc += ` — ${r.prodotto.colore}`;
      if (r.misuraLarghezza && r.misuraAltezza) desc += ` (${r.misuraLarghezza}×${r.misuraAltezza})`;
      if (r.optionalDescrizione) desc += ` + ${r.optionalDescrizione}`;
      return { commessaId: id, rigaPreventivoId: r.id, descrizione: desc, quantita: r.quantita };
    });
  if (nuove.length) {
    await prisma.rigaOrdine.createMany({ data: nuove });
    await log(id, `Elenco ordini generato: ${nuove.length} righe da vidimare.`);
  }
  revalidatePath(`/commesse/${id}`);
}

export async function aggiornaRigaOrdine(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "rigaId");
  if (!id) return;
  const prima = await prisma.rigaOrdine.findUnique({ where: { id } });
  if (!prima) return;
  const ordinato = formData.get("ordinato") === "on";
  const arrivato = formData.get("arrivato") === "on";
  const fornitoreId = str(formData, "fornitoreId");
  const forn = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId } }) : null;
  const costo = flt(formData, "costoEffettivo");
  await prisma.rigaOrdine.update({
    where: { id },
    data: {
      ordinato,
      ordinatoIl: ordinato ? (prima.ordinatoIl ?? new Date()) : null,
      ordinatoDaNome: ordinato ? (prima.ordinatoDaNome ?? u.nome) : null,
      arrivato,
      arrivatoIl: arrivato ? (prima.arrivatoIl ?? new Date()) : null,
      fornitoreId,
      fornitoreNome: forn?.ragioneSociale ?? null,
      costoEffettivo: costo,
      note: str(formData, "note"),
    },
  });
  if (ordinato && !prima.ordinato) await log(prima.commessaId, `Ordine vidimato: ${prima.descrizione}${forn ? " (" + forn.ragioneSociale + ")" : ""}.`);
  if (arrivato && !prima.arrivato) await log(prima.commessaId, `Merce arrivata: ${prima.descrizione}.`);
  revalidatePath(`/commesse/${prima.commessaId}`);
}

// ============ COSTI MANUALI ============
export async function aggiungiCostoManuale(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  const descrizione = str(formData, "descrizione");
  const importo = flt(formData, "importo");
  if (!commessaId || !descrizione || importo === null) return;
  await prisma.costoManuale.create({
    data: { commessaId, descrizione, importo, categoria: str(formData, "categoria") ?? "ALTRO", autoreNome: u.nome },
  });
  await log(commessaId, `Costo aggiunto: ${descrizione} — ${importo.toFixed(2)} €.`);
  revalidatePath(`/commesse/${commessaId}`);
}

export async function eliminaCostoManuale(formData: FormData) {
  const u = await getCurrentUser();
  if (!puoGestireIncassi(u?.ruolo)) return;
  const id = str(formData, "id");
  if (!id) return;
  const c = await prisma.costoManuale.delete({ where: { id } });
  revalidatePath(`/commesse/${c.commessaId}`);
}

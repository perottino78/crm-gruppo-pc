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

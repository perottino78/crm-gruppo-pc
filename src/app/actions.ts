"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aliquotaIvaPerPaese } from "@/lib/pricing";
import { trovaFasciaPrezzo } from "@/lib/prezzoPerMisura";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function creaLead(formData: FormData) {
  const nome = str(formData, "nome");
  const brandId = str(formData, "brandId");
  if (!nome || !brandId) return;

  await prisma.lead.create({
    data: {
      nome,
      telefono: str(formData, "telefono"),
      email: str(formData, "email"),
      fonte: str(formData, "fonte") ?? "facebook",
      brandId,
    },
  });
  revalidatePath("/clienti");
  revalidatePath("/");
}

export async function aggiornaFaseLead(formData: FormData) {
  const id = str(formData, "id");
  const fase = str(formData, "fase");
  if (!id || !fase) return;
  await prisma.lead.update({ where: { id }, data: { fase } });
  revalidatePath("/clienti");
  revalidatePath("/");
}

export async function convertiLeadInCliente(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return;
  await prisma.cliente.create({
    data: {
      nome: lead.nome,
      telefono: lead.telefono,
      email: lead.email,
      brandId: lead.brandId,
      leadOrigineId: lead.id,
    },
  });
  await prisma.lead.update({ where: { id }, data: { fase: "APPUNTAMENTO_FISSATO" } });
  revalidatePath("/clienti");
}

export async function creaCliente(formData: FormData) {
  const nome = str(formData, "nome");
  const brandId = str(formData, "brandId");
  if (!nome || !brandId) return;
  await prisma.cliente.create({
    data: {
      nome,
      telefono: str(formData, "telefono"),
      email: str(formData, "email"),
      indirizzo: str(formData, "indirizzo"),
      paese: str(formData, "paese") ?? "IT",
      brandId,
    },
  });
  revalidatePath("/clienti");
}

export async function creaPreventivo(formData: FormData) {
  const clienteId = str(formData, "clienteId");
  const brandId = str(formData, "brandId");
  const commercialeId = str(formData, "commercialeId");
  if (!clienteId || !brandId || !commercialeId) return;

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  const { aliquota } = aliquotaIvaPerPaese(cliente?.paese ?? "IT");

  const preventivo = await prisma.preventivo.create({
    data: { clienteId, brandId, commercialeId, aliquotaIva: aliquota },
  });
  revalidatePath("/preventivi");
  revalidatePath("/");
  revalidatePath(`/clienti/${clienteId}`);
  redirect(`/preventivi/${preventivo.id}`);
}

async function ricalcolaTotali(preventivoId: string) {
  const righe = await prisma.rigaPreventivo.findMany({
    where: { preventivoId },
    include: { optionali: true },
  });
  const totaleNetto = righe.reduce((sum, r) => {
    const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    return sum + r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
  }, 0);
  const preventivo = await prisma.preventivo.update({
    where: { id: preventivoId },
    data: { totaleNetto },
  });
  await prisma.preventivo.update({
    where: { id: preventivoId },
    data: { totaleIva: totaleNetto * (preventivo.aliquotaIva / 100) },
  });
}

export async function aggiungiRigaPreventivo(formData: FormData) {
  const preventivoId = str(formData, "preventivoId");
  const prodottoId = str(formData, "prodottoId");
  const quantitaStr = str(formData, "quantita");
  const prezzoStr = str(formData, "prezzoUnitario");
  if (!preventivoId || !prodottoId) return;

  const prodotto = await prisma.prodotto.findUnique({ where: { id: prodottoId } });
  if (!prodotto) return;

  const quantita = quantitaStr ? Math.max(1, parseInt(quantitaStr, 10)) : 1;
  const prezzoUnitario = prezzoStr ? parseFloat(prezzoStr) : prodotto.prezzoBase;

  await prisma.rigaPreventivo.create({
    data: { preventivoId, prodottoId, quantita, prezzoUnitario },
  });
  await ricalcolaTotali(preventivoId);
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function aggiungiRigaPreventivoPerMisura(formData: FormData) {
  const preventivoId = str(formData, "preventivoId");
  const brandId = str(formData, "brandId");
  const tipologia = str(formData, "tipologia");
  const larghezzaStr = str(formData, "larghezza");
  const altezzaStr = str(formData, "altezza");
  const quantitaStr = str(formData, "quantita");
  if (!preventivoId || !brandId || !tipologia || !larghezzaStr || !altezzaStr) return;

  const larghezza = parseFloat(larghezzaStr.replace(",", "."));
  const altezza = parseFloat(altezzaStr.replace(",", "."));
  if (!Number.isFinite(larghezza) || !Number.isFinite(altezza) || larghezza <= 0 || altezza <= 0) {
    redirect(`/preventivi/${preventivoId}?errore=${encodeURIComponent("Misure non valide")}`);
  }

  const prodotto = await trovaFasciaPrezzo({ brandId, tipologia, larghezza, altezza });
  if (!prodotto) {
    redirect(
      `/preventivi/${preventivoId}?errore=${encodeURIComponent(
        `Nessuna fascia di prezzo per ${tipologia} a ${larghezza}×${altezza} — misura fuori listino`
      )}`
    );
  }

  const quantita = quantitaStr ? Math.max(1, parseInt(quantitaStr, 10)) : 1;

  await prisma.rigaPreventivo.create({
    data: {
      preventivoId,
      prodottoId: prodotto!.id,
      quantita,
      prezzoUnitario: prodotto!.prezzoBase,
      misuraLarghezza: larghezza,
      misuraAltezza: altezza,
    },
  });
  await ricalcolaTotali(preventivoId);
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function aggiornaDescrizionePersonalizzata(formData: FormData) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  if (!id || !preventivoId) return;
  const testo = str(formData, "descrizionePersonalizzata");
  await prisma.rigaPreventivo.update({
    where: { id },
    data: { descrizionePersonalizzata: testo },
  });
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function rimuoviRigaPreventivo(formData: FormData) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  if (!id || !preventivoId) return;
  await prisma.rigaOptional.deleteMany({ where: { rigaId: id } });
  await prisma.rigaPreventivo.delete({ where: { id } });
  await ricalcolaTotali(preventivoId);
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function aggiungiOptionalARiga(formData: FormData) {
  const rigaId = str(formData, "rigaId");
  const optionalId = str(formData, "optionalId");
  const preventivoId = str(formData, "preventivoId");
  const quantitaStr = str(formData, "quantita");
  if (!rigaId || !optionalId || !preventivoId) return;

  const [riga, optional] = await Promise.all([
    prisma.rigaPreventivo.findUnique({ where: { id: rigaId } }),
    prisma.optional.findUnique({ where: { id: optionalId } }),
  ]);
  if (!riga || !optional) return;

  const quantita = quantitaStr ? Math.max(1, parseInt(quantitaStr, 10)) : 1;
  const prezzoUnitario =
    optional.tipoPrezzo === "PERCENTUALE"
      ? Math.round(riga.quantita * riga.prezzoUnitario * (optional.valore / 100) * 100) / 100
      : optional.valore;

  await prisma.rigaOptional.create({
    data: { rigaId, optionalId, quantita, prezzoUnitario },
  });
  await ricalcolaTotali(preventivoId);
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function rimuoviOptionalDaRiga(formData: FormData) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  if (!id || !preventivoId) return;
  await prisma.rigaOptional.delete({ where: { id } });
  await ricalcolaTotali(preventivoId);
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function aggiornaStatoPreventivo(formData: FormData) {
  const id = str(formData, "id");
  const stato = str(formData, "stato");
  if (!id || !stato) return;
  await prisma.preventivo.update({ where: { id }, data: { stato } });
  revalidatePath("/preventivi");
  revalidatePath("/");
}

export async function aggiornaConfigurazione(formData: FormData) {
  const id = str(formData, "id");
  const valore = str(formData, "valore");
  if (!id || valore === null) return;
  await prisma.configurazione.update({ where: { id }, data: { valore } });
  revalidatePath("/impostazioni");
}

export async function creaUtente(formData: FormData) {
  const nome = str(formData, "nome");
  const email = str(formData, "email");
  const ruolo = str(formData, "ruolo");
  if (!nome || !email || !ruolo) return;
  await prisma.utente.create({ data: { nome, email, ruolo } });
  revalidatePath("/impostazioni");
}

export async function creaAttivita(formData: FormData) {
  const clienteId = str(formData, "clienteId");
  const tipo = str(formData, "tipo");
  const oggetto = str(formData, "oggetto");
  if (!clienteId || !tipo || !oggetto) return;
  const scadenzaStr = str(formData, "scadenza");
  await prisma.attivita.create({
    data: {
      clienteId,
      tipo,
      oggetto,
      descrizione: str(formData, "descrizione"),
      scadenza: scadenzaStr ? new Date(scadenzaStr) : null,
      utenteId: str(formData, "utenteId"),
    },
  });
  revalidatePath(`/clienti/${clienteId}`);
}

export async function completaAttivita(formData: FormData) {
  const id = str(formData, "id");
  const clienteId = str(formData, "clienteId");
  if (!id) return;
  await prisma.attivita.update({ where: { id }, data: { completata: true } });
  if (clienteId) revalidatePath(`/clienti/${clienteId}`);
}

export async function salvaModelloProdotto(formData: FormData) {
  const brandId = str(formData, "brandId");
  const tipologia = str(formData, "tipologia");
  if (!brandId || !tipologia) return;
  const immagineUrl = str(formData, "immagineUrl");
  const descrizioneTecnica = str(formData, "descrizioneTecnica");
  const famiglia = str(formData, "famiglia");
  const gruppo = str(formData, "gruppo");

  await prisma.modelloProdotto.upsert({
    where: { brandId_tipologia: { brandId, tipologia } },
    create: { brandId, tipologia, immagineUrl, descrizioneTecnica, famiglia, gruppo },
    update: { immagineUrl, descrizioneTecnica, famiglia, gruppo },
  });
  revalidatePath("/prodotti");
  revalidatePath(`/prodotti/modello/${encodeURIComponent(tipologia)}`);
}

export async function aggiornaPermessiBrand(formData: FormData) {
  const utenteId = str(formData, "utenteId");
  if (!utenteId) return;
  const brandIds = formData.getAll("brandIds").map((v) => String(v));
  await prisma.utente.update({
    where: { id: utenteId },
    data: { brandAutorizzati: { set: brandIds.map((id) => ({ id })) } },
  });
  revalidatePath(`/commerciali/${utenteId}`);
  revalidatePath("/commerciali");
}

export async function impostaObiettivo(formData: FormData) {
  const utenteId = str(formData, "utenteId");
  const periodo = str(formData, "periodo");
  const importoStr = str(formData, "importoTarget");
  if (!utenteId || !periodo || !importoStr) return;
  const importoTarget = parseFloat(importoStr.replace(",", "."));
  if (!Number.isFinite(importoTarget)) return;
  const note = str(formData, "note");

  await prisma.obiettivo.upsert({
    where: { utenteId_periodo: { utenteId, periodo } },
    create: { utenteId, periodo, importoTarget, note },
    update: { importoTarget, note },
  });
  revalidatePath(`/commerciali/${utenteId}`);
}

export async function toggleDescrizioneRiga(formData: FormData) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  const mostraStr = str(formData, "mostra");
  if (!id || !preventivoId) return;
  await prisma.rigaPreventivo.update({
    where: { id },
    data: { mostraDescrizione: mostraStr === "true" },
  });
  revalidatePath(`/preventivi/${preventivoId}`);
}

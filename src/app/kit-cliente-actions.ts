"use server";

// Raccolta punti kit al cliente: registrare la consegna nella pratica, segnare la recensione, regole e premi.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { daOraRoma } from "@/lib/calendario/tempo";
import { puntiConsegna, puoConsegnareKit, CHIAVI_KIT } from "@/lib/kit/punti";
import { regoleKit } from "@/lib/kit/server";
import { registra } from "@/lib/amministrazione/server";

const torna = (commessaId: string, chiave: "kitOk" | "kitErrore", testo: string, daLista = false): never =>
  daLista
    ? redirect(`/kit?${chiave === "kitOk" ? "ok" : "errore"}=${encodeURIComponent(testo)}`)
    : redirect(`/commesse/${commessaId}?${chiave}=${encodeURIComponent(testo)}#kit-cliente`);

/** Foto dal selettore (array JSON di data URI) → Documenti della commessa, cartella «Consegna kit». */
function fotoDa(campo: FormDataEntryValue | null): { nome: string; mime: string; dati: Buffer }[] {
  let lista: { nome?: string; dataUri?: string }[] = [];
  try { lista = JSON.parse(String(campo ?? "[]")); } catch { lista = []; }
  return lista.slice(0, 4).flatMap((f) => {
    const m = String(f.dataUri ?? "").match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
    return m ? [{ nome: f.nome || "consegna-kit.jpg", mime: m[1], dati: Buffer.from(m[2], "base64") }] : [];
  });
}

export async function registraKitCliente(formData: FormData) {
  const u = await getCurrentUser();
  const commessaId = String(formData.get("commessaId") ?? "");
  // dalla lista «Lavori finiti senza kit» si torna alla lista (spunta veloce dell'ufficio)
  const daLista = formData.get("torna") === "kit";
  if (!u || !puo(u, "commesse")) return torna(commessaId, "kitErrore", "Non hai il permesso di aggiornare le pratiche.", daLista);
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, select: { id: true, stato: true, clienteId: true, preventivo: { select: { commercialeId: true } } } });
  if (!c) return torna(commessaId, "kitErrore", "Pratica non trovata.", daLista);
  if (!puoConsegnareKit(c.stato)) return torna(commessaId, "kitErrore", "Il kit si registra a lavoro finito (posa in corso o fatta).", daLista);
  if (await prisma.consegnaKit.findUnique({ where: { commessaId } })) return torna(commessaId, "kitErrore", "Il kit di questa pratica è già registrato.", daLista);
  const chiId = String(formData.get("utenteId") || c.preventivo.commercialeId);
  const chi = await prisma.utente.findUnique({ where: { id: chiId }, select: { id: true, nome: true } });
  if (!chi) return torna(commessaId, "kitErrore", "Scegli chi ha consegnato il kit.", daLista);
  const quando = daOraRoma(String(formData.get("giorno") ?? "")) ?? new Date();
  if (quando.getTime() > Date.now() + 86400000) return torna(commessaId, "kitErrore", "La data di consegna non può essere nel futuro.", daLista);
  const foto = fotoDa(formData.get("foto"));
  // le foto del kit ora partono da sole, una alla volta, nei Documenti «Consegna kit»: contano se ce n'è almeno una
  const giaCaricate = await prisma.documento.count({ where: { entita: "COMMESSA", entitaId: commessaId, cartella: "Consegna kit", mime: { startsWith: "image/" }, createdAt: { gte: new Date(Date.now() - 6 * 3600_000) } } }); // solo quelle di adesso (non foto vecchie di una consegna annullata)
  const conFoto = foto.length > 0 || giaCaricate > 0;
  const recensione = formData.get("recensione") === "1";
  const regole = await regoleKit();
  const punti = puntiConsegna({ conFoto, recensione }, regole);
  const nota = String(formData.get("nota") ?? "").trim().slice(0, 500) || null;
  await prisma.$transaction(async (tx) => {
    for (const f of foto) {
      await tx.documento.create({ data: { entita: "COMMESSA", entitaId: commessaId, cartella: "Consegna kit", nome: f.nome, mime: f.mime, dimensione: f.dati.length, contenuto: f.dati, caricatoDaNome: u.nome } });
    }
    await tx.consegnaKit.create({ data: { commessaId, clienteId: c.clienteId, utenteId: chi.id, utenteNome: chi.nome, consegnatoIl: quando, conFoto, recensione, punti, nota, registratoDaNome: u.nome } });
    await tx.commessaEvento.create({ data: { commessaId, utenteNome: u.nome, testo: `🎁 Kit consegnato al cliente da ${chi.nome}${conFoto ? " (con foto)" : ""}${recensione ? ", con recensione" : ""}: ${punti} punti` } });
  });
  revalidatePath(`/commesse/${commessaId}`);
  revalidatePath("/kit");
  return torna(commessaId, "kitOk", `Kit registrato: ${punti} punti a ${chi.nome}.`, daLista);
}

/** Il cliente ha lasciato la recensione (o si toglie per errore): ricalcola i punti con le regole di adesso. */
export async function segnaRecensioneKit(formData: FormData) {
  const u = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const k = await prisma.consegnaKit.findUnique({ where: { id } });
  if (!k) redirect("/kit");
  if (!u || !puo(u, "commesse")) return torna(k.commessaId, "kitErrore", "Non hai il permesso di aggiornare le pratiche.");
  const recensione = formData.get("recensione") === "1";
  const punti = puntiConsegna({ conFoto: k.conFoto, recensione }, await regoleKit());
  await prisma.consegnaKit.update({ where: { id }, data: { recensione, punti } });
  await prisma.commessaEvento.create({ data: { commessaId: k.commessaId, utenteNome: u.nome, testo: recensione ? `⭐ Recensione del cliente segnata: kit a ${punti} punti` : `Recensione tolta: kit a ${punti} punti` } });
  revalidatePath("/kit");
  return torna(k.commessaId, "kitOk", recensione ? `Recensione segnata: ora ${punti} punti.` : `Recensione tolta: ora ${punti} punti.`);
}

/** Annulla una consegna registrata per errore (solo chi gestisce le regole): le foto restano nei Documenti. */
export async function annullaKitCliente(formData: FormData) {
  const u = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const k = await prisma.consegnaKit.findUnique({ where: { id } });
  if (!k) redirect("/kit");
  if (!u || !puo(u, "kit.regole")) return torna(k.commessaId, "kitErrore", "Solo l'amministrazione può annullare una consegna.");
  await prisma.consegnaKit.delete({ where: { id } });
  await prisma.commessaEvento.create({ data: { commessaId: k.commessaId, utenteNome: u.nome, testo: `Consegna del kit annullata (era di ${k.utenteNome}, ${k.punti} punti)` } });
  await registra("KIT", k.commessaId, "ANNULLATO", `Consegna kit di ${k.utenteNome} (${k.punti} punti) annullata`, u.nome);
  revalidatePath("/kit");
  return torna(k.commessaId, "kitOk", "Consegna del kit annullata.");
}

/** Regole e premi della raccolta punti (Configurazione kit_*). I punti già dati non cambiano. */
export async function salvaRegoleKit(formData: FormData) {
  const u = await getCurrentUser();
  if (!u || !puo(u, "kit.regole")) redirect("/kit?errore=" + encodeURIComponent("Solo l'amministrazione può cambiare regole e premi."));
  const numero = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    const n = Number(v.replace(",", "."));
    return v !== "" && Number.isFinite(n) && n >= 0 && n <= 1000 ? String(Math.round(n)) : null;
  };
  const valori: [string, string | null][] = [
    [CHIAVI_KIT.puntiConsegna, numero("puntiConsegna")],
    [CHIAVI_KIT.puntiFoto, numero("puntiFoto")],
    [CHIAVI_KIT.puntiRecensione, numero("puntiRecensione")],
    [CHIAVI_KIT.premioMese, String(formData.get("premioMese") ?? "").trim().slice(0, 200)],
    [CHIAVI_KIT.premioAnno, String(formData.get("premioAnno") ?? "").trim().slice(0, 200)],
  ];
  if (valori.slice(0, 3).some(([, v]) => v === null)) redirect("/kit?errore=" + encodeURIComponent("I punti devono essere numeri da 0 a 1000.") + "#regole");
  for (const [chiave, valore] of valori) {
    await prisma.configurazione.upsert({ where: { chiave }, update: { valore: valore! }, create: { chiave, valore: valore! } });
  }
  await registra("KIT", null, "REGOLE", valori.map(([k, v]) => `${k}=${v}`).join(", "), u.nome);
  revalidatePath("/kit");
  redirect("/kit?ok=" + encodeURIComponent("Regole e premi salvati. Valgono per i kit registrati da adesso.") + "#regole");
}

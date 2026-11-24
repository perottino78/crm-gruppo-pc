"use server";

import { ricalcolaStatoCommessa } from "@/lib/pratica/stato-server";
import { puo } from "@/lib/permessi/catalogo";
import { statoSogliaRilievo } from "@/lib/pratica/soglia-server";
import { daOraRoma } from "@/lib/calendario/tempo";
import { inviaInvito } from "@/lib/calendario/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { verbaleDaForm, verbaleCompilato } from "@/lib/rilievo/verbale";
import { sceltePerRilievo } from "@/lib/listini/serramenti-comuni";
import { verificaMaterialeCommessa } from "@/lib/magazzino/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { avviaFaseFlusso, fattoTask, avanzaDopoIncasso, assicuraFlusso, creaTaskManuale, chiudiTaskFase, avviaRilievoSePronto, dopoIncassoAcconto } from "@/app/flusso-actions";
import { inviaMailPratica, ringraziaPagamentoAcconto, avvisaCommerciale } from "@/lib/pratica/mail-cliente-server";
import { mailRilievoFissato, mailPosaFissata, mailPosaCompletata, mailPosaParziale } from "@/lib/pratica/mail-cliente";
import { tipoValido, nomeIntervento, chiusuraIntervento } from "@/lib/pratica/interventi";
import { datiAcquisto } from "@/lib/ordini/server";
import { percorsoDiCommessa } from "@/lib/progetti/percorso-server";
import { trovaFasciaPrezzo, trovaBarraPiuVicina } from "@/lib/prezzoPerMisura";
import { labelBreveTipologia, unitaMisura } from "@/lib/prodotti";
import { costoPrevisto } from "@/lib/ordini/calcoli";
import { scontoEquivalente } from "@/lib/articoli/prezzi";
import { quantitaComponente } from "@/lib/listini/kit";

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

// Ricalcola lo stato della commessa nella fase acconto + rilievo (logica condivisa in src/lib/pratica/stato-server.ts)
const ricalcolaStato = ricalcolaStatoCommessa;

async function apriCommessa(preventivoId: string, utenteNome: string): Promise<string | null> {
  const p = await prisma.preventivo.findUnique({ where: { id: preventivoId }, include: { commessa: true } });
  if (!p || p.stato !== "ACCETTATO") return null;
  if (p.commessa) return p.commessa.id;
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
  await avviaFaseFlusso(c.id, "ACCETTAZIONE", null, utenteNome);
  await log(c.id, `Commessa creata dal preventivo accettato (totale ${totale.toFixed(2)} € IVA incl.).`);
  return c.id;
}

export async function creaCommessaDaPreventivo(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const preventivoId = str(formData, "preventivoId");
  if (!preventivoId) return;
  const id = await apriCommessa(preventivoId, utente.nome);
  if (id) redirect(`/commesse/${id}`);
}

// Il commerciale chiude il contratto: l'offerta si blocca così com'è, si apre la commessa,
// la fase "Accettazione" si chiude da sola e la pratica passa all'ufficio successivo del flusso
// (di norma la contabilità per la fattura d'acconto), con la nota del commerciale.
export async function confermaOrdinePreventivo(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const preventivoId = str(formData, "preventivoId");
  if (!preventivoId) return;
  const torna = (errore?: string) =>
    redirect(`/preventivi/${preventivoId}${errore ? `?errore=${encodeURIComponent(errore)}` : "?confermata=1"}#conferma`);
  const p = await prisma.preventivo.findUnique({ where: { id: preventivoId }, include: { commessa: true } });
  if (!p) return;
  if (p.confermatoIl) torna();
  if (p.commessa) { await salvaVariante(formData); return; }
  if (["ANNULLATO"].includes(p.stato)) torna("Un'offerta annullata non si può confermare.");
  if (!p.numeroOfferta && p.totaleNetto <= 0) torna("L'offerta è vuota: aggiungi le righe prima di confermarla.");

  const [nContratto, nFoto] = await Promise.all([
    // il contratto vale sia se caricato nell'offerta sia nella commessa (se già aperta)
    prisma.documento.count({
      where: {
        cartella: "Contratto firmato",
        OR: [{ entita: "PREVENTIVO", entitaId: p.id }], // con la commessa già aperta si salva la variante (sopra)
      },
    }),
    prisma.documento.count({ where: { entita: "PREVENTIVO", entitaId: p.id, cartella: "Foto" } }),
  ]);
  const cartaceo = formData.get("contrattoCartaceo") === "on";
  if (nContratto === 0 && !cartaceo)
    torna("Carica il contratto firmato nella cartella «Contratto firmato» qui sotto, oppure spunta «firmato su carta, lo consegno in ufficio».");
  const nota = str(formData, "nota");

  await prisma.preventivo.update({
    where: { id: p.id },
    data: { stato: "ACCETTATO", archiviato: false, confermatoIl: new Date(), confermatoDaNome: utente.nome },
  });
  const commessaId = await apriCommessa(p.id, utente.nome);
  if (!commessaId) torna("Non sono riuscito ad aprire la commessa.");
  const cid = commessaId as string;

  const righeLog = [
    `Ordine confermato da ${utente.nome}: offerta ${p.numeroOfferta ?? ""} bloccata.`,
    nContratto ? `Contratto firmato allegato (${nContratto} file).` : "Contratto firmato su carta: da consegnare in ufficio.",
    nFoto ? `Foto allegate: ${nFoto}.` : null,
    nota ? `Nota per la contabilità: ${nota}` : null,
  ].filter(Boolean).join(" ");
  await log(cid, righeLog);

  // chiude la fase di accettazione (fatta dal commerciale) → il flusso crea il task dell'ufficio successivo
  const acc = await prisma.taskPratica.findFirst({ where: { commessaId: cid, faseChiave: "ACCETTAZIONE", completatoIl: null }, orderBy: { createdAt: "desc" } });
  if (acc) {
    const fd = new FormData();
    fd.set("taskId", acc.id);
    await fattoTask(fd);
  }
  // la nota del commerciale va sul task appena creato per il prossimo ufficio
  if (nota || !nContratto) {
    const prossimo = await prisma.taskPratica.findFirst({ where: { commessaId: cid, completatoIl: null, stato: { notIn: ["ANNULLATO"] } }, orderBy: { createdAt: "desc" } });
    if (prossimo) {
      const extra = [nota ? `Nota del commerciale (${utente.nome}): ${nota}` : null, !nContratto ? "⚠ Contratto firmato su carta: verificare che arrivi in ufficio." : null].filter(Boolean).join("\n");
      await prisma.taskPratica.update({ where: { id: prossimo.id }, data: { descrizione: [prossimo.descrizione, extra].filter(Boolean).join("\n\n") } });
    }
  }
  revalidatePath(`/preventivi/${p.id}`);
  revalidatePath(`/clienti/${p.clienteId}`);
  revalidatePath("/task");
  revalidatePath("/commesse");
  torna();
}

// Solo l'amministratore: riapre l'offerta confermata per una variante (la commessa resta)
export async function sbloccaPreventivo(formData: FormData) {
  const utente = await getCurrentUser();
  if (!isAmministratore(utente)) return;
  const id = str(formData, "preventivoId");
  if (!id) return;
  const p = await prisma.preventivo.update({ where: { id }, data: { confermatoIl: null, confermatoDaNome: null }, include: { commessa: true } });
  if (p.commessa) await log(p.commessa.id, `Offerta ${p.numeroOfferta ?? ""} sbloccata da ${utente!.nome} per una variante.`);
  revalidatePath(`/preventivi/${id}`);
}

/**
 * Salva la variante di un'offerta sbloccata (solo amministratore): riblocca l'offerta e aggiorna la commessa già aperta
 * (totali, acconto se non ancora incassato, materiale da ordinare). Le righe già ordinate al fornitore non si toccano.
 */
export async function salvaVariante(formData: FormData) {
  const utente = await getCurrentUser();
  if (!isAmministratore(utente)) return;
  const id = str(formData, "preventivoId");
  if (!id) return;
  const p = await prisma.preventivo.findUnique({ where: { id }, include: { commessa: true, righe: { select: { id: true } } } });
  if (!p?.commessa) return;
  const c = p.commessa;
  const totale = Math.round((p.totaleNetto + p.totaleIva) * 100) / 100;
  await prisma.preventivo.update({ where: { id }, data: { stato: "ACCETTATO", confermatoIl: new Date(), confermatoDaNome: utente!.nome } });
  await prisma.commessa.update({
    where: { id: c.id },
    data: {
      totaleVendita: totale, totaleImponibile: p.totaleNetto,
      ...(!c.accontoIncassato && c.accontoTipo === "ACCONTO" ? { accontoImporto: Math.round(totale * c.accontoPercentuale) / 100 } : {}),
    },
  });
  // materiale: le righe non ancora ordinate si rigenerano dall'offerta (tenendo il fornitore scelto), le nuove entrano
  const vecchie = await prisma.rigaOrdine.findMany({ where: { commessaId: c.id, rigaPreventivoId: { not: null }, complemento: false, ordineFornitoreId: null, ordinato: false, daMagazzino: false } });
  await prisma.rigaOrdine.deleteMany({ where: { kitDiId: { in: vecchie.map((r) => r.id) }, ordineFornitoreId: null, ordinato: false } });
  // pezzi del kit già ordinati: restano e si ricollegano alla riga rigenerata, senza ordinarli due volte
  const kitOrdinati = await prisma.rigaOrdine.findMany({ where: { kitDiId: { in: vecchie.map((r) => r.id) } } });
  await prisma.rigaOrdine.deleteMany({ where: { id: { in: vecchie.map((r) => r.id) } } });
  await assicuraRigheOfferta(c.id, true);
  for (const k of kitOrdinati) {
    const rp = vecchie.find((v) => v.id === k.kitDiId)?.rigaPreventivoId;
    const nuova = rp ? await prisma.rigaOrdine.findFirst({ where: { commessaId: c.id, rigaPreventivoId: rp, kitDiId: null } }) : null;
    if (!nuova) continue;
    await prisma.rigaOrdine.deleteMany({ where: { kitDiId: nuova.id, descrizione: k.descrizione, ordineFornitoreId: null, ordinato: false } });
    await prisma.rigaOrdine.update({ where: { id: k.id }, data: { kitDiId: nuova.id } });
  }
  for (const v of vecchie.filter((r) => r.fornitoreId)) {
    await prisma.rigaOrdine.updateMany({ where: { commessaId: c.id, rigaPreventivoId: v.rigaPreventivoId, ordineFornitoreId: null, fornitoreId: null }, data: { fornitoreId: v.fornitoreId, fornitoreNome: v.fornitoreNome } });
  }
  const idRighe = new Set(p.righe.map((r) => r.id));
  const tolteGiaOrdinate = await prisma.rigaOrdine.count({ where: { commessaId: c.id, complemento: false, rigaPreventivoId: { not: null }, NOT: { rigaPreventivoId: { in: [...idRighe] } } } });
  const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
  await log(c.id, `Variante dell'offerta ${p.numeroOfferta ?? ""} salvata da ${utente!.nome}: totale ${eur(c.totaleVendita)} → ${eur(totale)} IVA incl.; materiale aggiornato.${tolteGiaOrdinate ? ` ⚠ ${tolteGiaOrdinate} righe tolte dall'offerta erano già ordinate al fornitore: verificare.` : ""}`);
  await ricalcolaStato(c.id);
  revalidatePath(`/preventivi/${id}`);
  revalidatePath(`/commesse/${c.id}`);
  revalidatePath("/commesse");
  redirect(`/preventivi/${id}?variante=1#conferma`);
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
  await avanzaDopoIncasso(id);
  if (formData.get("ringrazia") === "1") await ringraziaPagamentoAcconto(id);
  await dopoIncassoAcconto(id);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

/** «✉️ Manda il ringraziamento al cliente» dalla pratica, se all'incasso non è stato spuntato o non è partito (es. email del cliente mancante). Una volta sola. */
export async function inviaRingraziamentoAcconto(formData: FormData) {
  const utente = await getCurrentUser();
  if (!puoGestireIncassi(utente?.ruolo)) return;
  const id = str(formData, "id");
  if (!id) return;
  await ringraziaPagamentoAcconto(id);
  revalidatePath(`/commesse/${id}`);
}

// ── Rate intermedie e sblocco del rilievo sotto il 50% (Debora, 21/11/2026) ─────────────────────────────────────
const puoIncassiOFatturazione = (u: Awaited<ReturnType<typeof getCurrentUser>>) => !!u && (puoGestireIncassi(u.ruolo) || puo(u, "fatturazione"));

/** Rata intermedia fra acconto e saldo: una scadenza d'incasso della pratica (si registra come le altre); il saldo cala di tanto. */
export async function aggiungiRataIntermedia(formData: FormData) {
  const u = await getCurrentUser();
  if (!puoIncassiOFatturazione(u)) return;
  const id = str(formData, "commessaId");
  const importo = Math.round((flt(formData, "importo") ?? 0) * 100) / 100;
  if (!id || importo <= 0) return;
  const c = await prisma.commessa.findUnique({ where: { id }, include: { cliente: { select: { nome: true } }, brand: { select: { nome: true } } } });
  if (!c) return;
  const esistenti = await prisma.scadenza.findMany({ where: { commessaId: id, origine: { startsWith: "COMMESSA_RATA_" } }, select: { origine: true } });
  const n = esistenti.reduce((m, s) => Math.max(m, Number(s.origine.replace("COMMESSA_RATA_", "")) || 0), 0) + 1;
  const data = str(formData, "data");
  await prisma.scadenza.create({
    data: {
      tipo: "INCASSO", origine: `COMMESSA_RATA_${n}`, commessaId: id, clienteId: c.clienteId, controparte: c.cliente.nome, brand: c.brand.nome,
      descrizione: str(formData, "descrizione") ?? `Rata ${n} commessa C${c.anno}-${String(c.numero).padStart(3, "0")}`, importo, dataScadenza: data ? new Date(`${data}T12:00:00Z`) : null, dataModificata: !!data,
    },
  });
  const { sincronizzaScadenzeCommesse } = await import("@/lib/amministrazione/server");
  await sincronizzaScadenzeCommesse(id);
  await log(id, `Rata intermedia ${n} di ${importo.toFixed(2)} € aggiunta da ${u!.nome}: il saldo cala di tanto.`);
  revalidatePath(`/commesse/${id}`);
}

/** Toglie una rata intermedia ancora da pagare (il saldo torna come prima). */
export async function togliRataIntermedia(formData: FormData) {
  const u = await getCurrentUser();
  if (!puoIncassiOFatturazione(u)) return;
  const s = await prisma.scadenza.findUnique({ where: { id: str(formData, "id") ?? "" }, include: { abbinamenti: true } });
  if (!s?.commessaId || !s.origine.startsWith("COMMESSA_RATA_") || s.abbinamenti.length || s.pagatoManuale > 0 || s.ritenuta > 0) return;
  await prisma.scadenza.delete({ where: { id: s.id } });
  const { sincronizzaScadenzeCommesse } = await import("@/lib/amministrazione/server");
  await sincronizzaScadenzeCommesse(s.commessaId);
  await log(s.commessaId, `Rata intermedia «${s.descrizione}» tolta da ${u!.nome}.`);
  revalidatePath(`/commesse/${s.commessaId}`);
}

const TITOLO_SBLOCCO = "Sbloccare il rilievo senza il 50% incassato";

/** Sotto il 50% il rilievo non parte: si chiede all'amministratore (email e task) di farlo partire lo stesso. */
export async function chiediSbloccoRilievo(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "commessaId");
  if (!id) return;
  const motivo = str(formData, "motivo");
  const c = await prisma.commessa.findUnique({ where: { id }, include: { cliente: { select: { nome: true } } } });
  if (!c || c.rilievoSbloccatoIl) return;
  const st = await statoSogliaRilievo(id);
  await prisma.commessa.update({ where: { id }, data: { rilievoSbloccoRichiestoIl: new Date(), rilievoSbloccoMotivo: motivo } });
  const admin = await prisma.utente.findMany({ where: { ruolo: "AMMINISTRATORE", stato: "ATTIVO" }, select: { id: true, nome: true, email: true }, orderBy: { nome: "asc" } });
  const nr = `C${c.anno}-${String(c.numero).padStart(3, "0")}`;
  const testo = `Pratica ${nr} di ${c.cliente.nome}: incassati ${(st?.incassato ?? 0).toFixed(2)} € su ${c.totaleVendita.toFixed(2)} € (serve il 50% = ${(st?.soglia ?? 0).toFixed(2)} €). ${u.nome} chiede di far partire lo stesso il rilievo${motivo ? `: ${motivo}` : "."} Nella pratica, riquadro Acconto: «🔓 Sblocca il rilievo».`;
  await prisma.taskPratica.create({ data: { commessaId: id, ufficio: "AMMINISTRAZIONE", titolo: TITOLO_SBLOCCO, descrizione: testo, creatoDa: u.nome, assegnatoUtenteId: admin[0]?.id ?? null, assegnatoNome: admin[0]?.nome ?? null } });
  const { inviaMail, APP_URL } = await import("@/lib/mail/invio");
  await inviaMail({ a: admin.map((a) => a.email).filter(Boolean) as string[], oggetto: `[CRM P&C] Richiesta: rilievo senza il 50% — ${c.cliente.nome}`, testo: `${testo}\n\n${APP_URL}/commesse/${id}#acconto`, rispondiA: u.email, daUtenteId: u.id });
  await log(id, `Chiesto all'amministratore di far partire il rilievo senza il 50% incassato (${u.nome})${motivo ? `: ${motivo}` : ""}.`);
  revalidatePath(`/commesse/${id}`);
}

/** L'amministratore fa partire il rilievo anche sotto il 50%. */
export async function sbloccaRilievo(formData: FormData) {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) return;
  const id = str(formData, "commessaId");
  if (!id) return;
  await prisma.commessa.update({ where: { id }, data: { rilievoSbloccatoIl: new Date(), rilievoSbloccatoDaNome: u!.nome } });
  await prisma.taskPratica.updateMany({ where: { commessaId: id, titolo: TITOLO_SBLOCCO, completatoIl: null }, data: { stato: "COMPLETATO", completatoIl: new Date(), completatoDaNome: u!.nome } });
  await log(id, `Rilievo sbloccato dall'amministratore (${u!.nome}) anche senza il 50% incassato.`);
  await ricalcolaStato(id);
  await avviaRilievoSePronto(id);
  revalidatePath(`/commesse/${id}`);
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
  // l'approvazione del finanziamento la segna la fatturazione (Giorgia, decisione di Debora 21/11/2026) o l'amministrazione
  if (!utente || (!puoGestireIncassi(utente.ruolo) && !puo(utente, "fatturazione"))) return;
  const id = str(formData, "id");
  const stato = str(formData, "finanziamentoStato");
  if (!id || !stato || !["IN_ISTRUTTORIA", "APPROVATO", "RIFIUTATO"].includes(stato)) return;
  await prisma.commessa.update({
    where: { id },
    data: { finanziamentoStato: stato, finanziamentoNote: str(formData, "finanziamentoNote") },
  });
  await log(id, `Finanziamento: ${stato.replace("_", " ").toLowerCase()}.${stato === "APPROVATO" ? " Rilievo sbloccato." : ""}`);
  await ricalcolaStato(id);
  if (stato === "APPROVATO") await dopoIncassoAcconto(id);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

/** Spunta «invia al cliente» dei moduli: se il modulo non ha la spunta (vecchi moduli) si invia come sempre. */
const inviaAlCliente = (fd: FormData) => !fd.has("conSpuntaCliente") || fd.get("inviaCliente") === "1";

export async function programmaRilievo(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const commessaId = str(formData, "commessaId");
  const tecnicoId = str(formData, "tecnicoId");
  const dataStr = str(formData, "dataOra");
  if (!commessaId || !tecnicoId || !dataStr) return;
  const dataOra = daOraRoma(dataStr);
  if (!dataOra) return;
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: true } });
  if (!c) return;
  if (!(await statoSogliaRilievo(c.id))?.viaLibera) return; // blocco: rilievo solo con il 50% incassato, finanziamento approvato o sblocco
  const percorso = await percorsoDiCommessa(commessaId);
  if (percorso && !percorso.progettoCreatoIl && !percorso.legacy) return; // blocco: prima si crea il progetto
  const indirizzo =
    str(formData, "indirizzo") ??
    [c.cliente.indirizzo, c.cliente.cap, c.cliente.comune, c.cliente.provincia].filter(Boolean).join(", ");
  const r = await prisma.rilievo.create({
    data: { commessaId, tecnicoId, dataOra, indirizzo: indirizzo || null, note: str(formData, "note") },
    include: { tecnico: true },
  });
  await log(commessaId, `Rilievo programmato il ${dataOra.toLocaleString("it-IT", { timeZone: "Europe/Rome" })} con ${r.tecnico.nome}.`);
  const inv = await inviaInvito(`RILIEVO:${r.id}`);
  if (inv.inviati.length) await log(commessaId, `Invito calendario inviato a ${inv.inviati.join(", ")}.`);
  // flusso: il centralino fissa il rilievo → mail al cliente e il task passa al rilevatore scelto
  const quando = dataOra.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  if (inviaAlCliente(formData)) await inviaMailPratica(commessaId, "rilievo fissato", (d) => mailRilievoFissato({ ...d, quando, tecnico: r.tecnico.nome, indirizzo: indirizzo || null }));
  await avvisaCommerciale(commessaId, "Rilievo fissato", `Il rilievo è stato fissato per ${quando} con ${r.tecnico.nome}${indirizzo ? ` (${indirizzo})` : ""}. Fissato da ${utente.nome}.`);
  await chiudiTaskFase(commessaId, "RILIEVO_APP", { id: r.tecnico.id, nome: r.tecnico.nome });
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
  await inviaInvito(`RILIEVO:${r.id}`, "CANCEL");
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
  // verbale di sopralluogo (spunte, stato dell'immobile, posa, prodotti da installare) compilato al passo 2
  const verbale = verbaleDaForm((k) => { const v = formData.get(k); return typeof v === "string" ? v : null; }, (k) => formData.getAll(k).filter((x): x is string => typeof x === "string"));
  const r = await prisma.rilievo.update({
    where: { id },
    data: { misure, note: note ?? undefined, stato: "ESEGUITO", eseguitoIl: new Date(), verbale: verbaleCompilato(verbale) ? (verbale as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
  });
  if (foto.length) {
    await prisma.rilievoAllegato.createMany({
      data: foto
        .filter((f) => typeof f.dataUri === "string" && f.dataUri.startsWith("data:"))
        .slice(0, 12)
        .map((f) => ({ rilievoId: id, nome: f.nome ?? null, dataUri: f.dataUri })),
    });
  }
  // i file del rilievo stanno anche nelle cartelle della pratica (Ugo 21/11/2026): i PDF in «Rilievi misura», le foto in «Foto rilievi»,
  // così si trovano tra i documenti e si allegano agli ordini (senza doppioni: `fileRilievo` salta quelli già in cartella)
  for (const f of foto.filter((x) => typeof x.dataUri === "string" && x.dataUri.startsWith("data:")).slice(0, 12)) {
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(f.dataUri);
    if (!m) continue;
    const contenuto = Buffer.from(m[2], "base64");
    if (!contenuto.length) continue;
    const nome = (f.nome ?? "").trim() || `rilievo-${Date.now()}.${m[1] === "application/pdf" ? "pdf" : (m[1].split("/")[1] ?? "jpg")}`;
    const cartella = m[1] === "application/pdf" ? "Rilievi misura" : "Foto rilievi";
    const dove = { entita: "COMMESSA", entitaId: r.commessaId, cartella, nome };
    if (await prisma.documento.findFirst({ where: dove, select: { id: true } })) continue;
    await prisma.documento.create({ data: { ...dove, mime: m[1], dimensione: contenuto.length, contenuto, caricatoDaNome: utente.nome } });
  }
  await assicuraRigheOfferta(r.commessaId);
  // materiale aggiunto nel modulo del rilievo (solo acquisto): si salva tutto insieme al rilievo
  let complementi: Complemento[] = [];
  try { const raw = str(formData, "complementi"); if (raw) complementi = JSON.parse(raw); } catch { complementi = []; }
  const aggiunti: string[] = [], errori: string[] = [];
  for (const x of (Array.isArray(complementi) ? complementi : []).slice(0, 60)) {
    const e = await creaComplemento(r.commessaId, x);
    if (e.errore) errori.push(e.errore); else if (e.descrizione) aggiunti.push(e.descrizione);
  }
  await log(r.commessaId, `Rilievo eseguito e caricato${foto.length ? ` (${foto.length} file tra foto e PDF)` : ""}${aggiunti.length ? `; materiale aggiunto (solo acquisto): ${aggiunti.join("; ")}` : ""}.`);
  await ricalcolaStato(r.commessaId);
  // flusso: rilievo eseguito → il task passa all'ufficio ordini (Laura)
  await chiudiTaskFase(r.commessaId, "RILIEVO");
  revalidatePath(`/commesse/${r.commessaId}`);
  revalidatePath("/commesse");
  const fatto = `Rilievo salvato${foto.length ? `: ${foto.length} file` : ""}${aggiunti.length ? `, ${aggiunti.length} materiali aggiunti` : ""}.`;
  redirect(`/commesse/${r.commessaId}?carica=${id}&salvato=1&fatto=${encodeURIComponent(fatto)}${errori.length ? `&avvisoRilievo=${encodeURIComponent(`Non aggiunti: ${errori.join(" · ")}`)}` : ""}`);
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
    centroCosto: str(fd, "centroCosto"),
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
  await assicuraRigheOfferta(id);
  revalidatePath(`/commesse/${id}`);
}

/** Porta nell'elenco del materiale le righe dell'offerta (quello che ha segnato il commerciale) non ancora presenti. */
async function assicuraRigheOfferta(id: string, silenzioso = false) {
  const c = await prisma.commessa.findUnique({
    where: { id },
    include: { righeOrdine: true, preventivo: { include: { righe: { include: { prodotto: true, optionali: { select: { quantita: true, nota: true, optional: { select: { categoria: true, nome: true } } } } }, orderBy: [{ ordine: "asc" }, { id: "asc" }] } } } },
  });
  if (!c) return;
  const giaPresenti = new Set(c.righeOrdine.map((r) => r.rigaPreventivoId).filter(Boolean));
  const daAggiungere = c.preventivo.righe.filter((r) => !giaPresenti.has(r.id));
  const acquisto = await datiAcquisto(daAggiungere);
  const nuove = daAggiungere
    .map((r) => {
      let desc = r.testoLibero ?? (r.prodotto ? r.prodotto.tipologia.replace(/_/g, " ") : "Riga");
      if (r.prodotto && r.prodotto.colore && !/TARIFFA|Prezzo a/.test(r.prodotto.colore)) desc += ` — ${r.prodotto.colore}`;
      if (r.misuraLarghezza && r.misuraAltezza) desc += ` (${r.misuraLarghezza}×${r.misuraAltezza})`;
      if (r.optionalDescrizione) desc += ` + ${r.optionalDescrizione}`;
      // colore esterno/interno, vetri e accessori scelti nell'offerta: servono al rilievo e nell'ordine al fornitore
      if (r.optionali.length) desc += ` — ${sceltePerRilievo(r.optionali)}`;
      const acq = acquisto.get(r.id);
      return { commessaId: id, rigaPreventivoId: r.id, descrizione: desc, quantita: r.quantita, ...acq };
    });
  if (nuove.length) {
    for (const [i, n] of nuove.entries()) {
      const rp = daAggiungere[i];
      const creata = await prisma.rigaOrdine.create({ data: { ...n, prodottoId: rp.prodottoId ?? null } });
      await aggiungiKit(id, { id: creata.id, quantita: creata.quantita, prodottoId: rp.prodottoId ?? null, larghezza: rp.misuraLarghezza, altezza: rp.misuraAltezza });
    }
    if (!silenzioso) await log(id, `Materiale dell'offerta portato nella pratica: ${nuove.length} righe da ordinare.`);
  }
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
      // la spunta a mano vale come arrivo completo (le bolle registrano gli arrivi parziali)
      ...(arrivato !== prima.arrivato ? { quantitaArrivata: arrivato ? prima.quantita : 0 } : {}),
      // una riga già in un ordine fornitore resta di quel fornitore
      fornitoreId: prima.ordineFornitoreId ? prima.fornitoreId : fornitoreId,
      fornitoreNome: prima.ordineFornitoreId ? prima.fornitoreNome : (forn?.ragioneSociale ?? null),
      ...(prima.ordineFornitoreId || fornitoreId === prima.fornitoreId ? {} : { costoPrevisto: null, scontoAcquisto: null }),
      costoEffettivo: costo,
      note: str(formData, "note"),
    },
  });
  if (!prima.commessaId) return;
  if (ordinato && !prima.ordinato) await log(prima.commessaId, `Ordine vidimato: ${prima.descrizione}${forn ? " (" + forn.ragioneSociale + ")" : ""}.`);
  if (arrivato && !prima.arrivato) await log(prima.commessaId, `Merce arrivata: ${prima.descrizione}.`);
  if (arrivato !== prima.arrivato) await prisma.$transaction((tx) => verificaMaterialeCommessa(tx, prima.commessaId!, u.nome));
  revalidatePath(`/commesse/${prima.commessaId}`);
}

// ============ COSTI MANUALI ============
export async function aggiungiCostoManuale(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  const categoria = str(formData, "categoria") ?? "ALTRO";
  let descrizione = str(formData, "descrizione");
  const importo = flt(formData, "importo");
  if (categoria === "ACQUISTO_MATERIALE") {
    const fid = str(formData, "fornitoreId");
    const forn = fid ? await prisma.soggetto.findUnique({ where: { id: fid } }) : null;
    const nf = str(formData, "fatturaNumero");
    descrizione = `Acquisto materiale${forn ? " — " + forn.ragioneSociale : ""}${nf ? " (fatt. " + nf + ")" : ""}`;
  }
  if (!commessaId || !descrizione || importo === null) return;
  await prisma.costoManuale.create({
    data: { commessaId, descrizione, importo, categoria, autoreNome: u.nome },
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

// ============ POSA ============
export async function programmaPosa(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  const dataStr = str(formData, "dataInizio");
  if (!commessaId || !dataStr) return;
  const dataInizio = daOraRoma(dataStr);
  if (!dataInizio) return;
  const sel = str(formData, "assegnatario") ?? "";
  let ass: { assegnatoUtenteId: string | null; assegnatoSoggettoId: string | null; assegnatoNome: string | null; tipo: string } = {
    assegnatoUtenteId: null, assegnatoSoggettoId: null, assegnatoNome: null, tipo: "INTERNA",
  };
  if (sel.startsWith("U:")) {
    const ut = await prisma.utente.findUnique({ where: { id: sel.slice(2) } });
    if (ut) ass = { assegnatoUtenteId: ut.id, assegnatoSoggettoId: null, assegnatoNome: ut.nome, tipo: "INTERNA" };
  } else if (sel.startsWith("S:")) {
    const so = await prisma.soggetto.findUnique({ where: { id: sel.slice(2) } });
    if (so) ass = { assegnatoUtenteId: so.utenteId, assegnatoSoggettoId: so.id, assegnatoNome: so.ragioneSociale, tipo: so.ruoli.includes("POSATORE_ESTERNO") ? "ESTERNA" : "INTERNA" };
  }
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: true } });
  if (!c) return;
  const indirizzo = str(formData, "indirizzo") ?? [c.cliente.indirizzo, c.cliente.cap, c.cliente.comune, c.cliente.provincia].filter(Boolean).join(", ");
  const giorni = Math.max(1, Math.round(flt(formData, "giorniPrevisti") ?? 1));
  const nuovaPosa = await prisma.posa.create({
    data: { commessaId, ...ass, squadra: str(formData, "squadra"), dataInizio, giorniPrevisti: giorni, indirizzo: indirizzo || null, note: str(formData, "note") },
  });
  await prisma.commessa.update({ where: { id: commessaId }, data: { stato: "POSA" } });
  // la fase Posa passa "in corso" e assegnata
  await prisma.faseCommessa.updateMany({
    where: { commessaId, tipo: "POSA", stato: { not: "CHIUSA" } },
    data: { stato: "IN_CORSO", assegnatoUtenteId: ass.assegnatoUtenteId, assegnatoSoggettoId: ass.assegnatoSoggettoId, assegnatoNome: ass.assegnatoNome },
  });
  await log(commessaId, `Posa programmata dal ${dataInizio.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} (${giorni} gg) — ${ass.tipo === "ESTERNA" ? "posatore esterno" : "squadra interna"}${ass.assegnatoNome ? ": " + ass.assegnatoNome : ""}.`);
  const invP = await inviaInvito(`POSA:${nuovaPosa.id}`);
  if (invP.inviati.length) await log(commessaId, `Invito calendario della posa inviato a ${invP.inviati.join(", ")}.`);
  // flusso: il centralino fissa la posa → mail al cliente (come far trovare l'ambiente di lavoro, conferma della data) e il task passa alla squadra
  const quandoPosa = dataInizio.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  if (inviaAlCliente(formData)) await inviaMailPratica(commessaId, "posa fissata", (d) => mailPosaFissata({ ...d, quando: quandoPosa, giorni: giorni, squadra: ass.assegnatoNome, indirizzo: indirizzo || null }));
  await avvisaCommerciale(commessaId, "Posa fissata", `La posa è stata fissata per ${quandoPosa} (${giorni} ${giorni === 1 ? "giorno" : "giorni"})${ass.assegnatoNome ? ` con ${ass.assegnatoNome}` : ""}. Fissata da ${u.nome}.`);
  await chiudiTaskFase(commessaId, "POSA_APP", ass.assegnatoUtenteId && ass.assegnatoNome ? { id: ass.assegnatoUtenteId, nome: ass.assegnatoNome } : null);
  revalidatePath(`/commesse/${commessaId}`);
  revalidatePath("/lavori");
  revalidatePath("/calendario");
}

export async function annullaPosa(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "posaId");
  if (!id) return;
  const p = await prisma.posa.update({ where: { id }, data: { stato: "ANNULLATA" } });
  await log(p.commessaId, "Posa annullata.");
  await inviaInvito(`POSA:${p.id}`, "CANCEL");
  revalidatePath(`/commesse/${p.commessaId}`);
  revalidatePath("/lavori");
}

export async function avviaPosa(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "posaId");
  if (!id) return;
  const prima = await prisma.posa.findUnique({ where: { id }, include: { commessa: true } });
  if (!prima || !prima.commessa.saldoIncassato) return; // il materiale esce solo a saldo incassato
  const p = await prisma.posa.update({ where: { id }, data: { stato: "IN_CORSO", avviataIl: new Date() } });
  await log(p.commessaId, `Posa avviata da ${u.nome}.`);
  revalidatePath(`/commesse/${p.commessaId}`);
  revalidatePath("/lavori");
}

function fotoDaForm(formData: FormData): { nome: string; dataUri: string }[] {
  try {
    const raw = str(formData, "foto");
    const arr = raw ? JSON.parse(raw) : [];
    return (Array.isArray(arr) ? arr : [])
      .filter((f) => typeof f?.dataUri === "string" && f.dataUri.startsWith("data:"))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export async function caricaFotoPosa(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "posaId");
  if (!id) return;
  const foto = fotoDaForm(formData);
  if (!foto.length) return;
  const cat = ["PRIMA", "DURANTE", "DOPO", "PROBLEMA"].includes(str(formData, "categoria") ?? "") ? (str(formData, "categoria") as string) : "DURANTE";
  const p = await prisma.posa.findUnique({ where: { id } });
  if (!p) return;
  await prisma.posaFoto.createMany({ data: foto.map((f) => ({ posaId: id, categoria: cat, nome: f.nome ?? null, dataUri: f.dataUri, autoreNome: u.nome })) });
  await log(p.commessaId, `${foto.length} foto posa caricate (${cat.toLowerCase()}) da ${u.nome}.`);
  revalidatePath(`/commesse/${p.commessaId}`);
  revalidatePath("/lavori");
}

// Fine lavori: verbale, firma cliente, foto finali; chiude anche la fase "Posa" con ore e costo
export async function completaPosa(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "posaId");
  if (!id) return;
  const p = await prisma.posa.findUnique({ where: { id } });
  if (!p || p.stato === "COMPLETATA") return;
  const foto = fotoDaForm(formData);
  const firma = str(formData, "firmaCliente");
  await prisma.posa.update({
    where: { id },
    data: {
      stato: "COMPLETATA",
      completataIl: new Date(),
      noteFine: str(formData, "noteFine"),
      nomeFirmatario: str(formData, "nomeFirmatario"),
      firmaCliente: firma && firma.startsWith("data:") ? firma : null,
    },
  });
  if (foto.length) {
    await prisma.posaFoto.createMany({ data: foto.map((f) => ({ posaId: id, categoria: "DOPO", nome: f.nome ?? null, dataUri: f.dataUri, autoreNome: u.nome })) });
  }
  // chiusura fase POSA con costo
  const esterna = str(formData, "tipoCosto") === "ESTERNA";
  const fattImporto = flt(formData, "fatturaImporto");
  const fattNumero = str(formData, "fatturaNumero");
  const ore = esterna ? null : flt(formData, "ore");
  const costoOrario = esterna ? null : flt(formData, "costoOrario");
  const forfait = esterna ? fattImporto : flt(formData, "forfait");
  const costoTotale = forfait ?? (ore !== null && costoOrario !== null ? Math.round(ore * costoOrario * 100) / 100 : 0);
  if (esterna) {
    await prisma.posa.update({ where: { id }, data: { tipo: "ESTERNA", fatturaEsternaNumero: fattNumero, fatturaEsternaImporto: fattImporto } });
  }
  const fase = await prisma.faseCommessa.findFirst({ where: { commessaId: p.commessaId, tipo: "POSA", stato: { not: "CHIUSA" } } });
  if (fase) {
    await prisma.faseCommessa.update({
      where: { id: fase.id },
      data: { stato: "CHIUSA", ore, costoOrario, forfait, costoTotale, chiusaIl: new Date(), chiusaDaNome: u.nome, assegnatoNome: fase.assegnatoNome ?? p.assegnatoNome, note: esterna ? `Fattura squadra esterna${fattNumero ? " n. " + fattNumero : ""}` : fase.note },
    });
  }
  // flusso: il centralino carica i documenti di fine lavori e segna la posa. Completa → lavori eseguiti, recensione al cliente e task kit al commerciale.
  // Parziale → la pratica resta in posa, al cliente le scuse e il centralino fissa un'altra data.
  // Parziale (Ugo, 21/11/2026) in due modi: si torna solo per finire (→ appuntamento di posa) oppure serve materiale mancante, rotto o in garanzia (→ ufficio ordini)
  const esito = str(formData, "esitoPosa") ?? "COMPLETA";
  const parziale = esito === "PARZIALE" || esito === "PARZIALE_MATERIALE";
  const conMateriale = esito === "PARZIALE_MATERIALE";
  const cosaServe = str(formData, "materialeServe");
  if (!parziale) await prisma.commessa.update({ where: { id: p.commessaId }, data: { stato: "LAVORI_ESEGUITI" } });
  await log(p.commessaId, `Posa ${parziale ? (conMateriale ? "PARZIALE: serve materiale" + (cosaServe ? ` (${cosaServe})` : "") + ", passa all'ufficio ordini" : "PARZIALE (si torna per finire)") : "completata"} da ${u.nome}${costoTotale ? ` — costo posa ${costoTotale.toFixed(2)} €` : ""}${firma ? ", verbale firmato dal cliente" : ""}.`);
  await chiudiTaskFase(p.commessaId, "POSA");
  if (parziale) {
    if (inviaAlCliente(formData)) await inviaMailPratica(p.commessaId, "posa parziale: scuse", (d) => mailPosaParziale({ ...d, note: str(formData, "noteFine") }));
    // si apre l'intervento di fine posa dentro il progetto: con materiale si passa prima dall'ufficio ordini, altrimenti il centralino lo fissa subito
    const note = str(formData, "noteFine");
    const iv = await prisma.assistenza.create({ data: { commessaId: p.commessaId, tipo: "FINE_POSA", descrizione: `Finire la posa${note ? `: ${note}` : ""}`, serveMateriale: conMateriale, ricambioNote: conMateriale ? cosaServe : null, stato: conMateriale ? "IN_ATTESA_RICAMBIO" : "APERTA", assegnatoUtenteId: p.assegnatoUtenteId, assegnatoNome: p.assegnatoNome, aperturaDa: u.nome } });
    await log(p.commessaId, `Aperto l'intervento n.${iv.numero} di fine posa${conMateriale ? " (serve materiale)" : ""}.`);
    if (conMateriale) await apriRiordino(p.commessaId, cosaServe, "Posa parziale", u.nome);
    else await taskFissareIntervento(p.commessaId, iv.numero, "FINE_POSA", `Posa parziale, intervento n.${iv.numero} per finire il lavoro. Note: ${note ?? "—"}`, u.nome);
  } else {
    const inviata = inviaAlCliente(formData) ? await inviaMailPratica(p.commessaId, "lavoro terminato: richiesta di recensione", (d) => mailPosaCompletata({ ...d, linkRecensione: process.env.RECENSIONI_URL || undefined })) : false;
    if (inviata) await prisma.commessa.update({ where: { id: p.commessaId }, data: { recensioneRichiestaIl: new Date() } });
    // il commerciale riceve il task (e la mail di avviso) per consegnare il kit di manutenzione
    await avviaFaseFlusso(p.commessaId, "KIT", "POSA", u.nome);
  }
  revalidatePath(`/commesse/${p.commessaId}`);
  revalidatePath("/lavori");
}

// ============ SALDO E CONFERMA POSA ============
export async function registraSaldo(formData: FormData) {
  const u = await getCurrentUser();
  if (!puoGestireIncassi(u?.ruolo)) return;
  const id = str(formData, "id");
  if (!id) return;
  const c = await prisma.commessa.findUnique({ where: { id } });
  if (!c) return;
  const importo = flt(formData, "importo") ?? 0;
  const dataFatt = str(formData, "fatturaData");
  await prisma.commessa.update({
    where: { id },
    data: {
      saldoIncassato: true,
      saldoIncassatoIl: new Date(),
      saldoImporto: importo,
      saldoModalita: str(formData, "modalita"),
      fatturaSaldoNumero: str(formData, "fatturaNumero"),
      fatturaSaldoData: dataFatt ? new Date(dataFatt) : null,
      stato: ["IN_ATTESA_ACCONTO", "RILIEVO_DA_PROGRAMMARE", "RILIEVO_PROGRAMMATO", "RILIEVO_ESEGUITO", "ORDINI"].includes(c.stato) ? "SALDO_INCASSATO" : c.stato,
    },
  });
  await log(id, `Saldo incassato: ${importo.toFixed(2)} €${str(formData, "fatturaNumero") ? " — fattura n. " + str(formData, "fatturaNumero") : ""}. Materiale rilasciabile e posa confermabile.`);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

export async function annullaSaldo(formData: FormData) {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) return;
  const id = str(formData, "id");
  if (!id) return;
  const c = await prisma.commessa.update({ where: { id }, data: { saldoIncassato: false, saldoIncassatoIl: null, saldoImporto: null, saldoModalita: null, fatturaSaldoNumero: null, fatturaSaldoData: null } });
  if (c.stato === "SALDO_INCASSATO") await prisma.commessa.update({ where: { id }, data: { stato: "RILIEVO_ESEGUITO" } });
  await log(id, "Saldo annullato dal responsabile.");
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

export async function confermaGiornoPosa(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "posaId");
  if (!id) return;
  const p = await prisma.posa.findUnique({ where: { id }, include: { commessa: true } });
  if (!p || !p.commessa.saldoIncassato) return;
  await prisma.posa.update({ where: { id }, data: { confermata: true, confermataIl: new Date() } });
  await log(p.commessaId, `Giorno di posa confermato al cliente (${p.dataInizio.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}) da ${u.nome}.`);
  revalidatePath(`/commesse/${p.commessaId}`);
}


// ============ CHIUSURA COMMESSA ============
export async function chiudiCommessa(formData: FormData) {
  const u = await getCurrentUser();
  if (!puoGestireIncassi(u?.ruolo)) return;
  const id = str(formData, "id");
  if (!id) return;
  const c = await prisma.commessa.findUnique({ where: { id } });
  if (!c || c.stato !== "LAVORI_ESEGUITI") return;
  await prisma.commessa.update({
    where: { id },
    data: { stato: "CHIUSA", chiusaIl: new Date(), fatturaFinaleNote: str(formData, "fatturaFinaleNote"), garanziaMesi: Math.round(flt(formData, "garanziaMesi") ?? 24) },
  });
  await log(id, `Commessa chiusa da ${u!.nome}.`);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

export async function riapriCommessa(formData: FormData) {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) return;
  const id = str(formData, "id");
  if (!id) return;
  await prisma.commessa.update({ where: { id }, data: { stato: "LAVORI_ESEGUITI", chiusaIl: null } });
  await log(id, `Commessa riaperta da ${u!.nome}.`);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

export async function segnaRecensioneRichiesta(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  if (!id) return;
  await prisma.commessa.update({ where: { id }, data: { recensioneRichiestaIl: new Date() } });
  await log(id, `Richiesta recensione al cliente (${u.nome}).`);
  revalidatePath(`/commesse/${id}`);
}

// ============ INTERVENTI DEL PROGETTO (ex assistenza) ============
// Ugo, 21/11/2026: dentro il progetto si apre un intervento per finire la posa, una manutenzione, un sopralluogo o un secondo rilievo.
// Può chiedere materiale (riordino all'ufficio ordini), si fissa con incaricato e giorno (va in calendario) e si chiude con il report.

/** Riordino del materiale: la pratica torna all'ufficio ordini; all'arrivo in magazzino si torna a fissare l'intervento o la posa. */
async function apriRiordino(commessaId: string, cosaServe: string | null, perche: string, chi: string) {
  await prisma.commessa.update({ where: { id: commessaId }, data: { riordinoIl: new Date(), riordinoNote: cosaServe, materialeCompletoIl: null } });
  await prisma.taskPratica.create({ data: { commessaId, faseChiave: "ORDINI", ufficio: "ORDINI", titolo: `${perche}: ordinare il materiale mancante, rotto o in garanzia`, descrizione: `${perche}: serve materiale.${cosaServe ? ` Cosa serve: ${cosaServe}.` : ""} Nella pratica, Materiale e ordini: aggiungi il materiale, crea e invia gli ordini (email o portale del fornitore). All'arrivo in magazzino il centralino fissa l'intervento.`, creatoDa: chi } });
}

/** Task al centralino per fissare l'intervento (si chiude da solo quando l'intervento ha giorno e incaricato). */
const titoloFissare = (numero: number, tipo: string) => `Fissare l'intervento n.${numero} (${nomeIntervento(tipo).replace(/^\S+ /, "")})`;
async function taskFissareIntervento(commessaId: string, numero: number, tipo: string, descrizione: string, chi: string) {
  await prisma.taskPratica.create({ data: { commessaId, ufficio: "CENTRALINO", titolo: titoloFissare(numero, tipo), descrizione: `${descrizione}. Nella pratica, sezione Interventi: scegli chi va e il giorno (va nel suo calendario).`, creatoDa: chi } });
}
async function chiudiTaskFissare(commessaId: string, numero: number, tipo: string, chi: string) {
  await prisma.taskPratica.updateMany({ where: { commessaId, faseChiave: null, titolo: titoloFissare(numero, tipo), completatoIl: null }, data: { stato: "COMPLETATO", completatoIl: new Date(), completatoDaNome: chi } });
}

export async function creaAssistenza(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  const descrizione = str(formData, "descrizione");
  if (!commessaId || !descrizione) return;
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { pose: true } });
  if (!c) return;
  const fine = c.pose.filter((p) => p.completataIl).map((p) => p.completataIl as Date).sort((x, y) => y.getTime() - x.getTime())[0];
  let inGaranzia = true;
  if (fine) {
    const scad = new Date(fine);
    scad.setMonth(scad.getMonth() + c.garanziaMesi);
    inGaranzia = scad.getTime() >= Date.now();
  }
  const tipo = tipoValido(str(formData, "tipo"));
  const serveMateriale = formData.get("serveMateriale") === "1";
  const ass = str(formData, "assegnatoUtenteId");
  const ut = ass ? await prisma.utente.findUnique({ where: { id: ass } }) : null;
  const dt = str(formData, "dataIntervento");
  const a = await prisma.assistenza.create({
    data: {
      commessaId,
      descrizione,
      tipo,
      serveMateriale,
      prodotto: str(formData, "prodotto"),
      priorita: str(formData, "priorita") ?? "NORMALE",
      inGaranzia,
      assegnatoUtenteId: ut?.id ?? null,
      assegnatoNome: ut?.nome ?? null,
      dataIntervento: dt ? daOraRoma(dt) : null,
      stato: serveMateriale ? "IN_ATTESA_RICAMBIO" : dt ? "PROGRAMMATA" : "APERTA",
      ricambioNote: serveMateriale ? str(formData, "materialeServe") : null,
      aperturaDa: u.nome,
    },
  });
  await log(commessaId, `Intervento n.${a.numero} (${nomeIntervento(tipo)}) aperto da ${u.nome}: ${descrizione}${serveMateriale ? " — serve materiale, passa all'ufficio ordini" : ""}${inGaranzia ? "" : " (fuori garanzia)"}`);
  if (serveMateriale) await apriRiordino(commessaId, str(formData, "materialeServe"), `Intervento n.${a.numero}`, u.nome);
  else if (!dt) await taskFissareIntervento(commessaId, a.numero, tipo, `Intervento n.${a.numero}: ${descrizione}`, u.nome);
  if (dt && ut) await inviaInvito(`ASSISTENZA:${a.id}`);
  revalidatePath(`/commesse/${commessaId}`);
  revalidatePath("/assistenza");
  revalidatePath("/calendario");
}

export async function aggiornaAssistenza(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  if (!id) return;
  const prima = await prisma.assistenza.findUnique({ where: { id } });
  if (!prima) return;
  const ass = formData.has("assegnatoUtenteId") ? str(formData, "assegnatoUtenteId") : prima.assegnatoUtenteId;
  const ut = ass ? await prisma.utente.findUnique({ where: { id: ass } }) : null;
  const dt = formData.has("dataIntervento") ? str(formData, "dataIntervento") : null;
  const data = formData.has("dataIntervento") ? (dt ? daOraRoma(dt) : null) : prima.dataIntervento;
  let stato = str(formData, "stato") ?? prima.stato;
  if ((stato === "APERTA" || stato === "IN_ATTESA_RICAMBIO") && data && !str(formData, "stato")) stato = "PROGRAMMATA";
  const lavoroFinito = stato === "RISOLTA" && formData.get("lavoroFinito") === "1";
  await prisma.assistenza.update({
    where: { id },
    data: {
      stato,
      assegnatoUtenteId: ut?.id ?? null,
      assegnatoNome: ut?.nome ?? null,
      dataIntervento: data,
      ricambioNote: formData.has("ricambioNote") ? str(formData, "ricambioNote") : prima.ricambioNote,
      esito: formData.has("esito") ? str(formData, "esito") : prima.esito,
      costo: formData.has("costo") ? flt(formData, "costo") : prima.costo,
      lavoroFinito,
      risoltaIl: stato === "RISOLTA" ? prima.risoltaIl ?? new Date() : null,
    },
  });
  const nome = `Intervento n.${prima.numero} (${nomeIntervento(prima.tipo)})`;
  if (stato !== prima.stato) await log(prima.commessaId, `${nome}: ${prima.stato} → ${stato} (${u.nome})${stato === "RISOLTA" && str(formData, "esito") ? `. Report: ${str(formData, "esito")}` : ""}.`);
  if (data && ut && (data.getTime() !== prima.dataIntervento?.getTime() || ut.id !== prima.assegnatoUtenteId)) {
    await chiudiTaskFissare(prima.commessaId, prima.numero, prima.tipo, u.nome);
    await inviaInvito(`ASSISTENZA:${id}`);
  }
  if (stato === "RISOLTA" && prima.stato !== "RISOLTA") {
    await chiudiTaskFissare(prima.commessaId, prima.numero, prima.tipo, u.nome);
    const altri = await prisma.assistenza.findMany({ where: { commessaId: prima.commessaId, id: { not: id } }, select: { tipo: true, stato: true } });
    const c = await prisma.commessa.findUnique({ where: { id: prima.commessaId }, select: { stato: true } });
    if (chiusuraIntervento({ tipo: prima.tipo, lavoroFinito }, altri).lavoriEseguiti && c && !["LAVORI_ESEGUITI", "CHIUSA"].includes(c.stato)) {
      // come una posa finita: lavori eseguiti, recensione al cliente (con la spunta) e kit al commerciale
      await prisma.commessa.update({ where: { id: prima.commessaId }, data: { stato: "LAVORI_ESEGUITI" } });
      await log(prima.commessaId, `${nome} chiuso con lavoro finito: lavori eseguiti.`);
      const inviata = inviaAlCliente(formData) ? await inviaMailPratica(prima.commessaId, "lavoro terminato: richiesta di recensione", (d) => mailPosaCompletata({ ...d, linkRecensione: process.env.RECENSIONI_URL || undefined })) : false;
      if (inviata) await prisma.commessa.update({ where: { id: prima.commessaId }, data: { recensioneRichiestaIl: new Date() } });
      await avviaFaseFlusso(prima.commessaId, "KIT", "POSA", u.nome);
    }
  }
  revalidatePath(`/commesse/${prima.commessaId}`);
  revalidatePath("/assistenza");
  revalidatePath("/calendario");
}

// ── Presa in carico di un lavoro iniziato in BConsole ─────────────────────────
// Dall'ordine cliente BConsole (DocumentoBC) nasce l'offerta (già confermata, con le righe dell'ordine) e la pratica:
// si agganciano le fatture BConsole dello stesso progetto (gli incassi arrivano da lì, niente rate automatiche)
// e la trafila dei task riparte dalla fase scelta (es. «Evasione ordini»).
const STATO_PER_FASE: Record<string, string> = {
  ACCETTAZIONE: "IN_ATTESA_ACCONTO", FATT_ACCONTO: "IN_ATTESA_ACCONTO", RILIEVO: "RILIEVO_DA_PROGRAMMARE", ORDINI: "ORDINI", FATT_SALDO: "ORDINI", POSA: "POSA",
};

export async function prendiInCaricoOrdineBC(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const { puo } = await import("@/lib/permessi/catalogo");
  const docId = str(formData, "docId") ?? "";
  const fase = str(formData, "fase") ?? "FATT_ACCONTO";
  const ritorno = str(formData, "ritorno") ?? "/clienti";
  const dove = (p: Record<string, string>) => redirect(`${ritorno}${ritorno.includes("?") ? "&" : "?"}${new URLSearchParams(p)}`);
  // la presa in carico la fa l'ufficio (amministrazione / fatturazione), non tecnici o posatori
  if (!puo(u, "amministrazione") && !puo(u, "provvigioni")) dove({ errore: "Non hai il permesso di prendere in carico i lavori di BConsole" });
  const d = await prisma.documentoBC.findUnique({ where: { id: docId } });
  if (!d || d.tipo !== "ORDINE") dove({ errore: "Ordine BConsole non trovato" });
  if (d!.commessaId) redirect(`/commesse/${d!.commessaId}`);
  if (!d!.clienteId) dove({ errore: "L'ordine non è collegato a un cliente del CRM" });
  await assicuraFlusso();
  const f = await prisma.flussoFase.findUnique({ where: { chiave: fase } });
  if (!f) dove({ errore: "Fase non valida" });
  const cliente = (await prisma.cliente.findUnique({ where: { id: d!.clienteId! } }))!;

  // commerciale dalla sigla BConsole, marchio dal nome
  const { SIGLE_COMMERCIALI } = await import("@/lib/clienti/bconsole");
  const username = d!.agente ? SIGLE_COMMERCIALI[d!.agente.toUpperCase()] : undefined;
  const commerciale = (username && (await prisma.utente.findFirst({ where: { username } }))) || u;
  const brand = (d!.marchio && (await prisma.brand.findFirst({ where: { nome: { equals: d!.marchio, mode: "insensitive" } } }))) || { id: cliente.brandId };
  const righe = (Array.isArray(d!.righe) ? d!.righe : []) as { dsc?: string; qta?: number | null; imponibile?: number | null }[];
  const imponibile = d!.imponibile || righe.reduce((t, r) => t + (r.imponibile ?? 0), 0);
  const totale = d!.totale || imponibile;

  // fatture BConsole dello stesso progetto (non ancora agganciate ad altre pratiche)
  const fatture = d!.progetto
    ? await prisma.fatturaVendita.findMany({ where: { progetto: d!.progetto, commessaId: null } })
    : [];
  const scadenze = fatture.length ? await prisma.scadenza.findMany({ where: { tipo: "INCASSO", fatturaVenditaId: { in: fatture.map((x) => x.id) } }, include: { abbinamenti: true } }) : [];
  const { residuoScadenza } = await import("@/lib/amministrazione/server");
  const pagato = scadenze.filter((s) => !["ANNULLATA", "SOSTITUITA"].includes(s.stato)).reduce((t, s) => t + Math.max(0, s.importo - residuoScadenza(s)), 0);
  const acconto = fatture.filter((x) => /acconto/i.test(`${x.descrizione ?? ""} ${x.causale ?? ""}`)).reduce((t, x) => t + x.totale, 0);
  const finanziamento = /finanz/i.test(d!.pagamento ?? "");

  const p = await prisma.preventivo.create({
    data: {
      clienteId: cliente.id, brandId: brand.id, commercialeId: commerciale.id, stato: "ACCETTATO", confermatoIl: new Date(),
      oggetto: [d!.riferimento, `ordine BConsole n. ${d!.numero}${d!.offertaRif ? `, offerta ${d!.offertaRif}` : ""}`].filter(Boolean).join(" · ").slice(0, 300),
      totaleNetto: Math.round(imponibile * 100) / 100, totaleIva: Math.round(Math.max(0, totale - imponibile) * 100) / 100,
      righe: { create: (righe.length ? righe : [{ dsc: d!.riferimento ?? `Ordine BConsole ${d!.numero}`, qta: 1, imponibile }]).map((r, i) => ({
        testoLibero: (r.dsc || "—").slice(0, 2000), quantita: Math.max(1, Math.round(r.qta ?? 1)), prezzoUnitario: Math.round(((r.imponibile ?? 0) / Math.max(1, Math.round(r.qta ?? 1))) * 100) / 100, ordine: i,
      })) },
    },
  });
  const anno = new Date().getFullYear();
  const ultimo = await prisma.commessa.findFirst({ where: { anno }, orderBy: { numero: "desc" } });
  const c = await prisma.commessa.create({
    data: {
      numero: (ultimo?.numero ?? 0) + 1, anno, preventivoId: p.id, clienteId: cliente.id, brandId: brand.id, responsabileId: commerciale.id,
      totaleVendita: Math.round(totale * 100) / 100, totaleImponibile: Math.round(imponibile * 100) / 100,
      accontoTipo: finanziamento ? "FINANZIAMENTO" : "ACCONTO", accontoPercentuale: totale > 0 ? Math.round((acconto / totale) * 100) : 0, accontoImporto: Math.round(acconto * 100) / 100,
      accontoIncassato: pagato > 0.5, accontoIncassatoIl: pagato > 0.5 ? new Date() : null, accontoImportoIncassato: pagato > 0.5 ? Math.round(pagato * 100) / 100 : null,
      finanziamentoStato: finanziamento ? "APPROVATO" : null, stato: STATO_PER_FASE[fase] ?? "IN_ATTESA_ACCONTO", ordineBC: d!.numero,
    },
  });
  if (fatture.length) await prisma.fatturaVendita.updateMany({ where: { id: { in: fatture.map((x) => x.id) } }, data: { commessaId: c.id } });
  await prisma.documentoBC.update({ where: { id: d!.id }, data: { commessaId: c.id } });
  await creaFasiStandard(c.id);
  await log(c.id, `Pratica presa in carico da BConsole (ordine n. ${d!.numero}${d!.progetto ? `, progetto ${d!.progetto}` : ""}) da ${u.nome}. ${fatture.length ? `Fatture agganciate: ${fatture.map((x) => x.numero).join(", ")} (pagato ${pagato.toFixed(2)} €).` : "Nessuna fattura BConsole agganciata."} Si riparte dalla fase «${f!.nome}».`);
  await avviaFaseFlusso(c.id, fase, null, u.nome);
  if (fase === "FATT_ACCONTO" || fase === "FATT_SALDO") await avanzaDopoIncasso(c.id);
  revalidatePath(`/clienti/${cliente.id}`);
  redirect(`/commesse/${c.id}?ok=${encodeURIComponent(`Pratica presa in carico da BConsole: il task è passato a ${f!.nome}`)}`);
}


/**
 * Mette i prodotti e i prezzi di un'offerta già fatta in ONE dentro la pratica presa da BConsole (Ugo 22/11/2026: «inserire l'offerta direttamente
 * in quella di BConsole, quella di ONE è già a livello di prodotti e prezzi»). L'offerta di ONE (anche se ha una sua pratica) resta com'è e viene COPIATA
 * nell'offerta della pratica al posto delle righe di testo dell'import; i totali della pratica (quelli di BConsole) non cambiano.
 */
export async function agganciaOffertaONE(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const { puo } = await import("@/lib/permessi/catalogo");
  const commessaId = str(formData, "commessaId") ?? "";
  const preventivoId = str(formData, "preventivoId") ?? "";
  const torna = (m: Record<string, string>) => redirect(`/commesse/${commessaId}?${new URLSearchParams(m)}#progetto`);
  if (!puo(u, "amministrazione") && !puo(u, "provvigioni") && !puo(u, "ordini")) torna({ avviso: "Non hai il permesso di inserire l'offerta" });
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, select: { id: true, clienteId: true, ordineBC: true, preventivoId: true, ordiniFornitore: { select: { id: true } }, righeOrdine: { select: { id: true, ordinato: true } } } });
  if (!c || !c.ordineBC) torna({ avviso: "Si può usare solo su una pratica presa da BConsole" });
  if (c!.ordiniFornitore.length || c!.righeOrdine.some((r) => r.ordinato)) torna({ avviso: "Ci sono già ordini ai fornitori: il materiale non si cambia più da qui" });
  const orig = await prisma.preventivo.findUnique({ where: { id: preventivoId }, include: { sezioni: true, righe: { include: { optionali: true } }, commessa: { select: { id: true, ordineBC: true } } } });
  if (!orig || orig.clienteId !== c!.clienteId) torna({ avviso: "Questa offerta non è di questo cliente" });
  if (orig!.id === c!.preventivoId) torna({ avviso: "È già l'offerta di questa pratica" });
  if (!orig!.righe.length) torna({ avviso: "L'offerta scelta non ha prodotti" });
  const dest = c!.preventivoId;
  try {
    await prisma.$transaction(async (tx) => {
      // via le righe di testo dell'import (e il materiale non ancora ordinato che ne derivava)
      await tx.rigaOrdine.deleteMany({ where: { commessaId: c!.id, ordinato: false, complemento: false } });
      await tx.rigaPreventivo.deleteMany({ where: { preventivoId: dest } });
      await tx.sezionePreventivo.deleteMany({ where: { preventivoId: dest } });
      await tx.preventivo.update({ where: { id: dest }, data: {
        aliquotaIva: orig!.aliquotaIva, scontoPercentuale: orig!.scontoPercentuale, prezzoManualeAttivo: orig!.prezzoManualeAttivo, prezzoManualeTotale: orig!.prezzoManualeTotale,
        immagineCopertinaUrl: orig!.immagineCopertinaUrl, condizioniPagamento: orig!.condizioniPagamento ?? undefined, condizioniConsegna: orig!.condizioniConsegna ?? undefined,
      } });
      const mappa = new Map<string, string>();
      for (const sez of orig!.sezioni) mappa.set(sez.id, (await tx.sezionePreventivo.create({ data: { preventivoId: dest, nome: sez.nome, ordine: sez.ordine } })).id);
      for (const r of orig!.righe) {
        const nr = await tx.rigaPreventivo.create({ data: {
          preventivoId: dest, prodottoId: r.prodottoId, testoLibero: r.testoLibero, quantita: r.quantita, prezzoUnitario: r.prezzoUnitario,
          optionalDescrizione: r.optionalDescrizione, optionalPrezzo: r.optionalPrezzo, mostraDescrizione: r.mostraDescrizione, allegaScheda: r.allegaScheda,
          misuraLarghezza: r.misuraLarghezza, misuraAltezza: r.misuraAltezza, descrizionePersonalizzata: r.descrizionePersonalizzata, ordine: r.ordine,
          sezioneId: r.sezioneId ? mappa.get(r.sezioneId) ?? null : null,
        } });
        if (r.optionali.length) await tx.rigaOptional.createMany({ data: r.optionali.map((o) => ({ rigaId: nr.id, optionalId: o.optionalId, quantita: o.quantita, prezzoUnitario: o.prezzoUnitario, nota: o.nota })) });
      }
    }, { timeout: 30000 });
  } catch (e) {
    console.error("agganciaOffertaONE", e);
    torna({ avviso: `Non sono riuscito a inserire l'offerta (${(e instanceof Error ? e.message : String(e)).split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}). Non è stato cambiato nulla.` });
  }
  try {
    const { ricalcolaTotali } = await import("@/lib/preventivi/totali");
    await ricalcolaTotali(dest);
    await assicuraRigheOfferta(c!.id);
  } catch (e) {
    console.error("agganciaOffertaONE dopo la copia", e);
    torna({ avviso: `Le righe sono state copiate ma il materiale non si è aggiornato (${(e instanceof Error ? e.message : String(e)).split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}).` });
  }
  // «teniamo solo quella di BConsole e l'altra la cancelliamo» (Ugo 22/11/2026): la pratica di ONE nata dalla stessa offerta si toglie, ma solo se è ancora vuota
  let nota = "";
  const altra = orig!.commessa;
  if (formData.get("eliminaAltra") === "1" && altra && altra.id !== c!.id && !altra.ordineBC) {
    const a = await prisma.commessa.findUnique({ where: { id: altra.id }, select: { ordiniFornitore: { select: { id: true } }, pose: { select: { id: true } }, assistenze: { select: { id: true } }, rilievi: { select: { stato: true } }, righeOrdine: { select: { ordinato: true } } } });
    const nFatture = await prisma.fatturaVendita.count({ where: { commessaId: altra.id } });
    const nScad = await prisma.scadenza.count({ where: { commessaId: altra.id, OR: [{ pagatoManuale: { gt: 0 } }, { stato: "PAGATA" }] } });
    const vuota = a && !a.ordiniFornitore.length && !a.pose.length && !a.assistenze.length && !nFatture && !nScad && !a.rilievi.some((r) => r.stato === "ESEGUITO") && !a.righeOrdine.some((r) => r.ordinato);
    if (!vuota) nota = " L'altra pratica di ONE non è stata cancellata perché ha già ordini, rilievi eseguiti, pose o incassi.";
    else {
      try {
        await prisma.$transaction(async (tx) => {
          const rilievi = await tx.rilievo.findMany({ where: { commessaId: altra.id }, select: { id: true } });
          await tx.rilievoAllegato.deleteMany({ where: { rilievoId: { in: rilievi.map((r) => r.id) } } });
          await tx.rilievo.deleteMany({ where: { commessaId: altra.id } });
          await tx.commessaEvento.deleteMany({ where: { commessaId: altra.id } });
          await tx.faseCommessa.deleteMany({ where: { commessaId: altra.id } });
          await tx.taskPratica.deleteMany({ where: { commessaId: altra.id } });
          await tx.rigaOrdine.deleteMany({ where: { commessaId: altra.id } });
          await tx.costoManuale.deleteMany({ where: { commessaId: altra.id } });
          await tx.scadenza.deleteMany({ where: { commessaId: altra.id } });
          await tx.documento.deleteMany({ where: { entita: "COMMESSA", entitaId: altra.id } });
          await tx.commessa.delete({ where: { id: altra.id } });
        });
        nota = " L'altra pratica di ONE è stata cancellata.";
      } catch { nota = " L'altra pratica di ONE non si è potuta cancellare (ha dati collegati): chiedimelo e la tolgo a mano."; }
    }
  }
  // e anche l'offerta di ONE (nel cestino 30 giorni) se non ha più una pratica
  if (formData.get("eliminaAltra") === "1") {
    const ancora = await prisma.commessa.count({ where: { preventivoId: orig!.id } });
    if (ancora) nota += " L'offerta di ONE resta perché la sua pratica è ancora lì.";
    else {
      try {
        const { mettiNelCestino } = await import("@/lib/cestino");
        await mettiNelCestino("PREVENTIVO", orig!.id, { id: u.id, nome: u.nome });
        const solaris = await prisma.solarisProgetto.findMany({ where: { preventivoId: orig!.id }, select: { id: true } });
        const idRighe = (await prisma.rigaPreventivo.findMany({ where: { preventivoId: orig!.id }, select: { id: true } })).map((x) => x.id);
        await prisma.$transaction([
          prisma.documento.deleteMany({ where: { entita: "RIGA_PREVENTIVO", entitaId: { in: idRighe } } }),
          prisma.solarisFoto.deleteMany({ where: { progettoId: { in: solaris.map((x) => x.id) } } }),
          prisma.solarisProgetto.deleteMany({ where: { preventivoId: orig!.id } }),
          prisma.emailOfferta.deleteMany({ where: { preventivoId: orig!.id } }),
          prisma.rigaOptional.deleteMany({ where: { riga: { preventivoId: orig!.id } } }),
          prisma.rigaPreventivo.deleteMany({ where: { preventivoId: orig!.id } }),
          prisma.sezionePreventivo.deleteMany({ where: { preventivoId: orig!.id } }),
          prisma.promemoriaInviato.deleteMany({ where: { preventivoId: orig!.id } }),
          prisma.preventivo.delete({ where: { id: orig!.id } }),
        ]);
        nota += " L'offerta di ONE è stata cancellata (resta 30 giorni nel cestino).";
      } catch (e) { console.error("agganciaOffertaONE elimina offerta", e); nota += " L'offerta di ONE non si è potuta cancellare."; }
    }
  }
  await log(c!.id, `Prodotti e prezzi dell'offerta di ONE ${orig!.numeroOfferta ?? ""} inseriti nella pratica di BConsole da ${u.nome} (${orig!.righe.length} righe): il materiale è quello dell'offerta.`);
  revalidatePath(`/commesse/${c!.id}`);
  redirect(`/commesse/${c!.id}?fatto=${encodeURIComponent("Offerta di ONE inserita: prodotti e prezzi sono nella pratica." + nota)}#progetto`);
}

// ============ DISTINTA BASE (KIT) ============
/**
 * Aggiunge al materiale della pratica i pezzi della distinta base del modello di una riga (solo acquisto).
 * Di norma solo quelli «sempre»; con `soloId` un componente preciso (anche facoltativo). Ritorna quante righe ha aggiunto.
 */
async function aggiungiKit(commessaId: string, madre: { id: string; quantita: number; prodottoId: string | null; larghezza?: number | null; altezza?: number | null }, soloId?: string): Promise<number> {
  if (!madre.prodottoId) return 0;
  const p = await prisma.prodotto.findUnique({ where: { id: madre.prodottoId }, select: { brandId: true, tipologia: true } });
  if (!p) return 0;
  const componenti = await prisma.componenteKit.findMany({ where: { brandId: p.brandId, tipologia: p.tipologia, ...(soloId ? { id: soloId } : { facoltativo: false }) }, orderBy: [{ ordine: "asc" }, { createdAt: "asc" }] });
  if (!componenti.length) return 0;
  const modello = await prisma.modelloProdotto.findUnique({ where: { brandId_tipologia: { brandId: p.brandId, tipologia: p.tipologia } }, select: { fornitoreId: true } });
  for (const c of componenti) {
    const art = c.articoloId ? await prisma.articolo.findUnique({ where: { id: c.articoloId } }) : null;
    const fornitoreId = c.fornitoreId ?? art?.fornitoreId ?? modello?.fornitoreId ?? null;
    const forn = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { id: true, ragioneSociale: true } }) : null;
    const q = quantitaComponente(c, { quantita: madre.quantita, larghezza: madre.larghezza, altezza: madre.altezza, unita: unitaMisura(p.tipologia) });
    const costo = c.costoUnitario ?? art?.costoAcquisto ?? null;
    await prisma.rigaOrdine.create({
      data: {
        commessaId, descrizione: c.descrizione, quantita: q, complemento: true, kitDiId: madre.id, fornitoreId: forn?.id ?? null, fornitoreNome: forn?.ragioneSociale ?? null,
        articoloId: art?.id ?? null, codice: art?.codice ?? null, codiceFornitore: art?.codiceFornitore ?? null, um: art?.um ?? null,
        prezzoAcquisto: costo, costoPrevisto: costo !== null ? Math.round(costo * q * 100) / 100 : null,
      },
    });
  }
  return componenti.length;
}

/** Aggiunge un correlato facoltativo della distinta base a una riga del materiale (pulsante «➕» nei suggeriti). */
export async function aggiungiCorrelato(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const rigaId = str(formData, "rigaId"), componenteId = str(formData, "componenteId");
  if (!rigaId || !componenteId) return;
  const r = await prisma.rigaOrdine.findUnique({ where: { id: rigaId } });
  if (!r?.commessaId) return;
  const misura = r.rigaPreventivoId ? await prisma.rigaPreventivo.findUnique({ where: { id: r.rigaPreventivoId }, select: { misuraLarghezza: true, misuraAltezza: true } }) : null;
  const n = await aggiungiKit(r.commessaId, { id: r.id, quantita: r.quantita, prodottoId: r.prodottoId, larghezza: misura?.misuraLarghezza, altezza: misura?.misuraAltezza }, componenteId);
  if (n) await log(r.commessaId, `Aggiunto il correlato della distinta base di «${r.descrizione}».`);
  revalidatePath(`/commesse/${r.commessaId}`);
  redirect(`/commesse/${r.commessaId}?fattoMateriale=${encodeURIComponent(n ? "Correlato aggiunto al materiale." : "Correlato non trovato.")}#materiale-pratica`);
}

// ============ COMPLEMENTI DEL RILIEVO (solo acquisto) ============
/** Materiale aggiunto al rilievo: articolo («A»), prodotto di listino («P», colore e misura) o testo libero («T»). */
export type Complemento = {
  tipo?: string; articoloId?: string; brandId?: string; tipologia?: string; colore?: string; larghezza?: number | string | null; altezza?: number | string | null;
  quantita?: number | string | null; fornitoreId?: string | null; descrizione?: string | null; note?: string | null;
  /** tipo «ANG»: angolare in alluminio su misura, codice ANGALL-… (forma, lati, spessore, bello, colore, lunghezza) */
  codice?: string | null;
  /** file allegato al complemento (foto o PDF del disegno, data URI): va nei documenti della pratica, cartella «Rilievi misura» */
  allegato?: { nome?: string; dataUri?: string } | null;
};
const numero = (v: unknown) => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const testo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Crea la riga del complemento: diventa materiale da ordinare al fornitore con il costo previsto; la vendita non cambia.
 * Ritorna l'errore da mostrare (niente riga) oppure la descrizione scritta.
 */
async function creaComplemento(commessaId: string, x: Complemento): Promise<{ errore?: string; descrizione?: string }> {
  const q = Math.max(1, Math.round(numero(x.quantita) ?? 1));
  const tipo = testo(x.tipo) ?? "T";
  let fornitoreId = testo(x.fornitoreId);
  let descrizione = testo(x.descrizione);
  const dati: { articoloId?: string; codice?: string | null; codiceFornitore?: string | null; um?: string | null; prezzoAcquisto?: number | null; scontoAcquisto?: number | null; costoPrevisto?: number | null } = {};
  let prodottoKit: string | null = null;

  if (tipo === "A") {
    const art = await prisma.articolo.findUnique({ where: { id: testo(x.articoloId) ?? "" } });
    if (!art) return { errore: "Articolo non trovato." };
    Object.assign(dati, {
      articoloId: art.id, codice: art.codice, codiceFornitore: art.codiceFornitore, um: art.um, prezzoAcquisto: art.prezzoListino ?? art.costoAcquisto,
      scontoAcquisto: art.prezzoListino !== null ? scontoEquivalente(art.sconti) : 0,
      costoPrevisto: art.costoAcquisto !== null ? Math.round(art.costoAcquisto * q * 100) / 100 : null,
    });
    descrizione = descrizione ?? art.descrizione;
    fornitoreId = fornitoreId ?? art.fornitoreId;
  } else if (tipo === "PR") {
    const p = await prisma.prodotto.findUnique({ where: { id: testo(x.articoloId) ?? "" } });
    if (!p) return { errore: "Prodotto di listino non trovato." };
    prodottoKit = p.id;
    const m = await prisma.modelloProdotto.findUnique({ where: { brandId_tipologia: { brandId: p.brandId, tipologia: p.tipologia } }, select: { fornitoreId: true, codiceFornitore: true, scontoAcquisto: true } });
    fornitoreId = fornitoreId ?? m?.fornitoreId ?? null;
    const f = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { scontoFornitore: true } }) : null;
    const sconto = m?.scontoAcquisto ?? f?.scontoFornitore ?? null;
    const prezzo = numero(x.larghezza) && testo(x.note) === "AL_METRO" ? Math.round(p.prezzoBase * (numero(x.larghezza) ?? 0) / 100 * 100) / 100 : p.prezzoBase;
    Object.assign(dati, {
      codiceFornitore: m?.codiceFornitore ?? null, prezzoAcquisto: prezzo, scontoAcquisto: f ? sconto : null,
      costoPrevisto: f ? costoPrevisto({ prezzoUnitario: prezzo, quantita: q }, sconto) : null,
    });
    const L = numero(x.larghezza), H = numero(x.altezza);
    descrizione = `${labelBreveTipologia(p.tipologia)}${p.colore && !/TARIFFA|Prezzo a/.test(p.colore) ? ` — ${p.colore}` : ""}${L ? ` (${L}${H ? `×${H}` : ""} ${unitaMisura(p.tipologia)})` : ""}`;
    x = { ...x, note: testo(x.note) === "AL_METRO" ? null : x.note };
  } else if (tipo === "P") {
    const brandId = testo(x.brandId), tipologia = testo(x.tipologia), colore = testo(x.colore);
    if (!brandId || !tipologia || !colore) return { errore: "Scegli il prodotto e il colore." };
    const L = numero(x.larghezza) ?? 0, H = numero(x.altezza) ?? 0;
    const griglia = (await prisma.prodotto.count({ where: { brandId, tipologia, OR: [{ larghezzaMm: { gt: 0 } }, { altezzaMm: { gt: 0 } }] } })) > 0;
    const nome = descrizione ?? labelBreveTipologia(tipologia);
    if (griglia && L <= 0) return { errore: `${nome}: scrivi la misura.` };
    // profili e pezzi a barre: la barra più vicina alla misura scritta (anche se scritta in mm)
    const barra = griglia && H <= 0 ? await trovaBarraPiuVicina({ brandId, tipologia, colore, larghezza: L }) : null;
    const p = barra
      ? barra.prodotto
      : griglia
        ? await trovaFasciaPrezzo({ brandId, tipologia, colore, larghezza: L, altezza: H })
        : await prisma.prodotto.findFirst({ where: { brandId, tipologia, colore } });
    if (!p) return { errore: `${nome}: misura fuori listino, scrivilo come testo libero.` };
    prodottoKit = p.id;
    const m = await prisma.modelloProdotto.findUnique({ where: { brandId_tipologia: { brandId, tipologia } }, select: { fornitoreId: true, codiceFornitore: true, scontoAcquisto: true } });
    fornitoreId = fornitoreId ?? m?.fornitoreId ?? null;
    const f = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { scontoFornitore: true } }) : null;
    const sconto = m?.scontoAcquisto ?? f?.scontoFornitore ?? null;
    const misura = barra ? ` (barra ${p.larghezzaMm} ${unitaMisura(tipologia)}${barra.richiesta !== p.larghezzaMm ? `, richiesto ${L}${barra.inMm ? " mm" : ""}` : ""})` : griglia ? ` (${L}${H > 0 ? `×${H}` : ""} ${unitaMisura(tipologia)})` : "";
    Object.assign(dati, {
      codiceFornitore: m?.codiceFornitore ?? null, prezzoAcquisto: p.prezzoBase, scontoAcquisto: f ? sconto : null,
      costoPrevisto: f ? costoPrevisto({ prezzoUnitario: p.prezzoBase, quantita: q }, sconto) : null,
    });
    descrizione = `${nome} — ${colore}${misura}`;
  } else if (tipo === "ANG") {
    // angolare in alluminio su misura (Il Mastro, richiesta di Ugo 20/11/2026): costo a peso a barra dal codice; fornitore Il Mastro se non scelto
    const { leggiCodiceAngolare, descrizioneAngolare, costoBarra, misureLabel } = await import("@/lib/ordini/angolari");
    const a = leggiCodiceAngolare(testo(x.codice), q);
    if (!a) return { errore: "Angolare: misure non valide." };
    const costo = costoBarra(a);
    descrizione = descrizioneAngolare(a);
    fornitoreId = fornitoreId ?? (await prisma.soggetto.findFirst({ where: { ragioneSociale: { contains: "mastro", mode: "insensitive" }, ruoli: { has: "FORNITORE" } }, select: { id: true } }))?.id ?? null;
    Object.assign(dati, { codice: testo(x.codice), um: "pz", prezzoAcquisto: costo, scontoAcquisto: 0, costoPrevisto: Math.round(costo * q * 100) / 100 });
    // file del disegno o foto (facoltativo): nei documenti della pratica, così si allega all'ordine per Il Mastro
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(x.allegato?.dataUri ?? "");
    if (m && /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(m[1])) {
      const contenuto = Buffer.from(m[2], "base64");
      if (contenuto.length <= 2_000_000) {
        const nome = `Angolare ${a.forma} ${misureLabel(a)} - ${(x.allegato?.nome ?? "disegno").replace(/[^\w.\- ]+/g, "_")}`.slice(0, 120);
        await prisma.documento.create({ data: { entita: "COMMESSA", entitaId: commessaId, cartella: "Rilievi misura", nome, mime: m[1], dimensione: contenuto.length, contenuto } });
        x = { ...x, note: [testo(x.note), `📎 ${nome}`].filter(Boolean).join(" · ") };
      }
    }
  }
  if (tipo === "LEG") {
    // legno piallato su misura (Ugo 20/11/2026): costo sullo sviluppo; se la misura è uno dei 26 articoli si collega all'articolo
    const { leggiLegnoLibero, descrizioneLegno, costoLegno } = await import("@/lib/ordini/legno");
    const l = leggiLegnoLibero(testo(x.codice));
    if (!l) return { errore: "Legno: misure non valide." };
    const art = await prisma.articolo.findUnique({ where: { codice: testo(x.codice)! }, select: { id: true, costoAcquisto: true, fornitoreId: true } });
    const costo = art?.costoAcquisto ?? costoLegno(l.sezione, l.lunghezza);
    descrizione = descrizioneLegno(l.sezione, l.lunghezza);
    fornitoreId = fornitoreId ?? art?.fornitoreId ?? null;
    Object.assign(dati, { codice: testo(x.codice), um: "pz", articoloId: art?.id, prezzoAcquisto: costo, scontoAcquisto: 0, costoPrevisto: Math.round(costo * q * 100) / 100 });
  }
  if (!descrizione) return { errore: "Scrivi la descrizione del complemento." };
  const forn = fornitoreId ? await prisma.soggetto.findUnique({ where: { id: fornitoreId }, select: { id: true, ragioneSociale: true } }) : null;
  const creata = await prisma.rigaOrdine.create({
    data: { commessaId, descrizione, quantita: q, complemento: true, fornitoreId: forn?.id ?? null, fornitoreNome: forn?.ragioneSociale ?? null, note: testo(x.note), prodottoId: prodottoKit, ...dati },
  });
  // pezzi della distinta base del prodotto di listino (kit), solo acquisto
  const nKit = await aggiungiKit(commessaId, { id: creata.id, quantita: q, prodottoId: prodottoKit, larghezza: numero(x.larghezza), altezza: numero(x.altezza) });
  return { descrizione: `${descrizione} × ${q}${forn ? ` (${forn.ragioneSociale})` : ""}${nKit ? ` + ${nKit} pezzi del kit` : ""}` };
}

/** Aggiunge un complemento singolo (fuori dal modulo del rilievo). */
export async function aggiungiComplemento(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  if (!commessaId) return;
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, select: { id: true } });
  if (!c) return;
  const torna = (errore?: string) => redirect(`/commesse/${commessaId}${errore ? `?avviso=${encodeURIComponent(errore)}` : ""}#materiale-pratica`);
  await assicuraRigheOfferta(commessaId);
  const r = await creaComplemento(commessaId, Object.fromEntries(formData) as Complemento);
  if (r.errore) torna(r.errore);
  await log(commessaId, `Complemento aggiunto al rilievo (solo acquisto) — ${r.descrizione}.`);
  revalidatePath(`/commesse/${commessaId}`);
  torna();
}

/** Toglie un complemento non ancora messo in un ordine al fornitore. */
// Righe di materiale aggiunte a mano («complementi») nella pratica: togli, modifica e duplica, finché non sono ordinate (Ugo 22/11/2026).
async function complementoLibero(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "rigaId");
  const r = id ? await prisma.rigaOrdine.findUnique({ where: { id } }) : null;
  const dove = (m: string, ok = false) => redirect(`/commesse/${r?.commessaId ?? str(formData, "commessaId") ?? ""}?${ok ? "fattoMateriale" : "avviso"}=${encodeURIComponent(m)}&passo=MATERIALE#evasione`);
  if (!r || !r.commessaId) redirect("/commesse");
  if (!r.complemento) dove("Si possono cambiare solo le righe aggiunte a mano; quelle dell'offerta si cambiano nell'offerta.");
  if (r.ordineFornitoreId || r.ordinato || r.daMagazzino) dove("Questa riga è già stata ordinata: non si cambia più.");
  return { r: r!, u, dove };
}

export async function eliminaComplemento(formData: FormData) {
  const { r, dove } = await complementoLibero(formData);
  await prisma.rigaOrdine.deleteMany({ where: { OR: [{ id: r.id }, { kitDiId: r.id, ordinato: false }] } });
  await log(r.commessaId!, `Tolto il materiale «${r.descrizione}».`);
  revalidatePath(`/commesse/${r.commessaId}`);
  dove(`Tolto: ${r.descrizione}`, true);
}

export async function duplicaComplemento(formData: FormData) {
  const { r, dove } = await complementoLibero(formData);
  const { id: _i, createdAt: _c, ...dati } = r;
  void _i; void _c;
  await prisma.rigaOrdine.create({ data: { ...dati, kitDiId: null, createdAt: new Date() } });
  await log(r.commessaId!, `Duplicato il materiale «${r.descrizione}».`);
  revalidatePath(`/commesse/${r.commessaId}`);
  dove(`Duplicato: ${r.descrizione}`, true);
}

export async function modificaComplemento(formData: FormData) {
  const { r, dove } = await complementoLibero(formData);
  const desc = (str(formData, `desc_${r.id}`) ?? "").trim();
  const q = Math.round(Number((str(formData, `qta_${r.id}`) ?? "").replace(",", ".")));
  const note = (str(formData, `note_${r.id}`) ?? "").trim();
  if (!desc) dove("Scrivi la descrizione.");
  if (!Number.isFinite(q) || q < 1) dove("La quantità deve essere almeno 1.");
  // il costo previsto è sul totale della riga: segue la quantità
  const costo = r.costoPrevisto != null && r.quantita > 0 ? Math.round((r.costoPrevisto / r.quantita) * q * 100) / 100 : r.costoPrevisto;
  await prisma.rigaOrdine.update({ where: { id: r.id }, data: { descrizione: desc.slice(0, 500), quantita: q, note: note || null, costoPrevisto: costo } });
  await log(r.commessaId!, `Modificato il materiale «${desc}» (${q} pz).`);
  revalidatePath(`/commesse/${r.commessaId}`);
  dove(`Salvato: ${desc}`, true);
}

// Versioni «legate» alla riga (si usano con .bind(null, rigaId) dalla tabella del materiale: il nome/valore del pulsante non arrivava all'azione)
export async function eliminaComplementoRiga(rigaId: string, fd: FormData) { fd.set("rigaId", rigaId); return eliminaComplemento(fd); }
export async function duplicaComplementoRiga(rigaId: string, fd: FormData) { fd.set("rigaId", rigaId); return duplicaComplemento(fd); }
export async function modificaComplementoRiga(rigaId: string, fd: FormData) { fd.set("rigaId", rigaId); return modificaComplemento(fd); }

/** Consegna prevista del progetto (deadline): si scrive e si sposta dalla pratica; ogni cambio va nello storico. */
export async function salvaConsegnaPrevista(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  if (!id) return;
  const v = str(formData, "consegnaPrevista");
  const nuova = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : null;
  const prima = await prisma.commessa.findUnique({ where: { id }, select: { consegnaPrevista: true } });
  if (!prima) return;
  await prisma.commessa.update({ where: { id }, data: { consegnaPrevista: nuova } });
  const it = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "nessuna");
  if ((prima.consegnaPrevista?.getTime() ?? null) !== (nuova?.getTime() ?? null))
    await log(id, `Consegna prevista: ${it(prima.consegnaPrevista)} → ${it(nuova)}.`);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
}

// ============ MATERIALE DAL LISTINO (stesso selettore a tendine dell'offerta) ============
// Il selettore dell'offerta manda «preventivoId»: qui è l'id della commessa. Il pezzo va nel materiale della pratica, solo acquisto.
async function complementoDaSelettore(formData: FormData, cerca: (commessaId: string) => Promise<Complemento | string>) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "preventivoId");
  if (!commessaId || !(await prisma.commessa.findUnique({ where: { id: commessaId }, select: { id: true } }))) return;
  const torna = (q: string) => redirect(`/commesse/${commessaId}?${q}#materiale-pratica`);
  const x = await cerca(commessaId);
  if (typeof x === "string") torna(`avviso=${encodeURIComponent(x)}`);
  await assicuraRigheOfferta(commessaId);
  const r = await creaComplemento(commessaId, x as Complemento);
  if (r.errore) torna(`avviso=${encodeURIComponent(r.errore)}`);
  await log(commessaId, `Materiale aggiunto dal listino (solo acquisto) — ${r.descrizione}.`);
  revalidatePath(`/commesse/${commessaId}`);
  torna(`fattoMateriale=${encodeURIComponent(`Aggiunto: ${r.descrizione}`)}`);
}

/** Dal selettore: prodotto a prezzo fisso o variante già scelta (anche lattoneria al metro, porte con misura di listino). */
export async function complementoDaListino(formData: FormData) {
  await complementoDaSelettore(formData, async () => {
    const prodottoId = str(formData, "prodottoId");
    if (!prodottoId) return "Scegli il prodotto.";
    const lattCm = flt(formData, "lattCm");
    const L = lattCm ?? flt(formData, "rmL") ?? flt(formData, "luceNetta"), H = lattCm ? null : flt(formData, "rmH");
    return { tipo: "PR", articoloId: prodottoId, quantita: str(formData, "quantita"), larghezza: L, altezza: H, note: lattCm ? "AL_METRO" : null };
  });
}

/** Dal selettore: prodotto a misura (larghezza × altezza): fascia di listino uguale o subito superiore. */
export async function complementoDaListinoPerMisura(formData: FormData) {
  await complementoDaSelettore(formData, async () => {
    const brandId = str(formData, "brandId"), tipologia = str(formData, "tipologia");
    const L = flt(formData, "larghezza"), H = flt(formData, "altezza") ?? 0;
    if (!brandId || !tipologia || !L) return "Scrivi la misura.";
    const barra = H <= 0 ? await trovaBarraPiuVicina({ brandId, tipologia, larghezza: L }) : null;
    const p = barra ? barra.prodotto : await trovaFasciaPrezzo({ brandId, tipologia, larghezza: L, altezza: H });
    if (!p) return `${labelBreveTipologia(tipologia)}: misura fuori listino, scrivilo come testo libero nel rilievo.`;
    return { tipo: "PR", articoloId: p.id, quantita: str(formData, "quantita"), larghezza: barra ? p.larghezzaMm : L, altezza: H || null, note: barra && barra.richiesta !== p.larghezzaMm ? `misura richiesta ${barra.richiesta}${barra.inMm ? " mm" : ""} → barra ${p.larghezzaMm}` : null };
  });
}

/** Dal selettore (tessera «Angolari in alluminio»): angolare su misura al costo di Il Mastro, solo acquisto. */
export async function complementoAngolareDaListino(formData: FormData) {
  await complementoDaSelettore(formData, async () => {
    const codice = str(formData, "codiceAngolare");
    if (!codice) return "Scegli le misure dell'angolare.";
    return { tipo: "ANG", codice, quantita: str(formData, "quantita"), note: str(formData, "notaAngolare") };
  });
}

/** Dal selettore (tessera «Legni piallati»): legno su misura al costo sullo sviluppo, solo acquisto. */
export async function complementoLegnoDaListino(formData: FormData) {
  await complementoDaSelettore(formData, async () => {
    const codice = str(formData, "codiceLegno");
    if (!codice) return "Scegli le misure del legno.";
    return { tipo: "LEG", codice, quantita: str(formData, "quantita"), note: str(formData, "notaLegno") };
  });
}

// ============ AZIONI SULLE RIGHE SPUNTATE (barra in fondo, come in BConsole) ============
function righeSpuntate(fd: FormData) { return [...new Set(fd.getAll("riga").map(String))]; }

/** Sposta le righe spuntate (non ancora ordinate) in un altro progetto dello stesso cliente. */
export async function spostaRigheProgetto(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const da = str(formData, "commessaId"), a = str(formData, "progettoDestinazione");
  if (!da) return;
  const torna = (q: string) => redirect(`/commesse/${da}?${q}#materiale-pratica`);
  const ids = righeSpuntate(formData);
  if (!ids.length) torna(`avviso=${encodeURIComponent("Spunta le righe da spostare.")}`);
  if (!a) torna(`avviso=${encodeURIComponent("Scegli il progetto in cui spostarle.")}`);
  const [cDa, cA] = await Promise.all([prisma.commessa.findUnique({ where: { id: da } }), prisma.commessa.findUnique({ where: { id: a! } })]);
  if (!cDa || !cA || cDa.clienteId !== cA.clienteId || cDa.id === cA.id) torna(`avviso=${encodeURIComponent("Si può spostare solo in un altro progetto dello stesso cliente.")}`);
  const righe = await prisma.rigaOrdine.findMany({ where: { id: { in: ids }, commessaId: da, ordineFornitoreId: null, ordinato: false } });
  if (!righe.length) torna(`avviso=${encodeURIComponent("Le righe spuntate sono già ordinate: si spostano solo quelle ancora da ordinare.")}`);
  await prisma.rigaOrdine.updateMany({ where: { id: { in: righe.map((r) => r.id) } }, data: { commessaId: a!, complemento: true } });
  const nome = (c: { anno: number; numero: number }) => `C${c.anno}-${String(c.numero).padStart(3, "0")}`;
  await log(da, `Spostate nel progetto ${nome(cA!)}: ${righe.map((r) => r.descrizione).join("; ")}.`);
  await log(a!, `Arrivate dal progetto ${nome(cDa!)} (solo acquisto): ${righe.map((r) => r.descrizione).join("; ")}.`);
  revalidatePath(`/commesse/${a}`);
  torna(`fattoMateriale=${encodeURIComponent(`${righe.length} righe spostate nel progetto ${nome(cA!)}.`)}`);
}

/** Toglie le righe spuntate aggiunte al rilievo (complementi) non ancora ordinate; quelle dell'offerta restano. */
export async function eliminaRigheMateriale(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  if (!commessaId) return;
  const ids = righeSpuntate(formData);
  const via = await prisma.rigaOrdine.findMany({ where: { id: { in: ids }, commessaId, complemento: true, ordineFornitoreId: null, ordinato: false } });
  if (via.length) {
    // con la riga vanno via anche i pezzi del suo kit non ancora ordinati
    await prisma.rigaOrdine.deleteMany({ where: { kitDiId: { in: via.map((r) => r.id) }, ordineFornitoreId: null, ordinato: false } });
    await prisma.rigaOrdine.deleteMany({ where: { id: { in: via.map((r) => r.id) } } });
    await log(commessaId, `Tolto il materiale aggiunto: ${via.map((r) => r.descrizione).join("; ")}.`);
  }
  const restano = ids.length - via.length;
  redirect(`/commesse/${commessaId}?${via.length ? `fattoMateriale=${encodeURIComponent(`${via.length} righe tolte.`)}&` : ""}${restano ? `avviso=${encodeURIComponent(`${restano} righe non tolte: sono dell'offerta o già ordinate (le righe dell'offerta si cambiano con una variante).`)}` : ""}#materiale-pratica`);
}

/**
 * «⏳ Rimanda»: le righe spuntate si mettono da parte con il motivo (es. «aspetto le misure definitive di produzione») e escono da «Da ordinare ora»;
 * il task dell'ufficio ordini resta uno solo e si chiude quando anche queste sono ordinate (Ugo 23/11/2026).
 */
export async function rimandaRighe(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  if (!commessaId) return;
  const ids = righeSpuntate(formData);
  const motivo = (str(formData, "motivoRimando") ?? "").trim().slice(0, 200) || "da ordinare più avanti";
  const r = await prisma.rigaOrdine.updateMany({ where: { id: { in: ids }, commessaId, ordineFornitoreId: null, ordinato: false, daMagazzino: false }, data: { rimandataIl: new Date(), rimandataMotivo: motivo, rimandataDaNome: u.nome } });
  if (r.count) await log(commessaId, `${r.count} righe messe da parte («${motivo}») da ${u.nome}: da ordinare più avanti.`);
  redirect(`/commesse/${commessaId}?${r.count ? `fattoMateriale=${encodeURIComponent(`${r.count} righe messe in «Da ordinare più avanti».`)}` : `avviso=${encodeURIComponent("Spunta le righe da rimandare: quelle già ordinate non si possono rimandare.")}`}&passo=MATERIALE#materiale-pratica`);
}

/** Rimette fra le righe da ordinare ora quelle rimandate (le spuntate, o tutte con `tutte=1`: «misure definitive arrivate»). */
export async function riprendiRighe(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  if (!commessaId) return;
  const ids = str(formData, "tutte") === "1" ? null : [...new Set(formData.getAll("riga").map(String))];
  const r = await prisma.rigaOrdine.updateMany({ where: { commessaId, rimandataIl: { not: null }, ordineFornitoreId: null, ordinato: false, ...(ids ? { id: { in: ids } } : {}) }, data: { rimandataIl: null, rimandataMotivo: null, rimandataDaNome: null } });
  if (r.count) await log(commessaId, `${r.count} righe rimesse in «Da ordinare ora» da ${u.nome}${str(formData, "tutte") === "1" ? " (misure definitive arrivate)" : ""}.`);
  redirect(`/commesse/${commessaId}?${r.count ? `fattoMateriale=${encodeURIComponent(`${r.count} righe pronte da ordinare.`)}` : `avviso=${encodeURIComponent("Nessuna riga da riprendere.")}`}&passo=MATERIALE#materiale-pratica`);
}

/** Task a un ufficio con l'elenco delle righe spuntate (es. magazzino: preparare questi pezzi). */
export async function taskDaRighe(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId"), ufficio = str(formData, "ufficioTask");
  if (!commessaId) return;
  const torna = (q: string) => redirect(`/commesse/${commessaId}?${q}#materiale-pratica`);
  const ids = righeSpuntate(formData);
  if (!ids.length || !ufficio) torna(`avviso=${encodeURIComponent("Spunta le righe e scegli l'ufficio del task.")}`);
  const righe = await prisma.rigaOrdine.findMany({ where: { id: { in: ids }, commessaId }, orderBy: { createdAt: "asc" } });
  const titolo = str(formData, "titoloTask") ?? `Materiale da gestire (${righe.length} righe)`;
  const descrizione = righe.map((r) => `• ${r.descrizione} × ${r.quantita}${r.fornitoreNome ? ` — ${r.fornitoreNome}` : ""}`).join("\n");
  const fd = new FormData();
  fd.set("commessaId", commessaId); fd.set("ufficio", ufficio!); fd.set("titolo", titolo); fd.set("descrizione", descrizione);
  await creaTaskManuale(fd);
  torna(`fattoMateriale=${encodeURIComponent(`Task «${titolo}» creato.`)}`);
}

// ── Percorso guidato del progetto (richiesta di Ugo 16/11/2026) ──────────────────────────────────────────────────────────
/** «Crea progetto»: il primo passo di Giorgia (Ugo, 21/11/2026): dentro il progetto si fanno fattura di acconto e chiamata di benvenuto; con l'acconto incassato parte il rilievo. */
export async function creaProgetto(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const id = str(formData, "commessaId");
  if (!id) return;
  const p = await percorsoDiCommessa(id);
  if (!p) return;
  const torna = (q: string) => redirect(`/commesse/${id}?${q}`);
  if (p.progettoCreatoIl) torna("pok=" + encodeURIComponent("Il progetto è già stato creato."));
  await prisma.commessa.update({ where: { id }, data: { progettoCreatoIl: new Date(), progettoCreatoDaNome: utente.nome } });
  await log(id, `Progetto creato da ${utente.nome}.`);
  // se l'acconto è già incassato il centralino può fissare subito il rilievo, altrimenti aspetta l'incasso di Debora
  await avviaRilievoSePronto(id);
  revalidatePath(`/commesse/${id}`);
  revalidatePath("/commesse");
  torna("pok=" + encodeURIComponent("Progetto creato. Ora la chiamata di benvenuto al cliente."));
}

/** Passo 3 dell'apertura pratica (Giorgia): la fattura di acconto è stata emessa, dentro il progetto già creato. Con annulla=1 si rimette «da fare». */
export async function registraFatturaAcconto(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const id = str(formData, "commessaId");
  if (!id) return;
  const annulla = str(formData, "annulla") === "1";
  if (!annulla) {
    const c = await prisma.commessa.findUnique({ where: { id }, select: { progettoCreatoIl: true } });
    if (!c?.progettoCreatoIl) redirect(`/commesse/${id}?pav=${encodeURIComponent("Prima si crea il progetto: la fattura di acconto si fa dentro il progetto.")}`);
  }
  await prisma.commessa.update({ where: { id }, data: annulla ? { fatturaAccontoIl: null, fatturaAccontoDaNome: null } : { fatturaAccontoIl: new Date(), fatturaAccontoDaNome: utente.nome } });
  await log(id, annulla ? `Fattura di acconto rimessa «da fare» da ${utente.nome}.` : `Fattura di acconto emessa (segnata da ${utente.nome}).`);
  // con progetto, chiamata di benvenuto e fattura fatti l'apertura pratica di Giorgia è finita: si chiude il suo task
  const fatta = !annulla && (await prisma.commessa.findUnique({ where: { id }, select: { benvenutoIl: true } }))?.benvenutoIl;
  if (fatta) { await chiudiTaskFase(id, "FATT_ACCONTO"); await avviaRilievoSePronto(id); }
  revalidatePath(`/commesse/${id}`);
  redirect(`/commesse/${id}?pok=${encodeURIComponent(annulla ? "Fattura di acconto rimessa da fare." : fatta ? "Fattura di acconto segnata: apertura pratica completata." : "Fattura di acconto segnata.")}`);
}

/** Passo 2 dell'apertura pratica (Giorgia): chiamata di benvenuto al cliente, con la nota di com'è andata. Rivedibile: salvando di nuovo si aggiorna la nota. */
export async function registraBenvenuto(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const id = str(formData, "commessaId");
  if (!id) return;
  const note = str(formData, "note");
  const c = await prisma.commessa.findUnique({ where: { id }, select: { benvenutoIl: true, progettoCreatoIl: true, fatturaAccontoIl: true } });
  if (!c) return;
  if (!c.progettoCreatoIl) redirect(`/commesse/${id}?pav=${encodeURIComponent("Prima si crea il progetto.")}`);
  const nuova = !c.benvenutoIl;
  await prisma.commessa.update({ where: { id }, data: { benvenutoIl: c.benvenutoIl ?? new Date(), benvenutoDaNome: utente.nome, benvenutoNote: note } });
  await log(id, `Chiamata di benvenuto al cliente ${nuova ? "fatta" : "aggiornata"} da ${utente.nome}${note ? `: ${note}` : "."}`);
  const completa = nuova && !!c.fatturaAccontoIl;
  if (completa) {
    // fattura già segnata (pratiche aperte con l'ordine di prima): l'apertura di Giorgia è finita, si chiude il suo task
    await chiudiTaskFase(id, "FATT_ACCONTO");
    await avviaRilievoSePronto(id);
  }
  revalidatePath(`/commesse/${id}`);
  redirect(`/commesse/${id}?pok=${encodeURIComponent(!nuova ? "Chiamata di benvenuto aggiornata." : completa ? "Chiamata di benvenuto salvata: apertura pratica completata." : "Chiamata di benvenuto salvata. Ora la fattura di acconto.")}`);
}

/** «Conferma materiale»: rilievo caricato e righe con il fornitore → si sbloccano gli ordini; chiude il task del rilievo e avvisa l'ufficio ordini. */
export async function confermaMaterialeProgetto(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const id = str(formData, "commessaId");
  if (!id) return;
  const p = await percorsoDiCommessa(id);
  if (!p) return;
  const torna = (q: string) => redirect(`/commesse/${id}?${q}#progetto`);
  if (p.materialeConfermatoIl) torna("pok=" + encodeURIComponent("Il materiale è già confermato."));
  if (!p.puoConfermare) torna("pav=" + encodeURIComponent("Per confermare servono il rilievo caricato e tutte le righe del materiale con il fornitore."));
  await prisma.commessa.update({ where: { id }, data: { materialeConfermatoIl: new Date(), materialeConfermatoDaNome: utente.nome } });
  await log(id, `Materiale confermato da ${utente.nome}: si può ordinare ai fornitori.`);
  // (il task del rilievo si è già chiuso al caricamento del rilievo: l'ufficio ordini ha il suo)
  revalidatePath(`/commesse/${id}`);
  torna("pok=" + encodeURIComponent("Materiale confermato: ora puoi creare gli ordini ai fornitori."));
}

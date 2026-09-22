"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aliquotaIvaPerPaese } from "@/lib/pricing";
import { trovaFasciaPrezzo, calcolaPrezzoAFormula } from "@/lib/prezzoPerMisura";
import { hashPassword, verificaPassword, creaSessione, distruggiSessione, getCurrentUser, isAmministratore } from "@/lib/auth";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function creaLead(formData: FormData) {
  const nome = str(formData, "nome");
  const brandId = str(formData, "brandId");
  if (!nome || !brandId) return;
  const utente = await getCurrentUser();

  await prisma.lead.create({
    data: {
      nome,
      telefono: str(formData, "telefono"),
      email: str(formData, "email"),
      fonte: str(formData, "fonte") ?? "facebook",
      brandId,
      telefonistaId: utente?.id,
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
  const utente = await getCurrentUser();
  await prisma.cliente.create({
    data: {
      nome,
      telefono: str(formData, "telefono"),
      email: str(formData, "email"),
      indirizzo: str(formData, "indirizzo"),
      cap: str(formData, "cap"),
      comune: str(formData, "comune"),
      provincia: str(formData, "provincia"),
      paese: str(formData, "paese") ?? "IT",
      brandId,
      responsabileId: utente?.id,
    },
  });
  revalidatePath("/clienti");
}

export async function aggiornaCliente(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  await prisma.cliente.update({
    where: { id },
    data: {
      telefono: str(formData, "telefono"),
      email: str(formData, "email"),
      indirizzo: str(formData, "indirizzo"),
      cap: str(formData, "cap"),
      comune: str(formData, "comune"),
      provincia: str(formData, "provincia"),
    },
  });
  revalidatePath(`/clienti/${id}`);
  revalidatePath("/clienti");
}

// Numero offerta progressivo per brand, resettato ogni anno solare (1, 2, 3... dal 1 gennaio).
// Non e' garantito atomico sotto concorrenza estrema, accettabile per il volume di questo CRM.
async function prossimoNumeroOfferta(brandId: string): Promise<number> {
  const anno = new Date().getFullYear();
  const inizioAnno = new Date(anno, 0, 1);
  const inizioAnnoSuccessivo = new Date(anno + 1, 0, 1);
  const ultimo = await prisma.preventivo.findFirst({
    where: { brandId, createdAt: { gte: inizioAnno, lt: inizioAnnoSuccessivo } },
    orderBy: { numeroOfferta: "desc" },
    select: { numeroOfferta: true },
  });
  return (ultimo?.numeroOfferta ?? 0) + 1;
}

export async function creaPreventivo(formData: FormData) {
  const clienteId = str(formData, "clienteId");
  const brandId = str(formData, "brandId");
  const commercialeId = str(formData, "commercialeId");
  if (!clienteId || !brandId || !commercialeId) return;

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  const { aliquota } = aliquotaIvaPerPaese(cliente?.paese ?? "IT");
  const numeroOfferta = await prossimoNumeroOfferta(brandId);

  const preventivo = await prisma.preventivo.create({
    data: { clienteId, brandId, commercialeId, aliquotaIva: aliquota, numeroOfferta },
  });
  revalidatePath("/preventivi");
  revalidatePath("/");
  revalidatePath(`/clienti/${clienteId}`);
  redirect(`/preventivi/${preventivo.id}`);
}

// totaleNetto memorizzato è l'imponibile SCONTATO (imponibile lordo * (1 - sconto/100));
// l'IVA viene calcolata su tale importo scontato, coerentemente con le offerte cartacee P&C.
async function ricalcolaTotali(preventivoId: string) {
  const righe = await prisma.rigaPreventivo.findMany({
    where: { preventivoId },
    include: { optionali: true },
  });
  const imponibileLordo = righe.reduce((sum, r) => {
    const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    return sum + r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
  }, 0);
  const preventivoAttuale = await prisma.preventivo.findUnique({ where: { id: preventivoId } });
  const sconto = preventivoAttuale?.scontoPercentuale ?? 0;
  const totaleNetto = imponibileLordo * (1 - sconto / 100);
  const preventivo = await prisma.preventivo.update({
    where: { id: preventivoId },
    data: { totaleNetto },
  });
  await prisma.preventivo.update({
    where: { id: preventivoId },
    data: { totaleIva: totaleNetto * (preventivo.aliquotaIva / 100) },
  });
}

export async function aggiornaCondizioniOfferta(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  const oggetto = str(formData, "oggetto");
  const condizioniPagamento = str(formData, "condizioniPagamento");
  const condizioniConsegna = str(formData, "condizioniConsegna");
  const immagineCopertinaUrl = str(formData, "immagineCopertinaUrl");

  await prisma.preventivo.update({
    where: { id },
    data: { oggetto, condizioniPagamento, condizioniConsegna, immagineCopertinaUrl },
  });
  revalidatePath(`/preventivi/${id}`);
  revalidatePath(`/preventivi/${id}/stampa`);
}

// Azione dedicata per lo sconto, separata da "Condizioni offerta": vive accanto al
// riquadro del totale nella pagina preventivo, con salvataggio immediato e ricalcolo
// del netto/IVA, cosi' non serve aprire la scheda condizioni per modificarlo.
export async function aggiornaSconto(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  const scontoStr = str(formData, "scontoPercentuale");
  const scontoPercentuale = scontoStr
    ? Math.max(0, Math.min(100, parseFloat(scontoStr.replace(",", "."))))
    : 0;

  await prisma.preventivo.update({
    where: { id },
    data: { scontoPercentuale: Number.isFinite(scontoPercentuale) ? scontoPercentuale : 0 },
  });
  await ricalcolaTotali(id);
  revalidatePath(`/preventivi/${id}`);
  revalidatePath(`/preventivi/${id}/stampa`);
}

// Aliquota IVA dell'offerta: di norma preimpostata dal paese del cliente alla
// creazione (aliquotaIvaPerPaese), ma il commerciale può doverla correggere a
// mano (es. aliquota agevolata 14,8% del regime del margine su alcuni
// arredi/serramenti, o un'aliquota estera). Tendina coi valori più comuni +
// slot libero per qualunque altro valore.
export async function aggiornaIva(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  const preset = str(formData, "aliquotaPreset");
  const customStr = str(formData, "aliquotaCustom");

  let aliquotaIva: number;
  if (preset === "ALTRO") {
    const custom = customStr ? parseFloat(customStr.replace(",", ".")) : NaN;
    aliquotaIva = Number.isFinite(custom) ? Math.max(0, Math.min(100, custom)) : 22;
  } else {
    const val = preset ? parseFloat(preset.replace(",", ".")) : NaN;
    aliquotaIva = Number.isFinite(val) ? val : 22;
  }

  await prisma.preventivo.update({
    where: { id },
    data: { aliquotaIva },
  });
  await ricalcolaTotali(id);
  revalidatePath(`/preventivi/${id}`);
  revalidatePath(`/preventivi/${id}/stampa`);
}

// Riga "di solo testo" senza prodotto collegato: utile per aggiungere note, informazioni
// aggiuntive o la motivazione di uno sconto direttamente come voce del preventivo (visibile
// anche in stampa). L'importo è facoltativo e può essere negativo per rappresentare uno
// sconto extra concordato manualmente.
export async function aggiungiRigaTestoLibero(formData: FormData) {
  const preventivoId = str(formData, "preventivoId");
  const testoLibero = str(formData, "testoLibero");
  if (!preventivoId || !testoLibero) return;
  const prezzoStr = str(formData, "prezzoUnitario");
  const prezzoParsed = prezzoStr ? parseFloat(prezzoStr.replace(",", ".")) : 0;
  const prezzoUnitario = Number.isFinite(prezzoParsed) ? prezzoParsed : 0;
  // Sezione opzionale: se il pulsante "+ riga testuale" è quello dentro una
  // sezione/stanza, la riga nasce già assegnata a quella sezione, in coda.
  const sezioneId = str(formData, "sezioneId") || null;
  const ordine = await prossimoOrdine(preventivoId, sezioneId);

  await prisma.rigaPreventivo.create({
    data: { preventivoId, testoLibero, quantita: 1, prezzoUnitario, sezioneId, ordine },
  });
  await ricalcolaTotali(preventivoId);
  revalidatePath(`/preventivi/${preventivoId}`);
}

// ===== Sezioni preventivo (raggruppamento righe per stanza/gruppo) =====
//
// Le righe di un preventivo con molti articoli misti (finestre, tapparelle,
// zanzariere...) possono essere organizzate in "sezioni" create a mano dal
// commerciale (es. "Cucina", "Camera 1"). Le righe senza sezioneId restano
// in un elenco "senza sezione" separato, in cima alla pagina.
//
// L'ordinamento (riga.ordine / sezione.ordine) non è mai garantito denso o
// univoco finché nessuno lo tocca (le righe create restano tutte a 0, o in
// coda con prossimoOrdine): per questo ogni operazione di spostamento fa
// prima un "resequence" (riassegna 0..n-1 in base all'ordine di visualizzazione
// attuale, con l'id come spareggio = ordine di creazione) e solo dopo scambia
// i due valori — così funziona correttamente anche sui preventivi già esistenti,
// senza bisogno di una migrazione dati separata.

async function prossimoOrdine(preventivoId: string, sezioneId: string | null): Promise<number> {
  const agg = await prisma.rigaPreventivo.aggregate({
    where: { preventivoId, sezioneId },
    _max: { ordine: true },
  });
  return (agg._max.ordine ?? -1) + 1;
}

async function resequenceRighe(preventivoId: string, sezioneId: string | null): Promise<{ id: string; ordine: number }[]> {
  const righe = await prisma.rigaPreventivo.findMany({
    where: { preventivoId, sezioneId },
    orderBy: [{ ordine: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const aggiornate = righe.map((r, i) => ({ id: r.id, ordine: i }));
  await Promise.all(aggiornate.map((r) => prisma.rigaPreventivo.update({ where: { id: r.id }, data: { ordine: r.ordine } })));
  return aggiornate;
}

async function spostaRiga(formData: FormData, direzione: 1 | -1) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  if (!id || !preventivoId) return;

  const riga = await prisma.rigaPreventivo.findUnique({ where: { id }, select: { sezioneId: true } });
  if (!riga) return;

  const ordinate = await resequenceRighe(preventivoId, riga.sezioneId);
  const idx = ordinate.findIndex((r) => r.id === id);
  const altroIdx = idx + direzione;
  if (idx === -1 || altroIdx < 0 || altroIdx >= ordinate.length) return;

  await prisma.$transaction([
    prisma.rigaPreventivo.update({ where: { id: ordinate[idx].id }, data: { ordine: ordinate[altroIdx].ordine } }),
    prisma.rigaPreventivo.update({ where: { id: ordinate[altroIdx].id }, data: { ordine: ordinate[idx].ordine } }),
  ]);
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function spostaRigaSu(formData: FormData) {
  await spostaRiga(formData, -1);
}

export async function spostaRigaGiu(formData: FormData) {
  await spostaRiga(formData, 1);
}

// Sposta una riga in un'altra sezione (o fuori da qualunque sezione se si
// sceglie l'opzione vuota): finisce in coda alla sezione di destinazione,
// poi eventualmente riordinabile con le frecce su/giu.
export async function spostaRigaSezione(formData: FormData) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  if (!id || !preventivoId) return;
  const sezioneIdRaw = str(formData, "sezioneId");
  const sezioneId = sezioneIdRaw ? sezioneIdRaw : null;

  const ordine = await prossimoOrdine(preventivoId, sezioneId);
  await prisma.rigaPreventivo.update({ where: { id }, data: { sezioneId, ordine } });
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function creaSezione(formData: FormData) {
  const preventivoId = str(formData, "preventivoId");
  const nome = str(formData, "nome");
  if (!preventivoId || !nome || !nome.trim()) return;

  const agg = await prisma.sezionePreventivo.aggregate({
    where: { preventivoId },
    _max: { ordine: true },
  });
  const ordine = (agg._max.ordine ?? -1) + 1;

  await prisma.sezionePreventivo.create({
    data: { preventivoId, nome: nome.trim(), ordine },
  });
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function rinominaSezione(formData: FormData) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  const nome = str(formData, "nome");
  if (!id || !preventivoId || !nome || !nome.trim()) return;

  await prisma.sezionePreventivo.update({ where: { id }, data: { nome: nome.trim() } });
  revalidatePath(`/preventivi/${preventivoId}`);
}

// Elimina una sezione vuota. Se contiene ancora righe non fa nulla (l'interfaccia
// non mostra comunque il pulsante in quel caso): evita di cancellare per sbaglio
// righe/articoli insieme alla sezione.
export async function eliminaSezione(formData: FormData) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  if (!id || !preventivoId) return;

  const righeCollegate = await prisma.rigaPreventivo.count({ where: { sezioneId: id } });
  if (righeCollegate > 0) return;

  await prisma.sezionePreventivo.delete({ where: { id } });
  revalidatePath(`/preventivi/${preventivoId}`);
}

async function resequenceSezioni(preventivoId: string): Promise<{ id: string; ordine: number }[]> {
  const sezioni = await prisma.sezionePreventivo.findMany({
    where: { preventivoId },
    orderBy: [{ ordine: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const aggiornate = sezioni.map((s, i) => ({ id: s.id, ordine: i }));
  await Promise.all(aggiornate.map((s) => prisma.sezionePreventivo.update({ where: { id: s.id }, data: { ordine: s.ordine } })));
  return aggiornate;
}

async function spostaSezione(formData: FormData, direzione: 1 | -1) {
  const id = str(formData, "id");
  const preventivoId = str(formData, "preventivoId");
  if (!id || !preventivoId) return;

  const ordinate = await resequenceSezioni(preventivoId);
  const idx = ordinate.findIndex((s) => s.id === id);
  const altroIdx = idx + direzione;
  if (idx === -1 || altroIdx < 0 || altroIdx >= ordinate.length) return;

  await prisma.$transaction([
    prisma.sezionePreventivo.update({ where: { id: ordinate[idx].id }, data: { ordine: ordinate[altroIdx].ordine } }),
    prisma.sezionePreventivo.update({ where: { id: ordinate[altroIdx].id }, data: { ordine: ordinate[idx].ordine } }),
  ]);
  revalidatePath(`/preventivi/${preventivoId}`);
}

export async function spostaSezioneSu(formData: FormData) {
  await spostaSezione(formData, -1);
}

export async function spostaSezioneGiu(formData: FormData) {
  await spostaSezione(formData, 1);
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

  const quantita = quantitaStr ? Math.max(1, parseInt(quantitaStr, 10)) : 1;

  const modello = await prisma.modelloProdotto.findUnique({
    where: { brandId_tipologia: { brandId, tipologia } },
  });

  if (modello && modello.modalitaCalcolo !== "GRIGLIA") {
    // Listini "a formula" (es. vetrate BRILLANTE/SCINTILLA): niente griglia larghezza×altezza,
    // il prezzo si ricava applicando la tariffa a listino alla misura reale.
    const esito = await calcolaPrezzoAFormula({
      brandId,
      tipologia,
      modalitaCalcolo: modello.modalitaCalcolo,
      parametriCalcolo: modello.parametriCalcolo,
      larghezzaCm: larghezza,
      altezzaCm: altezza,
    });
    if (!esito) {
      redirect(
        `/preventivi/${preventivoId}?errore=${encodeURIComponent(
          `Tariffa non disponibile per ${tipologia} a ${larghezza}×${altezza} — verificare il listino`
        )}`
      );
    }
    await prisma.rigaPreventivo.create({
      data: {
        preventivoId,
        prodottoId: esito!.prodottoRiferimentoId,
        quantita,
        prezzoUnitario: esito!.prezzoUnitario,
        misuraLarghezza: larghezza,
        misuraAltezza: altezza,
      },
    });
    await ricalcolaTotali(preventivoId);
    revalidatePath(`/preventivi/${preventivoId}`);
    return;
  }

  const prodotto = await trovaFasciaPrezzo({ brandId, tipologia, larghezza, altezza });
  if (!prodotto) {
    redirect(
      `/preventivi/${preventivoId}?errore=${encodeURIComponent(
        `Nessuna fascia di prezzo per ${tipologia} a ${larghezza}×${altezza} — misura fuori listino`
      )}`
    );
  }

  const nuovaRiga = await prisma.rigaPreventivo.create({
    data: {
      preventivoId,
      prodottoId: prodotto!.id,
      quantita,
      prezzoUnitario: prodotto!.prezzoBase,
      misuraLarghezza: larghezza,
      misuraAltezza: altezza,
    },
  });

  // Blindati anta singola (CL3/CL4): il prezzo del portoncino è fisso per tutte le
  // misure standard (80/85/90 x 210/220cm) — se la misura richiesta esce da questo
  // standard va applicata la maggiorazione "Fuori Misura" corrispondente, che prima
  // andava aggiunta a mano (facile da dimenticare, come segnalato dall'utente: "un
  // 100 di larghezza non costa come uno standard"). Qui viene calcolata e agganciata
  // automaticamente come riga Optional distinta, visibile/rimovibile come le altre.
  // Le varianti a due ante (DUEANTE_STD/SIMMETRICA) restano manuali: la maggiorazione
  // lì va valutata "per ogni anta" e la larghezza dell'antino non è nemmeno tracciata
  // separatamente nel modello dati attuale, quindi un calcolo automatico rischierebbe
  // di essere sbagliato — resta da selezionare a mano dalla tendina "Optional Blindato".
  if (tipologia === "BLINDATI_CL3" || tipologia === "BLINDATI_CL4") {
    const L = Math.round(larghezza);
    const H = Math.round(altezza);
    const larghezzaStd = L === 80 || L === 85 || L === 90;
    const altezzaStd = H === 210 || H === 220;
    let nomeMaggiorazione: string | null = null;
    if (!larghezzaStd && !altezzaStd) {
      const fasciaL = L <= 100 ? "50-100" : "101-110";
      const fasciaH = H <= 230 ? "180-230" : "231-250";
      nomeMaggiorazione =
        fasciaL === "50-100" && fasciaH === "180-230"
          ? "Fuori misura L e H (L 50-100cm, H 180-230cm)"
          : fasciaL === "50-100" && fasciaH === "231-250"
          ? "Fuori misura L e H (L 50-100cm, H 231-250cm)"
          : "Fuori misura L e H (L 101-110cm, H 180-250cm)";
    } else if (!larghezzaStd) {
      nomeMaggiorazione = L <= 100 ? "Fuori misura in Larghezza da 50 a 100 cm" : "Fuori misura in Larghezza da 101 a 110 cm";
    } else if (!altezzaStd) {
      nomeMaggiorazione = H <= 230 ? "Fuori misura in Altezza da 180 a 230 cm" : "Fuori misura in Altezza da 231 a 250 cm";
    }
    if (nomeMaggiorazione) {
      const optionalMaggiorazione = await prisma.optional.findFirst({
        where: { brandId, categoria: "Fuori Misura", nome: nomeMaggiorazione, listino: "BLINDATI_SINGOLA" },
      });
      if (optionalMaggiorazione) {
        await prisma.rigaOptional.create({
          data: {
            rigaId: nuovaRiga.id,
            optionalId: optionalMaggiorazione.id,
            quantita: 1,
            prezzoUnitario: optionalMaggiorazione.valore,
            nota: "applicata automaticamente — misura richiesta fuori standard",
          },
        });
      }
    }
  }

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
  // Slot di scrittura libera (es. codice tessuto Tempotest esatto dal campionario
  // fisico, quando l'automazione non è certa al 100%) — vedi task #210.
  const nota = str(formData, "nota");
  // Prezzo inserito a mano per le posizioni "a scrittura libera" (es. pannello
  // Blindati esterno/interno non a catalogo) — se presente e numerico sovrascrive
  // il prezzo calcolato dall'Optional-ancora selezionato. Vedi task #235.
  const prezzoManualeStr = str(formData, "prezzoManuale");
  if (!rigaId || !optionalId || !preventivoId) return;

  const [riga, optional] = await Promise.all([
    prisma.rigaPreventivo.findUnique({ where: { id: rigaId } }),
    prisma.optional.findUnique({ where: { id: optionalId } }),
  ]);
  if (!riga || !optional) return;

  const quantita = quantitaStr ? Math.max(1, parseInt(quantitaStr, 10)) : 1;
  const prezzoManuale = prezzoManualeStr !== null ? parseFloat(prezzoManualeStr) : NaN;
  const prezzoUnitario =
    !Number.isNaN(prezzoManuale)
      ? prezzoManuale
      : optional.tipoPrezzo === "PERCENTUALE"
      ? Math.round(riga.quantita * riga.prezzoUnitario * (optional.valore / 100) * 100) / 100
      : optional.valore;

  await prisma.rigaOptional.create({
    data: { rigaId, optionalId, quantita, prezzoUnitario, nota: nota || null },
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
  const username = str(formData, "username") ?? email;
  const passwordIniziale = str(formData, "password");
  const passwordHash = passwordIniziale ? await hashPassword(passwordIniziale) : null;

  await prisma.utente.create({
    data: {
      nome,
      email,
      ruolo,
      username,
      passwordHash,
      mustChangePassword: true,
    },
  });
  revalidatePath("/impostazioni");
}

// --- Autenticazione ---

export async function login(formData: FormData) {
  const username = str(formData, "username");
  const password = str(formData, "password");
  const next = str(formData, "next");
  if (!username || !password) {
    redirect(`/login?errore=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  const utente = await prisma.utente.findUnique({ where: { username: username! } });
  if (!utente || !utente.passwordHash || !(await verificaPassword(password!, utente.passwordHash))) {
    redirect(`/login?errore=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  await creaSessione(utente!.id);
  redirect(next && next.startsWith("/") ? next : "/");
}

export async function logout() {
  await distruggiSessione();
  redirect("/login");
}

export async function cambiaPassword(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");

  const passwordAttuale = str(formData, "passwordAttuale");
  const nuovaPassword = str(formData, "nuovaPassword");
  const conferma = str(formData, "conferma");

  if (!nuovaPassword || nuovaPassword.length < 6) {
    redirect("/profilo?errore=" + encodeURIComponent("La nuova password deve avere almeno 6 caratteri"));
  }
  if (nuovaPassword !== conferma) {
    redirect("/profilo?errore=" + encodeURIComponent("Le due password non coincidono"));
  }
  // Se l'utente ha già una password impostata (non è il primo accesso forzato),
  // richiediamo comunque la password attuale per sicurezza.
  if (utente!.passwordHash && !utente!.mustChangePassword) {
    if (!passwordAttuale || !(await verificaPassword(passwordAttuale, utente!.passwordHash))) {
      redirect("/profilo?errore=" + encodeURIComponent("Password attuale non corretta"));
    }
  }

  const passwordHash = await hashPassword(nuovaPassword!);
  await prisma.utente.update({
    where: { id: utente!.id },
    data: { passwordHash, mustChangePassword: false },
  });
  redirect("/profilo?ok=1");
}

export async function aggiornaUsername(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const username = str(formData, "username");
  if (!username) return;
  await prisma.utente.update({ where: { id: utente!.id }, data: { username } });
  revalidatePath("/profilo");
}

// Telefono di contatto del commerciale, mostrato nella stampa dell'offerta come riferimento.
export async function aggiornaContattiUtente(formData: FormData) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const telefono = str(formData, "telefono");
  await prisma.utente.update({ where: { id: utente!.id }, data: { telefono } });
  revalidatePath("/profilo");
}

// L'amministratore può correggere il telefono di un altro utente (es. se lo ha inserito sbagliato).
export async function adminAggiornaTelefonoUtente(formData: FormData) {
  const admin = await getCurrentUser();
  if (!admin || !isAmministratore(admin)) redirect("/impostazioni");
  const utenteId = str(formData, "utenteId");
  if (!utenteId) return;
  const telefono = str(formData, "telefono");
  await prisma.utente.update({ where: { id: utenteId }, data: { telefono } });
  revalidatePath("/impostazioni");
}

// Reset amministrativo: l'AMMINISTRATORE imposta una nuova password per un altro utente,
// senza bisogno di conoscerne quella attuale (recupero credenziali smarrite).
export async function adminResetPassword(formData: FormData) {
  const admin = await getCurrentUser();
  if (!admin || !isAmministratore(admin)) redirect("/impostazioni");

  const utenteId = str(formData, "utenteId");
  const nuovaPassword = str(formData, "nuovaPassword");
  const nuovoUsername = str(formData, "nuovoUsername");
  if (!utenteId) return;

  const data: { passwordHash?: string; mustChangePassword?: boolean; username?: string } = {};
  if (nuovaPassword && nuovaPassword.length >= 6) {
    data.passwordHash = await hashPassword(nuovaPassword);
    data.mustChangePassword = true;
  }
  if (nuovoUsername) data.username = nuovoUsername;
  if (Object.keys(data).length === 0) return;

  await prisma.utente.update({ where: { id: utenteId }, data });
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

export async function salvaPrezzoProdotto(formData: FormData) {
  const prodottoId = str(formData, "prodottoId");
  const tipologia = str(formData, "tipologia");
  const prezzoStr = str(formData, "prezzoBase");
  if (!prodottoId || !tipologia || prezzoStr === null) return;
  const prezzoBase = parseFloat(prezzoStr.replace(",", "."));
  if (!Number.isFinite(prezzoBase) || prezzoBase < 0) return;

  await prisma.prodotto.update({ where: { id: prodottoId }, data: { prezzoBase } });
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

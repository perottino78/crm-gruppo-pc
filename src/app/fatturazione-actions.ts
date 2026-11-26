"use server";

// Fatturazione (ufficio Giorgia): fatture emesse dal CRM e DDT di uscita, come in BConsole.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { leggiCointestatario } from "@/lib/fatturazione/cointestato";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getConfig, setConfig } from "@/lib/leadIngest";
import { registra as registraLog } from "@/lib/amministrazione/server";
import { leggiQuantita } from "@/lib/magazzino/calcoli";
import { daOraRoma } from "@/lib/calendario/tempo";
import { accontiEmessiDellaCommessa, ibanDellaBanca, CHIAVE_REALE, CEDENTE, chiaveUltimaFattura, chiaveUltimoDdt, datiCliente, datiPdfFattura, emetti, emissioneReale, motivoNoRiapertura, prossimoNumeroDdt, puoFatturazione, ricalcolaFattura, righeDaOfferta, sezionaliSenzaUltimoNumero } from "@/lib/fatturazione/server";
import { accontiDaDedurre, chiaveNumero, rigaDeduzione } from "@/lib/fatturazione/acconti";
import { BANCA_PREDEFINITA, CAUSALI_TRASPORTO, SEZIONALI, TIPI_FATTURA, codiceIva, sezionale } from "@/lib/fatturazione/tabelle";
import { propostaDaCommessa, statoDdtDaRighe } from "@/lib/fatturazione/calcoli";
import { numeroCommessa } from "@/lib/commesse";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const num = (fd: FormData, k: string) => leggiQuantita(str(fd, k));
const intero = (fd: FormData, k: string) => { const n = num(fd, k); return n === null ? null : Math.round(n); };
/** Campo del form se presente (anche vuoto = cancellato), altrimenti il valore attuale. */
const campo = <T,>(fd: FormData, k: string, attuale: T, leggi: (fd: FormData, k: string) => T): T => (fd.has(k) ? leggi(fd, k) : attuale);
/** Data del form (aaaa-mm-gg) a mezzogiorno UTC: è il giorno giusto in Italia. */
const giorno = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : null);
const oggi = () => new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })}T12:00:00Z`);

async function utente() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoFatturazione(u)) throw new Error("Serve il permesso «Fatturazione».");
  return u;
}
const errore = (dove: string, msg: string): never => redirect(`${dove}${dove.includes("?") ? "&" : "?"}errore=${encodeURIComponent(msg)}`);
function aggiorna(...percorsi: string[]) {
  revalidatePath("/fatturazione");
  for (const p of percorsi) revalidatePath(p);
}

// ======================= FATTURE =======================

/** Nuova fattura (bozza) per un cliente o da una commessa: acconto, saldo o fattura libera. */
export async function creaFattura(fd: FormData) {
  const u = await utente();
  const tipo = TIPI_FATTURA.some((t) => t.codice === str(fd, "tipo")) ? str(fd, "tipo")! : "FATTURA";
  const commessaId = str(fd, "commessaId");
  const comm = commessaId ? await prisma.commessa.findUnique({ where: { id: commessaId }, include: { brand: true, preventivo: { select: { id: true, aliquotaIva: true, commerciale: { select: { nome: true } } } } } }) : null;
  const clienteId = comm?.clienteId ?? str(fd, "clienteId");
  if (!clienteId) errore("/fatturazione", "Scegli il cliente (dall'elenco che compare mentre scrivi) o la commessa.");
  const cli = await datiCliente(clienteId!);
  if (!cli) errore("/fatturazione", "Cliente non trovato.");
  const brand = comm?.brand.nome ?? cli!.brand;
  const sez = str(fd, "sezionale") ?? (SEZIONALI.find((s) => s.brand && brand && s.brand.toLowerCase() === brand.toLowerCase())?.codice ?? "PC");
  const data = giorno(str(fd, "data")) ?? oggi();
  const { brand: _b, metodoPagamento: _m, ...anagrafica } = cli!;
  void _b; void _m;
  const aliquota = comm?.preventivo.aliquotaIva ?? 10;
  const righe: { descrizione: string; quantita: number; um: string | null; prezzo: number; aliquota: number; natura: string | null }[] = [];
  let causale: string | null = null;
  if (comm && tipo === "ACCONTO") {
    const p = propostaDaCommessa("ACCONTO", comm, 0, aliquota);
    righe.push({ descrizione: `Acconto per fornitura come da contratto (commessa ${numeroCommessa(comm)})`, quantita: 1, um: null, prezzo: p.imponibile, aliquota, natura: null });
    causale = "FATTURA ACCONTO";
  } else if (comm && tipo === "SALDO") {
    for (const r of await righeDaOfferta(comm.preventivo.id)) righe.push({ ...r, um: r.um });
    // acconti già fatturati (dal CRM o da BConsole, anche non agganciati alla commessa) da dedurre con il segno meno
    for (const a of accontiDaDedurre(await accontiEmessiDellaCommessa(comm.id, comm.clienteId, aliquota))) righe.push(rigaDeduzione(a));
    causale = "FATTURA SALDO";
  } else if (comm && tipo !== "NOTA_CREDITO") {
    for (const r of await righeDaOfferta(comm.preventivo.id)) righe.push(r);
  }
  const f = await prisma.$transaction(async (tx) => {
    const f = await tx.fatturaEmessa.create({
      data: {
        tipo, sezionale: sezionale(sez).codice, anno: data.getUTCFullYear(), data, ...anagrafica, commessaId: comm?.id ?? null, brand,
        venditore: comm?.preventivo.commerciale?.nome ?? null, riferimento: comm ? `Commessa ${numeroCommessa(comm)}` : null, causale,
        metodoPagamento: "BONIFICO_VISTA", banca: BANCA_PREDEFINITA, iban: await ibanDellaBanca(BANCA_PREDEFINITA), creatoDaNome: u.nome,
        righe: { create: righe.map((r, i) => ({ ...r, posizione: i + 1 })) },
      },
    });
    await ricalcolaFattura(tx, f.id);
    return f;
  });
  aggiorna();
  redirect(`/fatturazione/fatture/${f.id}`);
}

async function bozza(id: string | null) {
  const f = id ? await prisma.fatturaEmessa.findUnique({ where: { id } }) : null;
  if (!f) redirect("/fatturazione/fatture");
  if (f.stato !== "BOZZA") errore(`/fatturazione/fatture/${f.id}`, "La fattura è già emessa: non si modifica più (per correggerla fai una nota di credito).");
  return f;
}

/** Testata della fattura (tipo, sezionale, data, pagamento, causale, trasporto, dati del cliente). */
export async function salvaTestataFattura(fd: FormData) {
  await utente();
  const f = await bozza(str(fd, "id"));
  const bloccata = !!f.numero; // riaperta per correggerla: il numero è già suo, tipo, sezionale e data non cambiano
  const tipo = bloccata ? f.tipo : TIPI_FATTURA.some((t) => t.codice === str(fd, "tipo")) ? str(fd, "tipo")! : f.tipo;
  const data = bloccata ? f.data : giorno(str(fd, "data")) ?? f.data;
  const cointest = leggiCointestatario((k) => str(fd, k), fd.get("cointestata") === "on") as Prisma.InputJsonValue | null;
  await prisma.$transaction(async (tx) => {
    await tx.fatturaEmessa.update({
      where: { id: f.id },
      data: {
        tipo, sezionale: bloccata ? f.sezionale : sezionale(str(fd, "sezionale") ?? f.sezionale).codice, data, anno: data.getUTCFullYear(),
        metodoPagamento: str(fd, "metodoPagamento"), banca: str(fd, "banca"), iban: str(fd, "iban")?.replace(/\s/g, "").toUpperCase() ?? null,
        causale: str(fd, "causale"), riferimento: str(fd, "riferimento"), note: str(fd, "note"), noteInterne: str(fd, "noteInterne"),
        addebitoBollo: fd.get("addebitoBollo") === "on", detrazione: fd.get("detrazione") === "on",
        ritenutaAliquota: fd.get("conRitenuta") === "on" ? (num(fd, "ritenutaAliquota") ?? 23) : null, ritenutaBase: fd.get("conRitenuta") === "on" ? (num(fd, "ritenutaBase") ?? 100) : null,
        cointestatario: cointest ?? Prisma.DbNull,
        clienteNome: str(fd, "clienteNome") ?? f.clienteNome, partitaIva: campo(fd, "partitaIva", f.partitaIva, str), codiceFiscale: campo(fd, "codiceFiscale", f.codiceFiscale, (x, k) => str(x, k)?.toUpperCase() ?? null),
        indirizzo: campo(fd, "indirizzo", f.indirizzo, str), cap: campo(fd, "cap", f.cap, str), comune: campo(fd, "comune", f.comune, str), provincia: campo(fd, "provincia", f.provincia, (x, k) => str(x, k)?.toUpperCase() ?? null),
        nazione: (campo(fd, "nazione", f.nazione, str) ?? "IT").toUpperCase().slice(0, 2), codiceDestinatario: campo(fd, "codiceDestinatario", f.codiceDestinatario, (x, k) => str(x, k)?.toUpperCase() ?? null), pec: campo(fd, "pec", f.pec, str), email: campo(fd, "email", f.email, str), telefono: campo(fd, "telefono", f.telefono, str),
        persona: fd.has("clienteNome") ? fd.get("persona") === "on" : f.persona, nomePersona: campo(fd, "nomePersona", f.nomePersona, str), cognome: campo(fd, "cognome", f.cognome, str),
        causaleTrasporto: str(fd, "causaleTrasporto"), trasportoACura: str(fd, "trasportoACura"), vettore: str(fd, "vettore"), aspettoBeni: str(fd, "aspettoBeni"),
        colli: intero(fd, "colli"), pesoLordo: num(fd, "pesoLordo"), pesoNetto: num(fd, "pesoNetto"), porto: str(fd, "porto"),
        inizioTrasporto: str(fd, "inizioTrasporto") ? daOraRoma(str(fd, "inizioTrasporto")!) : null, destinazione: str(fd, "destinazione"),
      },
    });
    await ricalcolaFattura(tx, f.id);
  });
  aggiorna(`/fatturazione/fatture/${f.id}`);
  redirect(`/fatturazione/fatture/${f.id}?salvato=1`);
}

/** Aggiunge alla bozza di un saldo le righe «A dedurre acconto fattura n. …» (prezzo negativo) degli acconti emessi non ancora presenti. */
export async function aggiungiAccontiDaDedurre(fd: FormData) {
  await utente();
  const f = await bozza(str(fd, "id"));
  if (f.tipo !== "SALDO" || !f.commessaId) errore(`/fatturazione/fatture/${f.id}`, "Gli acconti si deducono solo nella fattura di saldo di una commessa.");
  const comm = await prisma.commessa.findUnique({ where: { id: f.commessaId! }, select: { clienteId: true, preventivo: { select: { aliquotaIva: true } } } });
  const righe = await prisma.rigaFatturaEmessa.findMany({ where: { fatturaId: f.id }, select: { descrizione: true } });
  const scelti = fd.getAll("acconto").map(String);
  const daAggiungere = accontiDaDedurre(await accontiEmessiDellaCommessa(f.commessaId!, comm?.clienteId ?? f.clienteId, comm?.preventivo.aliquotaIva ?? 10), righe.map((r) => r.descrizione)).filter((a) => scelti.includes(chiaveNumero(a.numero)));
  if (!daAggiungere.length) errore(`/fatturazione/fatture/${f.id}#righe`, "Nessun acconto da aggiungere: spunta quelli da dedurre (o sono già tutti nelle righe).");
  await prisma.$transaction(async (tx) => {
    const ultima = await tx.rigaFatturaEmessa.aggregate({ where: { fatturaId: f.id }, _max: { posizione: true } });
    let pos = ultima._max.posizione ?? 0;
    for (const a of daAggiungere) await tx.rigaFatturaEmessa.create({ data: { fatturaId: f.id, ...rigaDeduzione(a), posizione: ++pos } });
    await ricalcolaFattura(tx, f.id);
  });
  aggiorna(`/fatturazione/fatture/${f.id}`);
  redirect(`/fatturazione/fatture/${f.id}?salvato=1#righe`);
}

/** Salva tutte le righe (modifiche) e, se compilata, aggiunge la riga nuova. */
export async function salvaRigheFattura(fd: FormData) {
  await utente();
  const f = await bozza(str(fd, "id"));
  const righe = await prisma.rigaFatturaEmessa.findMany({ where: { fatturaId: f.id } });
  await prisma.$transaction(async (tx) => {
    for (const r of righe) {
      if (fd.get(`del_${r.id}`) === "on") { await tx.rigaFatturaEmessa.delete({ where: { id: r.id } }); continue; }
      const iva = codiceIva(str(fd, `iva_${r.id}`));
      await tx.rigaFatturaEmessa.update({
        where: { id: r.id },
        data: {
          codice: str(fd, `codice_${r.id}`), descrizione: str(fd, `descrizione_${r.id}`) ?? r.descrizione, quantita: num(fd, `quantita_${r.id}`) ?? r.quantita,
          um: str(fd, `um_${r.id}`), prezzo: num(fd, `prezzo_${r.id}`) ?? r.prezzo, sconto: num(fd, `sconto_${r.id}`), aliquota: iva.aliquota, natura: iva.natura ?? null,
          posizione: intero(fd, `pos_${r.id}`) ?? r.posizione,
        },
      });
    }
    const descr = str(fd, "nuova_descrizione");
    if (descr) {
      const iva = codiceIva(str(fd, "nuova_iva"));
      await tx.rigaFatturaEmessa.create({
        data: {
          fatturaId: f.id, posizione: righe.length + 1, codice: str(fd, "nuova_codice"), descrizione: descr, quantita: num(fd, "nuova_quantita") ?? 1,
          um: str(fd, "nuova_um"), prezzo: num(fd, "nuova_prezzo") ?? 0, sconto: num(fd, "nuova_sconto"), aliquota: iva.aliquota, natura: iva.natura ?? null,
        },
      });
    }
    await ricalcolaFattura(tx, f.id);
  });
  aggiorna(`/fatturazione/fatture/${f.id}`);
  redirect(`/fatturazione/fatture/${f.id}?salvato=1#righe`);
}

/** Emette la fattura: numero, XML e (se l'emissione vera è accesa) fattura di vendita con le scadenze. */
export async function emettiFattura(fd: FormData) {
  const u = await utente();
  const f = await bozza(str(fd, "id"));
  const reale = await emissioneReale();
  let msg: string | null = null;
  try {
    const e = await prisma.$transaction((tx) => emetti(tx, f.id, u.nome, reale), { timeout: 30000 });
    await registraLog("FATTURA_EMESSA", e.id, e.stato, `${e.numero} — ${e.clienteNome} — ${e.totale.toFixed(2)} €`, u.nome);
    // copia in pdf nella cartella «Fatture a cliente» della pratica (mai bloccante)
    try {
      if (e.commessaId && e.tipo !== "PROFORMA") {
        const d = await datiPdfFattura(e.id);
        if (d) {
          const { pdfFattura } = await import("@/lib/fatturazione/pdf");
          const bytes = Buffer.from(await pdfFattura(d.dati));
          await prisma.documento.create({ data: { entita: "COMMESSA", entitaId: e.commessaId, cartella: "Fatture a cliente", nome: `Fattura ${(e.numero ?? "").replace(/\//g, "-")}.pdf`, mime: "application/pdf", dimensione: bytes.length, contenuto: bytes, caricatoDaNome: u.nome } });
        }
      }
    } catch { /* il PDF resta scaricabile dalla fattura */ }
  } catch (err) { msg = (err as Error).message; }
  if (msg) errore(`/fatturazione/fatture/${f.id}`, msg);
  aggiorna(`/fatturazione/fatture/${f.id}`, "/amministrazione/fatture-vendita", "/amministrazione/scadenzario");
  redirect(`/fatturazione/fatture/${f.id}?emessa=1`);
}

/** Riapre una fattura emessa per correggerla (non inviata allo SDI, senza incassi): torna bozza CON il suo numero; rimessa «Emetti» riprende lo stesso numero. */
export async function riapriFattura(fd: FormData) {
  const u = await utente();
  const f = await prisma.fatturaEmessa.findUnique({ where: { id: str(fd, "id") ?? "" } });
  if (!f) redirect("/fatturazione/fatture");
  const no = await motivoNoRiapertura(f);
  if (no) errore(`/fatturazione/fatture/${f.id}`, no);
  await prisma.$transaction(async (tx) => {
    if (f.fatturaVenditaId) {
      await tx.scadenza.deleteMany({ where: { fatturaVenditaId: f.fatturaVenditaId } });
      await tx.fatturaEmessa.update({ where: { id: f.id }, data: { fatturaVenditaId: null } });
      await tx.fatturaVendita.delete({ where: { id: f.fatturaVenditaId } });
    }
    await tx.fatturaEmessa.update({ where: { id: f.id }, data: { stato: "BOZZA", xml: null, rate: Prisma.DbNull } });
  });
  await registraLog("FATTURA_EMESSA", f.id, "RIAPERTA", `${f.numero} riaperta per correggerla`, u.nome);
  aggiorna(`/fatturazione/fatture/${f.id}`, "/amministrazione/fatture-vendita", "/amministrazione/scadenzario");
  redirect(`/fatturazione/fatture/${f.id}?salvato=1`);
}

/** Segna la fattura come inviata allo SDI (o toglie il segno). Entro 12 giorni dall'emissione. */
export async function segnaInviataSdi(fd: FormData) {
  const u = await utente();
  const f = await prisma.fatturaEmessa.findUnique({ where: { id: str(fd, "id") ?? "" } });
  if (!f || f.stato !== "EMESSA") redirect("/fatturazione/fatture");
  const annulla = fd.get("annulla") === "1";
  await prisma.fatturaEmessa.update({ where: { id: f.id }, data: { inviataSdiIl: annulla ? null : giorno(str(fd, "data")) ?? new Date() } });
  await registraLog("FATTURA_SDI", f.id, annulla ? "ANNULLATA" : "INVIATA", `${f.numero} ${annulla ? "tolto il segno «inviata allo SDI»" : "segnata inviata allo SDI"}`, u.nome);
  aggiorna(`/fatturazione/fatture/${f.id}`);
  redirect(`/fatturazione/fatture/${f.id}?salvato=1`);
}

/**
 * Lo SDI ha scartato il file (errore da correggere, es. partita IVA o codice destinatario sbagliati): la fattura non è mai stata consegnata,
 * quindi tiene il suo numero. Toglie il segno «inviata», annota il motivo e la rende riapribile: si corregge e si rimanda con lo stesso numero.
 */
export async function segnaScartataSdi(fd: FormData) {
  const u = await utente();
  const f = await prisma.fatturaEmessa.findUnique({ where: { id: str(fd, "id") ?? "" } });
  if (!f || f.stato !== "EMESSA") redirect("/fatturazione/fatture");
  const motivo = (str(fd, "motivo") ?? "motivo non indicato").slice(0, 300);
  const quando = new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  await prisma.fatturaEmessa.update({ where: { id: f.id }, data: { inviataSdiIl: null, noteInterne: [f.noteInterne, `⚠️ Scartata dallo SDI il ${quando}: ${motivo}`].filter(Boolean).join("\n") } });
  await registraLog("FATTURA_SDI", f.id, "SCARTATA", `${f.numero} scartata dallo SDI: ${motivo}`, u.nome);
  aggiorna(`/fatturazione/fatture/${f.id}`);
  redirect(`/fatturazione/fatture/${f.id}?salvato=1`);
}

/** Invia la fattura (PDF di cortesia) al cliente per email, dalla casella di chi la manda (Debora 23/11/2026). */
export async function inviaFatturaEmail(fd: FormData) {
  const u = await utente();
  const id = str(fd, "id");
  const d = id ? await datiPdfFattura(id) : null;
  if (!d) redirect("/fatturazione/fatture");
  const f = d.fattura;
  const a = (str(fd, "a") ?? "").split(/[;,\s]+/).filter((x) => x.includes("@"));
  if (a.length === 0) errore(`/fatturazione/fatture/${f.id}`, "Scrivi l'email del cliente.");
  const { pdfFattura } = await import("@/lib/fatturazione/pdf");
  const { inviaMail } = await import("@/lib/mail/invio");
  const pdf = Buffer.from(await pdfFattura(d.dati));
  const numero = f.numero ?? "bozza";
  const esito = await inviaMail({
    a, daUtenteId: u.id, oggetto: `Fattura n. ${numero} - ${CEDENTE.denominazione}`,
    testo: `Buongiorno,\n\nin allegato la fattura n. ${numero} del ${f.data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}.\n\nCordiali saluti\nUfficio fatturazione\n${CEDENTE.denominazione}`,
    allegati: [{ nome: `Fattura ${numero.replace(/\//g, "-")}.pdf`, contenuto: pdf, mime: "application/pdf" }],
  });
  if (!esito.inviata) errore(`/fatturazione/fatture/${f.id}`, `Email non inviata: ${esito.motivo ?? "errore"}`);
  await registraLog("FATTURA_INVIATA_EMAIL", f.id, "INVIATA", `${numero} → ${a.join(", ")}`, u.nome);
  aggiorna(`/fatturazione/fatture/${f.id}`);
  redirect(`/fatturazione/fatture/${f.id}?inviata=1`);
}

/** Elimina una bozza, o una fattura di prova (non è mai stata valida). Libera i DDT collegati. */
export async function eliminaFattura(fd: FormData) {
  const u = await utente();
  const f = await prisma.fatturaEmessa.findUnique({ where: { id: str(fd, "id") ?? "" }, include: { righe: true } });
  if (!f) redirect("/fatturazione/fatture");
  if (f.stato === "EMESSA") errore(`/fatturazione/fatture/${f.id}`, "Una fattura emessa non si elimina: fai una nota di credito.");
  if (f.stato === "BOZZA" && f.numero) errore(`/fatturazione/fatture/${f.id}`, "Questa fattura ha già un numero (è stata riaperta per correggerla): riemettila oppure fai una nota di credito.");
  await prisma.$transaction(async (tx) => {
    const righeDdt = f.righe.map((r) => r.rigaDdtId).filter(Boolean) as string[];
    if (righeDdt.length) await tx.rigaDdtUscita.updateMany({ where: { id: { in: righeDdt } }, data: { fatturata: false } });
    const ddt = await tx.ddtUscita.findMany({ where: { fatturaId: f.id } });
    await tx.ddtUscita.updateMany({ where: { fatturaId: f.id }, data: { fatturaId: null } });
    for (const d of ddt) await tx.ddtUscita.update({ where: { id: d.id }, data: { stato: statoDdtDaRighe(d.stato, await tx.rigaDdtUscita.findMany({ where: { ddtId: d.id }, select: { fatturata: true } })) } });
    await tx.fatturaEmessa.delete({ where: { id: f.id } });
  });
  await registraLog("FATTURA_EMESSA", f.id, "ELIMINATA", `${f.numero ?? "bozza"} — ${f.clienteNome}`, u.nome);
  aggiorna("/fatturazione/fatture", "/fatturazione/ddt");
  redirect("/fatturazione/fatture");
}

/** Nota di credito (bozza) che storna una fattura emessa: stesse righe, poi si correggono gli importi. */
export async function creaNotaCredito(fd: FormData) {
  const u = await utente();
  const f = await prisma.fatturaEmessa.findUnique({ where: { id: str(fd, "id") ?? "" }, include: { righe: { orderBy: { posizione: "asc" } } } });
  if (!f || (f.stato !== "EMESSA" && f.stato !== "PROVA")) redirect("/fatturazione/fatture");
  const { id: _id, righe, stato: _s, progressivo: _p, numero: _n, xml: _x, fatturaVenditaId: _fv, emessaDaNome: _e, emessaIl: _ei, createdAt: _c, updatedAt: _u, rate: _r, tipo: _t, cointestatario: _ct, inviataSdiIl: _sdi1, ...resto } = f;
  void _sdi1; void _id; void _s; void _p; void _n; void _x; void _fv; void _e; void _ei; void _c; void _u; void _r; void _t;
  const cointest = _ct === null ? undefined : (_ct as Prisma.InputJsonValue);
  const nc = await prisma.fatturaEmessa.create({
    data: {
      ...resto, cointestatario: cointest, tipo: "NOTA_CREDITO", data: oggi(), anno: oggi().getUTCFullYear(), fatturaCollegataId: f.id, causale: `Storno fattura n. ${f.numero}`, creatoDaNome: u.nome,
      righe: { create: righe.map((r) => ({ posizione: r.posizione, codice: r.codice, descrizione: r.descrizione, quantita: r.quantita, um: r.um, prezzo: r.prezzo, sconto: r.sconto, aliquota: r.aliquota, natura: r.natura })) },
    },
  });
  aggiorna();
  redirect(`/fatturazione/fatture/${nc.id}`);
}

/** Copia una fattura in una nuova bozza (es. per rifare una fattura di prova). */
export async function duplicaFattura(fd: FormData) {
  const u = await utente();
  const f = await prisma.fatturaEmessa.findUnique({ where: { id: str(fd, "id") ?? "" }, include: { righe: { orderBy: { posizione: "asc" } } } });
  if (!f) redirect("/fatturazione/fatture");
  const { id: _id, righe, stato: _s, progressivo: _p, numero: _n, xml: _x, fatturaVenditaId: _fv, emessaDaNome: _e, emessaIl: _ei, createdAt: _c, updatedAt: _u, rate: _r, cointestatario: _ct2, inviataSdiIl: _sdi2, ...resto } = f;
  void _sdi2; void _id; void _s; void _p; void _n; void _x; void _fv; void _e; void _ei; void _c; void _u; void _r;
  const cointest2 = _ct2 === null ? undefined : (_ct2 as Prisma.InputJsonValue);
  const nuova = await prisma.fatturaEmessa.create({
    data: { ...resto, cointestatario: cointest2, data: oggi(), anno: oggi().getUTCFullYear(), creatoDaNome: u.nome, righe: { create: righe.map((r) => ({ posizione: r.posizione, codice: r.codice, descrizione: r.descrizione, quantita: r.quantita, um: r.um, prezzo: r.prezzo, sconto: r.sconto, aliquota: r.aliquota, natura: r.natura })) } },
  });
  aggiorna();
  redirect(`/fatturazione/fatture/${nuova.id}`);
}

// ======================= DDT DI USCITA =======================

/** Nuovo DDT (bozza) a un fornitore: reso o merce data in lavorazione. I dati del fornitore vanno nel riquadro del destinatario. */
export async function creaDdtFornitore(fd: FormData) {
  const u = await utente();
  const f = await prisma.soggetto.findUnique({ where: { id: str(fd, "fornitoreId") ?? "" } });
  if (!f) errore("/fatturazione", "Scegli il fornitore.");
  const causale = CAUSALI_TRASPORTO.includes(str(fd, "causale") ?? "") ? str(fd, "causale")! : "Reso al fornitore";
  const data = giorno(str(fd, "data")) ?? oggi();
  const d = await prisma.ddtUscita.create({
    data: {
      anno: data.getUTCFullYear(), data, fornitoreId: f!.id, clienteNome: f!.ragioneSociale, indirizzo: f!.indirizzo, cap: f!.cap, comune: f!.comune, provincia: f!.provincia,
      partitaIva: f!.partitaIva, codiceFiscale: f!.codiceFiscale, causale, trasportoACura: "MITTENTE", aspettoBeni: "A vista", porto: "Porto franco",
      riferimento: `Fornitore ${f!.ragioneSociale}`, creatoDaNome: u.nome,
    },
  });
  aggiorna();
  redirect(`/fatturazione/ddt/${d.id}`);
}

/** Nuovo DDT (bozza) per un cliente o da una commessa; con la spunta copia le voci dell'offerta. */
export async function creaDdt(fd: FormData) {
  const u = await utente();
  const commessaId = str(fd, "commessaId");
  const comm = commessaId ? await prisma.commessa.findUnique({ where: { id: commessaId }, include: { brand: true, preventivo: { select: { id: true } } } }) : null;
  const clienteId = comm?.clienteId ?? str(fd, "clienteId");
  if (!clienteId) errore("/fatturazione/ddt", "Scegli il cliente (dall'elenco che compare mentre scrivi) o la commessa.");
  const cli = await datiCliente(clienteId!);
  if (!cli) errore("/fatturazione/ddt", "Cliente non trovato.");
  const data = giorno(str(fd, "data")) ?? oggi();
  const righe = comm && fd.get("conRighe") !== "off" ? await righeDaOfferta(comm.preventivo.id) : [];
  const d = await prisma.ddtUscita.create({
    data: {
      anno: data.getUTCFullYear(), data, clienteId: cli!.clienteId, clienteNome: cli!.clienteNome, indirizzo: cli!.indirizzo, cap: cli!.cap, comune: cli!.comune,
      provincia: cli!.provincia, partitaIva: cli!.partitaIva, codiceFiscale: cli!.codiceFiscale, commessaId: comm?.id ?? null, brand: comm?.brand.nome ?? cli!.brand,
      riferimento: comm ? `Commessa ${numeroCommessa(comm)}` : null, causale: CAUSALI_TRASPORTO[0], trasportoACura: "MITTENTE", aspettoBeni: "A vista", porto: "Porto franco",
      creatoDaNome: u.nome, righe: { create: righe.map((r, i) => ({ ...r, posizione: i + 1 })) },
    },
  });
  aggiorna();
  redirect(`/fatturazione/ddt/${d.id}`);
}

async function ddtModificabile(id: string | null) {
  const d = id ? await prisma.ddtUscita.findUnique({ where: { id } }) : null;
  if (!d) redirect("/fatturazione/ddt");
  if (d.fatturaId && d.stato === "FATTURATO") errore(`/fatturazione/ddt/${d.id}`, "Il DDT è già fatturato: non si modifica più.");
  return d;
}

export async function salvaTestataDdt(fd: FormData) {
  await utente();
  const d = await ddtModificabile(str(fd, "id"));
  const data = giorno(str(fd, "data")) ?? d.data;
  await prisma.ddtUscita.update({
    where: { id: d.id },
    data: {
      data, anno: d.numero ? d.anno : data.getUTCFullYear(), causale: str(fd, "causale") ?? d.causale, trasportoACura: str(fd, "trasportoACura") ?? d.trasportoACura,
      vettore: str(fd, "vettore"), aspettoBeni: str(fd, "aspettoBeni"), colli: intero(fd, "colli"), pesoLordo: num(fd, "pesoLordo"), pesoNetto: num(fd, "pesoNetto"),
      volume: num(fd, "volume"), porto: str(fd, "porto"), inizioTrasporto: str(fd, "inizioTrasporto") ? daOraRoma(str(fd, "inizioTrasporto")!) : null,
      destinazione: str(fd, "destinazione"), riferimento: str(fd, "riferimento"), note: str(fd, "note"), noteConsegna: str(fd, "noteConsegna"), noteInterne: str(fd, "noteInterne"),
      clienteNome: str(fd, "clienteNome") ?? d.clienteNome, indirizzo: campo(fd, "indirizzo", d.indirizzo, str), cap: campo(fd, "cap", d.cap, str), comune: campo(fd, "comune", d.comune, str),
      provincia: campo(fd, "provincia", d.provincia, (x, k) => str(x, k)?.toUpperCase() ?? null),
    },
  });
  aggiorna(`/fatturazione/ddt/${d.id}`);
  redirect(`/fatturazione/ddt/${d.id}?salvato=1`);
}

export async function salvaRigheDdt(fd: FormData) {
  await utente();
  const d = await ddtModificabile(str(fd, "id"));
  const righe = await prisma.rigaDdtUscita.findMany({ where: { ddtId: d.id } });
  await prisma.$transaction(async (tx) => {
    for (const r of righe) {
      if (r.fatturata) continue;
      if (fd.get(`del_${r.id}`) === "on") { await tx.rigaDdtUscita.delete({ where: { id: r.id } }); continue; }
      const iva = codiceIva(str(fd, `iva_${r.id}`));
      await tx.rigaDdtUscita.update({
        where: { id: r.id },
        data: {
          codice: str(fd, `codice_${r.id}`), descrizione: str(fd, `descrizione_${r.id}`) ?? r.descrizione, quantita: num(fd, `quantita_${r.id}`) ?? r.quantita,
          um: str(fd, `um_${r.id}`), prezzo: num(fd, `prezzo_${r.id}`) ?? r.prezzo, sconto: num(fd, `sconto_${r.id}`), aliquota: iva.aliquota, natura: iva.natura ?? null,
          posizione: intero(fd, `pos_${r.id}`) ?? r.posizione,
        },
      });
    }
    const descr = str(fd, "nuova_descrizione");
    if (descr) {
      const iva = codiceIva(str(fd, "nuova_iva"));
      await tx.rigaDdtUscita.create({
        data: { ddtId: d.id, posizione: righe.length + 1, codice: str(fd, "nuova_codice"), descrizione: descr, quantita: num(fd, "nuova_quantita") ?? 1, um: str(fd, "nuova_um"), prezzo: num(fd, "nuova_prezzo") ?? 0, sconto: num(fd, "nuova_sconto"), aliquota: iva.aliquota, natura: iva.natura ?? null },
      });
    }
    const tutte = await tx.rigaDdtUscita.findMany({ where: { ddtId: d.id }, select: { fatturata: true } });
    await tx.ddtUscita.update({ where: { id: d.id }, data: { stato: statoDdtDaRighe(d.stato, tutte) } });
  });
  aggiorna(`/fatturazione/ddt/${d.id}`);
  redirect(`/fatturazione/ddt/${d.id}?salvato=1#righe`);
}

/** Conferma il DDT: prende il numero (vero o di prova) e diventa «Da fatturare». */
export async function confermaDdt(fd: FormData) {
  const u = await utente();
  const d = await ddtModificabile(str(fd, "id"));
  if (d.numero) errore(`/fatturazione/ddt/${d.id}`, "Il DDT ha già il numero.");
  const n = await prisma.rigaDdtUscita.count({ where: { ddtId: d.id } });
  if (!n) errore(`/fatturazione/ddt/${d.id}`, "Il DDT non ha righe.");
  const reale = await emissioneReale();
  const e = await prisma.$transaction(async (tx) => {
    const numero = await prossimoNumeroDdt(tx, d.anno, !reale);
    return tx.ddtUscita.update({ where: { id: d.id }, data: { numero, prova: !reale, stato: "DA_FATTURARE", emessoDaNome: u.nome, inizioTrasporto: d.inizioTrasporto } });
  });
  await registraLog("DDT_USCITA", e.id, "CONFERMATO", `${e.prova ? "PROVA " : ""}${e.numero}/${e.anno} — ${e.clienteNome}`, u.nome);
  aggiorna(`/fatturazione/ddt/${d.id}`);
  redirect(`/fatturazione/ddt/${d.id}?confermato=1`);
}

/** Stato a mano: «Chiuso» (non da fatturare: reso, conto visione, omaggio…) o di nuovo da fatturare. */
export async function cambiaStatoDdt(fd: FormData) {
  await utente();
  const d = await prisma.ddtUscita.findUnique({ where: { id: str(fd, "id") ?? "" } });
  if (!d || !d.numero) redirect("/fatturazione/ddt");
  const chiudi = str(fd, "azione") === "chiudi";
  const righe = await prisma.rigaDdtUscita.findMany({ where: { ddtId: d.id }, select: { fatturata: true } });
  await prisma.ddtUscita.update({ where: { id: d.id }, data: { stato: chiudi ? "CHIUSO" : statoDdtDaRighe("DA_FATTURARE", righe) } });
  aggiorna(`/fatturazione/ddt/${d.id}`);
  redirect(`/fatturazione/ddt/${d.id}`);
}

/** Elimina un DDT in bozza o di prova (mai uno vero con il numero, né uno già fatturato). */
export async function eliminaDdt(fd: FormData) {
  const u = await utente();
  const d = await prisma.ddtUscita.findUnique({ where: { id: str(fd, "id") ?? "" }, include: { righe: true } });
  if (!d) redirect("/fatturazione/ddt");
  if (d.numero && !d.prova) errore(`/fatturazione/ddt/${d.id}`, "Un DDT con il numero non si elimina: segnalo come «Chiuso».");
  if (d.righe.some((r) => r.fatturata)) errore(`/fatturazione/ddt/${d.id}`, "Il DDT è già in una fattura.");
  await prisma.ddtUscita.delete({ where: { id: d.id } });
  await registraLog("DDT_USCITA", d.id, "ELIMINATO", `${d.numero ?? "bozza"} — ${d.clienteNome}`, u.nome);
  aggiorna("/fatturazione/ddt");
  redirect("/fatturazione/ddt");
}

/** Fattura differita da uno o più DDT dello stesso cliente (righe non ancora fatturate). */
export async function fatturaDaDdt(fd: FormData) {
  const u = await utente();
  const ids = fd.getAll("ddtId").filter((x): x is string => typeof x === "string" && !!x);
  const ritorno = str(fd, "ritorno") ?? "/fatturazione";
  if (!ids.length) errore(ritorno, "Spunta almeno un DDT.");
  const ddt = await prisma.ddtUscita.findMany({ where: { id: { in: ids } }, include: { righe: { where: { fatturata: false }, orderBy: { posizione: "asc" } } }, orderBy: [{ anno: "asc" }, { numero: "asc" }] });
  if (ddt.some((d) => !d.numero)) errore(ritorno, "C'è un DDT ancora in bozza: confermalo prima.");
  const clienti = new Set(ddt.map((d) => d.clienteId ?? d.clienteNome));
  if (clienti.size > 1) errore(ritorno, "I DDT spuntati sono di clienti diversi: una fattura è per un solo cliente.");
  if (!ddt.some((d) => d.righe.length)) errore(ritorno, "Le righe di questi DDT sono già tutte fatturate.");
  const cli = ddt[0].clienteId ? await datiCliente(ddt[0].clienteId) : null;
  const brand = ddt[0].brand ?? cli?.brand ?? null;
  const sez = SEZIONALI.find((s) => s.brand && brand && s.brand.toLowerCase() === brand.toLowerCase())?.codice ?? "PC";
  const data = oggi();
  const f = await prisma.$transaction(async (tx) => {
    let pos = 0;
    const righe = ddt.flatMap((d) => [
      { posizione: ++pos, descrizione: `Rif. DDT n. ${d.prova ? "PROVA " : ""}${d.numero}/${d.anno} del ${d.data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`, quantita: 1, prezzo: 0, aliquota: d.righe[0]?.aliquota ?? 22, natura: d.righe[0]?.natura ?? null, um: null as string | null, codice: null as string | null, sconto: null as number | null, rigaDdtId: null as string | null },
      ...d.righe.map((r) => ({ posizione: ++pos, descrizione: r.descrizione, quantita: r.quantita, prezzo: r.prezzo, aliquota: r.aliquota, natura: r.natura, um: r.um, codice: r.codice, sconto: r.sconto, rigaDdtId: r.id })),
    ]);
    const f = await tx.fatturaEmessa.create({
      data: {
        tipo: "DIFFERITA", sezionale: sez, anno: data.getUTCFullYear(), data,
        ...(cli ? (({ brand: _b, metodoPagamento: _m, ...a }) => { void _b; void _m; return a; })(cli) : { clienteNome: ddt[0].clienteNome, indirizzo: ddt[0].indirizzo, cap: ddt[0].cap, comune: ddt[0].comune, provincia: ddt[0].provincia, partitaIva: ddt[0].partitaIva, codiceFiscale: ddt[0].codiceFiscale }),
        commessaId: ddt.find((d) => d.commessaId)?.commessaId ?? null, brand, riferimento: ddt.map((d) => d.riferimento).filter(Boolean).join("; ").slice(0, 300) || null,
        metodoPagamento: "BONIFICO_VISTA", banca: BANCA_PREDEFINITA, iban: await ibanDellaBanca(BANCA_PREDEFINITA), creatoDaNome: u.nome, righe: { create: righe },
      },
    });
    await tx.ddtUscita.updateMany({ where: { id: { in: ddt.map((d) => d.id) } }, data: { fatturaId: f.id } });
    await ricalcolaFattura(tx, f.id);
    return f;
  });
  aggiorna("/fatturazione/ddt");
  redirect(`/fatturazione/fatture/${f.id}`);
}

// ======================= IMPOSTAZIONI =======================

/** Numerazione: ultimo numero usato in BConsole per sezionale e DDT; accensione dell'emissione vera (solo amministratore). */
export async function salvaImpostazioniFatturazione(fd: FormData) {
  const u = await utente();
  const anno = intero(fd, "anno") ?? new Date().getFullYear();
  const cambi: string[] = [];
  for (const s of SEZIONALI) {
    const v = intero(fd, `ultimo_${s.codice}`);
    if (v !== null) {
      const nuovo = String(Math.max(0, v));
      const prima = await getConfig(chiaveUltimaFattura(s.codice, anno));
      if (prima !== nuovo) cambi.push(`${s.estensione}/${anno}: ${prima ?? "—"} → ${nuovo}`);
      await setConfig(chiaveUltimaFattura(s.codice, anno), nuovo);
    }
  }
  const ddt = intero(fd, "ultimo_ddt");
  if (ddt !== null) {
    const prima = await getConfig(chiaveUltimoDdt(anno));
    if (prima !== String(Math.max(0, ddt))) cambi.push(`DDT/${anno}: ${prima ?? "—"} → ${Math.max(0, ddt)}`);
    await setConfig(chiaveUltimoDdt(anno), String(Math.max(0, ddt)));
  }
  if (cambi.length) await registraLog("FATTURAZIONE", null, "NUMERAZIONE", `Ultimo numero usato in BConsole: ${cambi.join("; ")}`, u.nome);
  if (u.ruolo === "AMMINISTRATORE") {
    const reale = fd.get("reale") === "on";
    if (reale !== (await emissioneReale())) {
      if (reale) {
        const mancano = await sezionaliSenzaUltimoNumero(anno);
        if (mancano.length) errore("/fatturazione/impostazioni", `Prima di accendere l'emissione vera scrivi l'ultimo numero usato in BConsole per: ${mancano.join(", ")} (scrivi 0 se in questo anno non c'è ancora nessuna fattura). Senza, i numeri potrebbero ripetersi.`);
      }
      await setConfig(CHIAVE_REALE, reale ? "1" : "0");
      await registraLog("FATTURAZIONE", null, reale ? "EMISSIONE_VERA" : "EMISSIONE_PROVA", reale ? "Accesa l'emissione vera di fatture e DDT" : "Tornati alle fatture di prova", u.nome);
    }
  }
  aggiorna("/fatturazione/impostazioni");
  redirect("/fatturazione/impostazioni?salvato=1");
}


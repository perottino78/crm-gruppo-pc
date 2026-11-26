// Fatturazione (ufficio Giorgia): funzioni lato server condivise da azioni e pagine.
import { codiceFiscaleValido, pivaValida, erroreCodiceDestinatario, pecValida } from "./controlli";
import { cointestatarioDa, mancaCointestato, causaleConCointestato } from "./cointestato";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { puo, type ConPermessi } from "@/lib/permessi/catalogo";
import { getConfig } from "@/lib/leadIngest";
import { CEDENTE, codiceIvaDa, ibanUfficiale, metodoPagamento, SEZIONALI, sezionale, tipoFattura } from "./tabelle";
import { cent, numeroFattura, numeroProva, progressivoDa, prossimoNumero, rateDaMetodo, serveBollo, statoDdtDaRighe, totali } from "./calcoli";
import { xmlFatturaPA } from "./xml";
import { aliquotaDa, nonAgganciatiAttribuibili, type AccontoEmesso } from "./acconti";
import { creaScadenzeVendita } from "@/lib/fatture/vendite";
import { residuoScadenza } from "@/lib/amministrazione/server";

type Tx = Prisma.TransactionClient;

export const puoFatturazione = (u: ConPermessi | null | undefined) => puo(u, "fatturazione");

/** Chiavi di Configurazione. */
export const CHIAVE_REALE = "fatturazione_reale";
export const chiaveUltimaFattura = (sez: string, anno: number) => `fatt_ultimo_${sez}_${anno}`;
export const chiaveUltimoDdt = (anno: number) => `ddt_ultimo_${anno}`;

/** Emissione vera (numeri validi, fattura nelle vendite e nello scadenzario) o di prova (numeri «PROVA …»). */
export async function emissioneReale(): Promise<boolean> {
  return (await getConfig(CHIAVE_REALE)) === "1";
}
async function ultimoIndicato(chiave: string): Promise<number | null> {
  const v = Number(await getConfig(chiave));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Sezionali per cui NON è stato indicato l'ultimo numero di BConsole (né sono state importate fatture dell'anno): accendere l'emissione
 * vera così darebbe numeri già usati. Indicare «0» vale come «ancora nessuna fattura in quest'anno».
 */
export async function sezionaliSenzaUltimoNumero(anno: number): Promise<string[]> {
  const mancano: string[] = [];
  for (const s of SEZIONALI) {
    const v = await getConfig(chiaveUltimaFattura(s.codice, anno));
    if (v !== null && v !== undefined && String(v).trim() !== "") continue;
    const importate = await prisma.fatturaVendita.count({ where: { numero: { contains: `/${s.estensione}/${anno}` } } });
    if (importate === 0) mancano.push(`${s.nome} (${s.estensione})`);
  }
  return mancano;
}

/** Prossimo numero della fattura nel sezionale e anno: segue BConsole (fatture importate) e l'ultimo numero indicato in Impostazioni. */
export async function prossimoProgressivoFattura(tx: Tx, sez: string, anno: number, prova: boolean): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fatture-${prova ? "prova" : "vere"}-${sez}-${anno}`}))`;
  const nostre = await tx.fatturaEmessa.findMany({ where: { sezionale: sez, anno, tipo: { not: "PROFORMA" }, stato: prova ? "PROVA" : { in: ["EMESSA", "ANNULLATA", "BOZZA"] }, progressivo: { not: null } }, select: { progressivo: true } });
  const usati = nostre.map((f) => f.progressivo!);
  if (!prova) {
    const est = sezionale(sez).estensione;
    const importate = await tx.fatturaVendita.findMany({ where: { numero: { contains: `/${est}/${anno}` } }, select: { numero: true } });
    for (const f of importate) { const n = progressivoDa(f.numero, sez, anno); if (n) usati.push(n); }
  }
  return prossimoNumero(usati, prova ? null : await ultimoIndicato(chiaveUltimaFattura(sez, anno)));
}

async function prossimaProforma(tx: Tx, anno: number): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`proforma-${anno}`}))`;
  const usati = (await tx.fatturaEmessa.findMany({ where: { anno, tipo: "PROFORMA", progressivo: { not: null } }, select: { progressivo: true } })).map((f) => f.progressivo!);
  return prossimoNumero(usati);
}

/** Prossimo numero del DDT nell'anno (dopo l'ultimo di BConsole indicato in Impostazioni). */
export async function prossimoNumeroDdt(tx: Tx, anno: number, prova: boolean): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ddt-${prova ? "prova" : "veri"}-${anno}`}))`;
  const usati = (await tx.ddtUscita.findMany({ where: { anno, prova, numero: { not: null } }, select: { numero: true } })).map((d) => d.numero!);
  return prossimoNumero(usati, prova ? null : await ultimoIndicato(chiaveUltimoDdt(anno)));
}

/** Copia dei dati fiscali del cliente sulla fattura/DDT. */
export async function datiCliente(clienteId: string) {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, include: { brand: { select: { nome: true } } } });
  if (!c) return null;
  const persona = c.tipoAnagrafica === "PERSONA_FISICA" || (!c.piva && !!c.codiceFiscale && c.codiceFiscale.length === 16);
  return {
    clienteId: c.id, clienteNome: persona && c.cognome && c.nomePersona ? `${c.cognome} ${c.nomePersona}` : c.nome, persona, nomePersona: c.nomePersona, cognome: c.cognome,
    partitaIva: c.piva, codiceFiscale: c.codiceFiscale, indirizzo: c.indirizzo, cap: c.cap, comune: c.comune, provincia: c.provincia,
    nazione: (c.isoNazione || c.paese || "IT").slice(0, 2).toUpperCase(), codiceDestinatario: c.codiceDestinatario, pec: c.pec,
    email: c.emailInvioFatture || c.email, telefono: c.telefono ?? c.cellulare ?? null, brand: c.brand.nome, metodoPagamento: null as string | null,
  };
}

/** Cosa manca per emettere (fiscale: dati del cliente; sempre: righe e importi). */
export function controlliEmissione(f: { tipo: string; clienteNome: string; partitaIva: string | null; codiceFiscale: string | null; indirizzo: string | null; cap: string | null; comune: string | null; nazione: string; persona: boolean; nomePersona: string | null; cognome: string | null; codiceDestinatario?: string | null; pec?: string | null }, righe: { descrizione: string; quantita: number; prezzo: number }[]): string[] {
  const out: string[] = [];
  if (!righe.length) out.push("La fattura non ha righe.");
  if (righe.some((r) => !r.descrizione.trim())) out.push("C'è una riga senza descrizione.");
  if (!tipoFattura(f.tipo).fiscale) return out;
  if (!f.partitaIva && !f.codiceFiscale) out.push("Manca il codice fiscale o la partita IVA del cliente (scheda cliente › Amministrazione).");
  if (f.nazione === "IT" && f.codiceFiscale && !codiceFiscaleValido(f.codiceFiscale)) out.push("Il codice fiscale del cliente non è valido (lo SDI scarterebbe la fattura): controllalo nella scheda cliente.");
  if (f.partitaIva && f.nazione === "IT" && !pivaValida(f.partitaIva)) out.push("La partita IVA del cliente non è valida (11 cifre con cifra di controllo: lo SDI scarterebbe la fattura): controllala nella scheda cliente.");
  const eCd = erroreCodiceDestinatario(f.codiceDestinatario); if (eCd) out.push(eCd);
  if (!pecValida(f.pec)) out.push("La PEC del cliente non sembra un indirizzo valido.");
  if (!f.indirizzo || !f.comune || (f.nazione === "IT" && !/^\d{5}$/.test(f.cap ?? ""))) out.push("Manca l'indirizzo completo del cliente (via, CAP, comune).");
  return out;
}

/** Ricalcola e salva i totali della fattura (e il bollo, se le righe senza IVA lo richiedono). */
export async function ricalcolaFattura(tx: Tx, id: string) {
  const f = await tx.fatturaEmessa.findUniqueOrThrow({ where: { id }, include: { righe: true } });
  const bollo = serveBollo(f.righe);
  const t = totali(f.righe, { bollo, addebitoBollo: bollo && f.addebitoBollo, ritenutaAliquota: f.ritenutaAliquota, ritenutaBase: f.ritenutaBase });
  return tx.fatturaEmessa.update({ where: { id }, data: { imponibile: t.imponibile, iva: t.iva, totale: t.totale, bollo, ritenutaImporto: t.ritenuta } });
}

/** IBAN del conto in Amministrazione › Banche con quel nome di banca (se c'è). */
async function ibanDi(tx: Tx, banca: string | null): Promise<string | null> {
  if (!banca) return null;
  const parola = banca.replace(/^Banca\s+/i, "").split(/\s+/)[0];
  const conti = await tx.contoFinanziario.findMany({ where: { tipo: "BANCA", attivo: true, iban: { not: null } }, select: { nome: true, banca: true, iban: true } });
  // l'IBAN del conto in Amministrazione vince; se manca vale quello ufficiale dell'azienda (tabelle.ts)
  return conti.find((c) => `${c.nome} ${c.banca ?? ""}`.toLowerCase().includes(parola.toLowerCase()))?.iban ?? ibanUfficiale(banca);
}

/** IBAN di una banca dell'azienda (conto in Amministrazione, altrimenti quello ufficiale); serve anche alla creazione della fattura. */
export const ibanDellaBanca = (banca: string | null) => ibanDi(prisma as unknown as Tx, banca);

/**
 * Emissione: assegna il numero (vero o di prova), prepara l'XML e, se vera e fiscale, crea la fattura di vendita con le
 * scadenze di incasso (come le fatture importate da BConsole). Le righe dei DDT collegati diventano fatturate.
 */
export async function emetti(tx: Tx, id: string, nome: string, reale: boolean) {
  const f = await tx.fatturaEmessa.findUniqueOrThrow({ where: { id }, include: { righe: { orderBy: [{ posizione: "asc" }, { id: "asc" }] }, ddt: true } });
  if (f.stato === "EMESSA" || f.stato === "ANNULLATA") throw new Error("La fattura è già emessa.");
  const cointest = cointestatarioDa(f.cointestatario);
  const mancano = [...controlliEmissione(f, f.righe), ...mancaCointestato(cointest).map((m) => `Manca: ${m}.`)];
  if (mancano.length) throw new Error(mancano.join(" "));
  const tf = tipoFattura(f.tipo);
  const anno = f.data.getUTCFullYear();
  // la proforma non è un documento fiscale: numerazione a parte, mai nelle vendite
  const proforma = !tf.fiscale;
  const prova = !reale && !proforma;
  if (prova && f.numero !== null && f.progressivo !== null && !f.numero.startsWith("PROVA")) throw new Error(`La fattura ${f.numero} ha già un numero vero: si riemette solo con l'emissione vera accesa (altrimenti perderebbe il suo numero).`);
  // fattura riaperta per una correzione: mantiene il suo numero (la numerazione fiscale non si tocca)
  const riaperta = !proforma && !prova && f.numero !== null && f.progressivo !== null;
  const progressivo = riaperta ? f.progressivo! : proforma ? await prossimaProforma(tx, anno) : await prossimoProgressivoFattura(tx, f.sezionale, anno, prova);
  const numero = riaperta ? f.numero! : proforma ? `PROFORMA ${progressivo}/${anno}` : prova ? numeroProva(progressivo, f.sezionale, anno) : numeroFattura(progressivo, f.sezionale, anno);
  if (!prova && !proforma && !riaperta) await controllaDataFattura(tx, f.sezionale, anno, f.data, progressivo);
  const bollo = serveBollo(f.righe);
  const t = totali(f.righe, { bollo, addebitoBollo: bollo && f.addebitoBollo, ritenutaAliquota: f.ritenutaAliquota, ritenutaBase: f.ritenutaBase });
  const iban = f.iban ?? (metodoPagamento(f.metodoPagamento).banca ? await ibanDi(tx, f.banca) : null);
  const rate = tf.notaCredito || t.totale <= 0 ? [] : rateDaMetodo(f.metodoPagamento, f.data, t.daPagare);
  const collegata = f.fatturaCollegataId ? await tx.fatturaEmessa.findUnique({ where: { id: f.fatturaCollegataId }, select: { numero: true, data: true } }) : null;
  const xml = tf.fiscale ? xmlFatturaPA({
    progressivoInvio: `${anno}${sezionale(f.sezionale).estensione}${progressivo}`.slice(-10), tipo: f.tipo, numero, data: f.data,
    cliente: { denominazione: f.clienteNome, persona: f.persona, nome: f.nomePersona, cognome: f.cognome, partitaIva: f.partitaIva, codiceFiscale: f.codiceFiscale, nazione: f.nazione, indirizzo: f.indirizzo, cap: f.cap, comune: f.comune, provincia: f.provincia, codiceDestinatario: f.codiceDestinatario, pec: f.pec },
    righe: f.righe, causale: causaleConCointestato(f.causale, cointest), bollo, addebitoBollo: bollo && f.addebitoBollo, ritenutaAliquota: f.ritenutaAliquota, ritenutaBase: f.ritenutaBase,
    pagamento: rate.length ? { metodo: f.metodoPagamento, iban, istituto: f.banca, rate } : null,
    ddt: f.ddt.filter((d) => d.numero).map((d) => ({ numero: `${d.numero}/${d.anno}`, data: d.data })),
    fatturaCollegata: collegata?.numero ? { numero: collegata.numero, data: collegata.data } : null,
    trasporto: tf.trasporto ? { causale: f.causaleTrasporto, colli: f.colli, aspetto: f.aspettoBeni, pesoLordo: f.pesoLordo, pesoNetto: f.pesoNetto, dataInizio: f.inizioTrasporto, porto: f.porto, vettore: f.vettore } : null,
  }) : null;

  let fatturaVenditaId: string | null = null;
  if (!prova && !proforma) {
    const segno = tf.notaCredito ? -1 : 1;
    const fv = await tx.fatturaVendita.create({
      data: {
        chiave: `CRM|${f.id}`, sezionale: sezionale(f.sezionale).estensione, tipoDocumento: tf.td!, numero, data: f.data,
        clienteId: f.clienteId, clienteNome: f.clienteNome, partitaIva: f.partitaIva?.replace(/^IT/i, "") ?? null, codiceFiscale: f.codiceFiscale,
        commessaId: f.commessaId, divisione: "P&C", brand: f.brand ?? sezionale(f.sezionale).brand, imponibile: cent(segno * t.imponibile), iva: cent(segno * t.iva),
        totale: cent(segno * t.totale), detrazione: f.detrazione, causale: causaleConCointestato(f.causale, cointest), origine: "CRM", xml, creatoDaNome: nome, venditore: f.venditore,
        descrizione: f.righe.map((r) => r.descrizione).join(" · ").slice(0, 300),
      },
    });
    if (!tf.notaCredito && t.totale > 0) await creaScadenzeVendita(tx, fv.id);
    if (tf.notaCredito && f.fatturaCollegataId) {
      const orig = await tx.fatturaEmessa.findUnique({ where: { id: f.fatturaCollegataId }, select: { fatturaVenditaId: true } });
      if (orig?.fatturaVenditaId) await riduciIncassiConNota(tx, orig.fatturaVenditaId, t.totale, numero);
    }
    if (t.ritenuta > 0) await tx.scadenza.updateMany({ where: { fatturaVenditaId: fv.id, origine: "FATTURA_VENDITA" }, data: { note: `Ritenuta d'acconto ${f.ritenutaAliquota}% su ${f.ritenutaBase ?? 100}%: ${t.ritenuta.toFixed(2).replace(".", ",")} € trattenuti dal cliente. Da incassare ${t.daPagare.toFixed(2).replace(".", ",")} €.` } });
    fatturaVenditaId = fv.id;
  }
  // DDT: righe fatturate e stato
  const righeDdt = f.righe.map((r) => r.rigaDdtId).filter(Boolean) as string[];
  if (righeDdt.length) await tx.rigaDdtUscita.updateMany({ where: { id: { in: righeDdt } }, data: { fatturata: true } });
  for (const d of f.ddt) {
    const righe = await tx.rigaDdtUscita.findMany({ where: { ddtId: d.id }, select: { fatturata: true } });
    await tx.ddtUscita.update({ where: { id: d.id }, data: { stato: statoDdtDaRighe(d.stato, righe) } });
  }
  return tx.fatturaEmessa.update({
    where: { id },
    data: {
      stato: prova ? "PROVA" : "EMESSA", progressivo, anno, numero, xml, iban, rate: rate.map((r) => ({ data: r.data.toISOString(), importo: r.importo })),
      imponibile: t.imponibile, iva: t.iva, totale: t.totale, bollo, ritenutaImporto: t.ritenuta, fatturaVenditaId, emessaDaNome: nome, emessaIl: new Date(),
    },
  });
}

/**
 * La data deve seguire la numerazione: non nel futuro e non prima della fattura precedente dello stesso sezionale e anno
 * (la numerazione è progressiva e le date non possono tornare indietro).
 */
async function controllaDataFattura(tx: Tx, sez: string, anno: number, data: Date, progressivo: number) {
  const giornoRoma = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  if (giornoRoma(data) > giornoRoma(new Date())) throw new Error("La data della fattura è nel futuro: usa la data di oggi.");
  const prima = await tx.fatturaEmessa.findFirst({ where: { sezionale: sez, anno, stato: "EMESSA", tipo: { not: "PROFORMA" }, progressivo: { lt: progressivo } }, orderBy: { progressivo: "desc" }, select: { numero: true, data: true } });
  if (prima && giornoRoma(data) < giornoRoma(prima.data)) throw new Error(`La data è precedente a quella della fattura n. ${prima.numero} (${prima.data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}): i numeri devono seguire le date. Metti una data uguale o successiva.`);
}

/**
 * Una nota di credito abbassa ciò che il cliente deve ancora pagare sulla fattura stornata: toglie dalle ultime rate ancora da incassare
 * (mai sotto quanto già pagato). Se il cliente ha già pagato più del dovuto resta un credito da restituire (lo dice la nota della rata).
 */
export async function riduciIncassiConNota(tx: Tx, fatturaVenditaId: string, importoNota: number, numeroNota: string) {
  let resto = cent(Math.abs(importoNota));
  const scad = await tx.scadenza.findMany({ where: { fatturaVenditaId, tipo: "INCASSO", stato: { in: ["APERTA", "PARZIALE"] } }, include: { abbinamenti: { select: { importo: true } } }, orderBy: { dataScadenza: "desc" } });
  for (const s of scad) {
    if (resto <= 0) break;
    const residuo = residuoScadenza(s);
    if (residuo <= 0) continue;
    const togli = Math.min(residuo, resto);
    const nuovoImporto = cent(s.importo - togli);
    const nota = `${s.note ? s.note + "\n" : ""}Ridotta di ${togli.toFixed(2).replace(".", ",")} € dalla nota di credito ${numeroNota}.`;
    const pagato = cent(s.importo - residuo);
    if (pagato <= 0 && nuovoImporto <= 0) await tx.scadenza.update({ where: { id: s.id }, data: { stato: "ANNULLATA", note: nota } });
    else await tx.scadenza.update({ where: { id: s.id }, data: { importo: nuovoImporto, stato: cent(nuovoImporto - pagato) <= 0 ? "PAGATA" : s.stato, note: nota } });
    resto = cent(resto - togli);
  }
  if (resto > 0) {
    const ultima = await tx.scadenza.findFirst({ where: { fatturaVenditaId, tipo: "INCASSO" }, orderBy: { dataScadenza: "desc" } });
    if (ultima) await tx.scadenza.update({ where: { id: ultima.id }, data: { note: `${ultima.note ? ultima.note + "\n" : ""}La nota di credito ${numeroNota} supera quanto ancora da incassare: ${resto.toFixed(2).replace(".", ",")} € sono un credito del cliente (da restituire o compensare).` } });
  }
}

/** Righe proposte dall'offerta della commessa (descrizione dei prodotti con il loro importo IVA esclusa). */
export async function righeDaOfferta(preventivoId: string) {
  const p = await prisma.preventivo.findUnique({
    where: { id: preventivoId },
    include: { righe: { orderBy: [{ ordine: "asc" }, { id: "asc" }], include: { prodotto: true, optionali: { include: { optional: true } } } } },
  });
  if (!p) return [];
  const aliquota = p.aliquotaIva ?? 22;
  // sconto dell'offerta spalmato sulle righe (totaleNetto = imponibile già scontato)
  const lordo = p.righe.reduce((t, r) => t + r.quantita * r.prezzoUnitario + r.optionalPrezzo + r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0), 0);
  const fattore = lordo > 0 && p.totaleNetto > 0 ? p.totaleNetto / lordo : 1;
  // misure definitive di produzione (ordine al fornitore): in fattura devono coincidere con quelle delle certificazioni del fornitore
  const definitive = new Map((await prisma.rigaOrdine.findMany({ where: { rigaPreventivoId: { in: p.righe.map((r) => r.id) }, misureDefinitive: { not: null } }, select: { rigaPreventivoId: true, misureDefinitive: true } })).map((x) => [x.rigaPreventivoId!, x.misureDefinitive!]));
  return p.righe.map((r) => {
    const opt = r.optionali.map((o) => o.optional.nome).join(", ");
    const nomeProd = r.testoLibero ?? (r.prodotto ? `${r.prodotto.tipologia.replace(/_/g, " ")} ${r.prodotto.colore}`.trim() : "Voce");
    const misura = definitive.has(r.id) ? ` ${definitive.get(r.id)}` : r.misuraLarghezza ? ` ${r.misuraLarghezza}${r.misuraAltezza ? `×${r.misuraAltezza}` : ""}` : "";
    const unit = r.quantita ? (r.prezzoUnitario + (r.optionalPrezzo + r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0)) / r.quantita) * fattore : 0;
    return {
      descrizione: `${r.descrizionePersonalizzata && !r.testoLibero ? r.descrizionePersonalizzata.split("\n")[0].slice(0, 200) : nomeProd}${misura}${opt ? ` — con ${opt}` : ""}`.slice(0, 900),
      quantita: r.quantita, um: "pz", prezzo: r.quantita > 0 ? Math.round((cent(unit * r.quantita) / r.quantita) * 1e8) / 1e8 : cent(unit), aliquota: r.aliquotaIva ?? aliquota, natura: null as string | null,
    };
  }).filter((r) => r.prezzo !== 0 || r.descrizione);
}

export { codiceIvaDa, CEDENTE };

/** Dati per il PDF della fattura (anche della bozza: si vede come verrà). */
export async function datiPdfFattura(id: string) {
  const f = await prisma.fatturaEmessa.findUnique({ where: { id }, include: { righe: { orderBy: [{ posizione: "asc" }, { id: "asc" }] }, ddt: true } });
  if (!f) return null;
  const { righeCliente } = await import("./pdf");
  const collegata = f.fatturaCollegataId ? await prisma.fatturaEmessa.findUnique({ where: { id: f.fatturaCollegataId }, select: { numero: true, data: true } }) : null;
  const rate = Array.isArray(f.rate) ? (f.rate as { data: string; importo: number }[]).map((r) => ({ data: new Date(r.data), importo: r.importo })) : [];
  const bollo = serveBollo(f.righe);
  return {
    fattura: f,
    dati: {
      tipo: f.tipo, numero: f.numero ?? "BOZZA", data: f.data, stato: f.stato, cliente: { nome: f.clienteNome, righe: righeCliente(f) }, righe: f.righe,
      causale: causaleConCointestato(f.causale, cointestatarioDa(f.cointestatario)), riferimento: f.riferimento, note: f.note, metodoPagamento: f.metodoPagamento, banca: f.banca, iban: f.iban ?? (f.banca && metodoPagamento(f.metodoPagamento).banca ? await ibanDellaBanca(f.banca) : null), rate,
      bollo, addebitoBollo: f.addebitoBollo, ritenutaAliquota: f.ritenutaAliquota, ritenutaBase: f.ritenutaBase, ddt: f.ddt.filter((d) => d.numero).map((d) => `${d.prova ? "PROVA " : ""}${d.numero}/${d.anno} del ${d.data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`),
      fatturaCollegata: collegata?.numero ? `${collegata.numero} del ${collegata.data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : null, destinazione: f.destinazione,
      trasporto: { causale: f.causaleTrasporto, aCura: ({ MITTENTE: "Mittente", DESTINATARIO: "Destinatario", VETTORE: "Vettore" } as Record<string, string>)[f.trasportoACura ?? ""] ?? f.trasportoACura, vettore: f.vettore, aspetto: f.aspettoBeni, colli: f.colli, peso: f.pesoLordo, porto: f.porto, inizio: f.inizioTrasporto },
    },
  };
}

/** Dati per il PDF del DDT. */
export async function datiPdfDdt(id: string) {
  const d = await prisma.ddtUscita.findUnique({ where: { id }, include: { righe: { orderBy: [{ posizione: "asc" }, { id: "asc" }] } } });
  if (!d) return null;
  const { righeCliente } = await import("./pdf");
  const aCura = { MITTENTE: "Mittente", DESTINATARIO: "Destinatario", VETTORE: "Vettore" }[d.trasportoACura] ?? d.trasportoACura;
  return {
    ddt: d,
    dati: {
      numero: d.numero ? `${d.numero}/${d.anno}` : "BOZZA", data: d.data, prova: d.prova, cliente: { nome: d.clienteNome, righe: righeCliente(d) }, destinazione: d.destinazione,
      righe: d.righe, riferimento: d.riferimento, note: d.note, noteConsegna: d.noteConsegna, causale: d.causale, aCura, vettore: d.vettore, aspetto: d.aspettoBeni,
      colli: d.colli, pesoLordo: d.pesoLordo, pesoNetto: d.pesoNetto, volume: d.volume, porto: d.porto, inizio: d.inizioTrasporto,
    },
  };
}


/** Una fattura emessa si può riaprire per correggerla se non è stata inviata allo SDI e il cliente non ha pagato nulla. Ritorna il motivo del no, o null. */
export async function motivoNoRiapertura(f: { id: string; stato: string; tipo: string; inviataSdiIl: Date | null; fatturaVenditaId: string | null }): Promise<string | null> {
  if (f.stato !== "EMESSA") return "Solo le fatture emesse si riaprono.";
  if (!tipoFattura(f.tipo).fiscale) return "Documento non fiscale.";
  if (f.inviataSdiIl) return "È già stata inviata allo SDI: si corregge con una nota di credito.";
  if (!f.fatturaVenditaId) return null;
  const scad = await prisma.scadenza.findMany({ where: { fatturaVenditaId: f.fatturaVenditaId }, include: { abbinamenti: { select: { id: true } } } });
  if (scad.some((s) => s.abbinamenti.length > 0 || s.pagatoManuale > 0 || s.ritenuta > 0 || s.pagataIl)) return "Ci sono già incassi registrati su questa fattura: si corregge con una nota di credito.";
  return null;
}


/**
 * Acconti già fatturati per una commessa, da dedurre nel saldo: quelli emessi dal CRM (EMESSA, non di prova) e le fatture di acconto
 * importate da BConsole (TD02) agganciate alla commessa o, se il cliente ha UNA sola commessa aperta, non agganciate a nessuna.
 * Lo stesso numero non compare due volte (si confronta il numero: le fatture del CRM sono anche in FatturaVendita).
 */
export async function accontiEmessiDellaCommessa(commessaId: string, clienteId: string | null, aliquotaDefault: number): Promise<AccontoEmesso[]> {
  const crm = await prisma.fatturaEmessa.findMany({ where: { commessaId, tipo: "ACCONTO", stato: "EMESSA", numero: { not: null } }, select: { numero: true, data: true, imponibile: true, righe: { select: { aliquota: true }, take: 1 } } });
  const bc = await prisma.fatturaVendita.findMany({ where: { commessaId, tipoDocumento: "TD02" }, select: { numero: true, data: true, imponibile: true, iva: true } });
  if (clienteId) {
    const aperte = await prisma.commessa.findMany({ where: { clienteId, stato: { notIn: ["ANNULLATA", "CHIUSA"] } }, select: { id: true } });
    if (nonAgganciatiAttribuibili(aperte.map((c) => c.id), commessaId)) {
      bc.push(...(await prisma.fatturaVendita.findMany({ where: { clienteId, commessaId: null, tipoDocumento: "TD02" }, select: { numero: true, data: true, imponibile: true, iva: true } })));
    }
  }
  return [
    ...crm.map((x) => ({ numero: x.numero!, data: x.data, imponibile: x.imponibile, aliquota: x.righe[0]?.aliquota ?? aliquotaDefault, fonte: "CRM" as const })),
    ...bc.map((x) => ({ numero: x.numero, data: x.data, imponibile: x.imponibile, aliquota: aliquotaDa(x.imponibile, x.iva, aliquotaDefault), fonte: "BCONSOLE" as const })),
  ];
}

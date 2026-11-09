// Fatturazione (ufficio Giorgia): funzioni lato server condivise da azioni e pagine.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { puo, type ConPermessi } from "@/lib/permessi/catalogo";
import { getConfig } from "@/lib/leadIngest";
import { CEDENTE, codiceIvaDa, metodoPagamento, sezionale, tipoFattura } from "./tabelle";
import { cent, numeroFattura, numeroProva, progressivoDa, prossimoNumero, rateDaMetodo, serveBollo, statoDdtDaRighe, totali } from "./calcoli";
import { xmlFatturaPA } from "./xml";
import { creaScadenzeVendita } from "@/lib/fatture/vendite";

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

/** Prossimo numero della fattura nel sezionale e anno: segue BConsole (fatture importate) e l'ultimo numero indicato in Impostazioni. */
export async function prossimoProgressivoFattura(tx: Tx, sez: string, anno: number, prova: boolean): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fatture-${prova ? "prova" : "vere"}-${sez}-${anno}`}))`;
  const nostre = await tx.fatturaEmessa.findMany({ where: { sezionale: sez, anno, tipo: { not: "PROFORMA" }, stato: prova ? "PROVA" : { in: ["EMESSA", "ANNULLATA"] }, progressivo: { not: null } }, select: { progressivo: true } });
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
    clienteId: c.id, clienteNome: c.nome, persona, nomePersona: c.nomePersona, cognome: c.cognome,
    partitaIva: c.piva, codiceFiscale: c.codiceFiscale, indirizzo: c.indirizzo, cap: c.cap, comune: c.comune, provincia: c.provincia,
    nazione: (c.isoNazione || c.paese || "IT").slice(0, 2).toUpperCase(), codiceDestinatario: c.codiceDestinatario, pec: c.pec,
    email: c.emailInvioFatture || c.email, brand: c.brand.nome, metodoPagamento: null as string | null,
  };
}

/** Cosa manca per emettere (fiscale: dati del cliente; sempre: righe e importi). */
export function controlliEmissione(f: { tipo: string; clienteNome: string; partitaIva: string | null; codiceFiscale: string | null; indirizzo: string | null; cap: string | null; comune: string | null; nazione: string; persona: boolean; nomePersona: string | null; cognome: string | null }, righe: { descrizione: string; quantita: number; prezzo: number }[]): string[] {
  const out: string[] = [];
  if (!righe.length) out.push("La fattura non ha righe.");
  if (righe.some((r) => !r.descrizione.trim())) out.push("C'è una riga senza descrizione.");
  if (!tipoFattura(f.tipo).fiscale) return out;
  if (!f.partitaIva && !f.codiceFiscale) out.push("Manca il codice fiscale o la partita IVA del cliente (scheda cliente › Amministrazione).");
  if (f.codiceFiscale && !/^([A-Z0-9]{16}|\d{11})$/i.test(f.codiceFiscale.trim())) out.push("Il codice fiscale del cliente non sembra valido.");
  if (f.partitaIva && f.nazione === "IT" && !/^(IT)?\d{11}$/i.test(f.partitaIva.replace(/\s/g, ""))) out.push("La partita IVA del cliente non sembra valida (11 cifre).");
  if (!f.indirizzo || !f.comune || (f.nazione === "IT" && !/^\d{5}$/.test(f.cap ?? ""))) out.push("Manca l'indirizzo completo del cliente (via, CAP, comune).");
  return out;
}

/** Ricalcola e salva i totali della fattura (e il bollo, se le righe senza IVA lo richiedono). */
export async function ricalcolaFattura(tx: Tx, id: string) {
  const f = await tx.fatturaEmessa.findUniqueOrThrow({ where: { id }, include: { righe: true } });
  const bollo = serveBollo(f.righe);
  const t = totali(f.righe, { bollo, addebitoBollo: bollo && f.addebitoBollo });
  return tx.fatturaEmessa.update({ where: { id }, data: { imponibile: t.imponibile, iva: t.iva, totale: t.totale, bollo } });
}

/** IBAN del conto in Amministrazione › Banche con quel nome di banca (se c'è). */
async function ibanDi(tx: Tx, banca: string | null): Promise<string | null> {
  if (!banca) return null;
  const parola = banca.replace(/^Banca\s+/i, "").split(/\s+/)[0];
  const conti = await tx.contoFinanziario.findMany({ where: { tipo: "BANCA", attivo: true, iban: { not: null } }, select: { nome: true, banca: true, iban: true } });
  return conti.find((c) => `${c.nome} ${c.banca ?? ""}`.toLowerCase().includes(parola.toLowerCase()))?.iban ?? null;
}

/**
 * Emissione: assegna il numero (vero o di prova), prepara l'XML e, se vera e fiscale, crea la fattura di vendita con le
 * scadenze di incasso (come le fatture importate da BConsole). Le righe dei DDT collegati diventano fatturate.
 */
export async function emetti(tx: Tx, id: string, nome: string, reale: boolean) {
  const f = await tx.fatturaEmessa.findUniqueOrThrow({ where: { id }, include: { righe: { orderBy: [{ posizione: "asc" }, { id: "asc" }] }, ddt: true } });
  if (f.stato === "EMESSA" || f.stato === "ANNULLATA") throw new Error("La fattura è già emessa.");
  const mancano = controlliEmissione(f, f.righe);
  if (mancano.length) throw new Error(mancano.join(" "));
  const tf = tipoFattura(f.tipo);
  const anno = f.data.getUTCFullYear();
  // la proforma non è un documento fiscale: numerazione a parte, mai nelle vendite
  const proforma = !tf.fiscale;
  const prova = !reale && !proforma;
  const progressivo = proforma ? await prossimaProforma(tx, anno) : await prossimoProgressivoFattura(tx, f.sezionale, anno, prova);
  const numero = proforma ? `PROFORMA ${progressivo}/${anno}` : prova ? numeroProva(progressivo, f.sezionale, anno) : numeroFattura(progressivo, f.sezionale, anno);
  const bollo = serveBollo(f.righe);
  const t = totali(f.righe, { bollo, addebitoBollo: bollo && f.addebitoBollo });
  const iban = f.iban ?? (metodoPagamento(f.metodoPagamento).banca ? await ibanDi(tx, f.banca) : null);
  const rate = tf.notaCredito || t.totale <= 0 ? [] : rateDaMetodo(f.metodoPagamento, f.data, t.totale);
  const collegata = f.fatturaCollegataId ? await tx.fatturaEmessa.findUnique({ where: { id: f.fatturaCollegataId }, select: { numero: true, data: true } }) : null;
  const xml = tf.fiscale ? xmlFatturaPA({
    progressivoInvio: `${sezionale(f.sezionale).estensione}${progressivo}`.slice(-10), tipo: f.tipo, numero, data: f.data,
    cliente: { denominazione: f.clienteNome, persona: f.persona, nome: f.nomePersona, cognome: f.cognome, partitaIva: f.partitaIva, codiceFiscale: f.codiceFiscale, nazione: f.nazione, indirizzo: f.indirizzo, cap: f.cap, comune: f.comune, provincia: f.provincia, codiceDestinatario: f.codiceDestinatario, pec: f.pec },
    righe: f.righe, causale: f.causale, bollo, addebitoBollo: bollo && f.addebitoBollo,
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
        totale: cent(segno * t.totale), detrazione: f.detrazione, causale: f.causale, origine: "CRM", xml, creatoDaNome: nome, venditore: f.venditore,
        descrizione: f.righe.map((r) => r.descrizione).join(" · ").slice(0, 300),
      },
    });
    if (!tf.notaCredito && t.totale > 0) await creaScadenzeVendita(tx, fv.id);
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
      imponibile: t.imponibile, iva: t.iva, totale: t.totale, bollo, fatturaVenditaId, emessaDaNome: nome, emessaIl: new Date(),
    },
  });
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
  return p.righe.map((r) => {
    const opt = r.optionali.map((o) => o.optional.nome).join(", ");
    const nomeProd = r.testoLibero ?? (r.prodotto ? `${r.prodotto.tipologia.replace(/_/g, " ")} ${r.prodotto.colore}`.trim() : "Voce");
    const misura = r.misuraLarghezza ? ` ${r.misuraLarghezza}${r.misuraAltezza ? `×${r.misuraAltezza}` : ""}` : "";
    const unit = r.quantita ? (r.prezzoUnitario + (r.optionalPrezzo + r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0)) / r.quantita) * fattore : 0;
    return {
      descrizione: `${r.descrizionePersonalizzata && !r.testoLibero ? r.descrizionePersonalizzata.split("\n")[0].slice(0, 200) : nomeProd}${misura}${opt ? ` — con ${opt}` : ""}`.slice(0, 900),
      quantita: r.quantita, um: "pz", prezzo: cent(unit), aliquota, natura: null as string | null,
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
      causale: f.causale, riferimento: f.riferimento, note: f.note, metodoPagamento: f.metodoPagamento, banca: f.banca, iban: f.iban, rate,
      bollo, addebitoBollo: f.addebitoBollo, ddt: f.ddt.filter((d) => d.numero).map((d) => `${d.prova ? "PROVA " : ""}${d.numero}/${d.anno} del ${d.data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`),
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

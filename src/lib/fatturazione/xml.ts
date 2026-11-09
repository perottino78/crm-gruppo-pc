// File XML FatturaPA (formato FPR12, privati) della fattura emessa dal CRM, da caricare a mano sul portale/intermediario
// finché lo SDI non è collegato. Modulo puro, testato rileggendo l'XML con leggiFatturaPA.
import { CEDENTE, metodoPagamento, tipoFattura } from "./tabelle";
import { cent, importoRiga, totali, type RigaCalcolo } from "./calcoli";

export type DatiXml = {
  progressivoInvio: string; // max 10 caratteri alfanumerici
  tipo: string; // codice di TIPI_FATTURA
  numero: string;
  data: Date;
  cliente: {
    denominazione: string; nome?: string | null; cognome?: string | null; persona: boolean;
    partitaIva?: string | null; codiceFiscale?: string | null; nazione?: string | null;
    indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null;
    codiceDestinatario?: string | null; pec?: string | null;
  };
  righe: (RigaCalcolo & { descrizione: string; codice?: string | null; um?: string | null })[];
  causale?: string | null;
  bollo?: boolean; addebitoBollo?: boolean;
  pagamento?: { metodo: string | null; iban?: string | null; istituto?: string | null; rate: { data: Date; importo: number }[] } | null;
  ddt?: { numero: string; data: Date }[];
  fatturaCollegata?: { numero: string; data: Date } | null; // nota di credito → fattura stornata
  trasporto?: { vettore?: string | null; causale?: string | null; colli?: number | null; aspetto?: string | null; pesoLordo?: number | null; pesoNetto?: number | null; dataInizio?: Date | null; porto?: string | null } | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
/** Solo caratteri accettati dallo SDI (Latin-1 di base), testo ripulito e tagliato. */
const t = (s: string | null | undefined, max: number) => esc(String(s ?? "").normalize("NFC").replace(/[€]/g, "EUR").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, " ").replace(/\s+/g, " ").trim().slice(0, max));
const d10 = (d: Date) => d.toISOString().slice(0, 10);
const n2 = (n: number) => cent(n).toFixed(2);
/** Prezzi unitari fino a 8 decimali, senza zeri inutili oltre i 2. */
const nPrezzo = (n: number) => { const s = (Math.round(n * 1e8) / 1e8).toFixed(8).replace(/0+$/, ""); const [i, dec = ""] = s.split("."); return `${i}.${dec.padEnd(2, "0")}`; };
const tag = (nome: string, valore: string | null | undefined) => (valore === null || valore === undefined || valore === "" ? "" : `<${nome}>${valore}</${nome}>`);
const piva = (p: string | null | undefined) => (p ? p.replace(/\s/g, "").replace(/^IT/i, "") : "");

/** Spezza un testo lungo in più <Causale> da 200 caratteri. */
const causali = (s: string | null | undefined) => {
  const testo = String(s ?? "").trim();
  const out: string[] = [];
  for (let i = 0; i < testo.length && out.length < 10; i += 200) out.push(`<Causale>${t(testo.slice(i, i + 200), 200)}</Causale>`);
  return out.join("");
};

export function xmlFatturaPA(d: DatiXml): string {
  const tf = tipoFattura(d.tipo);
  if (!tf.td) throw new Error("La fattura proforma non è un documento fiscale: niente XML.");
  const tot = totali(d.righe, { bollo: d.bollo, addebitoBollo: d.addebitoBollo });
  const c = d.cliente;
  const naz = (c.nazione || "IT").toUpperCase().slice(0, 2);
  const codDest = naz !== "IT" ? "XXXXXXX" : (c.codiceDestinatario || "0000000").toUpperCase().slice(0, 7).padEnd(7, "0");
  const pivaCli = piva(c.partitaIva);
  const anagraficaCli = !c.persona || !(c.nome && c.cognome)
    ? `<Anagrafica><Denominazione>${t(c.denominazione, 80)}</Denominazione></Anagrafica>`
    : `<Anagrafica><Nome>${t(c.nome, 60)}</Nome><Cognome>${t(c.cognome, 60)}</Cognome></Anagrafica>`;
  const header =
    `<FatturaElettronicaHeader>` +
    `<DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${CEDENTE.codiceFiscale}</IdCodice></IdTrasmittente>` +
    `<ProgressivoInvio>${t(d.progressivoInvio, 10).replace(/[^A-Za-z0-9]/g, "") || "1"}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione>` +
    `<CodiceDestinatario>${codDest}</CodiceDestinatario>` +
    (codDest === "0000000" && c.pec ? `<PECDestinatario>${t(c.pec, 256)}</PECDestinatario>` : "") +
    `</DatiTrasmissione>` +
    `<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${CEDENTE.partitaIva}</IdCodice></IdFiscaleIVA>` +
    `<CodiceFiscale>${CEDENTE.codiceFiscale}</CodiceFiscale><Anagrafica><Denominazione>${t(CEDENTE.denominazione, 80)}</Denominazione></Anagrafica>` +
    `<RegimeFiscale>${CEDENTE.regimeFiscale}</RegimeFiscale></DatiAnagrafici>` +
    `<Sede><Indirizzo>${t(CEDENTE.indirizzo, 60)}</Indirizzo><NumeroCivico>${CEDENTE.numeroCivico}</NumeroCivico><CAP>${CEDENTE.cap}</CAP>` +
    `<Comune>${t(CEDENTE.comune, 60)}</Comune><Provincia>${CEDENTE.provincia}</Provincia><Nazione>IT</Nazione></Sede>` +
    `<Contatti><Telefono>${CEDENTE.telefono}</Telefono><Email>${CEDENTE.email}</Email></Contatti></CedentePrestatore>` +
    `<CessionarioCommittente><DatiAnagrafici>` +
    (pivaCli ? `<IdFiscaleIVA><IdPaese>${naz}</IdPaese><IdCodice>${t(pivaCli, 28)}</IdCodice></IdFiscaleIVA>` : "") +
    (c.codiceFiscale ? `<CodiceFiscale>${t(c.codiceFiscale.toUpperCase(), 16)}</CodiceFiscale>` : "") +
    anagraficaCli + `</DatiAnagrafici>` +
    `<Sede><Indirizzo>${t(c.indirizzo || "-", 60)}</Indirizzo><CAP>${naz === "IT" ? (c.cap || "00000").replace(/\D/g, "").padStart(5, "0").slice(0, 5) : "00000"}</CAP>` +
    `<Comune>${t(c.comune || "-", 60)}</Comune>` + (naz === "IT" && c.provincia && /^[A-Za-z]{2}$/.test(c.provincia) ? `<Provincia>${c.provincia.toUpperCase()}</Provincia>` : "") +
    `<Nazione>${naz}</Nazione></Sede></CessionarioCommittente>` +
    `</FatturaElettronicaHeader>`;

  const generali =
    `<DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${tf.td}</TipoDocumento><Divisa>EUR</Divisa><Data>${d10(d.data)}</Data>` +
    `<Numero>${t(d.numero, 20)}</Numero>` +
    (d.bollo ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${n2(tot.bollo)}</ImportoBollo></DatiBollo>` : "") +
    `<ImportoTotaleDocumento>${n2(tot.totale)}</ImportoTotaleDocumento>` + causali(d.causale) + `</DatiGeneraliDocumento>` +
    (d.fatturaCollegata ? `<DatiFattureCollegate><IdDocumento>${t(d.fatturaCollegata.numero, 20)}</IdDocumento><Data>${d10(d.fatturaCollegata.data)}</Data></DatiFattureCollegate>` : "") +
    (d.ddt ?? []).map((x) => `<DatiDDT><NumeroDDT>${t(x.numero, 20)}</NumeroDDT><DataDDT>${d10(x.data)}</DataDDT></DatiDDT>`).join("") +
    (tf.trasporto && d.trasporto ? datiTrasporto(d.trasporto) : "") +
    `</DatiGenerali>`;

  const linee = d.righe.map((r, i) =>
    `<DettaglioLinee><NumeroLinea>${i + 1}</NumeroLinea>` +
    (r.codice ? `<CodiceArticolo><CodiceTipo>INTERNO</CodiceTipo><CodiceValore>${t(r.codice, 35)}</CodiceValore></CodiceArticolo>` : "") +
    `<Descrizione>${t(r.descrizione || "-", 1000)}</Descrizione>` +
    `<Quantita>${nPrezzo(r.quantita)}</Quantita>` + (r.um ? `<UnitaMisura>${t(r.um, 10)}</UnitaMisura>` : "") +
    `<PrezzoUnitario>${nPrezzo(r.prezzo)}</PrezzoUnitario>` +
    (r.sconto ? `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${n2(r.sconto)}</Percentuale></ScontoMaggiorazione>` : "") +
    `<PrezzoTotale>${n2(importoRiga(r))}</PrezzoTotale><AliquotaIVA>${n2(r.natura ? 0 : r.aliquota)}</AliquotaIVA>` +
    (r.natura ? `<Natura>${r.natura}</Natura>` : "") + `</DettaglioLinee>`).join("");
  const riepilogo = tot.riepilogo.map((v) =>
    `<DatiRiepilogo><AliquotaIVA>${n2(v.natura ? 0 : v.aliquota)}</AliquotaIVA>` + (v.natura ? `<Natura>${v.natura}</Natura>` : "") +
    `<ImponibileImporto>${n2(v.imponibile)}</ImponibileImporto><Imposta>${n2(v.imposta)}</Imposta>` +
    (v.natura ? "" : `<EsigibilitaIVA>I</EsigibilitaIVA>`) +
    (v.natura && v.norma ? `<RiferimentoNormativo>${t(v.norma, 100)}</RiferimentoNormativo>` : "") + `</DatiRiepilogo>`).join("");

  let pagamento = "";
  if (d.pagamento && d.pagamento.rate.length && tot.totale > 0) {
    const m = metodoPagamento(d.pagamento.metodo);
    const rate = d.pagamento.rate;
    pagamento = `<DatiPagamento><CondizioniPagamento>${rate.length > 1 ? "TP01" : "TP02"}</CondizioniPagamento>` +
      rate.map((r) => `<DettaglioPagamento><ModalitaPagamento>${m.mp}</ModalitaPagamento><DataScadenzaPagamento>${d10(r.data)}</DataScadenzaPagamento>` +
        `<ImportoPagamento>${n2(r.importo)}</ImportoPagamento>` +
        (d.pagamento!.istituto && m.banca ? `<IstitutoFinanziario>${t(d.pagamento!.istituto, 80)}</IstitutoFinanziario>` : "") +
        (d.pagamento!.iban && m.banca ? `<IBAN>${d.pagamento!.iban.replace(/\s/g, "").toUpperCase()}</IBAN>` : "") + `</DettaglioPagamento>`).join("") +
      `</DatiPagamento>`;
  }
  const body = `<FatturaElettronicaBody>${generali}<DatiBeniServizi>${linee}${riepilogo}</DatiBeniServizi>${pagamento}</FatturaElettronicaBody>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ` +
    `xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">` +
    header + body + `</p:FatturaElettronica>\n`;
}

function datiTrasporto(tr: NonNullable<DatiXml["trasporto"]>): string {
  // Il vettore non si indica nei dati anagrafici (servirebbe la sua partita IVA): va nella descrizione.
  const descr = [tr.aspetto, tr.vettore ? `Vettore: ${tr.vettore}` : null, tr.porto].filter(Boolean).join(" - ");
  return `<DatiTrasporto>` +
    tag("CausaleTrasporto", tr.causale ? t(tr.causale, 100) : null) + tag("NumeroColli", tr.colli ? String(Math.round(tr.colli)) : null) +
    tag("Descrizione", descr ? t(descr, 100) : null) +
    (tr.pesoLordo ? `<UnitaMisuraPeso>KG</UnitaMisuraPeso><PesoLordo>${n2(tr.pesoLordo)}</PesoLordo>` : "") + tag("PesoNetto", tr.pesoNetto ? n2(tr.pesoNetto) : null) +
    tag("DataInizioTrasporto", tr.dataInizio ? d10(tr.dataInizio) : null) +
    `</DatiTrasporto>`;
}

/** Nome del file come vuole lo SDI: IT + partita IVA + _ + progressivo (5 caratteri). */
export const nomeFileXml = (progressivo: string) => `IT${CEDENTE.partitaIva}_${progressivo.replace(/[^A-Za-z0-9]/g, "").slice(-5).padStart(5, "0")}.xml`;

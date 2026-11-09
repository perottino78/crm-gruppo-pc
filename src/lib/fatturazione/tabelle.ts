// Fatturazione e DDT di uscita: le tabelle come in BConsole (lette il 9/11/2026 da app.bconsole.com, azienda «pecsrl»).
// Modulo puro (usabile anche nel browser).

/** Dati del cedente (P&C srl unipersonale, da BConsole › Profilo azienda). */
export const CEDENTE = {
  denominazione: "P&C srl unipersonale",
  partitaIva: "10741080013",
  codiceFiscale: "10741080013",
  regimeFiscale: "RF01",
  indirizzo: "Corso Moncenisio",
  numeroCivico: "28",
  cap: "10090",
  comune: "Rosta",
  provincia: "TO",
  nazione: "IT",
  telefono: "01119887497",
  email: "info@gruppopec.com",
  pec: "gruppopec@cert.ica-net.it",
  sito: "www.gruppopec.com",
  codiceDestinatario: "8CQGKGJ",
  socioUnico: true,
};

/** Sezionali delle fatture (BConsole › Sezionali Fatture): il numero è «N/estensione/anno», es. 518/FE/2026. */
export const SEZIONALI: { codice: string; nome: string; estensione: string; brand: string | null }[] = [
  { codice: "PC", nome: "Fatture P&C", estensione: "FE", brand: "P&C" },
  { codice: "FO", nome: "Fatture Fotovoltaico", estensione: "FO", brand: "Solaris" },
  { codice: "SCF", nome: "Fatture Sconto in fattura", estensione: "SCF", brand: null },
  { codice: "PL", nome: "Fatture Plasma 30", estensione: "PL", brand: "Plasma30" },
  { codice: "PF", nome: "Fatture Pura Fonte", estensione: "PF", brand: "Purafonte" },
  { codice: "RA", nome: "Fattura R.A (ritenuta d'acconto)", estensione: "A", brand: null },
];
export const sezionale = (codice: string | null | undefined) => SEZIONALI.find((s) => s.codice === codice) ?? SEZIONALI[0];

/** Tipi di fattura (BConsole › Tipi Fattura) con il codice TipoDocumento della fattura elettronica. */
export const TIPI_FATTURA: { codice: string; nome: string; td: string | null; notaCredito?: boolean; trasporto?: boolean; fiscale: boolean }[] = [
  { codice: "FATTURA", nome: "Fattura", td: "TD01", fiscale: true },
  { codice: "ACCONTO", nome: "Fattura di acconto", td: "TD02", fiscale: true },
  { codice: "SALDO", nome: "Fattura a saldo", td: "TD01", fiscale: true },
  { codice: "ACCOMPAGNATORIA", nome: "Fattura accompagnatoria", td: "TD01", trasporto: true, fiscale: true },
  { codice: "DIFFERITA", nome: "Fattura differita (da DDT)", td: "TD24", fiscale: true },
  { codice: "NOTA_CREDITO", nome: "Nota di credito", td: "TD04", notaCredito: true, fiscale: true },
  { codice: "NOTA_DEBITO", nome: "Nota di debito", td: "TD05", fiscale: true },
  { codice: "PROFORMA", nome: "Fattura proforma (non fiscale)", td: null, fiscale: false },
];
export const tipoFattura = (codice: string | null | undefined) => TIPI_FATTURA.find((t) => t.codice === codice) ?? TIPI_FATTURA[0];

/** Codici IVA (BConsole › Codici IVA). natura = codice della fattura elettronica per le operazioni senza IVA. */
export type CodiceIva = { codice: string; nome: string; aliquota: number; natura?: string; norma?: string };
export const CODICI_IVA: CodiceIva[] = [
  { codice: "22", nome: "IVA 22%", aliquota: 22 },
  { codice: "10", nome: "IVA 10% (agevolata)", aliquota: 10 },
  { codice: "4", nome: "IVA 4%", aliquota: 4 },
  { codice: "5", nome: "IVA 5%", aliquota: 5 },
  { codice: "N6.3", nome: "Inversione contabile — subappalto edile (art. 17 c.6 a)", aliquota: 0, natura: "N6.3", norma: "Inversione contabile art. 17 c. 6 lett. a) DPR 633/72" },
  { codice: "N6.9", nome: "Inversione contabile — altri casi", aliquota: 0, natura: "N6.9", norma: "Inversione contabile art. 17 DPR 633/72" },
  { codice: "N4", nome: "Esente art. 10 DPR 633/72", aliquota: 0, natura: "N4", norma: "Esente IVA art. 10 DPR 633/72" },
  { codice: "N1", nome: "Escluso art. 15 (anticipazioni, fuori campo)", aliquota: 0, natura: "N1", norma: "Escluso art. 15 DPR 633/72" },
  { codice: "N2.2", nome: "Non soggetto — altri casi", aliquota: 0, natura: "N2.2", norma: "Non soggetto IVA" },
  { codice: "N3.2", nome: "Cessione intracomunitaria (art. 41 DL 331/93)", aliquota: 0, natura: "N3.2", norma: "Non imponibile art. 41 DL 331/93" },
  { codice: "N5", nome: "Regime del margine (art. 36)", aliquota: 0, natura: "N5", norma: "Regime del margine art. 36 DL 41/95" },
];
export const codiceIva = (codice: string | null | undefined) => CODICI_IVA.find((c) => c.codice === codice) ?? CODICI_IVA[0];
/** Codice IVA da aliquota + natura (righe salvate). */
export const codiceIvaDa = (aliquota: number, natura?: string | null) =>
  natura ? CODICI_IVA.find((c) => c.natura === natura) ?? CODICI_IVA[0] : CODICI_IVA.find((c) => !c.natura && c.aliquota === aliquota) ?? { codice: String(aliquota), nome: `IVA ${aliquota}%`, aliquota };

/** Metodi di pagamento (i più usati di BConsole) con la modalità della fattura elettronica e le rate (giorni, fine mese). */
export type MetodoPagamento = { codice: string; nome: string; mp: string; rate: number[]; fineMese?: boolean; banca?: boolean };
export const METODI_PAGAMENTO_FATTURA: MetodoPagamento[] = [
  { codice: "BONIFICO_VISTA", nome: "Bonifico vista fattura", mp: "MP05", rate: [0], banca: true },
  { codice: "BONIFICO_ANTICIPATO", nome: "Bonifico anticipato", mp: "MP05", rate: [0], banca: true },
  { codice: "BONIFICO", nome: "Bonifico", mp: "MP05", rate: [0], banca: true },
  { codice: "BONIFICO_30FM", nome: "Bonifico 30 gg F.M.", mp: "MP05", rate: [30], fineMese: true, banca: true },
  { codice: "BONIFICO_60FM", nome: "Bonifico 60 gg F.M.", mp: "MP05", rate: [60], fineMese: true, banca: true },
  { codice: "BONIFICO_3060FM", nome: "Bonifico 30/60 gg F.M.", mp: "MP05", rate: [30, 60], fineMese: true, banca: true },
  { codice: "BONIFICO_306090FM", nome: "Bonifico 30/60/90 gg F.M.", mp: "MP05", rate: [30, 60, 90], fineMese: true, banca: true },
  { codice: "ALLA_CONSEGNA", nome: "Alla consegna", mp: "MP05", rate: [0], banca: true },
  { codice: "FINANZIAMENTO", nome: "Finanziamento", mp: "MP05", rate: [0] },
  { codice: "RIBA_30FM", nome: "Ricevuta bancaria 30 gg F.M.", mp: "MP12", rate: [30], fineMese: true },
  { codice: "RIBA_3060FM", nome: "Ricevuta bancaria 30/60 gg F.M.", mp: "MP12", rate: [30, 60], fineMese: true },
  { codice: "RIBA_306090FM", nome: "Ricevuta bancaria 30/60/90 gg F.M.", mp: "MP12", rate: [30, 60, 90], fineMese: true },
  { codice: "CONTANTI", nome: "Contanti", mp: "MP01", rate: [0] },
  { codice: "ASSEGNO", nome: "Assegno", mp: "MP02", rate: [0] },
  { codice: "ASSEGNO_CIRCOLARE", nome: "Assegno circolare", mp: "MP03", rate: [0] },
  { codice: "POS", nome: "Incasso con POS / carta", mp: "MP08", rate: [0] },
  { codice: "RID", nome: "RID / SDD", mp: "MP09", rate: [0] },
  { codice: "COMPENSAZIONE", nome: "Compensazione con vostra fattura", mp: "MP04", rate: [0] },
];
export const metodoPagamento = (codice: string | null | undefined) => METODI_PAGAMENTO_FATTURA.find((m) => m.codice === codice) ?? METODI_PAGAMENTO_FATTURA[0];

/** Banche dell'azienda per l'incasso (BConsole › Banca azienda). L'IBAN si prende dal conto in Amministrazione › Banche se c'è. */
export const BANCHE_AZIENDA = ["Banca Crédit Agricole Cariparma", "Banca Intesa Sanpaolo", "Banca BPER", "Banca Nazionale del Lavoro S.p.A."];

/** Causali di trasporto verso il cliente (BConsole › Caus. Trasporto, tipo CLIENTE). */
export const CAUSALI_TRASPORTO = [
  "Vendita merce", "Reso al fornitore", "Conto visione", "Conto sostituzione", "Conto lavorazione da cliente", "Conto riparazione da cliente",
  "Comodato d'uso gratuito", "Prestito d'uso cliente", "Omaggio a cliente", "Reso da cliente", "Sposta giacenza",
];
export const TRASPORTO_A_CURA = [{ codice: "MITTENTE", nome: "Mittente" }, { codice: "DESTINATARIO", nome: "Destinatario" }, { codice: "VETTORE", nome: "Vettore" }];
export const ASPETTO_BENI = ["A vista", "Cartoni", "Pallet", "Scatole", "Sfuso", "Collo unico"];
export const PORTO = ["Porto franco", "Porto assegnato", "Franco stabilimento"];

/** Stati dei DDT (BConsole › Stati Ddt). */
export const STATI_DDT: Record<string, { nome: string; colore: string }> = {
  BOZZA: { nome: "Bozza", colore: "#6b7280" },
  DA_FATTURARE: { nome: "Da fatturare", colore: "#b45309" },
  PARZ_FATTURATO: { nome: "Parz. fatturato", colore: "#2563eb" },
  FATTURATO: { nome: "Fatturato", colore: "#15803d" },
  CHIUSO: { nome: "Chiuso (non da fatturare)", colore: "#374151" },
};

/** Stati delle fatture emesse dal CRM. */
export const STATI_FATTURA: Record<string, { nome: string; colore: string }> = {
  BOZZA: { nome: "Bozza", colore: "#6b7280" },
  PROVA: { nome: "Di prova (non valida)", colore: "#7c3aed" },
  EMESSA: { nome: "Emessa", colore: "#15803d" },
  ANNULLATA: { nome: "Annullata", colore: "#b91c1c" },
};

/** Unità di misura usate nelle righe. */
export const UNITA_MISURA = ["pz", "nr", "mq", "ml", "kg", "ore", "a corpo", "kit", "cp"];

/** Bollo: 2 € quando le operazioni senza IVA (esenti, escluse, non imponibili) superano 77,47 €. */
export const SOGLIA_BOLLO = 77.47;
export const IMPORTO_BOLLO = 2;
export const NATURE_CON_BOLLO = ["N1", "N2.1", "N2.2", "N3.5", "N3.6", "N4"];

/** Testo fisso a piè di fattura (BConsole › riga fattura predefinita). */
export const DICHIARAZIONE_CCNL =
  "Si dichiara che i lavori non edili indicati sono eseguiti con applicazione quale datore di lavoro del contratto collettivo del settore di appartenenza terziario confcommercio.";

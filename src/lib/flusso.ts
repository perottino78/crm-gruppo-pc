// Flusso pratiche fra uffici: costanti e utilità condivise (client + server)
export const UFFICI: { chiave: string; nome: string }[] = [
  { chiave: "COMMERCIALE", nome: "Commerciale" },
  { chiave: "FATTURAZIONE", nome: "Fatturazione" },
  { chiave: "TECNICO", nome: "Tecnico / Rilievi" },
  { chiave: "ORDINI", nome: "Ufficio ordini" },
  { chiave: "MAGAZZINO", nome: "Magazzino" },
  { chiave: "POSA", nome: "Posa" },
  { chiave: "AMMINISTRAZIONE", nome: "Amministrazione" },
  { chiave: "MARKETING", nome: "Marketing" },
  { chiave: "CENTRALINO", nome: "Centralino / telefoniste" },
];
export const nomeUfficio = (k?: string | null) => UFFICI.find((u) => u.chiave === k)?.nome ?? k ?? "—";

// Stessi stati del gestionale precedente
export const STATI_TASK: { chiave: string; nome: string; colore: string }[] = [
  { chiave: "DA_INIZIARE", nome: "Da iniziare", colore: "#2563eb" },
  { chiave: "IN_CORSO", nome: "In corso", colore: "#d97706" },
  { chiave: "COMPLETATO", nome: "Completato", colore: "#15803d" },
  { chiave: "ANNULLATO", nome: "Annullato", colore: "#6b7280" },
  { chiave: "CONFERMATO", nome: "Confermato", colore: "#15803d" },
  { chiave: "ACCONTO_PAGATO", nome: "Acconto pagato", colore: "#0f766e" },
  { chiave: "SALDO_PAGATO", nome: "Saldo pagato", colore: "#0f766e" },
  { chiave: "INVIATO_MAIL_KIT", nome: "Inviato mail per kit", colore: "#7c3aed" },
  { chiave: "ESEGUITO", nome: "Eseguito", colore: "#15803d" },
  { chiave: "PARZIALMENTE_CONFERMATO", nome: "Parzialmente confermato", colore: "#d97706" },
];
export const statoTask = (k: string) => STATI_TASK.find((s) => s.chiave === k) ?? { chiave: k, nome: k, colore: "#6b7280" };
// Stati che chiudono il task e fanno partire l'ufficio successivo
export const STATI_CHE_AVANZANO = ["COMPLETATO", "ESEGUITO"];
export const STATI_CHIUSI = ["COMPLETATO", "ESEGUITO", "ANNULLATO"];

export type FaseDefault = {
  chiave: string; nome: string; ufficio: string; prossimaChiave: string | null;
  taskTitolo: string; taskTesto: string; mailAttiva?: boolean; mailQuando?: string; mailDestinatario?: string;
  mailOggetto?: string; mailTesto?: string;
};
export const FASI_DEFAULT: FaseDefault[] = [
  {
    chiave: "ACCETTAZIONE", nome: "Accettazione e caricamento pratica", ufficio: "COMMERCIALE", prossimaChiave: "FATT_ACCONTO",
    taskTitolo: "Caricare la pratica e confermare l'accettazione", taskTesto: "Verificare che l'offerta {offerta} sia firmata e che i dati del cliente {cliente} siano completi, poi premere Fatto.",
    mailAttiva: false, mailQuando: "INIZIO", mailDestinatario: "CLIENTE",
    mailOggetto: "Grazie per aver scelto Gruppo P&C — offerta {offerta}",
    mailTesto: "Gentile {cliente},\n\nla ringraziamo per aver accettato la nostra offerta {offerta}. Procederemo ora con le fasi successive e la terremo aggiornata.\n\nCordiali saluti,\n{commerciale}\nGruppo P&C",
  },
  // Flusso reale di P&C (Ugo, 16-18/11/2026): Giorgia fattura, crea il progetto e fa la chiamata di benvenuto, Debora segna il pagamento, Alessia (centralino) fissa rilievo e posa,
  // il tecnico carica il rilievo, Laura (ufficio ordini) conferma il materiale e ordina, il magazzino carica bolle e fatture, il commerciale consegna il kit.
  { chiave: "FATT_ACCONTO", nome: "Progetto, chiamata di benvenuto e fattura acconto", ufficio: "FATTURAZIONE", prossimaChiave: null, taskTitolo: "Creazione progetto, chiamata di benvenuto e fattura di acconto", taskTesto: "Pratica {commessa} di {cliente}: nella pratica, passo per passo: 1) creare il progetto, 2) fare la chiamata di benvenuto al cliente e annotarla, 3) emettere la fattura di acconto (importo pratica {importo}) e segnarla. L'incasso lo registra l'amministrazione." },
  { chiave: "PROGETTO", nome: "Incasso acconto", ufficio: "AMMINISTRAZIONE", prossimaChiave: null, taskTitolo: "Registrare l'incasso dell'acconto", taskTesto: "Pratica {commessa} di {cliente}: quando arriva il pagamento dell'acconto registrarlo (nello scadenzario, nella fattura o nella pratica): spuntare «✉️ Manda il ringraziamento al cliente» (parte dalla casella della fatturazione); il task si chiude da solo, non serve premere Fatto. Con l'acconto incassato e il progetto creato da Giorgia, il centralino fissa il rilievo." },
  { chiave: "RILIEVO_APP", nome: "Appuntamento di rilievo", ufficio: "CENTRALINO", prossimaChiave: "RILIEVO", taskTitolo: "Fissare l'appuntamento di rilievo", taskTesto: "Pratica {commessa} di {cliente}: nella pratica, sezione Rilievo, scegliere il rilevatore, il giorno e l'ora. Va nel calendario del tecnico e parte la mail al cliente." },
  { chiave: "RILIEVO", nome: "Rilievo misure", ufficio: "TECNICO", prossimaChiave: "ORDINI", taskTitolo: "Eseguire il rilievo e caricare le misure", taskTesto: "Pratica {commessa} di {cliente}: eseguire il rilievo, poi in «Carica il rilievo» inserire misure, PDF e foto e il materiale mancante e salvare (il rilievo risulta eseguito: il task passa all'ufficio tecnico)." },
  { chiave: "ORDINI", nome: "Conferma materiale e invio ordini", ufficio: "ORDINI", prossimaChiave: "MAGAZZINO", taskTitolo: "Confermare il materiale, inviare gli ordini ai fornitori e caricare i costi", taskTesto: "Pratica {commessa} di {cliente}: rilievo caricato. Controllare i prodotti (ogni riga col suo fornitore), premere «Conferma materiale», creare e inviare gli ordini ai fornitori: per email dal CRM con i PDF del rilievo, oppure caricandoli sul portale del fornitore e premendo «Segna come inviato». Caricare i costi. Con tutti gli ordini inviati il task passa al magazzino." },
  { chiave: "MAGAZZINO", nome: "Arrivo materiale in magazzino", ufficio: "MAGAZZINO", prossimaChiave: "POSA_APP", taskTitolo: "Caricare bolle e fatture del materiale in arrivo", taskTesto: "Pratica {commessa} di {cliente}: caricare le bolle e le fatture del materiale man mano che arriva. Quando la pratica è completa il task passa al centralino per fissare la posa." },
  { chiave: "FATT_SALDO", nome: "Fattura saldo", ufficio: "FATTURAZIONE", prossimaChiave: null, taskTitolo: "Fattura saldo e incasso prima dell'uscita materiale", taskTesto: "Pratica {commessa} di {cliente}: emettere la fattura di saldo e registrare l'incasso. Con il saldo incassato si conferma il giorno di posa." },
  { chiave: "POSA_APP", nome: "Appuntamento di posa", ufficio: "CENTRALINO", prossimaChiave: "POSA", taskTitolo: "Fissare la posa con la squadra competente", taskTesto: "Pratica {commessa} di {cliente}: materiale completo. Nella pratica, sezione Posa, scegliere la squadra, il giorno e i giorni previsti. Parte la mail al cliente con come far trovare l'ambiente di lavoro e la richiesta di conferma della data." },
  { chiave: "POSA", nome: "Posa in opera", ufficio: "POSA", prossimaChiave: null, taskTitolo: "Eseguire la posa e consegnare in azienda i documenti di fine lavori", taskTesto: "Pratica {commessa} di {cliente}: eseguire la posa e, finito, consegnare in azienda i documenti di fine lavori. Il centralino li carica e segna la posa finita (al cliente parte la richiesta di recensione; se la posa è parziale, le scuse)." },
  { chiave: "KIT", nome: "Consegna del kit di manutenzione", ufficio: "COMMERCIALE", prossimaChiave: null, taskTitolo: "Consegnare il kit di manutenzione al cliente", taskTesto: "Pratica {commessa} di {cliente}: posa finita. Andare a consegnare il kit di manutenzione, verificare che il cliente sia soddisfatto e registrare la consegna nella pratica (punti kit)." },
];

/** Fasi di serie con testi cambiati nel tempo: si riallineano da sole una volta per versione (solo nome e testi del task). */
export const VERSIONE_TESTI_FLUSSO = "2026-11-21b";
export const FASI_TESTI_AGGIORNATI = ["FATT_ACCONTO", "PROGETTO", "ORDINI"];

export function compila(testo: string | null | undefined, v: Record<string, string>): string {
  return (testo ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

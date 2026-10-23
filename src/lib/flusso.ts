// Flusso pratiche fra uffici: costanti e utilità condivise (client + server)
export const UFFICI: { chiave: string; nome: string }[] = [
  { chiave: "COMMERCIALE", nome: "Commerciale" },
  { chiave: "FATTURAZIONE", nome: "Fatturazione" },
  { chiave: "TECNICO", nome: "Tecnico / Rilievi" },
  { chiave: "ORDINI", nome: "Ufficio ordini" },
  { chiave: "POSA", nome: "Posa" },
  { chiave: "AMMINISTRAZIONE", nome: "Amministrazione" },
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
  { chiave: "FATT_ACCONTO", nome: "Fattura acconto", ufficio: "FATTURAZIONE", prossimaChiave: "RILIEVO", taskTitolo: "Emettere la fattura di acconto", taskTesto: "Pratica {commessa} di {cliente}: emettere la fattura di acconto e registrare l'incasso. Importo pratica {importo}." },
  { chiave: "RILIEVO", nome: "Rilievo misure", ufficio: "TECNICO", prossimaChiave: "ORDINI", taskTitolo: "Eseguire il rilievo e caricare le misure", taskTesto: "Pratica {commessa} di {cliente}: programmare il rilievo, caricare misure e foto nella scheda commessa, poi premere Fatto." },
  { chiave: "ORDINI", nome: "Evasione ordini", ufficio: "ORDINI", prossimaChiave: "FATT_SALDO", taskTitolo: "Evadere gli ordini ai fornitori", taskTesto: "Pratica {commessa} di {cliente}: rilievo caricato. Generare e inviare gli ordini ai fornitori, spuntare le righe ordinate." },
  { chiave: "FATT_SALDO", nome: "Fattura saldo", ufficio: "FATTURAZIONE", prossimaChiave: "POSA", taskTitolo: "Fattura saldo e incasso prima dell'uscita materiale", taskTesto: "Pratica {commessa} di {cliente}: emettere la fattura di saldo e registrare l'incasso. Con il saldo incassato parte la conferma del giorno di posa." },
  { chiave: "POSA", nome: "Posa in opera", ufficio: "POSA", prossimaChiave: null, taskTitolo: "Programmare e confermare la posa", taskTesto: "Pratica {commessa} di {cliente}: programmare la posa, confermare il giorno al cliente e completarla con foto e firma." },
];

export function compila(testo: string | null | undefined, v: Record<string, string>): string {
  return (testo ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

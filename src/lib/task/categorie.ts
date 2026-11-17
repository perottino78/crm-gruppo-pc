// Categorie dei task (campo «Categoria» come in BConsole). Elenco fisso, si può allungare qui.
export const CATEGORIE_TASK = [
  "Richiesta preventivo", "Richiesta informazioni", "Da richiamare", "Ordine e materiale", "Rilievo e posa", "Fatturazione e pagamenti", "Assistenza", "Pratiche e documenti", "Altro",
];
export const STATI_TASK_CLIENTE = [
  { chiave: "DA_FARE", nome: "Da fare" },
  { chiave: "IN_CORSO", nome: "In corso" },
  { chiave: "FATTO", nome: "Fatto" },
];
/** Stato mostrato: «Scaduta» se non è fatto e la scadenza è passata (come in BConsole). */
export function statoMostrato(t: { statoTask: string; completata: boolean; scadenza: Date | null }, adesso = new Date()): { chiave: string; nome: string } {
  if (t.completata || t.statoTask === "FATTO") return { chiave: "FATTO", nome: "Fatto" };
  if (t.scadenza && t.scadenza < adesso) return { chiave: "SCADUTA", nome: "Scaduta" };
  return STATI_TASK_CLIENTE.find((s) => s.chiave === t.statoTask) ?? STATI_TASK_CLIENTE[0];
}

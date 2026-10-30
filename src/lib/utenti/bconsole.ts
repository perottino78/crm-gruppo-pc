// Personale letto da BConsole (Utenti, Rete Vendita, Risorse — ottobre 2026) e scelto da Ugo:
// chi entra nel CRM, con quale ruolo, ufficio e marchi. Funzioni pure: testabili senza database.

export type PersonaBConsole = {
  nome: string; // "Nome Cognome", come nel CRM
  email: string | null; // null = in BConsole ha un'email finta (prova@libero.it): si completa a mano
  username: string; // stesso username di BConsole
  ruolo: "AMMINISTRATORE" | "AMMINISTRATIVO" | "COMMERCIALE" | "TELEFONISTA" | "POSATORE";
  ufficio: string | null;
  marchi?: string[]; // parole che riconoscono i Brand autorizzati (vuoto = nessuna restrizione)
  nota: string; // ruolo/gruppi in BConsole, per memoria
};

export const PERSONALE_BCONSOLE: PersonaBConsole[] = [
  // Commerciali / consulenti attivi
  { nome: "Marco Piccatti", email: "marco.piccatti@gruppopec.com", username: "mpiccatti", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE", nota: "Agente" },
  { nome: "Massimo Giordano", email: "massimo.giordano@gruppopec.com", username: "mgiordano", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE", nota: "Agente" },
  { nome: "Roberto Marongiu", email: "roberto.marongiu@gruppopec.com", username: "mroberto", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE", nota: "Agente" },
  { nome: "Claudio Trimboli", email: "claudio.trimboli@gruppopec.com", username: "ctrimboli", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE", nota: "Agente" },
  { nome: "Gian Paolo Visconti", email: "gianpaolo.visconti@solarisfotovoltaico.com", username: "vpaolo", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE", marchi: ["SOLARIS"], nota: "Agente Solaris" },
  // Ufficio
  { nome: "Debora Girodo", email: "amministrazione@gruppopec.com", username: "dgirodo", ruolo: "AMMINISTRATORE", ufficio: "AMMINISTRAZIONE", nota: "Amministratori" },
  { nome: "Giorgia Rosa Clot", email: "fatturazione@gruppopec.com", username: "grosaclot", ruolo: "AMMINISTRATIVO", ufficio: "FATTURAZIONE", nota: "Fatturazione" },
  { nome: "Cristina Rege", email: "ordini@gruppopec.com", username: "ordini", ruolo: "AMMINISTRATIVO", ufficio: "ORDINI", nota: "Ufficio ordini e centralino" },
  { nome: "Alessia Vaccaro", email: "assistenza@gruppopec.com", username: "alessiav", ruolo: "TELEFONISTA", ufficio: "COMMERCIALE", nota: "Centralino e assistenza" },
  { nome: "Laura Pinto", email: "info@solarisfotovoltaico.com", username: "lpinto", ruolo: "AMMINISTRATIVO", ufficio: "ORDINI", marchi: ["SOLARIS", "P&C", "PURA", "WORK"], nota: "Contabilità Solaris e ordini P&C" },
  { nome: "Rocco Zaccaro", email: "marketing@gruppopec.com", username: "mpec", ruolo: "TELEFONISTA", ufficio: "MARKETING", nota: "Marketing: email e nuove offerte" },
  // Posa e magazzino (in BConsole "Tecnico Interventi", senza email vera)
  { nome: "Ousmane Diomande", email: null, username: "odiomande", ruolo: "POSATORE", ufficio: "POSA", nota: "Tecnico interventi" },
  { nome: "Pasqualino Re", email: null, username: "pre", ruolo: "POSATORE", ufficio: "POSA", nota: "Tecnico interventi" },
  { nome: "Impianti Pilotto", email: null, username: "ipilotto", ruolo: "POSATORE", ufficio: "POSA", nota: "Tecnico interventi" },
  { nome: "Paolo Salvato", email: null, username: "psalvato", ruolo: "POSATORE", ufficio: "MAGAZZINO", nota: "Magazzino" },
];

/** Email segnaposto per chi non ne ha una vera (il campo è obbligatorio e unico). */
export const emailSegnaposto = (username: string) => `${username.toLowerCase()}@senza-email.invalid`;

/** Chiave del nome indipendente dall'ordine: "Rosa Clot Giorgia" = "Giorgia Rosa Clot". */
export function chiavePersona(nome: string): string {
  return nome.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");
}

/** Brand da autorizzare: un Brand vale se il suo nome contiene una delle parole indicate. */
export function brandDaMarchi(marchi: string[] | undefined, brand: { id: string; nome: string }[]): string[] {
  if (!marchi?.length) return [];
  const pulisci = (s: string) => s.toUpperCase().replace(/\s+/g, "");
  return brand.filter((b) => marchi.some((m) => pulisci(b.nome).includes(pulisci(m)))).map((b) => b.id);
}

type UtenteEsistente = { id: string; nome: string; email: string; username: string | null; ruolo: string; ufficio: string | null; brandIds: string[] };

export type Azione =
  | { tipo: "CREA"; persona: PersonaBConsole; email: string; brandIds: string[] }
  | { tipo: "COMPLETA"; persona: PersonaBConsole; id: string; dati: { username?: string; ufficio?: string }; brandIds: string[]; ruoloNelCrm: string }
  | { tipo: "INVARIATO"; persona: PersonaBConsole; id: string; ruoloNelCrm: string };

/**
 * Decide cosa fare per ogni persona: la riconosce per email, username o nome; se c'è già completa solo
 * i campi vuoti (username, ufficio, marchi se nessuno impostato) e non tocca il ruolo scelto a mano.
 */
export function pianoImportUtenti(personale: PersonaBConsole[], esistenti: UtenteEsistente[], brand: { id: string; nome: string }[]): Azione[] {
  const perEmail = new Map(esistenti.map((u) => [u.email.toLowerCase(), u]));
  const perUser = new Map(esistenti.filter((u) => u.username).map((u) => [u.username!.toLowerCase(), u]));
  const perNome = new Map(esistenti.map((u) => [chiavePersona(u.nome), u]));
  return personale.map((p): Azione => {
    const brandIds = brandDaMarchi(p.marchi, brand);
    const u = (p.email && perEmail.get(p.email.toLowerCase())) || perUser.get(p.username.toLowerCase()) || perNome.get(chiavePersona(p.nome));
    if (!u) return { tipo: "CREA", persona: p, email: p.email ?? emailSegnaposto(p.username), brandIds };
    const dati: { username?: string; ufficio?: string } = {};
    if (!u.username && !perUser.has(p.username.toLowerCase())) dati.username = p.username;
    if (!u.ufficio && p.ufficio) dati.ufficio = p.ufficio;
    const nuoviBrand = u.brandIds.length === 0 ? brandIds : [];
    if (Object.keys(dati).length === 0 && nuoviBrand.length === 0) return { tipo: "INVARIATO", persona: p, id: u.id, ruoloNelCrm: u.ruolo };
    return { tipo: "COMPLETA", persona: p, id: u.id, dati, brandIds: nuoviBrand, ruoloNelCrm: u.ruolo };
  });
}

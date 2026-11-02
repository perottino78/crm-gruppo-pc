// Ruoli e permessi (come i Gruppi di BConsole): ogni sezione del CRM è un permesso a spunta, e ogni profilo dice anche
// QUALI dati si vedono (solo i propri, quelli della propria zona, tutti). Senza profilo assegnato valgono i permessi
// predefiniti del ruolo, che riproducono come funzionava il CRM prima. L'amministratore può sempre tutto.
// Funzioni pure (usabili anche nel browser), testate in tests/permessi/permessi.test.ts.

export type Permesso = string;
export type Visibilita = "PROPRI" | "ZONA" | "TUTTI";

export const AREE: { area: string; voci: [Permesso, string][] }[] = [
  { area: "Contatti", voci: [["lead", "Lead da lavorare"], ["clienti", "Clienti"], ["clienti.esporta", "Esportare i clienti (Excel, pubblici Meta)"]] },
  { area: "Vendite", voci: [["preventivi", "Preventivi"], ["commesse", "Commesse e pratiche"], ["task", "Task pratiche"]] },
  { area: "Calendario", voci: [["calendario", "Calendario"], ["calendario.tutti", "Vede e organizza il calendario di tutti"]] },
  { area: "Ordini e magazzino", voci: [["ordini", "Ordini ai fornitori"], ["magazzino", "Magazzino"]] },
  { area: "Lavori e assistenza", voci: [["lavori", "Lavori e squadre"], ["assistenza", "Assistenza"]] },
  { area: "Prodotti", voci: [["prodotti", "Prodotti e listini (consultare)"], ["articoli", "Articoli dei fornitori"], ["listini.modifica", "Caricare listini e articoli, applicare aumenti"]] },
  { area: "Marketing", voci: [["marketing", "Pagina Marketing"], ["campagne", "Campagne email"], ["automazioni", "Email automatiche e loro testi"], ["pubblicita", "Lead da pubblicità e pagine di atterraggio"]] },
  { area: "Amministrazione", voci: [["amministrazione", "Amministrazione: banche, fatture, scadenze"], ["report", "Report: fatturato, margini, cassa"]] },
  { area: "Team", voci: [["team", "Team e performance"], ["utenti.crea", "Aggiungere nuovi colleghi"], ["archivio", "Archivio file"]] },
];
export const TUTTI_PERMESSI: Permesso[] = AREE.flatMap((a) => a.voci.map((v) => v[0]));
export const NOME_PERMESSO: Record<string, string> = Object.fromEntries(AREE.flatMap((a) => a.voci));

export const VISIBILITA: { chiave: Visibilita; nome: string; spiega: string }[] = [
  { chiave: "PROPRI", nome: "Solo i suoi", spiega: "clienti, offerte e lead di cui è responsabile o che ha seguito" },
  { chiave: "ZONA", nome: "La sua zona", spiega: "i suoi, quelli delle province della sua zona e quelli dei venditori della zona (responsabile di zona)" },
  { chiave: "TUTTI", nome: "Tutto", spiega: "tutti i clienti, offerte e lead" },
];

const BASE: Permesso[] = ["lead", "clienti", "clienti.esporta", "preventivi", "commesse", "task", "calendario", "lavori", "assistenza", "prodotti", "team", "archivio"];
const MARKETING: Permesso[] = ["marketing", "campagne", "automazioni", "pubblicita", "listini.modifica", "utenti.crea"];

/** I permessi di ogni ruolo come erano prima dei profili (nessuno perde accessi quando arrivano i profili). */
export function permessiPredefiniti(ruolo: string, ufficio?: string | null): Permesso[] {
  if (ruolo === "AMMINISTRATORE") return [...TUTTI_PERMESSI];
  const p = new Set<Permesso>(BASE);
  if (ruolo !== "COMMERCIALE") { p.add("ordini"); p.add("magazzino"); p.add("articoli"); }
  if (!["COMMERCIALE", "POSATORE"].includes(ruolo)) p.add("calendario.tutti");
  if (ruolo === "AMMINISTRATIVO") { p.add("amministrazione"); p.add("report"); }
  if (ruolo === "MARKETING" || ufficio === "MARKETING") MARKETING.forEach((x) => p.add(x));
  return TUTTI_PERMESSI.filter((x) => p.has(x));
}

export function visibilitaPredefinita(ruolo: string): Visibilita {
  return ruolo === "AMMINISTRATORE" || ruolo === "MARKETING" ? "TUTTI" : "PROPRI";
}

export type ConPermessi = { ruolo?: string | null; ufficio?: string | null; permessi?: string[] | null; profiloId?: string | null; visibilita?: string | null };

/** Permessi effettivi: quelli del profilo assegnato, altrimenti quelli predefiniti del ruolo. */
export function permessiDi(u: ConPermessi | null | undefined): Set<Permesso> {
  if (!u?.ruolo) return new Set();
  if (u.ruolo === "AMMINISTRATORE") return new Set(TUTTI_PERMESSI);
  return new Set(u.profiloId ? (u.permessi ?? []) : permessiPredefiniti(u.ruolo, u.ufficio));
}

/** Può farlo? L'amministratore sempre. */
export function puo(u: ConPermessi | null | undefined, p: Permesso): boolean {
  if (!u?.ruolo) return false;
  return u.ruolo === "AMMINISTRATORE" || permessiDi(u).has(p);
}

export function visibilitaDi(u: ConPermessi | null | undefined): Visibilita {
  if (!u?.ruolo) return "PROPRI";
  if (u.ruolo === "AMMINISTRATORE") return "TUTTI";
  const v = u.profiloId ? u.visibilita : null;
  return v === "TUTTI" || v === "ZONA" || v === "PROPRI" ? v : visibilitaPredefinita(u.ruolo);
}

/** Pagina → permesso che serve per aprirla (il più specifico vince). */
const PAGINE: [string, Permesso][] = [
  ["/impostazioni/automazioni", "automazioni"], ["/impostazioni/lead", "pubblicita"], ["/marketing/email", "automazioni"],
  ["/prodotti/aumenti", "listini.modifica"], ["/prodotti/articoli", "articoli"], ["/prodotti", "prodotti"],
  ["/lead", "lead"], ["/clienti", "clienti"], ["/preventivi", "preventivi"], ["/commesse", "commesse"], ["/task", "task"],
  ["/calendario", "calendario"], ["/ordini-fornitori", "ordini"], ["/magazzino", "magazzino"], ["/lavori", "lavori"],
  ["/assistenza", "assistenza"], ["/marketing", "marketing"], ["/campagne", "campagne"], ["/amministrazione", "amministrazione"],
  ["/report", "report"], ["/commerciali", "team"], ["/archivio", "archivio"],
];
export function permessoPagina(percorso: string): Permesso | null {
  const p = percorso.split("?")[0];
  return PAGINE.find(([pref]) => p === pref || p.startsWith(pref + "/"))?.[1] ?? null;
}

/** Profili di partenza (si modificano o se ne creano altri in Impostazioni › Ruoli e permessi). */
export const PROFILI_INIZIALI: { nome: string; descrizione: string; visibilita: Visibilita; permessi: Permesso[] }[] = [
  { nome: "Commerciale", descrizione: "Vede e lavora solo i suoi clienti, offerte e appuntamenti", visibilita: "PROPRI", permessi: permessiPredefiniti("COMMERCIALE") },
  { nome: "Responsabile commerciale di zona", descrizione: "Come il commerciale, ma vede tutta la sua zona (regioni) e i venditori della zona", visibilita: "ZONA", permessi: [...permessiPredefiniti("COMMERCIALE"), "calendario.tutti", "report"] },
  { nome: "Telefonista / centralino", descrizione: "Lavora i lead e fissa gli appuntamenti nel calendario di tutti", visibilita: "PROPRI", permessi: permessiPredefiniti("TELEFONISTA") },
  { nome: "Marketing", descrizione: "Campagne, email automatiche, pubblicità e listini; vede tutti i contatti", visibilita: "TUTTI", permessi: permessiPredefiniti("MARKETING") },
  { nome: "Responsabile marketing", descrizione: "Responsabile dell'ufficio marketing: tutto il marketing, i report e il team", visibilita: "TUTTI", permessi: [...permessiPredefiniti("MARKETING"), "report"] },
  { nome: "Amministrazione", descrizione: "Banche, fatture, scadenze e report", visibilita: "TUTTI", permessi: permessiPredefiniti("AMMINISTRATIVO") },
  { nome: "Tecnico", descrizione: "Rilievi, ordini, magazzino e calendario", visibilita: "PROPRI", permessi: permessiPredefiniti("TECNICO") },
  { nome: "Posatore", descrizione: "Pose, assistenze e il proprio calendario", visibilita: "PROPRI", permessi: permessiPredefiniti("POSATORE") },
];

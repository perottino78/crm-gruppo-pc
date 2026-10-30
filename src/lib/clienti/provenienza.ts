// Provenienza dei clienti (per le campagne) e filtri dell'elenco clienti.
// Un solo elenco di provenienze per tutte le strade da cui entra un cliente: form, lead convertito,
// landing page (?utm_source=…), Meta, simulatore, import BConsole. Funzioni pure: testabili senza database.

import type { Prisma } from "@prisma/client";

export const PROVENIENZE = [
  "FACEBOOK", "INSTAGRAM", "GOOGLE", "WEB", "SIMULATORE WEB", "FIERA", "PASSAPAROLA",
  "QUOTALO", "HOMDEAL", "CLIENTI PER TE", "UFFICIO", "CENTRALINO", "TELEFONO", "ALTRO",
] as const;

// Stati del lead (gli stessi di BConsole, per continuità)
export const STATI_LEAD = [
  "CALDO (interessato)", "Tentativo di contatto 1", "Tentativo di contatto 2", "Ricontattare", "Contattare in futuro",
  "VISITATO", "Mai risposto dopo 2 tentativi", "Non interessato", "COMPRATO MA NON DA NOI", "FUORI ZONA ( EXTRA REGIONI)",
  "FREDDO(non utilizzare)",
] as const;

/** Qualunque fonte scritta a mano o arrivata da un link (fb, utm_source=instagram, simulatore_web…) → provenienza uniforme. */
export function provenienzaDaFonte(fonte?: string | null): string {
  const f = (fonte ?? "").trim();
  if (!f) return "NON INDICATA";
  const u = f.toUpperCase().replace(/[_-]+/g, " ");
  if (/^(FB|FACEBOOK|META)\b|FACEBOOK/.test(u)) return "FACEBOOK";
  if (/^IG\b|INSTAGRAM/.test(u)) return "INSTAGRAM";
  if (/GOOGLE|GADS|ADWORDS/.test(u)) return "GOOGLE";
  if (/SIMULATORE/.test(u)) return "SIMULATORE WEB";
  if (/FIERA/.test(u)) return "FIERA";
  if (/PASSA ?PAROLA|REFERENZ|SEGNALAT|BNI/.test(u)) return "PASSAPAROLA";
  if (/QUOTALO/.test(u)) return "QUOTALO";
  if (/HOMDEAL/.test(u)) return "HOMDEAL";
  if (/CLIENTI ?PER ?TE/.test(u)) return "CLIENTI PER TE";
  if (/CENTRALINO/.test(u)) return "CENTRALINO";
  if (/TELEFON/.test(u)) return "TELEFONO";
  if (/UFFICIO|SHOWROOM/.test(u)) return "UFFICIO";
  if (/^(WEB|SITO|LANDING|ORGANIC|SEO)\b/.test(u)) return "WEB";
  if (u === "ALTRO") return "ALTRO";
  // una sorgente nuova (es. una campagna specifica) resta riconoscibile così com'è
  return u.slice(0, 40);
}

export type FiltriClienti = {
  brand?: string; q?: string; indirizzo?: string; comune?: string; provincia?: string; cap?: string; paese?: string;
  provenienza?: string; stato?: string; commerciale?: string; dal?: string; al?: string;
};

export const NESSUNA = "(nessuna)";

/** Condizioni Prisma dei filtri dell'elenco clienti (senza la visibilità per ruolo, che aggiunge chi chiama). */
export function whereFiltriClienti(f: FiltriClienti, dataDa?: Date | null, dataA?: Date | null): Prisma.ClienteWhereInput[] {
  const w: Prisma.ClienteWhereInput[] = [];
  if (f.brand && f.brand !== "Tutti") w.push({ brand: { nome: f.brand } });
  const q = f.q?.trim();
  if (q) w.push({ OR: [{ nome: { contains: q, mode: "insensitive" } }, { telefono: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] });
  for (const k of ["indirizzo", "comune", "provincia", "cap"] as const) {
    const v = f[k]?.trim();
    if (v) w.push({ [k]: { contains: v, mode: "insensitive" } });
  }
  if (f.paese?.trim() && f.paese !== "Tutti") w.push({ paese: f.paese.trim() });
  if (f.provenienza) w.push(f.provenienza === NESSUNA ? { OR: [{ origine: null }, { origine: "" }, { origine: "NON INDICATA" }] } : { origine: f.provenienza });
  if (f.stato) w.push(f.stato === NESSUNA ? { OR: [{ statoLead: null }, { statoLead: "" }] } : { statoLead: f.stato });
  if (f.commerciale) w.push(f.commerciale === NESSUNA ? { responsabileId: null } : { responsabileId: f.commerciale });
  if (dataDa) w.push({ createdAt: { gte: dataDa } });
  if (dataA) w.push({ createdAt: { lt: dataA } });
  return w;
}

/** Il filtro è "di campagna" se restringe per provenienza, stato, commerciale o periodo. */
export const filtriCampagnaAttivi = (f: FiltriClienti) => Boolean(f.provenienza || f.stato || f.commerciale || f.dal || f.al);

// ---- Esportazione per le campagne ----

const campoCsv = (v: unknown, sep: string) => {
  const s = v === null || v === undefined ? "" : String(v);
  return s.includes(sep) || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
};
export const rigaCsv = (valori: unknown[], sep: string) => valori.map((v) => campoCsv(v, sep)).join(sep);

/** Telefono in formato internazionale (+39…), come lo vuole Facebook per i pubblici personalizzati. */
export function telefonoInternazionale(t?: string | null): string {
  let n = (t ?? "").replace(/[^\d+]/g, "");
  if (!n) return "";
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (!n.startsWith("+")) n = `+39${n.replace(/^39(?=3\d{8,9}$)/, "")}`;
  return n;
}

/** "Rossi Mario" / "Mario Rossi" → nome e cognome separati (meglio di niente per Facebook). */
export function nomeCognome(nome: string, nomePersona?: string | null, cognome?: string | null): { nome: string; cognome: string } {
  if (nomePersona || cognome) return { nome: nomePersona ?? "", cognome: cognome ?? "" };
  const parti = nome.trim().split(/\s+/);
  if (parti.length < 2) return { nome: parti[0] ?? "", cognome: "" };
  // In BConsole e in ufficio si scrive di solito "Cognome Nome"
  return { cognome: parti[0], nome: parti.slice(1).join(" ") };
}

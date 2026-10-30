// Conversione delle anagrafiche (lead e clienti) lette da BConsole nei campi del Cliente del CRM.
// Fonti: la lista lead di BConsole (stato, commerciale, n. anagrafica) e l'export CSV "Esporta Tutto".
// Funzioni pure: testabili senza database.

import { normalizzaPiva } from "@/lib/fornitori/bconsole";

/** Una anagrafica come arriva al CRM (già ripulita dallo script di lettura). */
export type AnagraficaBConsole = {
  idAna?: string | null; // numero anagrafica BConsole (id_ana)
  categoria?: string | null; // "Lead", "Account,Cliente"…
  creatoIl?: string | null; // "26/10/2026" (+ ora "12:31" in creatoOra)
  creatoOra?: string | null;
  ragioneSociale?: string | null;
  referente?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  comune?: string | null;
  provincia?: string | null;
  regione?: string | null;
  nazione?: string | null;
  telefono?: string | null;
  cellulare?: string | null;
  altroTelefono?: string | null;
  email?: string | null;
  altraEmail?: string | null;
  pec?: string | null;
  piva?: string | null;
  codiceFiscale?: string | null;
  codiceDestinatario?: string | null;
  origine?: string | null; // FACEBOOK, QUOTALO, Fiera, PASSA PAROLA…
  settore?: string | null;
  stato?: string | null; // stato del lead in BConsole (CALDO, Non interessato…)
  venditore?: string | null; // sigla del commerciale in BConsole (MPI, MGI, UPE…)
  tag?: string[];
  note?: string | null;
};

/** Sigle dei commerciali BConsole (Risorse) → username nel CRM. Chi non c'è va a Ugo. */
export const SIGLE_COMMERCIALI: Record<string, string> = {
  MGI: "mgiordano", RMA: "mroberto", MPI: "mpiccatti", CTR: "ctrimboli", GVI: "vpaolo",
  LPI: "lpinto", AVA: "alessiav", GRO: "grosaclot", DGI: "dgirodo", MPE: "mpec", UPE: "uperottino", UOR: "ordini",
};
export const COMMERCIALE_DI_RISERVA = "uperottino";
/** Nome e cognome delle stesse persone: serve se nel CRM l'utente ha uno username diverso da BConsole. */
export const NOMI_COMMERCIALI: Record<string, string> = {
  mgiordano: "Massimo Giordano", mroberto: "Roberto Marongiu", mpiccatti: "Marco Piccatti", ctrimboli: "Claudio Trimboli",
  vpaolo: "Gian Paolo Visconti", lpinto: "Laura Pinto", alessiav: "Alessia Vaccaro", grosaclot: "Giorgia Rosa Clot",
  dgirodo: "Debora Girodo", mpec: "Rocco Zaccaro", uperottino: "Ugo Perottino", ordini: "Cristina Rege",
};

const pulisci = (s?: string | null) => {
  const t = (s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return t && t !== "---" && t !== "-" ? t : null;
};
const titolo = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());

export function normalizzaTelefono(s?: string | null): string | null {
  let t = (s ?? "").replace(/[^\d+]/g, "");
  if (t.startsWith("+39")) t = t.slice(3);
  else if (t.startsWith("0039")) t = t.slice(4);
  t = t.replace(/\D/g, "");
  return t.length >= 6 ? t : null;
}

/** Chiave del nome indipendente da ordine, maiuscole e accenti: "ROSSI MARIO" = "Mario Rossi". */
export function chiaveNomeCliente(s?: string | null): string {
  return (s ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");
}

/** Provenienza uniforme per le campagne: tiene il valore di BConsole, se manca la ricava da tag e descrizione. */
export function provenienza(a: AnagraficaBConsole): string {
  const o = pulisci(a.origine);
  if (o) {
    const u = o.toUpperCase();
    if (u === "FACEBOOK" || u === "SOCIAL") return "FACEBOOK";
    if (u.startsWith("FACEBOOK/WEB")) return "FACEBOOK - BONUS FISCALE";
    if (u === "PASSA PAROLA" || u === "REFERENZA" || u === "SEGNALATO DA TERZI" || u === "BNI") return `PASSAPAROLA (${o})`;
    if (u === "FIERA") return "FIERA";
    return u;
  }
  const tag = (a.tag ?? []).join(" ").toUpperCase();
  const note = (a.note ?? "").toUpperCase();
  if (/\bMETA\b/.test(tag)) return "FACEBOOK";
  if (/CLIENTI PER TE/.test(note)) return "CLIENTI PER TE";
  if (/\bFIERA\b/.test(note)) return "FIERA";
  if (/PASSA ?PAROLA/.test(note)) return "PASSAPAROLA";
  if (/GOOGLE/.test(tag)) return "GOOGLE";
  if (/SITO/.test(tag) || /richiesta web/i.test(a.note ?? "")) return "WEB";
  return "NON INDICATA";
}

/** Marchio del CRM: dai tag/note/commerciale; quello incerto va su P&C. */
export function marchio(a: AnagraficaBConsole): "P&C" | "Solaris" | "Purafonte" {
  const testo = [...(a.tag ?? []), a.note ?? "", a.origine ?? ""].join(" ").toUpperCase();
  if (/SOLARIS|FOTOVOLTAIC|POMPA DI CALORE|ECOCOMFORT/.test(testo) || a.venditore === "GVI") return "Solaris";
  if (/PURA\s?FONTE|DEPURA/.test(testo) || a.venditore === "IPU") return "Purafonte";
  return "P&C";
}

export function usernameCommerciale(a: AnagraficaBConsole): string {
  return SIGLE_COMMERCIALI[(a.venditore ?? "").trim().toUpperCase()] ?? COMMERCIALE_DI_RISERVA;
}

/** "26/10/2026" + "12:31" → "2026-10-26T12:31" (ora di Roma, da passare a daOraRoma). */
export function dataRoma(giorno?: string | null, ora?: string | null): string | null {
  const m = (giorno ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const o = (ora ?? "").match(/(\d{1,2})[.:](\d{2})/);
  return `${m[3]}-${m[2]}-${m[1]}T${o ? o[1].padStart(2, "0") : "12"}:${o ? o[2] : "00"}`;
}

/** Campi del Cliente del CRM (senza brand, responsabile e data, che decide la rotta). */
export function convertiAnagrafica(a: AnagraficaBConsole) {
  const nomeGrezzo = pulisci(a.ragioneSociale) ?? pulisci(a.referente);
  const nome = nomeGrezzo ? (nomeGrezzo === nomeGrezzo.toUpperCase() || nomeGrezzo === nomeGrezzo.toLowerCase() ? titolo(nomeGrezzo) : nomeGrezzo) : null;
  const piva = normalizzaPiva(a.piva);
  const cf = pulisci(a.codiceFiscale)?.toUpperCase().replace(/\s/g, "") ?? null;
  const cell = pulisci(a.cellulare);
  const tel = pulisci(a.telefono) ?? cell;
  const email = pulisci(a.email)?.toLowerCase() ?? null;
  const sdi = pulisci(a.codiceDestinatario);
  const tag = (a.tag ?? []).map((t) => t.trim()).filter(Boolean);
  const categoria = pulisci(a.categoria)?.split(",").map((c) => c.trim()).filter(Boolean).join(", ") ?? "Lead";
  return {
    nome: nome ?? "Senza nome",
    telefono: tel,
    cellulare: cell && cell !== tel ? cell : null,
    altroTelefono: pulisci(a.altroTelefono),
    email,
    altraEmail: pulisci(a.altraEmail)?.toLowerCase() ?? null,
    pec: pulisci(a.pec)?.toLowerCase() ?? null,
    indirizzo: pulisci(a.indirizzo),
    cap: pulisci(a.cap)?.match(/\d{5}/)?.[0] ?? null,
    comune: pulisci(a.comune) && pulisci(a.comune)!.length > 1 ? titolo(pulisci(a.comune)!) : null,
    provincia: pulisci(a.provincia),
    regione: pulisci(a.regione),
    piva,
    codiceFiscale: cf && cf.length >= 11 ? cf : null,
    codiceDestinatario: sdi && sdi !== "0000000" ? sdi.toUpperCase() : null,
    tipoAnagrafica: piva ? "AZIENDA" : "PERSONA_FISICA",
    origine: provenienza(a),
    settore: pulisci(a.settore),
    categoria,
    tag: tag.length ? tag.join(", ") : null,
    statoLead: pulisci(a.stato),
    bconsoleId: pulisci(a.idAna),
    noteLibere: [pulisci(a.note), `Importato da BConsole${a.idAna ? ` (anagrafica n. ${a.idAna})` : ""}.`].filter(Boolean).join("\n"),
  };
}

export type DatiCliente = ReturnType<typeof convertiAnagrafica>;
type ClienteEsistente = { id: string; nome: string; telefono: string | null; cellulare: string | null; email: string | null; piva: string | null; codiceFiscale: string | null; bconsoleId: string | null };

/** Indice dei clienti già nel CRM per riconoscere lo stesso cliente (n. BConsole, P.IVA, C.F., email, telefono, nome). */
export function indiceClienti(esistenti: ClienteEsistente[]) {
  const mappe = { id: new Map<string, ClienteEsistente>(), piva: new Map<string, ClienteEsistente>(), cf: new Map<string, ClienteEsistente>(), email: new Map<string, ClienteEsistente>(), tel: new Map<string, ClienteEsistente>(), nome: new Map<string, ClienteEsistente>() };
  const aggiungi = (c: ClienteEsistente) => {
    if (c.bconsoleId) mappe.id.set(c.bconsoleId, c);
    const p = normalizzaPiva(c.piva); if (p) mappe.piva.set(p, c);
    if (c.codiceFiscale) mappe.cf.set(c.codiceFiscale.toUpperCase(), c);
    if (c.email) mappe.email.set(c.email.toLowerCase(), c);
    for (const t of [c.telefono, c.cellulare]) { const n = normalizzaTelefono(t); if (n) mappe.tel.set(n, c); }
    const k = chiaveNomeCliente(c.nome); if (k.includes(" ")) mappe.nome.set(k, c);
  };
  esistenti.forEach(aggiungi);
  const trova = (d: DatiCliente) =>
    (d.bconsoleId && mappe.id.get(d.bconsoleId)) ||
    (d.piva && mappe.piva.get(d.piva)) ||
    (d.codiceFiscale && mappe.cf.get(d.codiceFiscale)) ||
    (d.email && mappe.email.get(d.email)) ||
    [d.telefono, d.cellulare].map(normalizzaTelefono).filter(Boolean).map((t) => mappe.tel.get(t!)).find(Boolean) ||
    // il nome da solo basta solo se ha almeno nome e cognome
    (chiaveNomeCliente(d.nome).includes(" ") ? mappe.nome.get(chiaveNomeCliente(d.nome)) : undefined) ||
    null;
  return { trova, aggiungi };
}

/** Riempie solo i campi vuoti del cliente esistente: quanto scritto a mano nel CRM non si tocca. */
export function completaCliente(esistente: Record<string, unknown>, nuovo: DatiCliente): Partial<DatiCliente> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(nuovo)) {
    if (k === "nome" || k === "noteLibere" || k === "tipoAnagrafica") continue;
    const att = esistente[k];
    if ((att === null || att === undefined || att === "") && v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out as Partial<DatiCliente>;
}

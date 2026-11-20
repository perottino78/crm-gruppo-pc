// Importazione dei lead da un file CSV (Excel → «Salva come CSV»). Funzioni pure, senza database: lettura del file,
// riconoscimento delle colonne, controllo di ogni riga e ricerca dei doppioni. Il salvataggio sta in importa-server.ts.

export type RigaLead = {
  riga: number; // numero di riga nel file (la prima dati = 2)
  nome: string; telefono: string; email: string;
  marchio: string; provenienza: string; comune: string; cap: string; prodotto: string; note: string;
};

export const CAMPI = ["nome", "telefono", "email", "marchio", "provenienza", "comune", "cap", "prodotto", "note"] as const;
export type Campo = (typeof CAMPI)[number];
export const MAX_RIGHE = 250000;

const senzaAccenti = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const chiaveIntestazione = (s: string) => senzaAccenti(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Nomi con cui una colonna può chiamarsi nel file di chi ce lo manda. */
const SINONIMI: Record<Campo, string[]> = {
  nome: ["nome", "nomeecognome", "nomecognome", "cognomenome", "nominativo", "cliente", "fullname", "name", "contatto", "ragionesociale"],
  telefono: ["telefono", "tel", "cellulare", "cell", "mobile", "numero", "numerotelefono", "phone", "telefonocellulare", "recapitotelefonico"],
  email: ["email", "mail", "emailaddress", "indirizzoemail", "posta", "postaelettronica"],
  marchio: ["marchio", "brand", "divisione", "azienda"],
  provenienza: ["provenienza", "fonte", "origine", "source", "canale", "campagna"],
  comune: ["comune", "citta", "city", "localita", "paese"],
  cap: ["cap", "codicepostale", "zip"],
  prodotto: ["prodotto", "interesse", "richiesta", "servizio", "interessato", "prodottointeresse"],
  note: ["note", "nota", "messaggio", "commento", "commenti", "annotazioni", "notes"],
};

/** Legge un CSV (separatore «;», «,» o tab riconosciuto da solo, virgolette, righe a capo dentro le celle, BOM). */
export function leggiCsv(testo: string): string[][] {
  let t = testo.replace(/^﻿/, "");
  const prima = t.split(/\r?\n/, 1)[0] ?? "";
  const conta = (c: string) => prima.split(c).length - 1;
  const sep = [";", "\t", ","].reduce((best, c) => (conta(c) > conta(best) ? c : best), ";");
  const righe: string[][] = [];
  let riga: string[] = [], cella = "", dentro = false;
  t = t.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentro) {
      if (c === '"') { if (t[i + 1] === '"') { cella += '"'; i++; } else dentro = false; }
      else cella += c;
    } else if (c === '"') dentro = true;
    else if (c === sep) { riga.push(cella); cella = ""; }
    else if (c === "\n") { riga.push(cella); righe.push(riga); riga = []; cella = ""; }
    else cella += c;
  }
  if (cella !== "" || riga.length) { riga.push(cella); righe.push(riga); }
  return righe.filter((r) => r.some((x) => x.trim() !== ""));
}

export type LetturaFile = { righe: RigaLead[]; colonneTrovate: Campo[]; colonneNonCapite: string[]; errore?: string };

/** Dal testo del CSV alle righe lead, riconoscendo le colonne dall'intestazione. */
export function righeDaCsv(testo: string): LetturaFile {
  const tabella = leggiCsv(testo);
  if (tabella.length < 2) return { righe: [], colonneTrovate: [], colonneNonCapite: [], errore: "Il file è vuoto o ha solo l'intestazione." };
  const intest = tabella[0].map((h) => h.trim());
  const indice: Partial<Record<Campo, number>> = {};
  const nonCapite: string[] = [];
  intest.forEach((h, i) => {
    const k = chiaveIntestazione(h);
    const campo = CAMPI.find((c) => SINONIMI[c].includes(k));
    if (campo && indice[campo] === undefined) indice[campo] = i; else if (h) nonCapite.push(h);
  });
  // «Cognome» separato dal nome: si unisce
  const iCognome = intest.findIndex((h) => chiaveIntestazione(h) === "cognome");
  if (indice.nome === undefined && iCognome < 0) return { righe: [], colonneTrovate: [], colonneNonCapite: nonCapite, errore: "Non trovo la colonna del nome (deve chiamarsi «Nome» o «Nome e cognome»)." };
  const trovate = CAMPI.filter((c) => indice[c] !== undefined);
  const righe: RigaLead[] = tabella.slice(1, MAX_RIGHE + 1).map((r, n) => {
    const v = (c: Campo) => (indice[c] === undefined ? "" : (r[indice[c]!] ?? "").trim());
    const cognome = iCognome >= 0 ? (r[iCognome] ?? "").trim() : "";
    const nome = [v("nome"), cognome && !v("nome").toLowerCase().includes(cognome.toLowerCase()) ? cognome : ""].filter(Boolean).join(" ");
    return { riga: n + 2, nome, telefono: v("telefono"), email: v("email"), marchio: v("marchio"), provenienza: v("provenienza"), comune: v("comune"), cap: v("cap"), prodotto: v("prodotto"), note: v("note") };
  });
  return { righe, colonneTrovate: trovate, colonneNonCapite: nonCapite.filter((h) => chiaveIntestazione(h) !== "cognome") };
}

export function normalizzaTel(s?: string | null): string | null {
  let t = (s ?? "").replace(/[^\d+]/g, "");
  if (t.startsWith("+39")) t = t.slice(3); else if (t.startsWith("0039")) t = t.slice(4);
  t = t.replace(/\D/g, "");
  return t.length >= 6 ? t : null;
}
export const normalizzaEmail = (s?: string | null) => (s ?? "").trim().toLowerCase();
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Telefoni e email possono essere più di uno nella stessa cella («333 1234567 / 011 987654»): si guardano tutti. */
export function telefoniDi(s: string): string[] {
  return s.split(/[\/;,|]|\s{2,}|\be\b/i).map((x) => normalizzaTel(x)).filter((x): x is string => !!x);
}

export type Esistente = { tipo: "LEAD" | "CLIENTE"; id: string; nome: string; telefoni: string[]; emails: string[]; info?: string };
export type Stato = "NUOVO" | "DOPPIO_FILE" | "DOPPIO_LEAD" | "DOPPIO_CLIENTE" | "ERRORE";
export type Esito = { riga: RigaLead; stato: Stato; motivo?: string; collegatoA?: string };

/** Dove vanno i contatti: TELEFONISTE = lead da chiamare (task di oggi); CAMPAGNE = solo contatti per le campagne email, le telefoniste non li vedono. */
export type Modo = "TELEFONISTE" | "CAMPAGNE";

/** Controlla ogni riga: errori, doppioni dentro il file (la prima vince) e doppioni già in ONE (lead o clienti, per telefono o email). */
export function classifica(righe: RigaLead[], esistenti: Esistente[], modo: Modo = "TELEFONISTE"): Esito[] {
  const perTel = new Map<string, Esistente>(), perMail = new Map<string, Esistente>();
  for (const e of esistenti) { for (const t of e.telefoni) if (!perTel.has(t)) perTel.set(t, e); for (const m of e.emails) if (!perMail.has(m)) perMail.set(m, e); }
  const visti = new Map<string, number>(); // chiave → riga del file
  return righe.map((riga) => {
    const campagne = modo === "CAMPAGNE";
    // per le campagne conta solo l'email: il telefono non serve e non fa da chiave
    const tels = campagne ? [] : telefoniDi(riga.telefono);
    const mail = normalizzaEmail(riga.email);
    if (!riga.nome.trim()) return { riga, stato: "ERRORE", motivo: "Manca il nome." };
    if (campagne && !EMAIL_OK.test(mail)) return { riga, stato: "ERRORE", motivo: mail ? "Email non valida." : "Manca l'email: le campagne mandano email." };
    if (!tels.length && !mail) return { riga, stato: "ERRORE", motivo: riga.telefono ? "Telefono non valido e nessuna email." : "Serve almeno un telefono o un'email." };
    if (mail && !EMAIL_OK.test(mail) && !tels.length) return { riga, stato: "ERRORE", motivo: "Email non valida e nessun telefono." };
    const mailBuona = mail && EMAIL_OK.test(mail) ? mail : "";
    const chiavi = [...tels.map((t) => `T${t}`), ...(mailBuona ? [`M${mailBuona}`] : [])];
    const giaNelFile = chiavi.map((k) => visti.get(k)).find((x) => x !== undefined);
    if (giaNelFile !== undefined) return { riga, stato: "DOPPIO_FILE", motivo: `Stesso telefono o email della riga ${giaNelFile}.`, collegatoA: `riga ${giaNelFile}` };
    const trovato = tels.map((t) => perTel.get(t)).find(Boolean) ?? (mailBuona ? perMail.get(mailBuona) : undefined);
    chiavi.forEach((k) => visti.set(k, riga.riga));
    if (trovato) return { riga, stato: trovato.tipo === "LEAD" ? "DOPPIO_LEAD" : "DOPPIO_CLIENTE", motivo: `${trovato.tipo === "LEAD" ? "Lead" : "Cliente"} già in ONE: ${trovato.nome}${trovato.info ? ` (${trovato.info})` : ""}.`, collegatoA: trovato.id };
    return { riga, stato: "NUOVO" };
  });
}

export function riepilogo(esiti: Esito[]) {
  const c = (s: Stato) => esiti.filter((e) => e.stato === s).length;
  return { totale: esiti.length, nuovi: c("NUOVO"), doppiFile: c("DOPPIO_FILE"), doppiLead: c("DOPPIO_LEAD"), doppiClienti: c("DOPPIO_CLIENTE"), errori: c("ERRORE") };
}

const cella = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** File modello da scaricare: intestazioni, due righe di esempio e i marchi veri di ONE. */
export function modelloCsv(marchi: string[]): string {
  const m = marchi[0] ?? "P&C", m2 = marchi.find((x) => /solaris/i.test(x)) ?? m;
  const righe = [
    ["Nome e cognome", "Telefono", "Email", "Marchio", "Provenienza", "Comune", "CAP", "Prodotto", "Note"],
    ["Mario Rossi", "333 1234567", "mario.rossi@esempio.it", m, "Fiera Torino 2026", "Rosta", "10090", "Serramenti", "Vuole il preventivo entro dicembre"],
    ["Anna Bianchi", "011 9876543", "", m2, "Passaparola", "Torino", "10100", "Fotovoltaico", ""],
  ];
  return "﻿" + righe.map((r) => r.map(cella).join(";")).join("\r\n") + "\r\n";
}

/** Rapporto dei non importati (doppioni ed errori) da scaricare e rivedere. */
export function rapportoCsv(esiti: Esito[]): string {
  const righe = [["Riga", "Esito", "Motivo", "Nome", "Telefono", "Email"], ...esiti.filter((e) => e.stato !== "NUOVO").map((e) => [String(e.riga.riga), e.stato === "ERRORE" ? "Errore" : "Doppione", e.motivo ?? "", e.riga.nome, e.riga.telefono, e.riga.email])];
  return "﻿" + righe.map((r) => r.map(cella).join(";")).join("\r\n") + "\r\n";
}

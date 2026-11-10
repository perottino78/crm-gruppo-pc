// Campagne email di marketing: filtri dei destinatari, testo personalizzato, avvisi di scadenza.
// Funzioni pure: testabili senza database.
import type { Prisma } from "@prisma/client";
import { chiaveGiorno } from "@/lib/calendario/tempo";

export const SENZA_STATO = "(nessuno)";
export const CATEGORIE = ["Lead", "Cliente", "Account"] as const;

export type FiltriCampagna = {
  marchi: string[];
  stati: string[];
  categorie: string[];
  provenienza?: string | null;
  commercialeId?: string | null;
  provincia?: string | null;
  /** Solo questi clienti (es. chi ha un'offerta non chiusa); null/undefined = nessun limite */
  soloClienti?: string[] | null;
  /** Escludi questi clienti (es. chi ha già comprato) */
  escludiClienti?: string[] | null;
};

/** Situazioni del contatto per scegliere a chi scrivere. */
export const SITUAZIONI: { codice: string; nome: string; spiega: string }[] = [
  { codice: "OFFERTA_APERTA", nome: "Ha un'offerta non chiusa", spiega: "ha avuto un preventivo (CRM o BConsole) nel periodo scelto e non ha mai firmato un contratto" },
  { codice: "HA_COMPRATO", nome: "Ha già comprato da noi", spiega: "ha un contratto, un ordine o una fattura: buono per proporre un altro marchio" },
  { codice: "MAI_COMPRATO", nome: "Non ha mai comprato", spiega: "lead e contatti senza contratto, ordine o fattura" },
];

/**
 * Da chi ha avuto offerte e chi ha comprato, i clienti da includere/escludere per la situazione scelta.
 * Chi ha un'offerta non chiusa = ha un'offerta nel periodo e non compare fra chi ha comprato.
 */
export function clientiPerSituazione(situazione: string | null | undefined, conOfferta: Iterable<string>, comprati: Iterable<string>): { soloClienti?: string[]; escludiClienti?: string[] } {
  const c = new Set(comprati);
  if (situazione === "OFFERTA_APERTA") return { soloClienti: [...new Set(conOfferta)].filter((id) => !c.has(id)) };
  if (situazione === "HA_COMPRATO") return { soloClienti: [...c] };
  if (situazione === "MAI_COMPRATO") return { escludiClienti: [...c] };
  return {};
}

/** Clienti che rientrano nei filtri della campagna (con email, non disiscritti: quelli si contano a parte). */
export function whereCampagna(f: FiltriCampagna): Prisma.ClienteWhereInput {
  const w: Prisma.ClienteWhereInput[] = [];
  if (f.marchi.length) w.push({ brand: { nome: { in: f.marchi } } });
  if (f.stati.length) {
    const veri = f.stati.filter((s) => s !== SENZA_STATO);
    const o: Prisma.ClienteWhereInput[] = [];
    if (veri.length) o.push({ statoLead: { in: veri } });
    if (f.stati.includes(SENZA_STATO)) o.push({ statoLead: null }, { statoLead: "" });
    w.push({ OR: o });
  }
  if (f.categorie.length) w.push({ OR: f.categorie.map((c) => ({ categoria: { contains: c, mode: "insensitive" as const } })) });
  if (f.provenienza) w.push({ origine: f.provenienza });
  if (f.commercialeId) w.push({ responsabileId: f.commercialeId });
  if (f.provincia?.trim()) w.push({ provincia: { contains: f.provincia.trim(), mode: "insensitive" } });
  if (f.soloClienti) w.push({ id: { in: f.soloClienti } });
  if (f.escludiClienti?.length) w.push({ id: { notIn: f.escludiClienti } });
  return { AND: w };
}

/** Condizioni per poter ricevere: email valida, non disiscritto (né come cliente né come lead d'origine). */
export const whereRaggiungibile: Prisma.ClienteWhereInput = {
  AND: [
    { email: { contains: "@" } },
    { disiscritto: false },
    { OR: [{ leadOrigineId: null }, { leadOrigine: { disiscritto: false } }] },
  ],
};

export const emailValida = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) && !e.trim().endsWith(".invalid");

/** {nome} → il nome proprio se è compilato nella scheda, altrimenti nome e cognome come scritti in anagrafica
 * (BConsole li scrive "Cognome Nome", Facebook "Nome Cognome": indovinare porterebbe a saluti sbagliati). */
export function personalizza(testo: string, nomeCliente: string, nomePersona?: string | null): string {
  const titolo = (s: string) => (s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase()) : s);
  const nome = titolo((nomePersona?.trim() || nomeCliente.trim()).replace(/\s+/g, " "));
  return testo.replace(/\{\s*nome\s*\}/gi, nome || "cliente");
}

/** Giorni di calendario (Roma) da oggi alla scadenza: 0 = scade oggi, negativo = scaduta. */
export function giorniAllaScadenza(validaFino: Date, adesso: Date): number {
  return Math.round((Date.parse(chiaveGiorno(validaFino)) - Date.parse(chiaveGiorno(adesso))) / 86400000);
}

/** "3,2,1" → [3,2,1] (solo numeri da 0 a 60, senza doppioni). */
export function leggiGiorniPromemoria(s?: string | null): number[] {
  const n = (s ?? "3,2,1").split(/[,;\s]+/).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 60);
  return [...new Set(n)].sort((a, b) => b - a);
}

/** Avviso da mandare oggi? Ritorna i giorni mancanti se oggi è un giorno di avviso non ancora mandato. */
export function promemoriaDiOggi(validaFino: Date | null, giorni: number[], giaInviati: string[], adesso: Date): number | null {
  if (!validaFino) return null;
  const g = giorniAllaScadenza(validaFino, adesso);
  return giorni.includes(g) && !giaInviati.includes(String(g)) ? g : null;
}

export const testoGiorni = (g: number) => (g === 0 ? "oggi" : g === 1 ? "domani" : `fra ${g} giorni`);

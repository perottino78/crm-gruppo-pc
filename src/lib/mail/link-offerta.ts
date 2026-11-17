// Link per il cliente all'offerta (email "Invia offerta"), firmato. Testato in tests/mail/firma.test.ts.
import { createHmac } from "crypto";

const SEGRETO = process.env.SESSION_SECRET || "gpc-2026-session-secret-x7f2-cambiami-in-produzione";
const firmaCodice = (id: string) => createHmac("sha256", SEGRETO).update(`offerta:${id}`).digest("hex").slice(0, 20);

/** Codice da mettere nel link: id dell'offerta + firma (nessuno può aprire le offerte degli altri cambiando l'id). */
export const codiceOfferta = (id: string) => `${id}.${firmaCodice(id)}`;
export const linkOfferta = (base: string, id: string) => `${base.replace(/\/$/, "")}/offerta/${codiceOfferta(id)}`;

export function leggiCodiceOfferta(codice: string): string | null {
  const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{20})$/.exec(decodeURIComponent(codice || ""));
  return m && firmaCodice(m[1]) === m[2] ? m[1] : null;
}


// File caricati su una riga dell'offerta (foto del portoncino scelto, PDF da scegliere): il cliente li apre dal link dell'offerta, senza accesso.
const firmaFile = (id: string) => createHmac("sha256", SEGRETO).update(`file-riga:${id}`).digest("hex").slice(0, 20);
export const codiceFileRiga = (id: string) => `${id}.${firmaFile(id)}`;
export function leggiCodiceFileRiga(codice: string): string | null {
  const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{20})$/.exec(decodeURIComponent(codice || ""));
  return m && firmaFile(m[1]) === m[2] ? m[1] : null;
}

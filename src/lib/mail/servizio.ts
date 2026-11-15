// Servizio di invio per campagne ed email automatiche ai clienti (Brevo, richiesta di Ugo 15/11/2026: l'hosting della posta
// aziendale ha bloccato gli invii massivi). Le email «una a una» (offerte, risposte, avvisi agli uffici) restano sulle caselle
// aziendali; campagne ed email automatiche ai clienti partono dal servizio, se è collegato (Impostazioni › Email automatiche).
// Rimbalzi, disiscrizioni e segnalazioni di spam arrivano da Brevo con un webhook (rotta /api/brevo/eventi?k=<chiave>).
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { cifra, decifra, type Casella } from "./caselle";

export const CHIAVI_SERVIZIO = { host: "servizio_host", porta: "servizio_porta", utente: "servizio_utente", chiave: "servizio_chiave", webhook: "servizio_webhook" } as const;
export const HOST_BREVO = "smtp-relay.brevo.com";
export const PORTA_BREVO = 587;

/** La casella del servizio di invio (Brevo), o null se non è collegato. */
export async function servizioInvio(): Promise<(Casella & { servizio: true }) | null> {
  const r = Object.fromEntries((await prisma.configurazione.findMany({ where: { chiave: { in: Object.values(CHIAVI_SERVIZIO) } } })).map((c) => [c.chiave, c.valore]));
  const chiave = decifra(r[CHIAVI_SERVIZIO.chiave]);
  if (!r[CHIAVI_SERVIZIO.utente] || !chiave) return null;
  return { host: r[CHIAVI_SERVIZIO.host] || HOST_BREVO, porta: Number(r[CHIAVI_SERVIZIO.porta]) || PORTA_BREVO, sicura: false, utente: r[CHIAVI_SERVIZIO.utente], password: chiave, mittente: r[CHIAVI_SERVIZIO.utente], servizio: true };
}

export async function salvaServizio(utente: string, chiave: string | null, host?: string | null, porta?: number | null) {
  const scrivi = (k: string, valore: string) => prisma.configurazione.upsert({ where: { chiave: k }, update: { valore }, create: { chiave: k, valore } });
  await scrivi(CHIAVI_SERVIZIO.utente, utente.trim());
  await scrivi(CHIAVI_SERVIZIO.host, host?.trim() || HOST_BREVO);
  await scrivi(CHIAVI_SERVIZIO.porta, String(porta || PORTA_BREVO));
  if (chiave) await scrivi(CHIAVI_SERVIZIO.chiave, cifra(chiave.trim()));
  await chiaveWebhook();
}

export async function scollegaServizio() {
  await prisma.configurazione.deleteMany({ where: { chiave: { in: [CHIAVI_SERVIZIO.utente, CHIAVI_SERVIZIO.chiave] } } });
}

/** Chiave segreta dell'indirizzo del webhook (creata la prima volta). */
export async function chiaveWebhook(): Promise<string> {
  const c = await prisma.configurazione.findUnique({ where: { chiave: CHIAVI_SERVIZIO.webhook } });
  if (c?.valore) return c.valore;
  const valore = randomBytes(18).toString("base64url");
  await prisma.configurazione.upsert({ where: { chiave: CHIAVI_SERVIZIO.webhook }, update: {}, create: { chiave: CHIAVI_SERVIZIO.webhook, valore } });
  return (await prisma.configurazione.findUnique({ where: { chiave: CHIAVI_SERVIZIO.webhook } }))!.valore;
}

// Email più ricche e tracciate (richiesta del Marketing): preheader, template HTML, aperture e clic.
// - Apertura: un'immagine invisibile 1×1 (/api/traccia/<codice>); conta quando il programma di posta mostra le immagini
//   (Gmail le mostra quasi sempre, Outlook e Apple Mail a volte no o le precaricano: il dato è indicativo, come in ogni gestionale).
// - Clic: i link passano da /api/traccia/<codice>?u=<link> e poi aprono la pagina vera.
// Il codice è "c-<id invio campagna>" o "l-<id email lead>", firmato: nessuno può falsare i conteggi.
// Funzioni pure, testate in tests/mail/tracciamento.test.ts.
import { createHmac } from "crypto";

const SEGRETO = process.env.SESSION_SECRET || "gpc-2026-session-secret-x7f2-cambiami-in-produzione";
const firma = (codice: string) => createHmac("sha256", SEGRETO).update(`traccia:${codice}`).digest("hex").slice(0, 16);

export const codiceFirmato = (codice: string) => `${codice}.${firma(codice)}`;

/** "c-abc.firma" → { tipo: "c", id: "abc" } se la firma è giusta, altrimenti null. */
export function leggiCodice(s: string): { tipo: "c" | "l"; id: string } | null {
  const m = /^([cl])-([A-Za-z0-9_-]{6,40})\.([0-9a-f]{16})$/.exec(s);
  if (!m || firma(`${m[1]}-${m[2]}`) !== m[3]) return null;
  return { tipo: m[1] as "c" | "l", id: m[2] };
}

export const linkApertura = (base: string, codice: string) => `${base}/api/traccia/${codiceFirmato(codice)}`;
export const linkClic = (base: string, codice: string, url: string) => `${base}/api/traccia/${codiceFirmato(codice)}?u=${encodeURIComponent(url)}`;

/** Link che si possono seguire dal clic: solo pagine web (niente javascript:, data:, ecc.). */
export const linkSicuro = (u: string | null | undefined) => !!u && /^https?:\/\/[^\s]+$/i.test(u);

/**
 * Aggiunge il tracciamento all'HTML: i link web passano dal contatore dei clic (non quello per disiscriversi,
 * né mailto: o tel:), l'immagine invisibile in fondo conta l'apertura.
 */
export function conTracciamento(html: string, base: string, codice: string): string {
  const conLink = html.replace(/href=(["'])(https?:\/\/[^"']+)\1/gi, (tutto, q: string, url: string) =>
    /\/api\/disiscrizione|\/api\/traccia\//.test(url) ? tutto : `href=${q}${linkClic(base, codice, url.replace(/&amp;/g, "&"))}${q}`);
  const pixel = `<img src="${linkApertura(base, codice)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  return /<\/body>/i.test(conLink) ? conLink.replace(/<\/body>/i, `${pixel}</body>`) : `${conLink}${pixel}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Il preheader: il testo che i programmi di posta mostrano accanto all'oggetto, nascosto nel corpo dell'email. */
export function conPreheader(html: string, preheader: string | null | undefined): string {
  const p = (preheader ?? "").trim();
  if (!p) return html;
  // gli spazi invisibili dopo il testo evitano che il programma di posta mostri l'inizio dell'email
  const div = `<div style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(p)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (b) => `${b}${div}`) : `${div}${html}`;
}

/** Versione di solo testo di un template HTML (per i programmi che non mostrano l'HTML). */
export function testoDaHtml(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a [^>]*href=(["'])(https?:\/\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi, (_t, _q, url, txt) => `${txt.replace(/<[^>]+>/g, "").trim()} (${url})`)
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Il template HTML incollato: se manca il link per disiscriversi ({disiscrizione}), lo aggiunge in fondo (obbligatorio). */
export function htmlCampagna(template: string, linkDisiscrizione: string): string {
  if (/\{\s*disiscrizione\s*\}/i.test(template)) return template.replace(/\{\s*disiscrizione\s*\}/gi, linkDisiscrizione);
  const piede = `<p style="font-size:11px;color:#888;text-align:center;margin:24px 0">Non vuoi più ricevere le nostre email? <a href="${linkDisiscrizione}" style="color:#888">Disiscriviti</a>.</p>`;
  return /<\/body>/i.test(template) ? template.replace(/<\/body>/i, `${piede}</body>`) : `${template}${piede}`;
}

// Funzioni pure sull'HTML delle email, senza dipendenze dal server (si usano anche nell'anteprima nel browser).

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

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Un valore di testo dentro un template HTML: caratteri speciali protetti e righe a capo come <br>. */
export const testoInHtml = (s: string) => escHtml(s).replace(/\n/g, "<br>");

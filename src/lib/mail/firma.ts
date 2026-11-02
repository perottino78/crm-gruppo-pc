// Firme email dei colleghi e email "Invia offerta" (come in BConsole: ogni utente ha la sua firma).
// La firma si scrive a righe (nome, ruolo, telefono, sito…): il CRM la impagina con il colore del marchio e rende
// cliccabili email, telefoni e siti. Chi ha già una firma fatta (es. da Outlook) può incollarla in HTML.
// Funzioni pure, testate in tests/mail/firma.test.ts.

export const AZIENDA = {
  nome: "Gruppo P&C",
  telefono: "011 19887497",
  indirizzo: "Corso Moncenisio 28, 10090 Rosta (TO)",
  sito: "www.gruppopec.com",
};

const QUALIFICHE: Record<string, string> = {
  COMMERCIALE: "Consulente commerciale",
  TELEFONISTA: "Ufficio clienti",
  MARKETING: "Ufficio marketing",
  TECNICO: "Ufficio tecnico",
  AMMINISTRATIVO: "Amministrazione",
  AMMINISTRATORE: "Direzione",
  POSATORE: "Posa e installazione",
  FATTURAZIONE: "Ufficio fatturazione",
  ORDINI: "Ufficio ordini",
  MAGAZZINO: "Magazzino",
  POSA: "Posa e installazione",
  AMMINISTRAZIONE: "Amministrazione",
};

export type DatiFirma = { nome: string; ruolo?: string | null; ufficio?: string | null; telefono?: string | null; email?: string | null };

/** Qualifica da mettere sotto il nome: dall'ufficio, se c'è, altrimenti dal ruolo. */
export function qualifica(u: Pick<DatiFirma, "ruolo" | "ufficio">): string {
  return (u.ufficio && QUALIFICHE[u.ufficio]) || (u.ruolo && QUALIFICHE[u.ruolo]) || "";
}

/** La firma pronta, fatta con i dati della scheda dell'utente (si può poi cambiare a mano). */
export function firmaPredefinita(u: DatiFirma, marchio?: string | null): string {
  const righe = [
    u.nome,
    qualifica(u),
    marchio && marchio !== "P&C" ? `${AZIENDA.nome} · ${marchio}` : AZIENDA.nome,
    u.telefono ? `Cell. ${u.telefono}` : "",
    `Tel. ${AZIENDA.telefono}`,
    u.email ?? "",
    AZIENDA.sito,
    AZIENDA.indirizzo,
  ];
  return righe.map((r) => r.trim()).filter(Boolean).join("\n");
}

/** La firma da usare: quella salvata o, se vuota, quella pronta. */
export const firmaDi = (u: DatiFirma & { firmaEmail?: string | null }, marchio?: string | null) =>
  u.firmaEmail?.trim() ? u.firmaEmail.trim() : firmaPredefinita(u, marchio);

export const eHtml = (s: string) => /^\s*</.test(s) && /<\/?[a-z][\s\S]*>/i.test(s);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Una riga della firma con email, siti e telefoni cliccabili. */
function rigaCliccabile(riga: string, colore: string): string {
  const stile = `color:${colore};text-decoration:none`;
  const parti = riga.split(/(\b[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+|\+?\d[\d .\/-]{6,}\d)/g);
  return parti.map((p, i) => {
    if (i % 2 === 0) return esc(p);
    if (p.includes("@")) return `<a href="mailto:${esc(p)}" style="${stile}">${esc(p)}</a>`;
    if (/^(https?:\/\/|www\.)/i.test(p)) return `<a href="${esc(/^www\./i.test(p) ? `https://${p}` : p)}" style="${stile}">${esc(p)}</a>`;
    return `<a href="tel:${p.replace(/[^\d+]/g, "")}" style="color:inherit;text-decoration:none">${esc(p)}</a>`;
  }).join("");
}

/** La firma in HTML: prima riga (nome) in grassetto, seconda (qualifica) in grigio, barra del colore del marchio. */
export function firmaHtml(firma: string, opz: { colore?: string; logo?: string | null } = {}): string {
  const colore = opz.colore || "#EA580C";
  if (eHtml(firma)) return firma;
  const righe = firma.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  if (!righe.length) return "";
  const [nome, secondo, ...resto] = righe;
  const corpo = [
    `<div style="font-size:15px;font-weight:bold;color:#171717">${esc(nome)}</div>`,
    secondo ? `<div style="font-size:13px;color:#525252;margin-bottom:6px">${rigaCliccabile(secondo, colore)}</div>` : "",
    ...resto.map((r) => `<div style="font-size:12px;color:#404040;line-height:1.5">${rigaCliccabile(r, colore)}</div>`),
  ].join("");
  const logo = opz.logo ? `<td style="padding-right:14px;vertical-align:top"><img src="${esc(opz.logo)}" alt="" width="90" style="display:block;max-width:90px;height:auto"></td>` : "";
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;border-left:3px solid ${colore};padding-left:12px"><tr>${logo}<td style="vertical-align:top">${corpo}</td></tr></table>`;
}

/** La firma in testo semplice (per i programmi di posta che non mostrano l'HTML). */
export function firmaTesto(firma: string): string {
  if (!eHtml(firma)) return firma.trim();
  return firma.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .split("\n").map((r) => r.trim()).filter(Boolean).join("\n");
}

// ---------- Email "Invia offerta" ----------

/** Testo di partenza dell'email dell'offerta (il commerciale lo cambia come vuole). */
export function testoOffertaPredefinito(o: { cliente: string; numero: string; oggetto?: string | null; nomePersona?: string | null }): string {
  const saluto = o.nomePersona?.trim() ? `Gentile ${o.nomePersona.trim()},` : `Gentile ${o.cliente},`;
  const per = o.oggetto?.trim() ? ` per ${o.oggetto.trim().replace(/\.$/, "")}` : "";
  return `${saluto}\n\ncome d'accordo le invio la nostra offerta n. ${o.numero}${per}.\n\nResto a disposizione per qualsiasi chiarimento o per fissare un nuovo incontro.\n\nCordiali saluti`;
}

export const oggettoOffertaPredefinito = (numero: string, marchio?: string | null) =>
  `Offerta n. ${numero} — ${marchio && marchio !== "Tutti" ? (marchio === "P&C" ? AZIENDA.nome : `${marchio} · ${AZIENDA.nome}`) : AZIENDA.nome}`;

/** Compone l'email: testo, pulsante per vedere l'offerta (se c'è il link) e firma. */
export function emailOfferta(e: { testo: string; firma: string; link?: string | null; colore?: string; logo?: string | null }): { testo: string; html: string } {
  const colore = e.colore || "#EA580C";
  const paragrafi = e.testo.trim().split(/\r?\n\s*\r?\n/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\r?\n/g, "<br>")}</p>`).join("");
  const pulsante = e.link
    ? `<p style="margin:6px 0 22px"><a href="${esc(e.link)}" style="display:inline-block;background:${colore};color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:8px">📄 Vedi e scarica l'offerta</a></p>`
    : "";
  const firma = firmaHtml(e.firma, { colore, logo: e.logo });
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff"><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#171717;max-width:640px;padding:16px">${paragrafi}${pulsante}${firma ? `<div style="margin-top:18px">${firma}</div>` : ""}</div></body></html>`;
  const testo = [e.testo.trim(), e.link ? `Vedi e scarica l'offerta: ${e.link}` : "", e.firma.trim() ? `-- \n${firmaTesto(e.firma)}` : ""].filter(Boolean).join("\n\n");
  return { testo, html };
}

/** Elenco di indirizzi scritti a mano ("a@b.it, c@d.it; e@f.it") → solo quelli validi, senza doppioni. */
export function indirizzi(s: string | null | undefined): string[] {
  return [...new Set((s ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x)))];
}

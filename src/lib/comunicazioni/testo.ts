// Comunicazioni interne al team (amministratore e marketing): testo con segnaposto, email in HTML, password provvisorie,
// gruppi di destinatari e modelli pronti (es. invito a P&C ONE). Funzioni pure, testate in tests/comunicazioni/comunicazioni.test.ts.

export const SEGNAPOSTO_COMUNICAZIONI: [string, string][] = [
  ["nome", "nome della persona (solo il nome)"],
  ["nome_completo", "nome e cognome"],
  ["username", "nome utente per entrare nel CRM"],
  ["password", "password provvisoria nuova (solo se scegli di generarla)"],
  ["email", "email di lavoro"],
  ["link", "indirizzo del CRM"],
];

export type Destinatario = { id: string; nome: string; email: string; username: string | null; ruolo: string; ufficio: string | null };

/** Sostituisce i segnaposto {nome}, {username}… (quelli sconosciuti restano come sono). */
export function riempi(testo: string, valori: Record<string, string | null | undefined>): string {
  return testo.replace(/\{([a-z_]+)\}/g, (tutto, k: string) => (k in valori ? valori[k] ?? "" : tutto));
}

export function valoriPer(d: Destinatario, opz: { link: string; password?: string | null }): Record<string, string> {
  return {
    nome: d.nome.trim().split(/\s+/)[0] ?? d.nome, nome_completo: d.nome, username: d.username ?? "(chiedi all'amministratore)",
    email: d.email, link: opz.link, password: opz.password ?? "(la tua password di sempre)",
  };
}

export const usaPassword = (testo: string) => /\{password\}/.test(testo);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Testo → HTML: paragrafi, a capo, **grassetto**, righe che iniziano con "- " come elenco, link cliccabili. */
export function htmlDaTesto(testo: string): string {
  const riga = (r: string) => esc(r)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#ea580c">$1</a>');
  const punto = /^\s*[-•]\s+/;
  return testo.trim().split(/\r?\n\s*\r?\n/).map((blocco) => {
    // nel blocco le righe normali vanno a capo, quelle che iniziano con "- " diventano un elenco puntato
    let out = "", righe: string[] = [], voci: string[] = [];
    const chiudi = () => {
      if (righe.length) out += `<p style="margin:0 0 ${voci.length ? 4 : 14}px">${righe.map(riga).join("<br>")}</p>`;
      righe = [];
    };
    const chiudiElenco = () => {
      if (voci.length) out += `<ul style="margin:0 0 14px;padding-left:20px;list-style:disc">${voci.map((v) => `<li>${riga(v)}</li>`).join("")}</ul>`;
      voci = [];
    };
    for (const r of blocco.split(/\r?\n/)) {
      if (punto.test(r)) { if (righe.length) { const t = righe; righe = []; out += `<p style="margin:0 0 4px">${t.map(riga).join("<br>")}</p>`; } voci.push(r.replace(punto, "")); }
      else { chiudiElenco(); righe.push(r); }
    }
    chiudi(); chiudiElenco();
    return out;
  }).join("");
}

/** L'email completa: intestazione P&C ONE, testo e firma di chi manda. */
export function emailComunicazione(e: { testo: string; firmaHtml?: string; firmaTesto?: string }): { html: string; testo: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4"><div style="max-width:640px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1c1917">`
    + `<div style="padding:14px 20px;border-bottom:3px solid #ea580c"><b style="font-size:17px">P&amp;C <span style="color:#ea580c">ONE</span></b> <span style="color:#78716c;font-size:12px">· comunicazione interna Gruppo P&amp;C</span></div>`
    + `<div style="padding:18px 20px">${htmlDaTesto(e.testo)}${e.firmaHtml ? `<div style="margin-top:18px">${e.firmaHtml}</div>` : ""}</div></div></body></html>`;
  const testo = [e.testo.trim(), e.firmaTesto ? `-- \n${e.firmaTesto}` : ""].filter(Boolean).join("\n\n").replace(/\*\*(.+?)\*\*/g, "$1");
  return { html, testo };
}

// ---------- gruppi di destinatari ----------

export const GRUPPI: { chiave: string; nome: string; prende: (d: Pick<Destinatario, "ruolo" | "ufficio">) => boolean }[] = [
  { chiave: "tutti", nome: "Tutto il team", prende: () => true },
  { chiave: "commerciali", nome: "Commerciali", prende: (d) => d.ruolo === "COMMERCIALE" || d.ufficio === "COMMERCIALE" },
  { chiave: "telefoniste", nome: "Telefoniste", prende: (d) => d.ruolo === "TELEFONISTA" },
  { chiave: "ufficio", nome: "Uffici (amministrazione, fatturazione, ordini)", prende: (d) => ["AMMINISTRATIVO"].includes(d.ruolo) || ["FATTURAZIONE", "AMMINISTRAZIONE", "ORDINI", "MAGAZZINO"].includes(d.ufficio ?? "") },
  { chiave: "tecnici", nome: "Tecnici e posatori", prende: (d) => ["TECNICO", "POSATORE"].includes(d.ruolo) || ["TECNICO", "POSA"].includes(d.ufficio ?? "") },
  { chiave: "marketing", nome: "Marketing", prende: (d) => d.ruolo === "MARKETING" || d.ufficio === "MARKETING" },
];

// ---------- modelli pronti ----------

export const MODELLI_COMUNICAZIONE: { chiave: string; nome: string; oggetto: string; testo: string; task?: string; password?: boolean }[] = [
  {
    chiave: "invito",
    nome: "Invito a scaricare P&C ONE",
    oggetto: "Benvenuto in P&C ONE, il nostro nuovo gestionale: scaricalo e inizia a provarlo",
    password: true,
    task: "Installa P&C ONE e fai il primo accesso",
    testo: `Ciao {nome},

da oggi parte la prova di **P&C ONE**, il nuovo gestionale di Gruppo P&C costruito su misura per noi: clienti, offerte, calendario, pratiche e contatti in un unico posto. «Tutto il Gruppo, in un clic.»

Ti chiedo di installarlo oggi stesso e di iniziare a usarlo nel lavoro di tutti i giorni.

**1. Entra**
- Indirizzo: {link}
- Nome utente: **{username}**
- Password provvisoria: **{password}**

Al primo accesso ti chiede di scegliere una password tua.

**2. Installalo come app (30 secondi)**
- Computer (Chrome o Edge): apri l'indirizzo e clicca l'icona «Installa» a destra nella barra dell'indirizzo (oppure ⋮ › «Installa P&C ONE»).
- iPhone: apri l'indirizzo con Safari › tasto Condividi (quadrato con la freccia) › «Aggiungi alla schermata Home».
- Android: apri l'indirizzo con Chrome › tre puntini › «Installa app».

Comparirà l'icona arancione con il simbolo di accensione: da lì si apre come una normale app.

**3. Le prime cose da fare**
- Profilo: controlla il tuo cellulare e la tua firma email (va in fondo alle email che mandi dal CRM).
- Calendario › «Su Google / telefono»: collega il calendario al telefono, così gli appuntamenti ti arrivano anche lì.
- Commerciali: prova a fare un'offerta e a mandarla al cliente con «Invia offerta»; in «Contratti e provvigioni» trovi i tuoi contratti, i pagamenti dei clienti e le provvigioni.
- Telefoniste: il vostro lavoro è in «Lead da lavorare» (c'è la guida stampata).

**4. È una prova: aiutaci a migliorarlo**
In queste settimane BConsole resta attivo come sempre: P&C ONE si usa in parallelo. Se trovi qualcosa che non funziona, che non è chiaro o che manca, rispondi a questa email (meglio con una foto dello schermo): lo sistemiamo in fretta.

Grazie a tutti, conto su di voi!`,
  },
  { chiave: "libero", nome: "Messaggio libero", oggetto: "", testo: "Ciao {nome},\n\n" },
];

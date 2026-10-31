// Testi delle email del percorso lead, ripresi dal catalogo Keap ripulito (E-01, E-02, E-03, E-09…E-13).
// Ogni modello ha chiave e versione: se si cambia un testo si alza la versione, il registro conserva quella inviata.
// Funzioni pure: testabili senza database.

export const CONTATTI = {
  telefonoUfficio: process.env.TELEFONO_UFFICIO || "011 19887497",
  cellulariUfficio: process.env.CELLULARI_UFFICIO || "392 7431645 / 327 7222576",
  mittenteClienti: process.env.MAIL_FROM_CLIENTI || "Promozionale P&C <promozionale@gruppopec.com>",
  mittenteInterne: process.env.MAIL_FROM_INTERNE || "Rocco Zaccaro <marketing@gruppopec.com>",
  centralino: process.env.MAIL_CENTRALINO || "promozionale@gruppopec.com",
};

export type DatiLeadEmail = {
  nome: string;
  telefono?: string | null;
  email?: string | null;
  comune?: string | null;
  cap?: string | null;
  prodotto?: string | null;
  fonte?: string | null;
  marchio?: string | null;
  richiamoIl?: Date | null;
};

export type Link = { lead: string; disiscrizione?: string };
export type Modello = { chiave: string; versione: number; categoria: "CLIENTE" | "INTERNA" };
export type EmailPronta = Modello & { oggetto: string; testo: string };

export const nomeProprio = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

const dataOra = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Riepilogo del contatto: le righe senza dato si omettono (niente segnaposto vuoti). */
export function riepilogoContatto(d: DatiLeadEmail): string {
  return [
    `Nome e cognome: ${d.nome}`,
    d.telefono && `Telefono: ${d.telefono}`,
    d.email && `Email: ${d.email}`,
    d.comune && `Città: ${d.comune}`,
    d.cap && `CAP: ${d.cap}`,
  ].filter(Boolean).join("\n");
}

function riepilogoRichiesta(d: DatiLeadEmail): string {
  return [d.fonte && `Fonte: ${d.fonte}`, d.marchio && `Marchio: ${d.marchio}`, d.prodotto && `Prodotto: ${d.prodotto}`].filter(Boolean).join("\n");
}

const firmaInterna = "Grazie,\nIl tuo assistente virtuale";
const firmaCliente = "A presto,\nGruppo P&C";

/** Varianti della chiamata al centralino (E-10) e dei solleciti (E-12): stesso modello, contesto diverso. */
const CONTESTO_CHIAMATA: Record<string, { oggetto: string; frase: string }> = {
  "initial-prequalification": { oggetto: "Contatto in target da chiamare", frase: "chiama il contatto in target per fissare il primo appuntamento." },
  "scheduled-first-contact": { oggetto: "Richiama il contatto interessato", frase: "richiama il contatto che durante la prima chiamata ha chiesto di essere ricontattato per fissare l'appuntamento." },
  "call-unanswered-reminder": { oggetto: "Richiama il contatto", frase: "richiama il contatto che non ha ancora risposto alle telefonate e cerca di fissare un appuntamento." },
};

export const MODELLI: Record<string, Modello> = {
  "qualification-requested": { chiave: "qualification-requested", versione: 1, categoria: "INTERNA" },
  "request-received": { chiave: "request-received", versione: 1, categoria: "CLIENTE" },
  "region-not-served": { chiave: "region-not-served", versione: 1, categoria: "CLIENTE" },
  "callback-confirmed": { chiave: "callback-confirmed", versione: 1, categoria: "CLIENTE" },
  "call-requested": { chiave: "call-requested", versione: 1, categoria: "INTERNA" },
  "call-unanswered-contact": { chiave: "call-unanswered-contact", versione: 1, categoria: "CLIENTE" },
  "interest-closed": { chiave: "interest-closed", versione: 1, categoria: "CLIENTE" },
};

/** Compone l'email del modello `chiave` per il lead. `variante` serve alle chiamate al centralino. */
export function componiEmail(chiave: string, d: DatiLeadEmail, link: Link, variante?: string): EmailPronta {
  const m = MODELLI[chiave];
  if (!m) throw new Error(`Modello email sconosciuto: ${chiave}`);
  const ciao = `Ciao ${nomeProprio(d.nome)},`;
  const contatto = riepilogoContatto(d);
  const richiesta = riepilogoRichiesta(d);
  const blocco = (...p: (string | null | undefined | false)[]) => p.filter(Boolean).join("\n\n");
  switch (chiave) {
    case "qualification-requested":
      return { ...m, oggetto: `[CRM P&C] Nuovo contatto ${d.fonte ?? ""} da classificare — ${d.nome}`.replace(/\s+/g, " "), testo: blocco(
        "Ciao Centralino P&C,", `abbiamo acquisito una nuova richiesta${d.fonte ? ` da ${d.fonte}` : ""}.`, contatto, richiesta,
        "Apri il lead e scegli uno dei due esiti:\n- In Target\n- Fuori Regione", `Apri il lead: ${link.lead}`, firmaInterna) };
    case "request-received":
      return { ...m, oggetto: "GRUPPO P&C: Grazie per la tua richiesta!", testo: blocco(
        ciao, "grazie per l'interesse nei nostri prodotti. Questi sono i dati che ci hai comunicato:",
        [contatto, d.prodotto && `Prodotto di interesse: ${d.prodotto}`].filter(Boolean).join("\n"),
        "Se noti qualche errore, rispondi gentilmente a questa email indicando i dati corretti.",
        "Verrai contattato dal nostro ufficio per fissare un appuntamento con un nostro consulente tecnico, che ti offrirà una consulenza gratuita e ti invierà un preventivo senza impegno.",
        `Per maggiori informazioni puoi contattarci al numero ${CONTATTI.telefonoUfficio}: il nostro personale sarà lieto di rispondere a tutte le tue domande.`, firmaCliente) };
    case "region-not-served":
      return { ...m, oggetto: "GRUPPO P&C: Ci spiace ma non serviamo ancora la tua regione", testo: blocco(
        ciao, "ti ringraziamo per averci contattato e per l'interesse dimostrato verso i nostri servizi. Al momento stiamo ampliando la nostra rete di copertura, ma purtroppo non siamo ancora operativi nella tua regione.",
        "Stiamo lavorando con impegno per riuscire a servire ogni area d'Italia nel minor tempo possibile e speriamo di poterti presto supportare nelle tue esigenze.",
        "Grazie ancora per la fiducia e a presto!", "Cordiali saluti,\nGruppo P&C") };
    case "callback-confirmed":
      return { ...m, oggetto: "GRUPPO P&C: Ti ricontatteremo per fissare l'appuntamento", testo: blocco(
        ciao, "grazie per l'interesse nei nostri prodotti. Durante la prima chiamata non abbiamo ancora fissato un appuntamento e ci hai chiesto di ricontattarti.",
        `Proveremo a contattarti nella data che ci hai indicato, ${d.richiamoIl ? dataOra(d.richiamoIl) : "concordata"}, ${d.telefono ? `al numero ${d.telefono}, ` : ""}utilizzando il nostro numero fisso ${CONTATTI.telefonoUfficio} oppure uno dei nostri numeri mobili ${CONTATTI.cellulariUfficio}.`,
        "Se il numero non fosse corretto, rispondi a questa email o chiamaci per comunicarci quello esatto. Se hai preferenze riguardo a giorni o fasce orarie, faccelo sapere.",
        "Ti auguriamo una buona giornata!", firmaCliente) };
    case "call-requested": {
      const c = CONTESTO_CHIAMATA[variante ?? "initial-prequalification"] ?? CONTESTO_CHIAMATA["initial-prequalification"];
      return { ...m, oggetto: `[CRM P&C] ${c.oggetto} — ${d.nome}`, testo: blocco(
        "Ciao Centralino P&C,", c.frase, contatto, richiesta,
        variante === "scheduled-first-contact" && d.richiamoIl ? `Ricontatto concordato: ${dataOra(d.richiamoIl)}` : null,
        `Apri il lead e registra l'esito della telefonata: ${link.lead}`,
        "Se emergono dettagli utili al venditore, inseriscili nelle note del lead.", firmaInterna) };
    }
    case "call-unanswered-contact":
      return { ...m, oggetto: "GRUPPO P&C: Abbiamo provato a chiamarti", testo: blocco(
        ciao, "abbiamo provato a chiamarti, ma non siamo riusciti a rintracciarti. Probabilmente ti abbiamo contattato in un momento in cui non potevi rispondere.",
        `Proveremo di nuovo${d.telefono ? ` al numero che ci hai lasciato, ${d.telefono},` : ""} utilizzando il nostro numero fisso ${CONTATTI.telefonoUfficio} oppure i numeri mobili ${CONTATTI.cellulariUfficio}.`,
        "Se il numero non è corretto, rispondi a questa email o chiamaci per comunicarci quello esatto. Puoi anche indicarci i giorni o le fasce orarie in cui preferisci essere contattato.", firmaCliente) };
    case "interest-closed":
      return { ...m, oggetto: "GRUPPO P&C: Restiamo in contatto per future opportunità", testo: blocco(
        ciao, "grazie per il tempo che ci hai dedicato e per aver valutato i nostri prodotti. Ci dispiace che al momento non siano di tuo interesse, ma comprendiamo che le esigenze possono cambiare.",
        "Nel frattempo restiamo a disposizione per qualsiasi richiesta o informazione.", "Ti auguriamo una buona giornata,\nGruppo P&C") };
  }
  throw new Error(`Modello email senza testo: ${chiave}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Versione HTML: fascia arancione P&C, testo con i link cliccabili, piè di pagina con la disiscrizione per i clienti. */
export function htmlEmail(e: EmailPronta, link: Link): string {
  const corpo = esc(e.testo).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#c2410c">$1</a>').replace(/\n/g, "<br>");
  const piede = e.categoria === "CLIENTE" && link.disiscrizione
    ? `<p style="font-size:11px;color:#888;margin-top:24px">Hai ricevuto questa email perché hai chiesto informazioni a Gruppo P&amp;C. <a href="${esc(link.disiscrizione)}" style="color:#888">Non voglio più ricevere email</a>.</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff">
<div style="background:#ea580c;color:#fff;padding:16px 24px;font-size:20px;font-weight:bold">Gruppo P&amp;C</div>
<div style="padding:24px;font-size:15px;line-height:1.55;color:#1c1917">${corpo}${piede}</div>
</div></body></html>`;
}

/** Testo semplice con la riga di disiscrizione (per i programmi di posta che non mostrano l'HTML). */
export function testoEmail(e: EmailPronta, link: Link): string {
  return e.categoria === "CLIENTE" && link.disiscrizione ? `${e.testo}\n\n—\nNon vuoi più ricevere email? ${link.disiscrizione}` : e.testo;
}

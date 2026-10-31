// Testi delle email del percorso lead, ripresi dal catalogo Keap ripulito (E-01…E-15) più le lettere di vendita
// scritte con Ugo (Fase 2) da mandare fra la conferma dell'appuntamento e il promemoria.
// Ogni modello ha chiave e versione: se si cambia un testo si alza la versione, il registro conserva quella inviata.
// Funzioni pure: testabili senza database.

export const CONTATTI = {
  telefonoUfficio: process.env.TELEFONO_UFFICIO || "011 19887497",
  cellulariUfficio: process.env.CELLULARI_UFFICIO || "392 7431645 / 327 7222576",
  mittenteClienti: process.env.MAIL_FROM_CLIENTI || "Promozionale P&C <promozionale@gruppopec.com>",
  mittenteInterne: process.env.MAIL_FROM_INTERNE || "Rocco Zaccaro <marketing@gruppopec.com>",
  centralino: process.env.MAIL_CENTRALINO || "promozionale@gruppopec.com",
  showroom: process.env.INDIRIZZO_SHOWROOM || "Corso Moncenisio 28, 10090 Rosta (TO)",
  sito: process.env.SITO_URL || "https://gruppopec.com",
  // pagina con le recensioni dei clienti (lettera 3)
  recensioni: process.env.RECENSIONI_URL || "https://gruppopec.com/recensioni/",
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
  appuntamentoIl?: Date | null;
  indirizzoAppuntamento?: string | null;
  note?: string | null;
  venditore?: { nome: string; telefono?: string | null; email?: string | null } | null;
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

/** Riepilogo dell'appuntamento: data, luogo, venditore. */
export function riepilogoAppuntamento(d: DatiLeadEmail, luogo?: string): string {
  return [
    d.appuntamentoIl && `Data e ora: ${dataOra(d.appuntamentoIl)}`,
    luogo === "SHOWROOM" ? `Luogo: showroom, ${CONTATTI.showroom}` : d.indirizzoAppuntamento && `Luogo: a casa del cliente, ${d.indirizzoAppuntamento}`,
    d.venditore && `Venditore: ${d.venditore.nome}`,
  ].filter(Boolean).join("\n");
}

/** Il sabato o a ufficio chiuso il cliente può chiamare direttamente il suo consulente: telefono ed email, se ci sono. */
export function contattiConsulente(d: DatiLeadEmail): string | null {
  const v = d.venditore;
  if (!v) return null;
  const email = v.email && /.+@.+\..+/.test(v.email) && !v.email.endsWith(".invalid") ? v.email : null;
  const recapiti = [v.telefono && `telefono ${v.telefono}`, email && `email ${email}`].filter(Boolean).join(", ");
  return recapiti ? `Il sabato o quando il nostro ufficio è chiuso puoi contattare direttamente il tuo consulente ${v.nome}: ${recapiti}.` : null;
}

/** Marchio delle lettere di vendita: Solaris e Purafonte hanno la loro versione, tutto il resto è P&C. */
export const famigliaLettere = (marchio?: string | null) => (/solaris/i.test(marchio ?? "") ? "SOLARIS" : /pura/i.test(marchio ?? "") ? "PURAFONTE" : "PC");

const firmaInterna = "Grazie,\nIl tuo assistente virtuale";
const firmaCliente = "A presto,\nGruppo P&C";

/** Varianti della chiamata al centralino (E-10) e dei solleciti (E-12): stesso modello, contesto diverso. */
const CONTESTO_CHIAMATA: Record<string, { oggetto: string; frase: string }> = {
  "initial-prequalification": { oggetto: "Contatto in target da chiamare", frase: "chiama il contatto in target per fissare il primo appuntamento." },
  "scheduled-first-contact": { oggetto: "Richiama il contatto interessato", frase: "richiama il contatto che durante la prima chiamata ha chiesto di essere ricontattato per fissare l'appuntamento." },
  "call-unanswered-reminder": { oggetto: "Richiama il contatto", frase: "richiama il contatto che non ha ancora risposto alle telefonate e cerca di fissare un appuntamento." },
};

export const MODELLI: Record<string, Modello> = {
  "seller-assignment-requested": { chiave: "seller-assignment-requested", versione: 1, categoria: "INTERNA" },
  "appointment-confirmed-contact": { chiave: "appointment-confirmed-contact", versione: 2, categoria: "CLIENTE" },
  "appointment-confirmed-seller": { chiave: "appointment-confirmed-seller", versione: 1, categoria: "INTERNA" },
  "appointment-reminder-contact": { chiave: "appointment-reminder-contact", versione: 2, categoria: "CLIENTE" },
  "appointment-reminder-seller": { chiave: "appointment-reminder-seller", versione: 1, categoria: "INTERNA" },
  "appointment-cancelled-seller": { chiave: "appointment-cancelled-seller", versione: 1, categoria: "INTERNA" },
  "cancellation-follow-up-requested": { chiave: "cancellation-follow-up-requested", versione: 1, categoria: "INTERNA" },
  "sales-letter-1": { chiave: "sales-letter-1", versione: 1, categoria: "CLIENTE" },
  "sales-letter-2": { chiave: "sales-letter-2", versione: 2, categoria: "CLIENTE" },
  "sales-letter-3": { chiave: "sales-letter-3", versione: 2, categoria: "CLIENTE" },
  "sales-letter-4": { chiave: "sales-letter-4", versione: 2, categoria: "CLIENTE" },
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
    case "seller-assignment-requested":
      return { ...m, oggetto: `[CRM P&C] Venditore da assegnare — ${d.nome}`, testo: blocco(
        "Ciao Centralino P&C,", `è stato fissato un appuntamento ${variante === "SHOWROOM" ? "in showroom" : "a casa del cliente"} per ${d.nome}.`,
        riepilogoAppuntamento(d, variante), contatto, richiesta,
        "Scegli il venditore che effettuerà l'appuntamento: partiranno da sole la conferma al cliente e al venditore e le lettere di presentazione.",
        `Assegna il venditore: ${link.lead}`, firmaInterna) };
    case "appointment-confirmed-contact":
      return { ...m, oggetto: "GRUPPO P&C: Conferma dell'appuntamento", testo: blocco(
        ciao, `ti inviamo la conferma dell'appuntamento con il Gruppo P&C per ${d.appuntamentoIl ? dataOra(d.appuntamentoIl) : "la data concordata"}.`,
        variante === "SHOWROOM" ? `Ti aspettiamo presso il nostro showroom in ${CONTATTI.showroom}.` : `L'incontro si svolgerà presso questo indirizzo: ${d.indirizzoAppuntamento ?? "quello che ci hai indicato"}.`,
        `Il nostro consulente tecnico${d.venditore ? ` ${d.venditore.nome}` : ""}${d.venditore?.telefono ? ` (telefono: ${d.venditore.telefono})` : ""} ti presenterà nel dettaglio le caratteristiche e i vantaggi dei prodotti P&C di tuo interesse. In questa occasione potrai comunicarci tutte le tue necessità e i tuoi desideri.`,
        "Per garantire condizioni più vantaggiose è richiesta la partecipazione di tutti i soggetti interessati all'acquisto durante l'incontro programmato.",
        `Se un imprevisto non ti permette di essere presente nella data o all'ora stabilita, contattaci al numero ${CONTATTI.telefonoUfficio}, così potremo concordare una nuova data o un orario differente.`,
        contattiConsulente(d),
        "Nell'attesa di conoscerti meglio, ti auguriamo una buona giornata!\nGruppo P&C") };
    case "appointment-confirmed-seller":
      return { ...m, oggetto: `[CRM P&C] Nuovo appuntamento ${variante === "SHOWROOM" ? "in showroom" : "a casa"} — ${d.nome} — ${d.appuntamentoIl ? dataOra(d.appuntamentoIl) : ""}`, testo: blocco(
        `Ciao ${d.venditore ? nomeProprio(d.venditore.nome) : ""},`.replace(" ,", ","), `hai un nuovo appuntamento${d.appuntamentoIl ? ` ${dataOra(d.appuntamentoIl)}` : ""}.`,
        riepilogoAppuntamento(d, variante), contatto, richiesta, d.note && `Note utili:\n${d.note}`,
        `Consulta la scheda del contatto prima dell'incontro: ${link.lead}`, "L'appuntamento è già nel tuo calendario del CRM.", firmaInterna) };
    case "appointment-reminder-contact":
      return { ...m, oggetto: `GRUPPO P&C: Ti ricordiamo l'appuntamento di ${d.appuntamentoIl ? dataOra(d.appuntamentoIl) : "domani"}`, testo: blocco(
        ciao, `ti ricordiamo il tuo appuntamento con il Gruppo P&C per ${d.appuntamentoIl ? dataOra(d.appuntamentoIl) : "domani"}.`,
        variante === "SHOWROOM" ? `Ti aspettiamo presso il nostro showroom in ${CONTATTI.showroom}.` : `L'incontro si svolgerà presso questo indirizzo: ${d.indirizzoAppuntamento ?? "quello che ci hai indicato"}.`,
        variante === "SHOWROOM" ? "Durante l'incontro potrai conoscere da vicino le caratteristiche dei prodotti e comunicarci le tue necessità." : "Durante il sopralluogo valuteremo i lavori necessari per preparare un preventivo completo.",
        ["Per sfruttare al meglio l'incontro:", "• è importante la presenza di tutte le persone che decideranno sull'acquisto;",
          famigliaLettere(d.marchio) === "SOLARIS" ? "• tieni a portata di mano le ultime bollette della luce: ci aiutano a calcolare il tuo risparmio;" : "• tieni a portata di mano idee, foto o esempi di ciò che ti piace;",
          "• segnati le domande da farci: rispondiamo a tutto."].join("\n"),
        `Se non potrai essere presente, contattaci al numero ${CONTATTI.telefonoUfficio} per concordare una nuova data o un orario diverso.`,
        contattiConsulente(d), firmaCliente) };
    case "appointment-reminder-seller":
      return { ...m, oggetto: `[CRM P&C] Promemoria appuntamento — ${d.nome} — ${d.appuntamentoIl ? dataOra(d.appuntamentoIl) : ""}`, testo: blocco(
        `Ciao ${d.venditore ? nomeProprio(d.venditore.nome) : ""},`.replace(" ,", ","), `ti ricordiamo l'appuntamento con ${d.nome}${d.appuntamentoIl ? ` ${dataOra(d.appuntamentoIl)}` : ""}.`,
        riepilogoAppuntamento(d, variante), d.note && `Note utili:\n${d.note}`,
        `Per prepararti, consulta i dati della richiesta e le note nella scheda del contatto: ${link.lead}`, "In caso di dubbi contatta l'ufficio.", firmaInterna) };
    case "appointment-cancelled-seller":
      return { ...m, oggetto: `[CRM P&C] Appuntamento annullato — ${d.nome}${d.appuntamentoIl ? ` — ${dataOra(d.appuntamentoIl)}` : ""}`, testo: blocco(
        `Ciao ${d.venditore ? nomeProprio(d.venditore.nome) : ""},`.replace(" ,", ","), `l'appuntamento con ${d.nome}${d.appuntamentoIl ? ` previsto ${dataOra(d.appuntamentoIl)}` : ""} è stato annullato.`,
        "Non è richiesta alcuna operazione da parte tua: l'appuntamento è stato tolto dal tuo calendario.", contatto, `Scheda del contatto: ${link.lead}`, firmaInterna) };
    case "cancellation-follow-up-requested":
      return { ...m, oggetto: `[CRM P&C] Definisci il seguito dell'appuntamento annullato — ${d.nome}`, testo: blocco(
        "Ciao Centralino P&C,", `l'appuntamento con ${d.nome}${d.appuntamentoIl ? ` ${dataOra(d.appuntamentoIl)}` : ""} è stato annullato.`, contatto,
        "Apri il lead e indica il seguito corretto:\n- nuovo appuntamento a casa;\n- nuovo appuntamento in showroom;\n- ricontatto in una data futura;\n- contatto non interessato.",
        `Definisci il seguito: ${link.lead}`, firmaInterna) };
    case "sales-letter-1":
    case "sales-letter-2":
    case "sales-letter-3":
    case "sales-letter-4":
      return { ...m, ...letteraDiVendita(Number(chiave.slice(-1)), d) };
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

/** Le lettere di vendita (Fase 2): presentano l'azienda mentre il cliente aspetta l'appuntamento. */
export function letteraDiVendita(n: number, d: DatiLeadEmail): { oggetto: string; testo: string } {
  const nome = nomeProprio(d.nome);
  const fam = famigliaLettere(d.marchio);
  const firma = "A presto,\nGruppo P&C";
  const p = (...righe: (string | false | null | undefined)[]) => righe.filter(Boolean).join("\n\n");
  const quando = d.appuntamentoIl ? ` Ci vediamo ${dataOra(d.appuntamentoIl)}.` : "";
  const sito = `Intanto puoi conoscerci meglio su ${CONTATTI.sito}`;
  if (n === 1) {
    const cosa = fam === "SOLARIS"
      ? "Con Solaris ti aiutiamo a produrre la tua energia con il fotovoltaico, a scaldare e raffrescare casa con le pompe di calore e a ricaricare la tua auto: meno bolletta, più indipendenza."
      : fam === "PURAFONTE"
        ? "Con Purafonte portiamo nelle case acqua depurata da bere ogni giorno: più benessere per tutta la famiglia e niente più bottiglie di plastica da comprare e portare a casa."
        : "Possiamo seguirti in tutto il progetto, dalla pergola alla porta interna, dal fotovoltaico alla ricarica dell'auto, fino all'acqua depurata da bere ogni giorno.";
    return { oggetto: `${nome}, piacere di conoscerti: ecco chi siamo`, testo: p(
      `Ciao ${nome},`, "grazie per aver fissato l'appuntamento con noi. Prima di incontrarci vogliamo presentarci.",
      "Siamo il Gruppo P&C: da 20 anni lavoriamo sul territorio al fianco delle famiglie che vogliono migliorare la propria casa. Siamo un gruppo di aziende che lavorano insieme, P&C, Solaris, Purafonte e Work & Services: una casa sempre al passo con i tempi, con un unico interlocutore.",
      cosa, `Meno pensieri, più risparmio.${quando}`, sito, firma) };
  }
  if (n === 2) return { oggetto: "Perché tante famiglie scelgono P&C", testo: p(
    `Ciao ${nome},`, "quando si sceglie a chi affidare la propria casa contano tre cose: chi ti consiglia, chi installa e chi resta al tuo fianco dopo.",
    ["• Consulenti tecnici preparati anche sui finanziamenti: il nostro consulente non ti propone solo un prodotto, ti aiuta a trovare la soluzione giusta e, grazie al corso specifico che ha seguito sui finanziamenti, anche il modo migliore per realizzarla.",
      "• Posatori qualificati QF4: i lavori sono eseguiti da posatori con la qualifica professionale QF4 e a fine lavori facciamo un sopralluogo per verificare e certificare il lavoro eseguito.",
      "• Dopo la posa non ti lasciamo solo: ti consegniamo il kit di manutenzione e restiamo il tuo riferimento.",
      "• Un team familiare, sempre presente in ufficio: quando chiami trovi persone che conoscono il tuo progetto."].join("\n"),
    firma) };
  if (n === 3) return { oggetto: "Cosa dicono di noi le famiglie che ci hanno già scelto", testo: p(
    `Ciao ${nome},`, "prima di affidare la propria casa a qualcuno, tutti fanno la stessa cosa: chiedono a chi ci è già passato. Ed è giusto così.",
    "Per questo, a fine posa, andiamo di persona a trovare i nostri clienti: controlliamo insieme il lavoro finito e chiediamo com'è andata. Le loro parole sono la cosa di cui andiamo più fieri.",
    `Qui trovi le loro recensioni, recentissime e tutte di persone vere che abbiamo seguito dal primo incontro fino all'ultimo dettaglio:\n${CONTATTI.recensioni}`,
    "Leggine qualcuna: ritroverai quello che toccherai con mano anche tu, la consulenza senza fretta, la cura nella posa e un'azienda che resta al tuo fianco anche dopo i lavori.",
    `Da 20 anni lavoriamo così, una famiglia alla volta. La prossima potrebbe essere la tua.${quando}`, firma) };
  return { oggetto: "Il tuo progetto, con il finanziamento cucito su misura", testo: p(
    `Ciao ${nome},`, "realizzare un progetto per la casa non deve essere un pensiero. Su molti prodotti abbiamo promozioni attive, e i nostri consulenti hanno seguito un corso specifico sui finanziamenti: insieme troviamo la soluzione di pagamento su misura per le tue esigenze.",
    `Durante l'incontro ti mostreremo le opportunità valide in questo momento per i prodotti che ti interessano.${quando}`, firma) };
}

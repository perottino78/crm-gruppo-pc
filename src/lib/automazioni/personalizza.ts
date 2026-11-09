// Testi delle email automatiche modificabili dal Marketing (come in Keap): il testo scritto nel CRM, con i segnaposto
// tipo {nome} o {data_appuntamento}, sostituisce quello standard di email.ts. Senza testo personalizzato resta lo standard.
// Funzioni pure (testate in tests/automazioni/personalizza.test.ts); il salvataggio è in Configurazione, chiave "email_testo:<modello>[:<variante>]".
import {
  componiEmail, riepilogoContatto, riepilogoRichiesta, riepilogoAppuntamento, contattiConsulente, nomeProprio, famigliaLettere, CONTATTI,
  type DatiLeadEmail, type EmailPronta, type Link,
} from "./email";
import { testoDaHtml, testoInHtml } from "@/lib/mail/html";

// formato HTML: «testo» è un template HTML (incollato o caricato) con gli stessi segnaposto; il testo semplice si ricava da lì.
export type TestoPersonalizzato = { oggetto: string; testo: string; formato?: "TESTO" | "HTML"; preheader?: string | null; aggiornatoDa?: string | null; aggiornatoIl?: string | null };

export const PREFISSO_TESTO = "email_testo:";

/** Varianti dello stesso modello che hanno testi diversi. */
export const VARIANTI: Record<string, string[]> = {
  "call-requested": ["initial-prequalification", "scheduled-first-contact", "call-unanswered-reminder"],
  "appointment-confirmed-contact": ["CASA", "SHOWROOM"],
  "appointment-reminder-contact": ["CASA", "SHOWROOM"],
  "sales-letter-1": ["PC", "SOLARIS", "PURAFONTE"],
};

/** Nome in italiano di ogni email, per chi la modifica. */
export const NOMI_EMAIL: Record<string, string> = {
  "qualification-requested": "Nuovo contatto da classificare (al centralino)",
  "request-received": "Grazie per la richiesta (al cliente)",
  "region-not-served": "Regione non servita (al cliente)",
  "callback-confirmed": "Ti richiameremo (al cliente)",
  "call-requested": "Chiamata da fare (al centralino)",
  "call-unanswered-contact": "Abbiamo provato a chiamarti (al cliente)",
  "seller-assignment-requested": "Venditore da assegnare (al centralino)",
  "appointment-confirmed-contact": "Conferma appuntamento (al cliente)",
  "appointment-confirmed-seller": "Nuovo appuntamento (al venditore)",
  "appointment-reminder-contact": "Promemoria appuntamento (al cliente)",
  "appointment-reminder-seller": "Promemoria appuntamento (al venditore)",
  "appointment-cancelled-seller": "Appuntamento annullato (al venditore)",
  "cancellation-follow-up-requested": "Seguito dell'appuntamento annullato (al centralino)",
  "sales-letter-1": "Lettera di vendita 1 — chi siamo (al cliente)",
  "sales-letter-2": "Lettera di vendita 2 — perché sceglierci (al cliente)",
  "sales-letter-3": "Lettera di vendita 3 — recensioni (al cliente)",
  "sales-letter-4": "Lettera di vendita 4 — finanziamento (al cliente)",
  "lost-recovery-promotion": "Recupero: promozione del momento (al cliente)",
  "lost-recovery-call-requested": "Recupero: contatto da richiamare (al centralino)",
  "interest-closed": "Non interessato: restiamo in contatto (al cliente)",
};
export const NOMI_VARIANTI: Record<string, string> = {
  "initial-prequalification": "prima chiamata", "scheduled-first-contact": "richiamo concordato", "call-unanswered-reminder": "non risponde",
  CASA: "a casa", SHOWROOM: "in showroom", PC: "P&C", SOLARIS: "Solaris", PURAFONTE: "Purafonte",
};

/** I segnaposto che si possono usare nei testi, con la spiegazione. */
export const SEGNAPOSTO: [string, string][] = [
  ["nome", "nome del cliente (es. Mario)"], ["nome_completo", "nome e cognome"], ["telefono", "telefono del cliente"], ["email", "email del cliente"],
  ["prodotto", "prodotto richiesto"], ["fonte", "da dove arriva (Facebook, sito…)"],
  ["data_appuntamento", "giorno e ora dell'appuntamento"], ["indirizzo_appuntamento", "indirizzo dell'appuntamento"], ["data_richiamo", "giorno e ora del ricontatto"],
  ["consulente", "nome e cognome del venditore"], ["consulente_nome", "nome del venditore"], ["telefono_consulente", "telefono del venditore"],
  ["contatti_consulente", "riga con telefono ed email del venditore"],
  ["riepilogo_contatto", "dati del contatto (righe)"], ["riepilogo_richiesta", "cosa ha chiesto (righe)"], ["riepilogo_appuntamento", "riepilogo dell'appuntamento (righe)"],
  ["note", "note del lead"], ["promozione", "testo della promozione del momento"], ["valida_fino", "scadenza della promozione"],
  ["link_lead", "link alla scheda del lead (email interne)"], ["telefono_ufficio", CONTATTI.telefonoUfficio], ["cellulari_ufficio", CONTATTI.cellulariUfficio],
  ["consiglio_incontro", "consiglio per prepararsi (Solaris: le bollette; altri: idee e foto)"], ["showroom", "indirizzo dello showroom"], ["sito", CONTATTI.sito], ["recensioni", "pagina delle recensioni"],
];

export const chiaveTesto = (modello: string, variante?: string | null) => `${PREFISSO_TESTO}${modello}${variante ? `:${variante}` : ""}`;

/** Variante usata per cercare il testo: per la lettera 1 conta il marchio (P&C, Solaris, Purafonte). */
export const varianteTesto = (modello: string, variante: string | undefined, d: Pick<DatiLeadEmail, "marchio">) =>
  modello === "sales-letter-1" ? famigliaLettere(d.marchio) : variante;

const CONSIGLIO_SOLARIS = "• tieni a portata di mano le ultime bollette della luce: ci aiutano a calcolare il tuo risparmio;";
const CONSIGLIO_ALTRI = "• tieni a portata di mano idee, foto o esempi di ciò che ti piace;";
const consiglioIncontro = (d: Pick<DatiLeadEmail, "marchio">) => (famigliaLettere(d.marchio) === "SOLARIS" ? CONSIGLIO_SOLARIS : CONSIGLIO_ALTRI);

const dataOra = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const dataLunga = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" });

const richiesta = riepilogoRichiesta;

/** I valori dei segnaposto per un lead vero. */
export function valoriSegnaposto(d: DatiLeadEmail, link: Link, variante?: string): Record<string, string> {
  return {
    nome: nomeProprio(d.nome), nome_completo: d.nome, telefono: d.telefono ?? "", email: d.email ?? "", prodotto: d.prodotto ?? "", fonte: d.fonte ?? "",
    data_appuntamento: d.appuntamentoIl ? dataOra(d.appuntamentoIl) : "", indirizzo_appuntamento: d.indirizzoAppuntamento ?? "",
    data_richiamo: d.richiamoIl ? dataOra(d.richiamoIl) : "",
    consulente: d.venditore?.nome ?? "", consulente_nome: d.venditore ? nomeProprio(d.venditore.nome) : "", telefono_consulente: d.venditore?.telefono ?? "",
    contatti_consulente: contattiConsulente(d) ?? "",
    riepilogo_contatto: riepilogoContatto(d), riepilogo_richiesta: richiesta(d), riepilogo_appuntamento: riepilogoAppuntamento(d, variante),
    note: d.note ?? "", promozione: d.promozione?.testo ?? "", valida_fino: d.promozione?.validaFino ? dataLunga(d.promozione.validaFino) : "",
    link_lead: link.lead, telefono_ufficio: CONTATTI.telefonoUfficio, cellulari_ufficio: CONTATTI.cellulariUfficio,
    showroom: CONTATTI.showroom, sito: CONTATTI.sito, recensioni: CONTATTI.recensioni, consiglio_incontro: consiglioIncontro(d),
  };
}

/**
 * Riempie i segnaposto. Un paragrafo fatto solo di segnaposto vuoti sparisce (niente righe bianche);
 * i segnaposto sconosciuti restano come sono, così chi scrive vede l'errore nell'anteprima.
 */
export function riempi(modello: string, valori: Record<string, string>): string {
  const paragrafi = modello.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out = paragrafi.map((p) => {
    const segnaposto = [...p.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => k in valori);
    const pieno = p.replace(/\{([a-z_]+)\}/g, (tutto, k) => (k in valori ? valori[k] : tutto));
    const soloSegnaposto = segnaposto.length > 0 && !p.replace(/\{([a-z_]+)\}/g, "").trim();
    return soloSegnaposto && !pieno.trim() ? null : pieno;
  });
  return out.filter((x) => x !== null).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Applica il testo personalizzato (se c'è) all'email già composta con il testo standard. */
export function personalizza(e: EmailPronta, t: TestoPersonalizzato | null | undefined, valori: Record<string, string>): EmailPronta & { personalizzata: boolean } {
  if (!t || !t.testo.trim()) return { ...e, personalizzata: false };
  const oggetto = riempi(t.oggetto || e.oggetto, valori).replace(/\s+/g, " ").trim();
  if (t.formato === "HTML") {
    const html = riempiHtml(t.testo, valori);
    return { ...e, oggetto, testo: testoDaHtml(html), html, personalizzata: true };
  }
  return { ...e, oggetto, testo: riempi(t.testo, valori), personalizzata: true };
}

/** Riempie i segnaposto in un template HTML: i valori sono protetti (niente tag rotti) e le righe a capo diventano <br>. */
export function riempiHtml(template: string, valori: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (tutto, k) => (k in valori ? testoInHtml(valori[k]) : tutto));
}

// --- testo standard scritto con i segnaposto (punto di partenza per chi lo modifica) ---

const APP = new Date("2031-03-04T09:30:00Z"), RICH = new Date("2031-05-06T14:15:00Z"), FINO = new Date("2031-07-08T12:00:00Z");
const ESEMPIO_SEGNAPOSTO = (marchio: string): DatiLeadEmail => ({
  nome: "Qnome Qcognome", telefono: "Qtelefono", email: "Qemail@x.it", prodotto: "Qprodotto", fonte: "Qfonte", marchio,
  appuntamentoIl: APP, richiamoIl: RICH, indirizzoAppuntamento: "Qindirizzo", note: "Qnote",
  venditore: { nome: "Qconsnome Qconscognome", telefono: "Qconstel", email: "Qconsemail@x.it" },
  promozione: { testo: "Qpromozione", validaFino: FINO },
});

/** Il testo standard del modello riscritto con i segnaposto, da cui partire per modificarlo. */
export function testoStandard(modello: string, variante?: string): { oggetto: string; testo: string } {
  const marchio = modello === "sales-letter-1" ? ({ SOLARIS: "Solaris", PURAFONTE: "Purafonte" } as Record<string, string>)[variante ?? ""] ?? "P&C" : "P&C";
  const d = ESEMPIO_SEGNAPOSTO(marchio);
  const link = { lead: "Qlinklead" };
  const v = modello === "sales-letter-1" ? undefined : variante;
  const e = componiEmail(modello, d, link, v);
  const blocchi: [string, string][] = [
    [riepilogoAppuntamento(d, v), "{riepilogo_appuntamento}"], [riepilogoContatto(d), "{riepilogo_contatto}"], [richiesta(d), "{riepilogo_richiesta}"],
    [contattiConsulente(d) ?? "\u0000", "{contatti_consulente}"],
    [dataOra(APP), "{data_appuntamento}"], [dataOra(RICH), "{data_richiamo}"], [dataLunga(FINO), "{valida_fino}"],
    ["Qconsnome Qconscognome", "{consulente}"], ["Qconsnome", "{consulente_nome}"], ["Qconstel", "{telefono_consulente}"],
    ["Qnome Qcognome", "{nome_completo}"], ["Qnome", "{nome}"], ["Qtelefono", "{telefono}"], ["Qemail@x.it", "{email}"],
    ["Qprodotto", "{prodotto}"], ["Qfonte", "{fonte}"], ["Qindirizzo", "{indirizzo_appuntamento}"], ["Qnote", "{note}"],
    ["Qpromozione", "{promozione}"], ["Qlinklead", "{link_lead}"],
    [CONTATTI.telefonoUfficio, "{telefono_ufficio}"], [CONTATTI.cellulariUfficio, "{cellulari_ufficio}"], [CONTATTI.showroom, "{showroom}"],
    [CONTATTI.recensioni, "{recensioni}"], [CONTATTI.sito, "{sito}"], [CONSIGLIO_ALTRI, "{consiglio_incontro}"],
  ];
  const sostituisci = (s: string) => blocchi.reduce((t, [da, a]) => (da && da !== "\u0000" ? t.split(da).join(a) : t), s);
  return { oggetto: sostituisci(e.oggetto), testo: sostituisci(e.testo) };
}

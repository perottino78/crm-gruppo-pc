// Mail al cliente lungo la pratica (flusso descritto da Ugo il 16/11/2026): ringraziamento al pagamento dell'acconto, rilievo fissato, posa
// fissata (come far trovare l'ambiente di lavoro), fine posa con richiesta di recensione o, se la posa è parziale, le scuse. Modulo puro.

export type DatiMailPratica = { cliente: string; numero: string; commerciale?: string | null; telefono?: string | null };
export type MailPratica = { oggetto: string; testo: string };

const firma = (d: DatiMailPratica) =>
  `\nCordiali saluti,\n${d.commerciale ? `${d.commerciale}\n` : ""}Gruppo P&C${d.telefono ? ` — ${d.telefono}` : ""}`;
const nome = (d: DatiMailPratica) => (d.cliente || "").trim() || "cliente";

export const RECENSIONI_URL_DEFAULT = "https://gruppopec.com/recensioni";

export function mailRingraziamentoPagamento(d: DatiMailPratica): MailPratica {
  return {
    oggetto: `Grazie! Abbiamo ricevuto il suo pagamento — pratica ${d.numero}`,
    testo: `Gentile ${nome(d)},\n\nla ringraziamo: abbiamo ricevuto il pagamento dell'acconto. La sua pratica ${d.numero} è ora in lavorazione.\n\nIl nostro centralino la contatterà a breve per fissare il giorno del rilievo delle misure. La terremo aggiornata a ogni passo.${firma(d)}`,
  };
}

export function mailRilievoFissato(d: DatiMailPratica & { quando: string; tecnico: string; indirizzo?: string | null }): MailPratica {
  return {
    oggetto: `Rilievo delle misure fissato: ${d.quando} — pratica ${d.numero}`,
    testo: `Gentile ${nome(d)},\n\nabbiamo fissato il rilievo delle misure:\n\n  Giorno e ora: ${d.quando}\n  Il nostro tecnico: ${d.tecnico}${d.indirizzo ? `\n  Presso: ${d.indirizzo}` : ""}\n\nPer favore faccia trovare libere le zone dove vanno posati i serramenti o i prodotti, così il tecnico può misurare con precisione. Se non può essere presente in quel momento ci avvisi il prima possibile e troveremo un altro giorno.${firma(d)}`,
  };
}

export function mailPosaFissata(d: DatiMailPratica & { quando: string; giorni: number; squadra?: string | null; indirizzo?: string | null }): MailPratica {
  return {
    oggetto: `Posa fissata: ${d.quando} — conferma e preparazione — pratica ${d.numero}`,
    testo: `Gentile ${nome(d)},\n\nabbiamo fissato la posa:\n\n  Inizio: ${d.quando}${d.giorni > 1 ? ` (${d.giorni} giorni di lavoro)` : ""}${d.squadra ? `\n  La nostra squadra: ${d.squadra}` : ""}${d.indirizzo ? `\n  Presso: ${d.indirizzo}` : ""}\n\nPer far lavorare bene la squadra, la preghiamo di preparare l'ambiente di lavoro:\n  - liberare le zone di posa da mobili, tende e oggetti, e proteggere ciò che non si può spostare;\n  - garantire l'accesso ai locali e un posto per il furgone vicino all'ingresso;\n  - lasciare disponibile la corrente elettrica;\n  - essere presente, o lasciare un referente maggiorenne;\n  - tenere gli animali domestici in un'altra stanza.\n\nCi conferma che il giorno va bene? Risponda a questa email o ci chiami: se serve cambiare data, la spostiamo volentieri.${firma(d)}`,
  };
}

export function mailPosaCompletata(d: DatiMailPratica & { linkRecensione?: string }): MailPratica {
  return {
    oggetto: `Lavoro terminato — ci racconta com'è andata? — pratica ${d.numero}`,
    testo: `Gentile ${nome(d)},\n\nil lavoro è terminato. Speriamo che il risultato la soddisfi: per noi la sua opinione è importante.\n\nSe ha due minuti, ci lasci una recensione: aiuta chi sta scegliendo come lei.\n${d.linkRecensione ?? RECENSIONI_URL_DEFAULT}\n\nIl suo consulente passerà presto a portarle il kit di manutenzione e a verificare che sia tutto a posto. Per qualsiasi cosa siamo a sua disposizione.${firma(d)}`,
  };
}

export function mailPosaParziale(d: DatiMailPratica & { note?: string | null }): MailPratica {
  return {
    oggetto: `La posa non è ancora conclusa — pratica ${d.numero}`,
    testo: `Gentile ${nome(d)},\n\nci scusiamo: oggi la posa non è stata completata${d.note ? ` (${d.note})` : ""}. Capiamo il disagio e ce ne dispiace.\n\nIl nostro centralino la contatterà a breve per fissare il giorno in cui tornare a finire il lavoro. Se preferisce, ci chiami lei: troviamo subito la prima data utile.${firma(d)}`,
  };
}

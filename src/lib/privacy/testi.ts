// Parte pura (senza database) dei testi privacy: si può importare anche nelle pagine client.
// Informativa privacy pubblica (/privacy). Il testo di partenza è una BOZZA scritta dal gestore del software sul funzionamento reale di P&C ONE:
// il consulente privacy la rivede e la modifica in Impostazioni › Informativa privacy, senza toccare il codice.

export const CHIAVE_INFORMATIVA = "privacy_informativa";
export const CHIAVE_INFORMATIVA_DATA = "privacy_informativa_data";
export const VERSIONE_PREDEFINITA = "2026-11-24";

/** Testo mostrato accanto alla casella del consenso alle comunicazioni commerciali (e salvato come prova). */
export const TESTO_CONSENSO_MARKETING =
  "Acconsento a ricevere da P&C srl unipersonale (marchi P&C, Solaris, PTC, Purafonte, Plasma30, Work & Services) comunicazioni commerciali e promozionali via email: novità, offerte e iniziative, con misurazione dell'apertura e dei clic dei messaggi. Posso revocare il consenso in ogni momento con il link in fondo a ogni email.";

/**
 * Formato: righe vuote separano i paragrafi; una riga che inizia con «## » è un titolo; una che inizia con «- » è un elenco puntato.
 */
export const INFORMATIVA_PREDEFINITA = `## Informativa sul trattamento dei dati personali
Ai sensi degli articoli 13 e 14 del Regolamento UE 2016/679 (GDPR).

## 1. Titolare del trattamento
P&C srl unipersonale, Corso Moncenisio 28, 10090 Rosta (TO) - P.IVA 10741080013 - tel. 011 19887497 - email info@gruppopec.com - PEC gruppopec@cert.ica-net.it. Il titolare opera con i marchi P&C, Solaris, PTC, Purafonte, Plasma30 e Work & Services.

## 2. Quali dati trattiamo e da dove arrivano
- Dati identificativi e di contatto: nome e cognome o ragione sociale, indirizzo, telefono, email, PEC.
- Dati fiscali e di pagamento: codice fiscale, partita IVA, codice destinatario, IBAN, dati di fatture, incassi, finanziamenti e detrazioni fiscali.
- Dati dei lavori: indirizzo dell'immobile, misure, foto dei sopralluoghi e della posa (che possono ritrarre l'interno dell'abitazione), firme su verbali e consegne, documenti del contratto.
- Dati di comunicazione: email, note e cronologia dei contatti; per le email commerciali anche, solo se hai dato il consenso, se e quando le apri e su quali link clicchi.
I dati ci arrivano direttamente da te (preventivi, contratti, telefonate, moduli), dai moduli di richiesta online e dalle pubblicità (per esempio Facebook e Instagram), dal simulatore sul nostro sito e, in alcuni casi, da elenchi di contatti: in questo caso ti informiamo al primo contatto indicando la fonte.

## 3. Perché li trattiamo e con quale base giuridica
- Preventivi, contratti, ordini, posa, assistenza e garanzia: esecuzione del contratto e misure precontrattuali richieste da te (art. 6.1.b).
- Fatturazione, contabilità, adempimenti fiscali e di legge: obbligo di legge (art. 6.1.c).
- Comunicazioni commerciali e promozionali via email: il tuo consenso (art. 6.1.a), che puoi revocare in ogni momento. Se sei già nostro cliente, possiamo inviarti anche comunicazioni su prodotti e servizi simili a quelli che hai acquistato, con la possibilità di opporti in ogni messaggio (art. 130, comma 4, del Codice privacy).
- Misurazione di aperture e clic delle email commerciali: solo con il tuo consenso.
- Utilizzo di foto dei lavori per finalità promozionali: solo con un consenso specifico, revocabile.
- Difesa dei nostri diritti e sicurezza dei sistemi: legittimo interesse (art. 6.1.f).
Il conferimento dei dati necessari al contratto e agli obblighi di legge è obbligatorio: senza non possiamo darti il preventivo o eseguire il lavoro. Il consenso alle comunicazioni commerciali è facoltativo e non incide sul rapporto con noi.

## 4. A chi comunichiamo i dati
- Nostri dipendenti e collaboratori autorizzati, posatori e tecnici incaricati dei lavori.
- Fornitori dei prodotti, quando serve per l'ordine e la consegna.
- Professionisti e consulenti (per esempio commercialista e consulenti fiscali e legali), che trattano i dati per nostro conto.
- Fornitori di servizi informatici che trattano i dati per nostro conto: hosting e database, posta elettronica e invio di email, calendari, mappe e strumenti di lettura automatica dei documenti (per esempio Vercel, Neon, Brevo, Google, Anthropic). L'elenco aggiornato è disponibile su richiesta.
- Banche e società finanziarie, se chiedi un finanziamento; autorità pubbliche e amministrazione finanziaria nei casi previsti dalla legge.
I dati non sono diffusi.

## 5. Trasferimenti fuori dall'Unione europea
Alcuni fornitori informatici hanno sede o infrastrutture anche negli Stati Uniti. I trasferimenti avvengono solo con le garanzie previste dal GDPR: decisione di adeguatezza (EU-US Data Privacy Framework) o clausole contrattuali standard. Puoi chiederci copia delle garanzie.

## 6. Per quanto tempo conserviamo i dati
- Contratti, fatture e documenti contabili: 10 anni, come previsto dalla legge.
- Dati di contatto di chi non è diventato cliente: non oltre 24 mesi dall'ultimo contatto.
- Consenso alle comunicazioni commerciali: fino alla revoca e comunque non oltre 24 mesi di inattività; conserviamo la prova del consenso e della revoca per tutelarci.

## 7. I tuoi diritti
Puoi chiederci in ogni momento l'accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione, la portabilità e opporti al trattamento (artt. 15-22 GDPR), e revocare il consenso senza che questo pregiudichi i trattamenti già fatti. Scrivi a info@gruppopec.com: rispondiamo entro un mese. Per non ricevere più email commerciali basta usare il link «disiscriviti» in fondo a ogni email.
Se ritieni che il trattamento violi la normativa puoi presentare reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).

## 8. Decisioni automatizzate
Non prendiamo decisioni basate unicamente su trattamenti automatizzati che producano effetti su di te.`;

export type BloccoInformativa = { tipo: "titolo" | "testo" | "voce"; testo: string };
/** Il testo diventa blocchi (titoli, paragrafi, voci di elenco) per mostrarlo senza HTML libero. */
export function bloccoDaTesto(testo: string): BloccoInformativa[] {
  return testo.split(/\r?\n/).map((r) => r.trim()).filter(Boolean).map((r) =>
    r.startsWith("## ") ? { tipo: "titolo" as const, testo: r.slice(3) } : r.startsWith("- ") ? { tipo: "voce" as const, testo: r.slice(2) } : { tipo: "testo" as const, testo: r });
}

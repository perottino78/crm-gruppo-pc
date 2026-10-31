import { test } from "node:test";
import assert from "node:assert/strict";
import { PERCORSI, ESITI, FASI_LEAD, esitiPossibili, scadenzaDopoEsito, quandoPasso, faseDelPercorso, daSaltare } from "../../src/lib/automazioni/percorsi";
import { MODELLI, componiEmail, htmlEmail, testoEmail, riepilogoContatto, nomeProprio, famigliaLettere, letteraDiVendita } from "../../src/lib/automazioni/email";
import { daOraRoma, perInput } from "../../src/lib/calendario/tempo";

const r = (s: string) => daOraRoma(s)!;

test("ogni passo usa un modello esistente e ogni esito ha la sua fase", () => {
  for (const [k, passi] of Object.entries(PERCORSI)) {
    assert.ok(FASI_LEAD[faseDelPercorso(k)], k);
    for (const p of passi) if (p.tipo === "EMAIL") assert.ok(MODELLI[p.modello], p.modello);
  }
  for (const e of Object.keys(ESITI)) assert.ok(PERCORSI[e], e);
});

test("prima la classificazione geografica, poi la prequalifica", () => {
  assert.deepEqual(esitiPossibili("NUOVO"), ["IN_TARGET", "FUORI_REGIONE"]);
  assert.ok(esitiPossibili("IN_TARGET").includes("NON_RISPONDE"));
  assert.ok(!esitiPossibili("IN_TARGET").includes("FUORI_REGIONE")); // fuori regione solo alla classificazione
  assert.ok(esitiPossibili("APPUNTAMENTO_CASA").includes("APPUNTAMENTO_ANNULLATO"));
  assert.deepEqual(esitiPossibili("NON_INTERESSATO"), ["IN_TARGET"]);
});

test("scadenze dopo l'esito", () => {
  const adesso = r("2026-11-03T10:00");
  assert.equal(perInput(scadenzaDopoEsito("IN_TARGET", adesso)!), "2026-11-03T18:30");
  assert.equal(scadenzaDopoEsito("NON_INTERESSATO", adesso), null);
  const R = r("2026-11-10T09:00");
  assert.equal(scadenzaDopoEsito("DA_RICHIAMARE", adesso, R), R);
});

test("quando parte ogni passo", () => {
  const rif = r("2026-11-06T11:00");
  assert.equal(quandoPasso({ subito: true }, rif), rif);
  assert.equal(perInput(quandoPasso({ dopoGiorni: 1 }, rif)), "2026-11-09T08:00");
  assert.equal(perInput(quandoPasso({ daRichiamo: 2 }, rif, { richiamoIl: r("2026-11-10T15:00") })), "2026-11-12T15:00");
  assert.equal(perInput(quandoPasso({ giornoDopo: true }, rif)), "2026-11-07T08:00"); // venerdì → sabato 08:00
  assert.equal(perInput(quandoPasso({ giornoDopo: true }, r("2026-11-07T18:00"))), "2026-11-09T08:00"); // sabato → lunedì
  assert.equal(perInput(quandoPasso({ daAppuntamento: -1 }, rif, { appuntamentoIl: r("2026-11-12T09:30") })), "2026-11-11T09:30");
  assert.throws(() => quandoPasso({ daRichiamo: 0 }, rif, {}));
});

test("testi delle email: niente segnaposto vuoti, disiscrizione solo ai clienti", () => {
  const d = { nome: "Mario Rossi", telefono: "333 1234567", email: null, comune: "Rivoli", prodotto: "Pergola" };
  assert.equal(nomeProprio("Mario Rossi"), "Mario");
  assert.equal(riepilogoContatto(d), "Nome e cognome: Mario Rossi\nTelefono: 333 1234567\nCittà: Rivoli");
  const link = { lead: "https://crm/lead?id=1", disiscrizione: "https://crm/api/disiscrizione?l=1&t=x" };
  const cliente = componiEmail("request-received", d, link);
  assert.ok(cliente.testo.startsWith("Ciao Mario,"));
  assert.ok(cliente.testo.includes("Prodotto di interesse: Pergola"));
  assert.ok(cliente.testo.includes("011 19887497"));
  assert.ok(!/undefined|null|\{\{|~Contact/.test(cliente.testo));
  assert.ok(testoEmail(cliente, link).includes("Non vuoi più ricevere email?"));
  assert.ok(htmlEmail(cliente, link).includes("Non voglio più ricevere email"));
  const interna = componiEmail("call-requested", d, link, "scheduled-first-contact");
  assert.equal(interna.oggetto, "[CRM P&C] Richiama il contatto interessato — Mario Rossi");
  assert.ok(interna.testo.includes("https://crm/lead?id=1"));
  assert.ok(!testoEmail(interna, link).includes("disiscrizione"));
  assert.ok(htmlEmail(componiEmail("request-received", { nome: "<b>x</b>" }, link), link).includes("&lt;b&gt;"));
});

test("fase 2: percorso dell'appuntamento e lettere di vendita", () => {
  assert.equal(faseDelPercorso("ASSEGNA_VENDITORE_CASA"), "APPUNTAMENTO_CASA");
  assert.equal(faseDelPercorso("IN_TARGET"), "IN_TARGET");
  const app = r("2026-11-13T10:00");
  // lettera: va mandata solo se cade prima delle 24 ore che precedono l'appuntamento
  assert.equal(daSaltare("PRIMA_DEL_PROMEMORIA", r("2026-11-11T08:00"), r("2026-11-10T09:00"), app), null);
  assert.ok(daSaltare("PRIMA_DEL_PROMEMORIA", r("2026-11-12T08:00"), r("2026-11-11T09:00"), app)); // giorno del promemoria
  // promemoria: si salta se l'appuntamento è stato fissato a meno di 24 ore
  assert.equal(daSaltare("NON_GIA_PASSATO", r("2026-11-12T10:00"), r("2026-11-11T09:00"), app), null);
  assert.ok(daSaltare("NON_GIA_PASSATO", r("2026-11-12T10:00"), r("2026-11-12T18:00"), app));
  assert.equal(daSaltare(undefined, r("2026-11-12T10:00"), r("2026-11-12T18:00"), app), null);
  // marchi delle lettere
  assert.equal(famigliaLettere("Solaris"), "SOLARIS");
  assert.equal(famigliaLettere("Purafonte"), "PURAFONTE");
  assert.equal(famigliaLettere("Work & Services"), "PC");
  const l1 = letteraDiVendita(1, { nome: "Anna Bianchi", marchio: "Solaris", appuntamentoIl: app });
  assert.ok(l1.oggetto.startsWith("Anna,") && l1.testo.includes("fotovoltaico") && l1.testo.includes("20 anni"));
  for (const n of [1, 2, 3, 4]) assert.ok(!/undefined|null|\{\{/.test(letteraDiVendita(n, { nome: "Anna" }).testo), `lettera ${n}`);
  const link = { lead: "https://crm/lead?id=1" };
  const conferma = componiEmail("appointment-confirmed-contact", { nome: "Anna Bianchi", appuntamentoIl: app, venditore: { nome: "Marco Piccatti", telefono: "333 1" } }, link, "SHOWROOM");
  assert.ok(conferma.testo.includes("Corso Moncenisio 28") && conferma.testo.includes("Marco Piccatti (telefono: 333 1)"));
  assert.ok(conferma.testo.includes("Il sabato o quando il nostro ufficio è chiuso puoi contattare direttamente il tuo consulente Marco Piccatti: telefono 333 1."));
  const conMail = componiEmail("appointment-reminder-contact", { nome: "Anna", venditore: { nome: "Marco Piccatti", telefono: "333 1", email: "marco@gruppopec.com" } }, link, "CASA");
  assert.ok(conMail.testo.includes("telefono 333 1, email marco@gruppopec.com"));
  const senzaRecapiti = componiEmail("appointment-confirmed-contact", { nome: "Anna", venditore: { nome: "Paolo", email: "p@senza-email.invalid" } }, link, "CASA");
  assert.ok(!senzaRecapiti.testo.includes("ufficio è chiuso"));
  assert.ok(letteraDiVendita(3, { nome: "Anna" }).testo.includes("https://gruppopec.com/recensioni/"));
  const promemoria = componiEmail("appointment-reminder-contact", { nome: "Anna", marchio: "Solaris", appuntamentoIl: app, indirizzoAppuntamento: "Via Roma 1, Rivoli" }, link, "CASA");
  assert.ok(promemoria.testo.includes("Via Roma 1, Rivoli") && promemoria.testo.includes("bollette"));
  assert.ok(componiEmail("appointment-confirmed-seller", { nome: "Anna", venditore: { nome: "Marco Piccatti" } }, link, "CASA").testo.startsWith("Ciao Marco,"));
});

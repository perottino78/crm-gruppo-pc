import { test } from "node:test";
import assert from "node:assert/strict";
import { PERCORSI, ESITI, FASI_LEAD, esitiPossibili, scadenzaDopoEsito, quandoPasso } from "../../src/lib/automazioni/percorsi";
import { MODELLI, componiEmail, htmlEmail, testoEmail, riepilogoContatto, nomeProprio } from "../../src/lib/automazioni/email";
import { daOraRoma, perInput } from "../../src/lib/calendario/tempo";

const r = (s: string) => daOraRoma(s)!;

test("ogni passo usa un modello esistente e ogni esito ha la sua fase", () => {
  for (const [k, passi] of Object.entries(PERCORSI)) {
    assert.ok(FASI_LEAD[k], k);
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
  assert.equal(perInput(quandoPasso({ daRichiamo: 2 }, rif, r("2026-11-10T15:00"))), "2026-11-12T15:00");
  assert.throws(() => quandoPasso({ daRichiamo: 0 }, rif, null));
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

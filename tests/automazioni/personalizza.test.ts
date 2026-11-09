import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELLI, componiEmail, htmlEmail } from "../../src/lib/automazioni/email";
import { testoStandard, VARIANTI, valoriSegnaposto, personalizza, riempi, chiaveTesto, varianteTesto, NOMI_EMAIL } from "../../src/lib/automazioni/personalizza";

const d = {
  nome: "Mario Rossi", telefono: "333 1", email: "m@r.it", comune: "Rivoli", prodotto: "Pergola", fonte: "FACEBOOK", marchio: "Solaris",
  appuntamentoIl: new Date("2026-11-10T09:00:00Z"), indirizzoAppuntamento: "Via Roma 1", venditore: { nome: "Marco Piccatti", telefono: "333 2", email: "mp@g.it" },
  promozione: { testo: "• Sconto", validaFino: new Date("2026-12-01T12:00:00Z") }, richiamoIl: new Date("2026-11-05T15:00:00Z"), note: "nota",
};
const link = { lead: "https://crm/lead?id=1" };

test("il testo standard riscritto con i segnaposto dà la stessa email per ogni modello e variante", () => {
  for (const m of Object.keys(MODELLI)) {
    assert.ok(NOMI_EMAIL[m], `manca il nome italiano di ${m}`);
    for (const v of VARIANTI[m] ?? [undefined]) {
      const lettera = m === "sales-letter-1";
      const dd = lettera ? { ...d, marchio: ({ SOLARIS: "Solaris", PURAFONTE: "Purafonte", PC: "P&C" } as Record<string, string>)[v!] } : d;
      const std = componiEmail(m, dd, link, lettera ? undefined : v);
      const p = personalizza(std, testoStandard(m, v), valoriSegnaposto(dd, link, lettera ? undefined : v));
      assert.equal(p.oggetto, std.oggetto.replace(/\s+/g, " ").trim(), `${m} ${v ?? ""}: oggetto`);
      assert.equal(p.testo, std.testo, `${m} ${v ?? ""}: testo`);
    }
  }
});

test("segnaposto: paragrafi vuoti spariscono, sconosciuti restano visibili", () => {
  assert.equal(riempi("Ciao {nome},\n\n{note}\n\nA presto", { nome: "Mario", note: "" }), "Ciao Mario,\n\nA presto");
  assert.equal(riempi("Telefono: {telefono}", { telefono: "" }), "Telefono:");
  assert.equal(riempi("Ciao {nme}", { nome: "Mario" }), "Ciao {nme}");
});

test("testo personalizzato: si applica solo se c'è, chiave per modello e variante", () => {
  const std = componiEmail("request-received", d, link);
  assert.equal(personalizza(std, null, {}).personalizzata, false);
  const p = personalizza(std, { oggetto: "Grazie {nome}!", testo: "Ciao {nome}, ti chiamiamo dal {telefono_ufficio}." }, valoriSegnaposto(d, link));
  assert.equal(p.oggetto, "Grazie Mario!");
  assert.match(p.testo, /^Ciao Mario, ti chiamiamo dal \d/);
  assert.equal(p.categoria, "CLIENTE");
  assert.equal(chiaveTesto("call-requested", "scheduled-first-contact"), "email_testo:call-requested:scheduled-first-contact");
  assert.equal(chiaveTesto("request-received"), "email_testo:request-received");
  assert.equal(varianteTesto("sales-letter-1", undefined, { marchio: "Pura Fonte" }), "PURAFONTE");
  assert.equal(varianteTesto("appointment-confirmed-contact", "CASA", { marchio: "Solaris" }), "CASA");
});

test("testo personalizzato in HTML: valori protetti, testo semplice ricavato, piede con la disiscrizione per i clienti", () => {
  const base = componiEmail("request-received", { nome: "Mario <Rossi>", telefono: "333", email: "m@x.it", prodotto: "Pergola", fonte: "facebook", marchio: "P&C" } as never, { lead: "" });
  const e = personalizza(base, { oggetto: "Ciao {nome}", testo: "<html><body><h1>Ciao {nome}</h1><p>Hai chiesto: {prodotto}</p></body></html>", formato: "HTML" }, { nome: "Mario <Rossi>", prodotto: "Pergola" });
  assert.equal(e.html, "<html><body><h1>Ciao Mario &lt;Rossi&gt;</h1><p>Hai chiesto: Pergola</p></body></html>");
  assert.ok(e.testo.includes("Ciao Mario <Rossi>") && e.testo.includes("Hai chiesto: Pergola") && !e.testo.includes("<h1>"));
  const h = htmlEmail(e, { lead: "", disiscrizione: "https://x/d?l=1" });
  assert.ok(h.includes("Ciao Mario &lt;Rossi&gt;") && h.includes('href="https://x/d?l=1"') && h.indexOf("disiscr") < h.indexOf("</body>") && !h.includes("Gruppo P&amp;C</div>"));
  const conPosto = htmlEmail({ ...e, html: "<p>x <a href=\"{disiscrizione}\">esci</a></p>" }, { lead: "", disiscrizione: "https://x/d?l=1" });
  assert.equal(conPosto, '<p>x <a href="https://x/d?l=1">esci</a></p>');
});

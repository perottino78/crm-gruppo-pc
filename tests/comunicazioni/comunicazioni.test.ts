import { test } from "node:test";
import assert from "node:assert/strict";
import { riempi, valoriPer, usaPassword, htmlDaTesto, emailComunicazione, GRUPPI, MODELLI_COMUNICAZIONE, type Destinatario } from "../../src/lib/comunicazioni/testo";
import { passwordProvvisoria } from "../../src/lib/comunicazioni/password";

const marco: Destinatario = { id: "1", nome: "Marco Piccatti", email: "marco@gruppopec.com", username: "mpiccatti", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE" };

test("segnaposto riempiti per ogni persona, quelli sconosciuti restano", () => {
  const v = valoriPer(marco, { link: "https://crm.it", password: "Pec-abcd23" });
  assert.equal(riempi("Ciao {nome} ({nome_completo}), entra su {link} con {username} / {password} {altro}", v),
    "Ciao Marco (Marco Piccatti), entra su https://crm.it con mpiccatti / Pec-abcd23 {altro}");
  assert.equal(valoriPer({ ...marco, username: null }, { link: "x" }).username, "(chiedi all'amministratore)");
  assert.ok(usaPassword("la tua password: {password}") && !usaPassword("ciao {nome}"));
});

test("password provvisoria facile da dettare e sempre diversa", () => {
  const p = passwordProvvisoria();
  assert.match(p, /^Pec-[a-z]{4}[2-9]{2}$/);
  assert.ok(!/[l10o]/.test(p.slice(4)));
  assert.ok(new Set(Array.from({ length: 20 }, passwordProvvisoria)).size > 15);
});

test("testo → HTML: paragrafi, grassetto, elenchi, link, niente HTML del testo", () => {
  const h = htmlDaTesto("Ciao **Marco**,\nseconda riga\n\n- uno\n- due https://x.it\n\n<script>");
  assert.ok(h.includes("<p style=\"margin:0 0 14px\">Ciao <b>Marco</b>,<br>seconda riga</p>"));
  assert.ok(h.includes("<li>uno</li><li>due <a href=\"https://x.it\""));
  assert.ok(h.includes("&lt;script&gt;") && !h.includes("<script>"));
});

test("email completa con firma; versione testo senza asterischi", () => {
  const e = emailComunicazione({ testo: "Ciao **tutti**", firmaHtml: "<b>Ugo</b>", firmaTesto: "Ugo Perottino" });
  assert.ok(e.html.includes("P&amp;C <span style=\"color:#ea580c\">ONE</span>") && e.html.includes("<b>Ugo</b>"));
  assert.equal(e.testo, "Ciao tutti\n\n-- \nUgo Perottino");
});

test("gruppi di destinatari", () => {
  const g = (k: string) => GRUPPI.find((x) => x.chiave === k)!.prende;
  assert.ok(g("commerciali")(marco) && !g("telefoniste")(marco));
  assert.ok(g("telefoniste")({ ruolo: "TELEFONISTA", ufficio: null }));
  assert.ok(g("ufficio")({ ruolo: "AMMINISTRATIVO", ufficio: "FATTURAZIONE" }) && g("ufficio")({ ruolo: "TECNICO", ufficio: "ORDINI" }));
  assert.ok(g("tecnici")({ ruolo: "POSATORE", ufficio: null }) && g("tutti")(marco));
});

test("il modello di invito ha nome, utente, password e link", () => {
  const inv = MODELLI_COMUNICAZIONE.find((m) => m.chiave === "invito")!;
  for (const k of ["{nome}", "{username}", "{password}", "{link}"]) assert.ok(inv.testo.includes(k), k);
  assert.ok(inv.password && inv.task);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { prezzoNetto, importoRiga, totaleOrdine, costoPrevisto, statoDaArrivi, nomeFileSicuro, numeroOrdine } from "../../src/lib/ordini/calcoli";
import { aCapo } from "../../src/lib/ordini/pdf";
import { pdfOrdineFornitore } from "../../src/lib/ordini/pdfOrdine";
import { configEmail, richiestaInvio, linkMailto, emailValida } from "../../src/lib/ordini/email";

test("prezzi, importi e totale ordine", () => {
  assert.equal(prezzoNetto(100, 35), 65);
  assert.equal(prezzoNetto(null, 10), null);
  assert.equal(importoRiga({ quantita: 3, prezzoAcquisto: 99.99, scontoAcquisto: 10 }), 269.97);
  assert.deepEqual(totaleOrdine([{ quantita: 2, prezzoAcquisto: 10 }, { quantita: 1, prezzoAcquisto: null }]), { totale: 20, righeSenzaPrezzo: 1 });
  assert.equal(numeroOrdine({ numero: 12, anno: 2026 }), "12/2026");
});

test("costo previsto da listino meno sconto fornitore", () => {
  assert.equal(costoPrevisto({ prezzoUnitario: 1000, optionalPrezzo: 100, quantita: 2 }, 40), 1320);
  assert.equal(costoPrevisto({ prezzoUnitario: 1000, quantita: 1 }, null), null, "senza sconto noto niente stima");
  assert.equal(costoPrevisto({ prezzoUnitario: 997.2, quantita: 1 }, 0), 997.2);
});

test("stato dell'ordine dagli arrivi", () => {
  assert.equal(statoDaArrivi("CONFERMATO", [{ arrivato: true }, { arrivato: false }]), "EVASO_PARZIALE");
  assert.equal(statoDaArrivi("INVIATO", [{ arrivato: true }, { arrivato: true }]), "EVASO");
  assert.equal(statoDaArrivi("EVASO", [{ arrivato: false }]), "CONFERMATO", "togliendo l'arrivo torna confermato");
  assert.equal(statoDaArrivi("ANNULLATO", [{ arrivato: true }]), "ANNULLATO");
  assert.equal(statoDaArrivi("BOZZA", []), "BOZZA");
});

test("nomi file sicuri", () => {
  assert.equal(nomeFileSicuro("Conferma d'ordine Fintecnic.pdf"), "Conferma d_ordine Fintecnic.pdf");
  assert.equal(nomeFileSicuro("../../etc/passwd"), ".._.._etc_passwd", "niente barre di percorso");
  assert.equal(nomeFileSicuro("perché è così.pdf"), "perche e cosi.pdf");
});

test("a capo del testo", () => {
  const r = aCapo("FINESTRA 2 ANTE ZENITH 1100X1000 COLORE INT/EST GRIGIO RAL 9018 MANIGLIA SQUADRATA ARGENTO SATINATO", 180, 8);
  assert.ok(r.length >= 2 && r.every((x) => x.length > 0));
  assert.deepEqual(aCapo("riga uno\nriga due", 500, 8), ["riga uno", "riga due"]);
});

test("PDF dell'ordine valido, anche su più pagine", () => {
  const righe = Array.from({ length: 70 }, (_, i) => ({ codice: `ZEN/${i}`, codiceFornitore: "F/2F", descrizione: `Finestra 2 ante Zenith (${i}) colore grigio RAL 9018 — maniglia € 12`, quantita: 1 + (i % 3), um: "pz", prezzoAcquisto: i % 2 ? 100 : null, scontoAcquisto: 35 }));
  const b = pdfOrdineFornitore({ numero: "15/2026", data: new Date("2026-10-27T10:00:00Z"), azienda: { ragioneSociale: "P&C S.r.l.", righe: ["Corso Moncenisio 28 (Rosta)"] }, fornitore: { ragioneSociale: "Fornitore (prova)", righe: ["ordini@esempio.it"] }, testata: [["Consegna richiesta", "30/11/2026"], ["Cliente finale", "Rossi"]], righe, note: "Consegna al mattino", firma: "Ufficio ordini" });
  const s = Buffer.from(b).toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  const pagine = Number(s.match(/\/Count (\d+)/)![1]);
  assert.ok(pagine >= 2, "70 righe vanno su più pagine");
  // ogni offset della tabella xref punta all'inizio dell'oggetto giusto
  const xref = Number(s.match(/startxref\n(\d+)/)![1]);
  const voci = s.slice(xref).split("\n").slice(3).filter((l) => / 00000 n /.test(l));
  voci.forEach((v, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, Number(v.slice(0, 10))), `oggetto ${i + 1}`));
  assert.ok(s.includes("\\(prova\\)"), "parentesi protette");
  assert.ok(s.includes("\x80 12"), "simbolo euro in WinAnsi");
});

test("email: configurazione, richieste ai servizi e mailto di riserva", () => {
  assert.equal(configEmail({}), null);
  assert.equal(configEmail({ EMAIL_PROVIDER: "gmail", EMAIL_API_KEY: "x", EMAIL_MITTENTE: "a@b.it" }), null);
  const cfg = configEmail({ EMAIL_PROVIDER: "Resend", EMAIL_API_KEY: "k", EMAIL_MITTENTE: "Ordini P&C <ordini@gruppopec.com>" })!;
  const msg = { a: ["f@x.it"], cc: ["ordini@gruppopec.com"], oggetto: "Ordine 1/2026", testo: "Buongiorno <test>", allegati: [{ nome: "o.pdf", contenuto: new Uint8Array([37, 80]), mime: "application/pdf" }] };
  const r = richiestaInvio(cfg, msg);
  const corpo = JSON.parse(r.init.body as string);
  assert.equal(r.url, "https://api.resend.com/emails");
  assert.equal(corpo.attachments[0].content, "JVA=");
  assert.ok(corpo.html.includes("&lt;test>"));
  const b = richiestaInvio({ ...cfg, provider: "brevo" }, msg);
  const cb = JSON.parse(b.init.body as string);
  assert.deepEqual(cb.sender, { name: "Ordini P&C", email: "ordini@gruppopec.com" });
  assert.equal(cb.attachment[0].name, "o.pdf");
  const m = linkMailto(msg);
  assert.ok(m.startsWith("mailto:f@x.it?cc=ordini%40gruppopec.com&subject=Ordine%201%2F2026"));
  assert.ok(emailValida("a@b.it") && !emailValida("ab.it") && !emailValida("a b@c.it"));
});

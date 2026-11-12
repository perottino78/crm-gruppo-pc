// Collaudo: «Invia offerta» con firma, link per il cliente, allegati e firme del team (server SMTP finto).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/invia-offerta.collaudo.ts
import net from "node:net";

// ── server SMTP finto: raccoglie le email inviate ─────────────────────────
const posta: { a: string[]; dati: string }[] = [];
const smtp = net.createServer((s) => {
  let inData = false, buf = "", rcpt: string[] = [];
  s.write("220 finto\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    if (inData) {
      const i = buf.indexOf("\r\n.\r\n");
      if (i < 0) return;
      posta.push({ a: rcpt, dati: buf.slice(0, i) });
      buf = buf.slice(i + 5); inData = false; rcpt = [];
      s.write("250 ok\r\n");
    }
    let j;
    while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
      const riga = buf.slice(0, j); buf = buf.slice(j + 2);
      const c = riga.slice(0, 4).toUpperCase();
      if (c === "EHLO") s.write("250-finto\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (c === "AUTH") s.write("235 ok\r\n");
      else if (c === "RCPT") { rcpt.push(riga.match(/<(.+)>/)?.[1] ?? ""); s.write("250 ok\r\n"); }
      else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); }
      else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); }
      else s.write("250 ok\r\n");
    }
  });
});

import { prisma } from "../../src/lib/prisma";
import { inviaOffertaEmail, salvaFirma } from "../../src/app/offerte-email-actions";
import { aggiornaSchedaRiga } from "../../src/app/actions";
import { codiceOfferta, leggiCodiceOfferta } from "../../src/lib/mail/link-offerta";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const modulo = (o: Record<string, string | string[]>, file?: File[]) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  for (const x of file ?? []) f.append("file", x);
  return f;
};
// il messaggio grezzo può essere in quoted-printable o base64: per i controlli lo "srotoliamo"
const leggibile = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_t, h) => String.fromCharCode(parseInt(h, 16)));

async function main() {
  await new Promise<void>((r) => smtp.listen(2531, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2531", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "EmailOfferta","Documento","Preventivo","Configurazione","Utente","Brand","Cliente" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "Solaris" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@gruppopec.com", username: "marco", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE", telefono: "333 1234567" } });
  const luca = await prisma.utente.create({ data: { nome: "Luca Verdi", email: "luca@gruppopec.com", username: "luca", ruolo: "COMMERCIALE" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "marketing@gruppopec.com", username: "rocco", ruolo: "MARKETING", ufficio: "MARKETING" } });
  const cliente = await prisma.cliente.create({ data: { nome: "Rossi Mario", brandId: brand.id, responsabileId: marco.id } });
  const off = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: brand.id, commercialeId: marco.id, numeroOfferta: 7, oggetto: "impianto fotovoltaico 6 kW" } });
  const doc = await prisma.documento.create({ data: { entita: "PREVENTIVO", entitaId: off.id, cartella: "Rilievi e disegni", nome: "schema.pdf", mime: "application/pdf", dimensione: 9, contenuto: Buffer.from("%PDF-1.4\n") } });
  const altro = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: brand.id, commercialeId: luca.id } });
  const docAltro = await prisma.documento.create({ data: { entita: "PREVENTIVO", entitaId: altro.id, cartella: "Generale", nome: "segreto.pdf", mime: "application/pdf", dimensione: 3, contenuto: Buffer.from("xyz") } });

  console.log("1. Firme");
  g.__utente = marco;
  let r = await redirectA(salvaFirma(modulo({ utenteId: luca.id, firma: "Luca finto", torna: "/profilo" })));
  verifica(r?.includes("Non hai il permesso"), "un commerciale non cambia la firma di un collega", r);
  r = await redirectA(salvaFirma(modulo({ firma: "Marco Piccatti\nConsulente energia\nCell. 333 1234567\nwww.solaris.it", torna: "https://sito-cattivo.it" })));
  verifica(r?.includes(";/profilo?firmaSalvata="), "la sua firma si salva (e si torna solo a pagine del CRM)", r);
  g.__utente = rocco;
  r = await redirectA(salvaFirma(modulo({ utenteId: luca.id, firma: "Luca Verdi\nCommerciale Piemonte", torna: "/impostazioni/firme" })));
  verifica(r?.includes(";/impostazioni/firme?firmaSalvata=") && (await prisma.utente.findUnique({ where: { id: luca.id } }))?.firmaEmail === "Luca Verdi\nCommerciale Piemonte", "il marketing scrive la firma di un collega");

  console.log("2. Invio dell'offerta");
  g.__utente = luca;
  r = await redirectA(inviaOffertaEmail(modulo({ id: off.id, a: "mario@rossi.it", oggetto: "x", testo: "y", firma: "" })));
  verifica(r?.includes("Offerta non trovata"), "un commerciale non manda l'offerta di un altro", r);
  g.__utente = marco;
  r = await redirectA(inviaOffertaEmail(modulo({ id: off.id, a: "non-email", oggetto: "x", testo: "y", firma: "" })));
  verifica(r?.includes("Scrivi l'indirizzo email"), "senza email valida non parte", r);
  const marcoOra = (await prisma.utente.findUnique({ where: { id: marco.id } }))!;
  g.__utente = marcoOra;
  const pdf = new File([Buffer.from("%PDF-1.4 offerta")], "Offerta 7-2026.pdf", { type: "application/pdf" });
  r = await redirectA(inviaOffertaEmail(modulo({
    id: off.id, a: "Mario@Rossi.it", cc: "luca@gruppopec.com", oggetto: "Offerta n. 7/2026 — Solaris · Gruppo P&C",
    testo: "Gentile Mario,\n\nle invio l'offerta.\n\nCordiali saluti", firma: marcoOra.firmaEmail!, conLink: "1",
    documento: [doc.id, docAltro.id],
  }, [pdf])));
  verifica(r?.includes(`;/preventivi/${off.id}?inviata=mario@rossi.it`), "inviata e si torna all'offerta", r);
  const m = posta.at(-1)!;
  const testo = leggibile(m.dati);
  verifica(m.a.includes("mario@rossi.it") && m.a.includes("luca@gruppopec.com"), "arriva al cliente e al collega in copia", m.a);
  verifica(/^Cc: luca@gruppopec.com/m.test(m.dati), "il collega è in Cc");
  verifica(testo.includes(`/offerta/${codiceOfferta(off.id)}`) && testo.includes("Vedi e scarica l'offerta"), "c'è il pulsante con il link firmato all'offerta");
  verifica(testo.includes("Consulente energia") && testo.includes("www.solaris.it"), "c'è la firma di Marco");
  verifica(/filename="?schema\.pdf/.test(m.dati) && /Offerta 7-2026\.pdf/.test(testo) && !m.dati.includes("segreto.pdf"), "allegati: il documento dell'offerta e il file dal computer, non quelli di altre offerte");
  verifica(/^Reply-To: marco@gruppopec.com/im.test(m.dati), "le risposte del cliente vanno a Marco");
  const dopo = (await prisma.preventivo.findUnique({ where: { id: off.id }, include: { emailInviate: true } }))!;
  verifica(dopo.inviatoIl && dopo.inviatoA === "mario@rossi.it" && dopo.emailInviate.length === 1 && dopo.emailInviate[0].stato === "INVIATA" && dopo.emailInviate[0].allegati.length === 2, "offerta segnata come inviata, con lo storico", dopo.emailInviate);
  verifica((await prisma.cliente.findUnique({ where: { id: cliente.id } }))?.email === "mario@rossi.it", "l'email mancante del cliente è salvata nella scheda");
  verifica((await prisma.documento.count({ where: { entita: "PREVENTIVO", entitaId: off.id, cartella: "Corrispondenza", nome: "Offerta 7-2026.pdf" } })) === 1, "il PDF preso dal computer resta nei documenti dell'offerta");

  console.log("3. Server di posta che non risponde");
  process.env.SMTP_PORT = "2599";
  r = await redirectA(inviaOffertaEmail(modulo({ id: off.id, a: "mario@rossi.it", oggetto: "Di nuovo", testo: "Ciao", firma: "" })));
  verifica(r?.includes("Email non partita"), "si vede l'errore e si resta nell'editor", r);
  verifica((await prisma.emailOfferta.count({ where: { preventivoId: off.id, stato: "NON_INVIATA" } })) === 1, "anche il tentativo fallito resta nello storico");

  console.log("4. Link per il cliente");
  verifica(leggiCodiceOfferta(codiceOfferta(off.id)) === off.id && leggiCodiceOfferta(`${altro.id}.${codiceOfferta(off.id).split(".")[1]}`) === null, "il link apre solo la sua offerta");

  console.log("5. Scheda tecnica Optima allegata");
  process.env.SMTP_PORT = "2531";
  const finestra = await prisma.prodotto.create({ data: { brandId: brand.id, tipologia: "OPTIMA_F1A", colore: "STD", larghezzaMm: 800, altezzaMm: 1200, prezzoBase: 500 } });
  const rigaOpt = await prisma.rigaPreventivo.create({ data: { preventivoId: off.id, prodottoId: finestra.id, quantita: 1, prezzoUnitario: 500 } });
  await aggiornaSchedaRiga(modulo({ id: rigaOpt.id, allega: "1" }));
  verifica((await prisma.rigaPreventivo.findUnique({ where: { id: rigaOpt.id } }))?.allegaScheda === true, "la spunta sul prodotto si salva");
  r = await redirectA(inviaOffertaEmail(modulo({ id: off.id, a: "mario@rossi.it", oggetto: "Con scheda", testo: "Ciao", firma: "", scheda: "OPTIMA" })));
  const conScheda = posta.at(-1)!;
  verifica(r?.includes("?inviata=") && /Scheda tecnica Optima 70\.pdf/.test(leggibile(conScheda.dati)) && conScheda.dati.length > 300_000, "il PDF della scheda parte con l'email", r);
  await aggiornaSchedaRiga(modulo({ id: rigaOpt.id }));
  verifica((await prisma.rigaPreventivo.findUnique({ where: { id: rigaOpt.id } }))?.allegaScheda === false, "togliendo la spunta non si allega più");

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}

main().catch((e) => { console.error(e); ko++; }).finally(async () => { smtp.close(); await prisma.$disconnect(); process.exit(ko ? 1 : 0); });

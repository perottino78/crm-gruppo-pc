// Collaudo: il flusso reale di P&C fra uffici, passo per passo (Ugo 16/11/2026): Giorgia fattura, Debora segna il pagamento e crea il progetto,
// Alessia (centralino) fissa il rilievo con il rilevatore scelto, il tecnico carica il rilievo, Laura (ordini) conferma e ordina, il magazzino carica
// le bolle, Alessia fissa la posa (mail al cliente), la squadra consegna i documenti, Alessia segna la posa: recensione al cliente e task kit al commerciale.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/flusso-uffici.collaudo.ts
import net from "node:net";
import { prisma } from "../../src/lib/prisma";
import * as C from "../../src/app/commesse-actions";
import * as O from "../../src/app/ordini-actions";
import { avviaFaseFlusso } from "../../src/app/flusso-actions";
import { ordiniTuttiInviati } from "../../src/lib/pratica/avanzamenti";
import { verificaMaterialeCommessa } from "../../src/lib/magazzino/server";

// ── SMTP finto: raccoglie le mail ─────────────────────────
const posta: { a: string[]; dati: string }[] = [];
const smtp = net.createServer((s) => {
  let inData = false, buf = "", rcpt: string[] = [];
  s.write("220 finto\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    if (inData) { const i = buf.indexOf("\r\n.\r\n"); if (i < 0) return; posta.push({ a: rcpt, dati: buf.slice(0, i) }); buf = buf.slice(i + 5); inData = false; rcpt = []; s.write("250 ok\r\n"); }
    let j;
    while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
      const riga = buf.slice(0, j); buf = buf.slice(j + 2); const c = riga.slice(0, 4).toUpperCase();
      if (c === "EHLO") s.write("250-finto\r\n250 AUTH PLAIN LOGIN\r\n"); else if (c === "AUTH") s.write("235 ok\r\n");
      else if (c === "RCPT") { rcpt.push(riga.match(/<(.+)>/)?.[1] ?? ""); s.write("250 ok\r\n"); }
      else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); } else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); } else s.write("250 ok\r\n");
    }
  });
});
// testo leggibile di una mail: soggetto (anche codificato) e corpo (quoted-printable o base64)
function testoMail(m: { dati: string }): string {
  let t = m.dati.replace(/\?=\r?\n[ \t]+=\?UTF-8\?/gi, "?==?UTF-8?");
  t = t.replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (_, b) => Buffer.from(b, "base64").toString("utf8"));
  t = t.replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi, (_, q) => Buffer.from(q.replace(/_/g, " ").replace(/=([0-9A-F]{2})/g, (__: string, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8"));
  t = t.replace(/=\r\n/g, "").replace(/(=[0-9A-F]{2})+/g, (x) => Buffer.from(x.split("=").filter(Boolean).map((h) => parseInt(h, 16))).toString("utf8"));
  const b64 = t.match(/Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/g) ?? [];
  for (const blocco of b64) t += "\n" + Buffer.from(blocco.replace(/^[^\n]*\r?\n\r?\n/, "").replace(/[\r\n]/g, ""), "base64").toString("utf8");
  return t;
}

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d.split(";")[2] ?? ""); } };

async function main() {
  await new Promise<void>((r) => smtp.listen(2541, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2541", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x", MAIL_FROM: "Gruppo P&C <crm@gruppopec.com>", EMAIL_PROVIDER: "" });
  await prisma.$executeRawUnsafe('TRUNCATE "TaskPratica","FlussoFase","OrdineFornitore","RigaOrdine","CommessaEvento","Commessa","RigaPreventivo","Preventivo","Cliente","Soggetto","Utente","Brand","Rilievo","RilievoAllegato","Posa","PosaFoto","Configurazione" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const mk = (nome: string, ufficio: string, ruolo = "AMMINISTRATIVO") => prisma.utente.create({ data: { nome, email: `${nome.split(" ")[0].toLowerCase()}@gruppopec.com`, username: nome.split(" ")[0].toLowerCase(), ruolo, ufficio } });
  const debora = await mk("Debora Girodo", "AMMINISTRAZIONE", "AMMINISTRATORE");
  const giorgia = await mk("Giorgia Rosa", "FATTURAZIONE");
  const alessia = await mk("Alessia Vaccaro", "CENTRALINO", "TELEFONISTA");
  const marco = await mk("Marco Piccatti", "TECNICO", "TECNICO");
  const laura = await mk("Laura Pinto", "ORDINI");
  const paolo = await mk("Paolo Salvato", "MAGAZZINO");
  const squadra = await mk("Squadra Posa 1", "POSA", "POSATORE");
  const pavel = await prisma.utente.create({ data: { nome: "Pavel Cristian", email: "pavel@gruppopec.com", username: "pavel", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE", telefono: "333 1112233" } });
  const fidra = await prisma.soggetto.create({ data: { ragioneSociale: "FIDRA SRL", ruoli: ["FORNITORE"], emailOrdini: "ordini@fidra.it" } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", email: "mario@cliente.it", brandId: brand.id, comune: "Rosta", indirizzo: "Via Roma 1" } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: pavel.id, oggetto: "Serramenti", stato: "ACCETTATO" } });
  await prisma.rigaPreventivo.create({ data: { preventivoId: prev.id, testoLibero: "Finestra 2 ante", prezzoUnitario: 900, quantita: 2, ordine: 1 } });
  const c = await prisma.commessa.create({ data: { numero: 7, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id, responsabileId: pavel.id, accontoImporto: 900 } });
  const aperti = async () => (await prisma.taskPratica.findMany({ where: { commessaId: c.id, completatoIl: null, faseChiave: { not: null } }, orderBy: { createdAt: "asc" } })).map((t) => `${t.faseChiave}:${t.ufficio}`).join(" ");

  console.log("1. Conferma ordine: partono insieme l'apertura pratica (Giorgia) e l'incasso (Debora)");
  g.__utente = pavel;
  await avviaFaseFlusso(c.id, "FATT_ACCONTO", "COMMERCIALE", "Pavel");
  verifica((await aperti()).split(" ").sort().join(" ") === "FATT_ACCONTO:FATTURAZIONE PROGETTO:AMMINISTRAZIONE", "due task", await aperti());

  console.log("2. Giorgia: fattura di acconto, creazione progetto e chiamata di benvenuto (un passo alla volta)");
  g.__utente = giorgia;
  await dove(C.creaProgetto(fd({ commessaId: c.id })));
  verifica(!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).progettoCreatoIl, "il progetto non si crea prima della fattura di acconto");
  await dove(C.registraFatturaAcconto(fd({ commessaId: c.id })));
  await dove(C.registraBenvenuto(fd({ commessaId: c.id, note: "x" })));
  verifica(!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).benvenutoIl, "il benvenuto non si salva prima del progetto");
  await dove(C.creaProgetto(fd({ commessaId: c.id })));
  verifica(!!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).progettoCreatoIl, "progetto creato da Giorgia");
  verifica(!(await aperti()).includes("RILIEVO_APP"), "il rilievo aspetta l'incasso dell'acconto", await aperti());
  await dove(C.registraBenvenuto(fd({ commessaId: c.id, note: "Cliente contento" })));
  verifica(!!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).benvenutoIl && !(await aperti()).includes("FATT_ACCONTO"), "chiamata di benvenuto salvata: il task di Giorgia si chiude", await aperti());

  console.log("3. Debora segna l'acconto pagato: ringraziamento al cliente e il task passa ad Alessia (centralino)");
  g.__utente = debora;
  await dove(C.registraIncassoAcconto(fd({ id: c.id, importo: "900", modalita: "Bonifico" })));
  const grazie = posta.find((m) => /Grazie! Abbiamo ricevuto il suo pagamento/.test(testoMail(m)));
  verifica(grazie?.a.includes("mario@cliente.it"), "ringraziamento al cliente", posta.map((m) => m.a));
  await dove(C.registraIncassoAcconto(fd({ id: c.id, importo: "900" }))).catch(() => undefined);
  verifica(posta.filter((m) => /Grazie! Abbiamo ricevuto/.test(testoMail(m))).length === 1, "una sola mail di ringraziamento");
  verifica((await aperti()).split(" ").sort().join(" ") === "RILIEVO_APP:CENTRALINO", "task rilievo al centralino (progetto e acconto fatti)", await aperti());

  console.log("4. Alessia fissa il rilievo e sceglie il tecnico: mail al cliente, il task va al tecnico");
  g.__utente = alessia;
  const quando = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16);
  await C.programmaRilievo(fd({ commessaId: c.id, tecnicoId: marco.id, dataOra: quando }));
  verifica(posta.some((m) => /Rilievo delle misure fissato/.test(testoMail(m)) && m.a.includes("mario@cliente.it")), "mail del rilievo al cliente");
  const tRil = await prisma.taskPratica.findFirst({ where: { commessaId: c.id, faseChiave: "RILIEVO", completatoIl: null } });
  verifica(tRil?.ufficio === "TECNICO" && tRil.assegnatoUtenteId === marco.id, "task di rilievo assegnato al tecnico scelto", tRil);

  console.log("5. Il tecnico carica il rilievo (eseguito): il task passa a Laura, ufficio ordini");
  const avvisi = await prisma.taskPratica.findMany({ where: { commessaId: c.id, faseChiave: null, ufficio: "COMMERCIALE" } });
  verifica(avvisi.length === 1 && /Rilievo fissato/.test(avvisi[0].titolo), "per conoscenza al commerciale: task del rilievo fissato", avvisi.map((a) => a.titolo));
  g.__utente = marco;
  const ril = await prisma.rilievo.findFirstOrThrow({ where: { commessaId: c.id } });
  await dove(C.caricaRilievo(fd({ rilievoId: ril.id, misure: "Soggiorno L 1200 × H 1400" })));
  verifica((await aperti()).split(" ").sort().join(" ") === "ORDINI:ORDINI", "task all'ufficio ordini", await aperti());

  console.log("6. Laura conferma il materiale, ordina; con tutte le righe ordinate il task va al magazzino");
  g.__utente = laura;
  await prisma.rigaOrdine.updateMany({ where: { commessaId: c.id }, data: { fornitoreId: fidra.id, fornitoreNome: "FIDRA SRL" } });
  await dove(C.confermaMaterialeProgetto(fd({ commessaId: c.id })));
  const righe = await prisma.rigaOrdine.findMany({ where: { commessaId: c.id } });
  await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id, riga: righe.map((r) => r.id) })));
  verifica((await prisma.ordineFornitore.count({ where: { commessaId: c.id } })) === 1, "ordine creato");
  await prisma.rigaOrdine.updateMany({ where: { commessaId: c.id }, data: { ordinato: true, ordinatoIl: new Date() } });
  await ordiniTuttiInviati(c.id);
  verifica((await aperti()).split(" ").sort().join(" ") === "MAGAZZINO:MAGAZZINO", "task al magazzino", await aperti());

  console.log("7. Il magazzino carica le bolle: pratica completa → saldo a Giorgia e posa ad Alessia");
  g.__utente = paolo;
  await prisma.rigaOrdine.updateMany({ where: { commessaId: c.id }, data: { arrivato: true, arrivatoIl: new Date(), quantitaArrivata: 5 } });
  await prisma.$transaction((tx) => verificaMaterialeCommessa(tx, c.id, "Paolo Salvato"));
  const dopoMag = (await aperti()).split(" ").sort().join(" ");
  verifica(dopoMag.includes("POSA_APP:CENTRALINO") && !dopoMag.includes("MAGAZZINO:") && dopoMag.includes("MATERIALE_COMPLETO:FATTURAZIONE"), "task di posa al centralino e di saldo alla fatturazione", dopoMag);

  console.log("8. Alessia fissa la posa con la squadra: mail al cliente (ambiente di lavoro), il task va alla squadra");
  g.__utente = alessia;
  await C.programmaPosa(fd({ commessaId: c.id, dataInizio: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 16), assegnatario: `U:${squadra.id}`, giorniPrevisti: "2" }));
  verifica(posta.some((m) => /Posa fissata/.test(testoMail(m)) && /liberare le zone di posa/i.test(testoMail(m).replace(/=\r\n/g, ""))), "mail della posa con la preparazione dell'ambiente");
  const tPosa = await prisma.taskPratica.findFirst({ where: { commessaId: c.id, faseChiave: "POSA", completatoIl: null } });
  verifica(tPosa?.ufficio === "POSA" && tPosa.assegnatoUtenteId === squadra.id, "task alla squadra", tPosa);

  console.log("9. Posa PARZIALE: scuse al cliente e nuovo task al centralino, niente kit");
  const posa = await prisma.posa.findFirstOrThrow({ where: { commessaId: c.id } });
  const mailPrima = posta.length;
  await C.completaPosa(fd({ posaId: posa.id, esitoPosa: "PARZIALE", noteFine: "manca un vetro", tipoCosto: "INTERNA" }));
  verifica(posta.slice(mailPrima).some((m) => /non è ancora conclusa/.test(testoMail(m))), "scuse al cliente");
  verifica((await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).stato !== "LAVORI_ESEGUITI" && (await aperti()).includes("POSA_APP:CENTRALINO"), "la pratica resta in posa, task per un'altra data", await aperti());
  verifica(!(await aperti()).includes("KIT:"), "nessun task kit");

  console.log("10. Seconda posa FINITA: recensione al cliente e task kit al commerciale (con mail)");
  await prisma.posa.update({ where: { id: posa.id }, data: { stato: "PROGRAMMATA", completataIl: null } });
  const mail2 = posta.length;
  await C.completaPosa(fd({ posaId: posa.id, esitoPosa: "COMPLETA", noteFine: "tutto a posto", tipoCosto: "INTERNA" }));
  verifica(posta.slice(mail2).some((m) => /ci racconta com'è andata/.test(testoMail(m)) && /recensioni/.test(testoMail(m))), "richiesta di recensione al cliente");
  const kit = await prisma.taskPratica.findFirst({ where: { commessaId: c.id, faseChiave: "KIT", completatoIl: null } });
  verifica(kit?.ufficio === "COMMERCIALE" && kit.assegnatoUtenteId === pavel.id, "task kit al commerciale della pratica", kit);
  verifica(posta.slice(mail2).some((m) => m.a.includes("pavel@gruppopec.com")), "mail di avviso al commerciale");
  verifica((await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).stato === "LAVORI_ESEGUITI" && !!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).recensioneRichiestaIl, "lavori eseguiti, recensione richiesta");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

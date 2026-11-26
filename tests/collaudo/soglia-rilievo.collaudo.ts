// Collaudo: regole di Debora del 21/11/2026 — rilievo con il 50% incassato, rate intermedie, finanziamento approvato da Giorgia,
// sblocco dell'amministratore, ritenuta 11% e pagamenti a mano da controllare.
import net from "node:net";
import { prisma } from "../../src/lib/prisma";
import * as C from "../../src/app/commesse-actions";
import { avviaFaseFlusso } from "../../src/app/flusso-actions";

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

import { registraPagamento, segnaControllatoEstratto } from "../../src/app/pagamenti-actions";
import { salvaFatturaVendita } from "../../src/app/vendite-actions";
import { impostaStatoScadenza } from "../../src/app/amministrazione-actions";
import { sincronizzaScadenzeCommesse } from "../../src/lib/amministrazione/server";
import { whereDaControllare } from "../../src/lib/amministrazione/da-controllare";

async function main() {
  await new Promise<void>((r) => smtp.listen(2542, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2542", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x", MAIL_FROM: "Gruppo P&C <crm@gruppopec.com>", EMAIL_PROVIDER: "" });
  await prisma.$executeRawUnsafe('TRUNCATE "TaskPratica","FlussoFase","AbbinamentoScadenza","MovimentoFinanziario","Scadenza","FatturaVendita","ContoFinanziario","RegistroAmministrazione","CommessaEvento","Commessa","RigaPreventivo","Preventivo","Cliente","Utente","Brand","Rilievo","Configurazione" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const mk = (nome: string, ufficio: string, ruolo = "AMMINISTRATIVO") => prisma.utente.create({ data: { nome, email: `${nome.split(" ")[0].toLowerCase()}@gruppopec.com`, username: nome.split(" ")[0].toLowerCase(), ruolo, ufficio } });
  const ugo = await mk("Ugo Perottino", "AMMINISTRAZIONE", "AMMINISTRATORE");
  const debora = await mk("Debora Girodo", "AMMINISTRAZIONE");
  const giorgia = await mk("Giorgia Rosa", "FATTURAZIONE", "COMMERCIALE");
  const pavel = await mk("Pavel Cristian", "COMMERCIALE", "COMMERCIALE");
  const bper = await prisma.contoFinanziario.create({ data: { nome: "Banca BPER", tipo: "BANCA", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", email: "mario@cliente.it", brandId: brand.id } });
  const nuova = async (numero: number, extra: Record<string, unknown> = {}) => {
    const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: pavel.id, oggetto: "Serramenti", stato: "ACCETTATO" } });
    return prisma.commessa.create({ data: { numero, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id, responsabileId: pavel.id, totaleVendita: 10000, accontoPercentuale: 30, accontoImporto: 3000, progettoCreatoIl: new Date(), ...extra } });
  };
  const rilievoApp = async (id: string) => !!(await prisma.taskPratica.findFirst({ where: { commessaId: id, faseChiave: "RILIEVO_APP" } }));
  const { statoSogliaRilievo } = await import("../../src/lib/pratica/soglia-server");

  console.log("1. Acconto del 30%: il rilievo non parte (serve il 50%)");
  const c = await nuova(1);
  g.__utente = debora;
  await dove(C.registraIncassoAcconto(fd({ id: c.id, importo: "3000", modalita: "Bonifico" })));
  verifica(!(await rilievoApp(c.id)), "con 3.000 su 10.000 niente rilievo");
  const st = await statoSogliaRilievo(c.id);
  verifica(st?.incassato === 3000 && st.soglia === 5000 && !st.viaLibera, "incassato 3.000, soglia 5.000", st);

  console.log("2. Rata intermedia di 2.000: il saldo cala, all'incasso parte il rilievo");
  await dove(C.aggiungiRataIntermedia(fd({ commessaId: c.id, importo: "2000", data: "2026-12-10", descrizione: "Seconda rata" })));
  await sincronizzaScadenzeCommesse(c.id);
  const rata = await prisma.scadenza.findFirstOrThrow({ where: { commessaId: c.id, origine: "COMMESSA_RATA_1" } });
  const saldo = await prisma.scadenza.findFirstOrThrow({ where: { commessaId: c.id, origine: "COMMESSA_SALDO" } });
  verifica(rata.importo === 2000 && saldo.importo === 5000, "rata 2.000, saldo 10.000 − 3.000 − 2.000 = 5.000", { rata: rata.importo, saldo: saldo.importo });
  await dove(registraPagamento(fd({ scadenzaId: rata.id, data: "2026-11-21", importo: "2000", contoId: bper.id, metodo: "BONIFICO" })));
  verifica(await rilievoApp(c.id), "con 5.000 incassati il rilievo parte (task al centralino)");

  console.log("3. Finanziamento: lo segna approvato Giorgia (fatturazione)");
  const f = await nuova(2, { accontoTipo: "FINANZIAMENTO", finanziamentoStato: "IN_ISTRUTTORIA" });
  g.__utente = giorgia;
  await dove(C.aggiornaFinanziamento(fd({ id: f.id, finanziamentoStato: "APPROVATO" })));
  verifica((await prisma.commessa.findUniqueOrThrow({ where: { id: f.id } })).finanziamentoStato === "APPROVATO" && (await rilievoApp(f.id)), "approvato da Giorgia: parte il rilievo");

  console.log("4. Sotto il 50%: si chiede all'amministratore, che sblocca il rilievo");
  const s = await nuova(3);
  g.__utente = debora;
  await dove(C.registraIncassoAcconto(fd({ id: s.id, importo: "1000", modalita: "Bonifico" })));
  const prima = posta.length;
  await dove(C.chiediSbloccoRilievo(fd({ commessaId: s.id, motivo: "cliente storico" })));
  const t = await prisma.taskPratica.findFirst({ where: { commessaId: s.id, titolo: { startsWith: "Sbloccare il rilievo" }, completatoIl: null } });
  verifica(t?.assegnatoUtenteId === ugo.id && /cliente storico/.test(t.descrizione ?? ""), "task all'amministratore con il motivo", t);
  verifica(posta.slice(prima).some((m) => m.a.includes("ugo@gruppopec.com") && /rilievo senza il 50/i.test(testoMail(m))), "email all'amministratore");
  await dove(C.sbloccaRilievo(fd({ commessaId: s.id })));
  verifica(!(await prisma.commessa.findUniqueOrThrow({ where: { id: s.id } })).rilievoSbloccatoIl, "Debora non può sbloccare: solo l'amministratore");
  g.__utente = ugo;
  await dove(C.sbloccaRilievo(fd({ commessaId: s.id })));
  verifica(!!(await prisma.commessa.findUniqueOrThrow({ where: { id: s.id } })).rilievoSbloccatoIl && (await rilievoApp(s.id)), "l'amministratore sblocca: parte il rilievo");
  verifica(!!(await prisma.taskPratica.findUniqueOrThrow({ where: { id: t!.id } })).completatoIl, "il task di sblocco si chiude");

  console.log("5. Ritenuta 11%: conta come pagata ma non è un movimento");
  g.__utente = debora;
  const r = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Saldo FT 40", controparte: "VERDI ANNA", importo: 1000 } });
  await dove(registraPagamento(fd({ scadenzaId: r.id, data: "2026-11-21", importo: "900", ritenuta: "100", contoId: bper.id, metodo: "BONIFICO_DETRAZIONE" })));
  const rr = await prisma.scadenza.findUniqueOrThrow({ where: { id: r.id } });
  const mov = await prisma.movimentoFinanziario.findMany({ where: { descrizione: { contains: "VERDI ANNA" } } });
  verifica(rr.stato === "PAGATA" && rr.ritenuta === 100 && mov.length === 1 && mov[0].importo === 900, "scadenza saldata, in banca solo i 900 accreditati", { stato: rr.stato, mov: mov.map((m) => m.importo) });

  console.log("6. Pagamenti a mano senza prima nota: lista e controllo con l'estratto");
  const m = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Saldo FT 41", controparte: "BIANCHI LUCA", importo: 500 } });
  await dove(registraPagamento(fd({ scadenzaId: m.id, data: "2026-11-21", importo: "500", contoId: bper.id, metodo: "BONIFICO", senzaPrimaNota: "1" })));
  verifica((await prisma.scadenza.count({ where: { ...whereDaControllare(), id: m.id } })) === 1, "finisce fra i pagamenti da controllare");
  await dove(segnaControllatoEstratto(fd({ id: m.id })));
  const mm = await prisma.scadenza.findUniqueOrThrow({ where: { id: m.id } });
  verifica(!!mm.controllatoEstrattoIl && mm.controllatoDaNome === "Debora Girodo" && (await prisma.scadenza.count({ where: { ...whereDaControllare(), id: m.id } })) === 0, "controllato: esce dalla lista");

  console.log("7. Caso Rita Esposito: fattura saldata da 4.500 € collegata alla pratica da 9.000 € → «Rilievo da programmare»");
  g.__utente = debora;
  const rita = await nuova(7, { totaleVendita: 9000, accontoImporto: 4500, accontoPercentuale: 50, stato: "IN_ATTESA_ACCONTO" });
  const fv = await prisma.fatturaVendita.create({ data: { chiave: "BCV|535", sezionale: "FE", numero: "535/FE/2026", data: new Date("2026-11-10T12:00:00Z"), clienteNome: "ROSSI MARIO", clienteId: cli.id, imponibile: 4500, iva: 0, totale: 4500, detrazione: true } });
  await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Fattura 535/FE/2026", controparte: "ROSSI MARIO", importo: 4500, stato: "PAGATA", pagatoManuale: 4500, origine: "FATTURA_VENDITA", chiaveImport: `FV:${fv.id}:0`, fatturaVenditaId: fv.id, numeroDocumento: "535/FE/2026" } });
  verifica((await prisma.commessa.findUniqueOrThrow({ where: { id: rita.id } })).stato === "IN_ATTESA_ACCONTO", "prima del collegamento la pratica è «In attesa acconto»");
  await dove(salvaFatturaVendita(fd({ id: fv.id, commessa: "C2026-007", cliente: "ROSSI MARIO" })));
  const dopoRita = await prisma.commessa.findUniqueOrThrow({ where: { id: rita.id } });
  verifica(dopoRita.stato === "RILIEVO_DA_PROGRAMMARE" && dopoRita.accontoIncassato, "collegata la fattura saldata: «Rilievo da programmare» e acconto incassato", { stato: dopoRita.stato });
  verifica(await rilievoApp(rita.id), "parte il task di fissare il rilievo");

  console.log("8. «Saldata» dallo scadenzario completo avanza la pratica come un pagamento");
  const sald = await nuova(8, { stato: "IN_ATTESA_ACCONTO" });
  await sincronizzaScadenzeCommesse(sald.id);
  const accSc = await prisma.scadenza.findFirstOrThrow({ where: { commessaId: sald.id, origine: "COMMESSA_ACCONTO" } });
  await prisma.scadenza.update({ where: { id: accSc.id }, data: { importo: 5000 } });
  await dove(impostaStatoScadenza(fd({ id: accSc.id, stato: "Saldata" })));
  verifica((await prisma.commessa.findUniqueOrThrow({ where: { id: sald.id } })).stato === "RILIEVO_DA_PROGRAMMARE", "con 5.000 su 10.000 segnati «Saldata» la pratica passa a «Rilievo da programmare»");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); smtp.close(); await prisma.$disconnect(); process.exit(1); });

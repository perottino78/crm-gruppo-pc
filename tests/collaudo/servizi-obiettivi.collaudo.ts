// Collaudo: «Servizi e pratiche» fuori provvigione, spunta «va in provvigione», provvigione sulla base netta, obiettivi e premi
// con l'email del lunedì (server SMTP finto).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/servizi-obiettivi.collaudo.ts
import net from "node:net";

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

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import * as seed from "../../src/app/api/admin/seed-servizi/route";
import { tassonomiaListino } from "../../src/lib/listini/tassonomia";
import { contrattiDi } from "../../src/lib/provvigioni/server";
import { salvaObiettiviCommerciale, mandaOraEmailObiettivi, impostaEmailObiettivi } from "../../src/app/provvigioni-actions";
import { inviaEmailObiettivi, obiettiviDi } from "../../src/lib/provvigioni/obiettivi-server";
import { salvaModelloProdotto } from "../../src/app/actions";
import { chiaveGiorno } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-servizi", { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await new Promise<void>((r) => smtp.listen(2534, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2534", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "Configurazione","Obiettivo","LiquidazioneProvvigione","Provvigione","Scadenza","FatturaVendita","Commessa","RigaOptional","RigaPreventivo","Optional","Prodotto","ModelloProdotto","Preventivo","Utente","Brand","Cliente" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  await prisma.brand.create({ data: { nome: "Solaris" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@x.it", username: "mpiccatti", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE" } });
  const luca = await prisma.utente.create({ data: { nome: "Luca Verdi", email: "luca@x.it", username: "luca", ruolo: "COMMERCIALE" } });
  const giorgia = await prisma.utente.create({ data: { nome: "Giorgia Rosa Clot", email: "giorgia@x.it", username: "grosaclot", ruolo: "AMMINISTRATIVO", ufficio: "FATTURAZIONE" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  // vecchio listino con ENEA e autoscala come optional, più un optional normale; una voce «Facchinaggio» nel listino Work&Service
  const enea = await prisma.optional.create({ data: { brandId: brand.id, categoria: "Servizi al contratto", nome: "Pratica ENEA (gestione e presentazione)", valore: 350, listino: "FIDRA" } });
  await prisma.optional.create({ data: { brandId: brand.id, categoria: "Servizi al contratto", nome: "Autoscala dal 3° piano in su", valore: 500, listino: "FIDRA" } });
  const ral = await prisma.optional.create({ data: { brandId: brand.id, categoria: "Colore", nome: "RAL fuori standard", valore: 200, listino: "FIDRA" } });
  await prisma.prodotto.create({ data: { brandId: brand.id, tipologia: "WSPOSA_NOTE_POSA_SERRAMENTI", colore: "Facchinaggio al piano", larghezzaMm: 0, altezzaMm: 0, prezzoBase: 70 } });
  await prisma.prodotto.create({ data: { brandId: brand.id, tipologia: "WSPOSA_NOTE_POSA_SERRAMENTI", colore: "Smontaggio vecchio serramento", larghezzaMm: 0, altezzaMm: 0, prezzoBase: 40 } });
  const finestra = await prisma.prodotto.create({ data: { brandId: brand.id, tipologia: "FIDRA_F1A", colore: "STD", larghezzaMm: 1000, altezzaMm: 1400, prezzoBase: 1000 } });
  await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia: "FIDRA_F1A", famiglia: "INDOOR", gruppo: "SERRAMENTI" } });

  console.log("1. Caricamento dei Servizi e pratiche");
  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === 12 && prova.optionalSpostati.length === 2 && prova.facchinaggioWsTolti === 1, "la prova conta 6 voci × 2 marchi, 2 optional da spostare, 1 facchinaggio W&S", prova);
  verifica(await prisma.prodotto.count({ where: { tipologia: { startsWith: "SERVIZI_" } } }) === 0, "la prova non scrive nulla");
  const fatto = await (await seed.POST(req("POST"))).json();
  verifica(fatto.ok && fatto.prodottiCreati === 12, "caricati i servizi per ogni marchio", fatto);
  const modelli = await prisma.modelloProdotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: "SERVIZI_" } } });
  verifica(modelli.length === 3 && modelli.every((m) => !m.inProvvigione && m.famiglia === "SERVIZI" && m.gruppo === "SERVIZI E PRATICHE"), "modelli ENEA/autoscala/facchinaggio senza spunta provvigione, famiglia Servizi");
  const opt = await prisma.optional.findMany({ where: { brandId: brand.id } });
  verifica(opt.filter((o) => !o.attivo && !o.inProvvigione).length === 2 && opt.find((o) => o.id === ral.id)!.attivo, "ENEA e autoscala escono dagli optional, il RAL resta");
  verifica(await prisma.prodotto.count({ where: { colore: "Facchinaggio al piano", tipologia: { startsWith: "WSPOSA_" } } }) === 0 && await prisma.prodotto.count({ where: { tipologia: "WSPOSA_NOTE_POSA_SERRAMENTI" } }) === 1, "via il facchinaggio W&S mai usato, resta lo smontaggio");
  const rilancio = await (await seed.POST(req("POST"))).json();
  verifica(rilancio.prodottiCreati === 0 && rilancio.optionalSpostati.length === 0, "rilanciabile senza doppioni", rilancio);
  const albero = await tassonomiaListino(brand.id);
  const servizi = albero.find((f) => f.nome === "SERVIZI");
  verifica(servizi && JSON.stringify(servizi).includes("Pratica ENEA") && JSON.stringify(servizi).includes("Autoscala"), "nel catalogo dell'offerta c'è la famiglia «Servizi e pratiche»");

  console.log("2. Contratto con un servizio: la base della provvigione è al netto");
  const cliente = await prisma.cliente.create({ data: { nome: "Rossi Mario", comune: "Rivoli", brandId: brand.id } });
  const eneaProd = (await prisma.prodotto.findFirst({ where: { brandId: brand.id, tipologia: "SERVIZI_ENEA" } }))!;
  const pr = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: brand.id, commercialeId: marco.id, stato: "ACCETTATO", oggetto: "Finestre Fidra", totaleNetto: 3350 } });
  const rigaF = await prisma.rigaPreventivo.create({ data: { preventivoId: pr.id, prodottoId: finestra.id, quantita: 3, prezzoUnitario: 1000 } });
  await prisma.rigaOptional.create({ data: { rigaId: rigaF.id, optionalId: enea.id, quantita: 1, prezzoUnitario: 350 } }); // vecchia offerta con ENEA optional
  await prisma.rigaPreventivo.create({ data: { preventivoId: pr.id, prodottoId: eneaProd.id, quantita: 1, prezzoUnitario: 350 } });
  await prisma.rigaPreventivo.create({ data: { preventivoId: pr.id, testoLibero: "Smaltimento", quantita: 1, prezzoUnitario: 100 } });
  const oggi = new Date();
  await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: pr.id, clienteId: cliente.id, brandId: brand.id, totaleVendita: 4880, totaleImponibile: 3800, accontoImporto: 2440, createdAt: oggi } });
  let lista = await contrattiDi([{ id: marco.id, nome: marco.nome, username: marco.username }]);
  verifica(lista.length === 1 && lista[0].servizi === 700, "servizi fuori provvigione = ENEA prodotto 350 + ENEA optional 350 (finestre e testo restano dentro)", lista[0]?.servizi);

  console.log("3. La spunta «va in provvigione» sulla scheda del modello");
  g.__utente = ugo;
  await salvaModelloProdotto(fd({ brandId: brand.id, tipologia: "FIDRA_F1A", famiglia: "INDOOR", gruppo: "SERRAMENTI", conProvvigione: "1" }));
  verifica((await prisma.modelloProdotto.findFirst({ where: { tipologia: "FIDRA_F1A" } }))!.inProvvigione === false, "togliendo la spunta il modello esce dalla provvigione");
  lista = await contrattiDi([{ id: marco.id, nome: marco.nome, username: marco.username }]);
  verifica(lista[0].servizi === 3700, "…e il suo importo si toglie dalla base", lista[0].servizi);
  await salvaModelloProdotto(fd({ brandId: brand.id, tipologia: "FIDRA_F1A", famiglia: "INDOOR", gruppo: "SERRAMENTI", conProvvigione: "1", inProvvigione: "1" }));
  g.__utente = marco;
  await salvaModelloProdotto(fd({ brandId: brand.id, tipologia: "FIDRA_F1A", famiglia: "INDOOR", gruppo: "SERRAMENTI", conProvvigione: "1" }));
  verifica((await prisma.modelloProdotto.findFirst({ where: { tipologia: "FIDRA_F1A" } }))!.inProvvigione === true, "rimessa la spunta; un commerciale non può toglierla");

  console.log("4. Obiettivi e premi");
  const mese = chiaveGiorno(oggi).slice(0, 7), anno = mese.slice(0, 4);
  g.__utente = marco;
  let r = await redirectA(salvaObiettiviCommerciale(fd({ utenteId: marco.id, mese, anno, targetMese: "10000", premioMese: "300" })));
  verifica(r?.includes("errore") && await prisma.obiettivo.count() === 0, "il commerciale non può darsi gli obiettivi", r);
  g.__utente = giorgia;
  r = await redirectA(salvaObiettiviCommerciale(fd({ utenteId: marco.id, mese, anno, targetMese: "10000", premioMese: "300", targetAnno: "100000", premioAnno: "2000", note: "forza!" })));
  const obs = await prisma.obiettivo.findMany({ where: { utenteId: marco.id } });
  verifica(r?.includes("ok=") && obs.length === 2 && obs.find((o) => o.periodo === anno)?.premio === 2000 && obs.find((o) => o.periodo === mese)?.importoTarget === 10000, "la fatturazione salva obiettivo e premio di mese e anno", obs);
  const ob = await obiettiviDi(marco.id, lista);
  verifica(ob.mese?.av.venduto === 3800 && ob.mese.premio === 300 && ob.anno?.av.target === 100000, "venduto del mese = imponibile del contratto", ob.mese?.av);
  await redirectA(salvaObiettiviCommerciale(fd({ utenteId: luca.id, mese, anno, targetMese: "5000" })));
  await redirectA(salvaObiettiviCommerciale(fd({ utenteId: luca.id, mese, anno, targetMese: "" })));
  verifica(await prisma.obiettivo.count({ where: { utenteId: luca.id } }) === 0, "obiettivo vuoto = tolto");

  console.log("5. Email del lunedì");
  const sabato = new Date("2026-11-14T09:00:00Z"), lunedi = new Date("2026-11-16T08:00:00Z");
  let e = await inviaEmailObiettivi({ adesso: sabato });
  verifica(e.motivo === "fine settimana" && posta.length === 0, "il sabato non parte", e);
  e = await inviaEmailObiettivi({ adesso: lunedi });
  verifica(e.inviate === 1 && posta.length === 1 && posta[0].a[0] === "marco@x.it", "il lunedì parte a chi ha un obiettivo (Marco), non a Luca", e);
  verifica(/obiettivi/i.test(posta[0]?.dati ?? "") && /premio/i.test(posta[0]?.dati ?? ""), "l'email parla degli obiettivi e del premio");
  e = await inviaEmailObiettivi({ adesso: new Date("2026-11-17T08:00:00Z") });
  verifica(e.motivo === "già mandata questa settimana" && posta.length === 1, "una volta sola a settimana", e);
  g.__utente = giorgia;
  await redirectA(impostaEmailObiettivi(fd({ attiva: "0" })));
  e = await inviaEmailObiettivi({ adesso: new Date("2026-11-23T08:00:00Z") });
  verifica(e.motivo === "email degli obiettivi spenta", "spenta non parte", e);
  r = await redirectA(mandaOraEmailObiettivi(fd({})));
  verifica(r?.includes("Email mandate: 1") && posta.length === 2, "«Manda adesso» parte anche se spenta", r);

  console.log(`\n${ok} ok, ${ko} ko`);
  smtp.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

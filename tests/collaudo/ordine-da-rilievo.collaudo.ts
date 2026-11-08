// Collaudo: dal rilievo all'ordine al fornitore come in BConsole — materiale dell'offerta + complementi, spunta delle righe
// dello stesso fornitore, ordine in bozza e invio da ordini@ con lista senza prezzi e rilievo allegato (server SMTP finto).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/ordine-da-rilievo.collaudo.ts
import net from "node:net";
import { prisma } from "../../src/lib/prisma";
import * as C from "../../src/app/commesse-actions";
import * as O from "../../src/app/ordini-actions";

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

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d.split(";")[2] ?? ""); } };

async function main() {
  await new Promise<void>((r) => smtp.listen(2533, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2533", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x", EMAIL_PROVIDER: "" });
  await prisma.$executeRawUnsafe('TRUNCATE "Documento","OrdineFornitore","RigaOrdine","CommessaEvento","Commessa","RigaPreventivo","Preventivo","Cliente","Soggetto","Utente","Brand","Rilievo","RilievoAllegato","Configurazione" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", ruolo: "AMMINISTRATORE" } });
  const fidra = await prisma.soggetto.create({ data: { ragioneSociale: "FIDRA SRL", ruoli: ["FORNITORE"], emailOrdini: "ordini@fidra.it" } });
  const mastro = await prisma.soggetto.create({ data: { ragioneSociale: "IL MASTRO SRLS", ruoli: ["FORNITORE"] } });
  const cli = await prisma.cliente.create({ data: { nome: "GERBAUDO PIERANGELA", brandId: brand.id, comune: "Rosta" } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: ugo.id, oggetto: "Serramenti" } });
  await prisma.rigaPreventivo.createMany({ data: [
    { preventivoId: prev.id, testoLibero: "Finestra 2 ante 1200×1400", prezzoUnitario: 900, quantita: 2, ordine: 1 },
    { preventivoId: prev.id, testoLibero: "Scossalina davanzale", prezzoUnitario: 60, quantita: 1, ordine: 2 },
  ] });
  const c = await prisma.commessa.create({ data: { numero: 9, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });
  const ril = await prisma.rilievo.create({ data: { commessaId: c.id, tecnicoId: ugo.id, dataOra: new Date() } });
  g.__utente = ugo;

  console.log("1. Carico il rilievo: entra il materiale segnato dal commerciale");
  const pdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.4 rilievo cartaceo").toString("base64")}`;
  await dove(C.caricaRilievo(fd({ rilievoId: ril.id, misure: "Soggiorno L 1200 × H 1400", foto: JSON.stringify([{ nome: "rilievo cartaceo.pdf", dataUri: pdf }]) })));
  const offerta = await prisma.rigaOrdine.findMany({ where: { commessaId: c.id }, orderBy: { descrizione: "asc" } });
  verifica(offerta.length === 2 && offerta.every((r) => r.rigaPreventivoId && !r.complemento), "le 2 righe dell'offerta sono nel materiale della pratica", offerta.map((r) => r.descrizione));
  const [finestra, scossalina] = [offerta.find((r) => r.descrizione.startsWith("Finestra"))!, offerta.find((r) => r.descrizione.startsWith("Scossalina"))!];

  console.log("2. Aggiungo il materiale mancante");
  await dove(C.aggiungiComplemento(fd({ commessaId: c.id, tipo: "T", descrizione: "Coprifilo 70 mm", quantita: "4", fornitoreId: fidra.id })));
  await dove(C.aggiungiComplemento(fd({ commessaId: c.id, tipo: "T", descrizione: "Tappi laterali", quantita: "2" })));
  verifica(await prisma.rigaOrdine.count({ where: { commessaId: c.id } }) === 4, "nessun doppione delle righe dell'offerta, 2 complementi in più");
  const coprifilo = await prisma.rigaOrdine.findFirstOrThrow({ where: { descrizione: "Coprifilo 70 mm" } });
  const tappi = await prisma.rigaOrdine.findFirstOrThrow({ where: { descrizione: "Tappi laterali" } });
  await prisma.rigaOrdine.update({ where: { id: finestra.id }, data: { fornitoreId: fidra.id, fornitoreNome: "FIDRA SRL", prezzoAcquisto: 400 } });
  await prisma.rigaOrdine.update({ where: { id: scossalina.id }, data: { fornitoreId: mastro.id, fornitoreNome: "IL MASTRO SRLS" } });

  console.log("3. Spunto le righe e creo l'ordine");
  verifica((await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id }))))?.includes("Spunta"), "senza spunte: avviso");
  const misto = await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id, riga: [finestra.id, scossalina.id] })));
  verifica(misto?.includes("fornitori diversi") && misto.endsWith("#materiale-pratica"), "righe di fornitori diversi: avviso, si torna al materiale", misto);
  const senza = await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id, riga: [tappi.id, coprifilo.id] })));
  verifica(senza?.includes("non hanno il fornitore"), "riga senza fornitore: chiede di sceglierlo", senza);
  verifica(await prisma.ordineFornitore.count() === 0, "nessun ordine creato per sbaglio");
  const d1 = await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id, riga: [finestra.id, coprifilo.id] })));
  const o1 = await prisma.ordineFornitore.findFirstOrThrow({ where: { fornitoreId: fidra.id }, include: { righe: true } });
  verifica(o1.stato === "BOZZA" && o1.righe.length === 2 && o1.commessaId === c.id && o1.clienteFinale?.startsWith("GERBAUDO"), "ordine in bozza a FIDRA con le 2 righe spuntate", o1);
  verifica(d1 === `/ordini-fornitori/${o1.id}#invia`, "si apre l'ordine sull'invio", d1);
  await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id, riga: [tappi.id], fornitoreId: mastro.id })));
  const t2 = await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: tappi.id }, include: { ordineFornitore: true } });
  verifica(t2.fornitoreId === mastro.id && t2.fornitoreNome === "IL MASTRO SRLS" && t2.ordineFornitore?.fornitoreId === mastro.id, "fornitore scelto nella tendina: la riga va a Il Mastro", t2);
  verifica((await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id, riga: [finestra.id] }))))?.includes("già in un ordine"), "riga già ordinata: avviso");

  console.log("4. Invio da ordini@ con lista senza prezzi e rilievo allegato");
  const e = await O.inviaOrdineEmail(o1.id, "ordini@fidra.it", "", "Ordine 1/2026 - P&C S.r.l.", "Buongiorno, in allegato il nostro ordine con il rilievo misure.", { senzaPrezzi: true, conRilievo: true });
  verifica(e.ok && e.messaggio.includes("ordini@gruppopec.com") && e.messaggio.includes("rilievo allegato (1 file)"), "invio riuscito, conferme a ordini@", e);
  const m = posta[0]?.dati ?? "";
  verifica(posta.length === 1 && posta[0].a.includes("ordini@fidra.it"), "email al fornitore", posta.map((p) => p.a));
  verifica(/^From: .*Ufficio ordini.*ordini@gruppopec\.com/m.test(m) && /^Reply-To: .*ordini@gruppopec\.com/m.test(m), "parte da ordini@gruppopec.com e le risposte tornano lì", m.slice(0, 600));
  verifica(m.includes('filename="rilievo cartaceo.pdf"') || m.includes("rilievo cartaceo.pdf"), "allegato il rilievo cartaceo");
  const allegatoPdf = m.split(/\r\n--/).find((p) => /Ordine 1-2026/.test(p) && /application\/pdf/.test(p));
  const testoPdf = allegatoPdf ? Buffer.from(allegatoPdf.split(/\r\n\r\n/).slice(1).join("").replace(/\s+/g, ""), "base64").toString("latin1") : "";
  verifica(testoPdf.startsWith("%PDF") && !testoPdf.includes("Importo") && !testoPdf.includes("400,00"), "PDF dell'ordine senza prezzi", testoPdf.slice(0, 40));
  const o1b = await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: o1.id }, include: { righe: true } });
  verifica(o1b.stato === "INVIATO" && o1b.righe.every((r) => r.ordinato), "ordine inviato, righe ordinate");
  verifica(await prisma.commessaEvento.findFirst({ where: { commessaId: c.id, testo: { contains: "lista senza prezzi" } } }), "scritto nella storia della pratica");

  console.log("5. Con i prezzi, senza rilievo");
  await O.inviaOrdineEmail(o1.id, "ordini@fidra.it", "", "Ordine", "Testo", { senzaPrezzi: false, conRilievo: false });
  const m2 = posta[1]?.dati ?? "";
  verifica(!m2.includes("rilievo cartaceo.pdf"), "senza la spunta il rilievo non parte");

  console.log(`\n${ok} ok, ${ko} falliti`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { smtp.close(); await prisma.$disconnect(); process.exit(ko ? 1 : 0); });

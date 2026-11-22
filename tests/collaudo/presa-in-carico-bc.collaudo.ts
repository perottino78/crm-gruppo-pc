// Collaudo: «Prendi in carico nel CRM» di un ordine BConsole (pratica, fatture agganciate, task dalla fase scelta).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/presa-in-carico-bc.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { prendiInCaricoOrdineBC, agganciaOffertaONE } from "../../src/app/commesse-actions";
import { sincronizzaScadenzeCommesse } from "../../src/lib/amministrazione/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "DocumentoBC","AbbinamentoScadenza","Scadenza","FatturaVendita","TaskPratica","CommessaEvento","FaseCommessa","Commessa","RigaPreventivo","Preventivo","FlussoFase","Utente","Brand","Cliente" CASCADE');
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "uperottino", ruolo: "AMMINISTRATORE" } });
  const posatore = await prisma.utente.create({ data: { nome: "Gino Posa", email: "gino@x.it", username: "gino", ruolo: "POSATORE" } });
  await prisma.brand.create({ data: { nome: "P&C" } });
  const pura = await prisma.brand.create({ data: { nome: "Purafonte" } });
  const cliente = await prisma.cliente.create({ data: { nome: "Stefano Giorgini", brandId: pura.id } });
  await prisma.documentoBC.create({ data: { id: "ORD|1268", tipo: "ORDINE", numero: "414/2026", data: new Date("2026-10-30"), clienteId: cliente.id, clienteNome: "GIORGINI STEFANO", agente: "UPE", riferimento: "Depuratore casa", stato: "In corso", imponibile: 2049.18, totale: 2500, marchio: "Purafonte", pagamento: "Bonifico", offertaRif: "851/2026", progetto: "761/26", righe: [{ dsc: "Depuratore osmosi", qta: 1, imponibile: 2049.18, iva: "22%" }] } });
  const fv = await prisma.fatturaVendita.create({ data: { chiave: "BCV|77", numero: "480/FE/2026", data: new Date("2026-10-30"), clienteNome: "GIORGINI STEFANO", clienteId: cliente.id, imponibile: 819.67, totale: 1000, progetto: "761/26", descrizione: "Acconto depuratore" } });
  await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Fattura 480/FE/2026", controparte: "Giorgini", importo: 1000, pagatoManuale: 1000, stato: "PAGATA", fatturaVenditaId: fv.id, origine: "FATTURA_VENDITA", chiaveImport: "BCV:77" } });
  await prisma.documentoBC.create({ data: { id: "ORD|9", tipo: "ORDINE", numero: "9/2026", clienteId: cliente.id, clienteNome: "GIORGINI STEFANO", imponibile: 100, totale: 122 } });

  g.__utente = posatore;
  let r = await dove(prendiInCaricoOrdineBC(fd({ docId: "ORD|1268", fase: "ORDINI", ritorno: `/clienti/${cliente.id}` })));
  verifica(r?.includes("errore=Non hai il permesso") || (await prisma.commessa.count()) === 0, "chi non gestisce le pratiche non può prenderle in carico", r);

  g.__utente = ugo;
  r = await dove(prendiInCaricoOrdineBC(fd({ docId: "ORD|1268", fase: "ORDINI", ritorno: `/clienti/${cliente.id}` })));
  const c = await prisma.commessa.findFirst({ where: { ordineBC: "414/2026" }, include: { preventivo: { include: { righe: true } }, tasks: true } });
  verifica(c && r?.includes(`/commesse/${c.id}`), "pratica creata, si apre la sua scheda", r);
  verifica(c?.brandId === pura.id && c.totaleVendita === 2500 && c.accontoIncassato && c.preventivo.confermatoIl && c.preventivo.righe[0]?.testoLibero === "Depuratore osmosi", "marchio, importo, acconto già pagato e righe dell'ordine (offerta bloccata)");
  verifica((await prisma.fatturaVendita.findUnique({ where: { id: fv.id } }))?.commessaId === c?.id, "la fattura BConsole del progetto 761/26 è agganciata alla pratica");
  verifica(c?.tasks.length === 1 && c.tasks[0].faseChiave === "ORDINI" && c.tasks[0].ufficio === "ORDINI", "parte il task all'ufficio ordini (fase scelta)");
  verifica((await prisma.documentoBC.findUnique({ where: { id: "ORD|1268" } }))?.commessaId === c?.id, "l'ordine BConsole ricorda la sua pratica");
  await sincronizzaScadenzeCommesse();
  verifica((await prisma.scadenza.count({ where: { commessaId: c!.id } })) === 0, "nessuna rata automatica doppia: gli incassi arrivano dalle fatture BConsole");
  r = await dove(prendiInCaricoOrdineBC(fd({ docId: "ORD|1268", fase: "ORDINI" })));
  verifica(r?.includes(`/commesse/${c!.id}`) && (await prisma.commessa.count()) === 1, "ripremendo si apre la stessa pratica, niente doppioni");

  r = await dove(prendiInCaricoOrdineBC(fd({ docId: "ORD|9", fase: "FATT_ACCONTO" })));
  const c2 = await prisma.commessa.findFirst({ where: { ordineBC: "9/2026" }, include: { tasks: true } });
  verifica(c2?.tasks.length === 1 && c2.tasks[0].faseChiave === "FATT_ACCONTO" && !c2.accontoIncassato, "ordine senza fatture: la pratica parte dalla fattura di acconto");

  // l'offerta già fatta in ONE si copia dentro quella della pratica di BConsole (Ugo 22/11/2026)
  const prod = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: pura.id, commercialeId: ugo.id, stato: "INVIATO", oggetto: "Osmosi vera", totaleNetto: 2049.18, totaleIva: 450.82, righe: { create: [{ testoLibero: "Depuratore osmosi inversa", quantita: 1, prezzoUnitario: 2049.18, ordine: 0 }] } } });
  const destId = c!.preventivoId;
  r = await dove(agganciaOffertaONE(fd({ commessaId: c!.id, preventivoId: prod.id })));
  const dopo = await prisma.commessa.findUnique({ where: { id: c!.id }, include: { preventivo: { include: { righe: true } } } });
  verifica(dopo?.preventivoId === destId && dopo.preventivo.righe.length === 1 && dopo.preventivo.righe[0].testoLibero === "Depuratore osmosi inversa", "prodotti e prezzi dell'offerta di ONE sono nell'offerta della pratica", r);
  verifica(dopo?.totaleVendita === 2500, "i totali della pratica (BConsole) non cambiano");
  verifica((await prisma.preventivo.findUnique({ where: { id: prod.id } }))?.stato === "INVIATO" && (await prisma.rigaPreventivo.count({ where: { preventivoId: prod.id } })) === 1, "l'offerta di ONE resta com'è");
  verifica((await prisma.rigaOrdine.count({ where: { commessaId: c!.id } })) >= 1, "le righe entrano nel materiale della pratica");
  r = await dove(agganciaOffertaONE(fd({ commessaId: c!.id, preventivoId: destId })));
  verifica(r?.includes("avviso="), "non si copia l'offerta della pratica su se stessa", r);
  // «teniamo solo quella di BConsole e l'altra la cancelliamo»
  const prod2 = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: pura.id, commercialeId: ugo.id, stato: "ACCETTATO", confermatoIl: new Date(), totaleNetto: 100, totaleIva: 22, righe: { create: [{ testoLibero: "Altro", quantita: 1, prezzoUnitario: 100, ordine: 0 }] } } });
  const altra = await prisma.commessa.create({ data: { numero: 77, anno: 2026, preventivoId: prod2.id, clienteId: cliente.id, brandId: pura.id, responsabileId: ugo.id, totaleVendita: 122, totaleImponibile: 100, accontoTipo: "ACCONTO", stato: "IN_ATTESA_ACCONTO" } });
  r = await dove(agganciaOffertaONE(fd({ commessaId: c!.id, preventivoId: prod2.id, eliminaAltra: "1" })));
  verifica((await prisma.commessa.findUnique({ where: { id: altra.id } })) === null && (await prisma.commessa.findUnique({ where: { id: c!.id } })) !== null, "l'altra pratica di ONE, ancora vuota, viene cancellata e resta quella di BConsole", r);
  verifica((await prisma.preventivo.findUnique({ where: { id: prod2.id } })) === null && (await prisma.cestino.count({ where: { rifId: prod2.id } })) === 1, "anche l'offerta di ONE è cancellata e finisce nel cestino");
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { await prisma.$disconnect(); process.exit(ko ? 1 : 0); });

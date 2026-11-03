// Collaudo: area commerciale (contratti CRM e BConsole, pagamenti del cliente) e provvigioni inserite dalla fatturazione.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/provvigioni.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { contrattiDi, personeVisibili, gestisceProvvigioni } from "../../src/lib/provvigioni/server";
import { riepilogoPagamenti, riepilogoProvvigione, filtra, totali } from "../../src/lib/provvigioni/calcoli";
import { salvaProvvigione, registraLiquidazione, annullaLiquidazione, eliminaProvvigione, salvaPercentualeAbituale } from "../../src/app/provvigioni-actions";
import { sincronizzaScadenzeCommesse } from "../../src/lib/amministrazione/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LiquidazioneProvvigione","Provvigione","Scadenza","FatturaVendita","ProgettoBC","Commessa","Preventivo","Utente","Brand","Cliente" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@x.it", username: "mpiccatti", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE" } });
  const luca = await prisma.utente.create({ data: { nome: "Luca Verdi", email: "luca@x.it", username: "luca", ruolo: "COMMERCIALE" } });
  const giorgia = await prisma.utente.create({ data: { nome: "Giorgia Rosa Clot", email: "giorgia@x.it", username: "grosaclot", ruolo: "AMMINISTRATIVO", ufficio: "FATTURAZIONE" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "rocco@x.it", username: "mpec", ruolo: "MARKETING", ufficio: "MARKETING" } });
  const cliente = await prisma.cliente.create({ data: { nome: "Rossi Mario", comune: "Rivoli", brandId: brand.id } });
  const crea = async (commercialeId: string, numero: number, totale: number, oggetto: string) => {
    const pr = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: brand.id, commercialeId, stato: "ACCETTATO", oggetto, totaleNetto: totale / 1.22 } });
    return prisma.commessa.create({ data: { numero, anno: 2026, preventivoId: pr.id, clienteId: cliente.id, brandId: brand.id, totaleVendita: totale, totaleImponibile: Math.round(totale / 1.22 * 100) / 100, accontoImporto: totale / 2, accontoIncassato: true, accontoIncassatoIl: new Date("2026-10-05") } });
  };
  const cMarco = await crea(marco.id, 1, 12200, "Infissi in PVC");
  await crea(luca.id, 2, 6100, "Zanzariere");
  await sincronizzaScadenzeCommesse();
  // storico BConsole: progetto 758/26 di Marco (sigla MPI), due fatture, la seconda pagata a metà
  await prisma.progettoBC.create({ data: { id: "bc1", numero: "758/26", clienteNome: "Bianchi Luca", descrizione: "Pergola bioclimatica", tipologia: "P&C", stato: "In corso", totaleOfferto: 10000, creatoIl: new Date("2026-02-15") } });
  const f1 = await prisma.fatturaVendita.create({ data: { chiave: "BCV|1", numero: "10/2026", data: new Date("2026-03-01"), clienteNome: "BIANCHI LUCA", imponibile: 5000, totale: 6100, venditore: "MPI", progetto: "758/26" } });
  const f2 = await prisma.fatturaVendita.create({ data: { chiave: "BCV|2", numero: "55/2026", data: new Date("2026-06-01"), clienteNome: "BIANCHI LUCA", imponibile: 5000, totale: 6100, venditore: "MPI", progetto: "758/26" } });
  await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Fattura 10/2026", controparte: "Bianchi", importo: 6100, pagatoManuale: 6100, stato: "PAGATA", fatturaVenditaId: f1.id, origine: "FATTURA_VENDITA", chiaveImport: "BCV:1" } });
  await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Fattura 55/2026", controparte: "Bianchi", importo: 6100, pagatoManuale: 3050, stato: "PARZIALE", fatturaVenditaId: f2.id, origine: "FATTURA_VENDITA", chiaveImport: "BCV:2" } });
  await prisma.fatturaVendita.create({ data: { chiave: "BCV|3", numero: "60/2026", data: new Date("2026-06-02"), clienteNome: "ALTRO", imponibile: 900, totale: 1098, venditore: "MGI" } });

  console.log("1. Chi vede cosa");
  const vMarco = await personeVisibili(marco);
  verifica(vMarco.length === 1 && vMarco[0].id === marco.id, "il commerciale vede solo i suoi contratti");
  verifica((await personeVisibili(rocco)).length === 1, "il marketing (che vede tutti i clienti) non vede le provvigioni degli altri");
  verifica(gestisceProvvigioni(giorgia) && !gestisceProvvigioni(marco), "la fatturazione gestisce le provvigioni, il commerciale no");
  const vGiorgia = await personeVisibili(giorgia);
  verifica(vGiorgia.some((x) => x.id === marco.id) && vGiorgia.some((x) => x.id === luca.id), "la fatturazione vede tutti i commerciali");

  console.log("2. I contratti di Marco");
  let lista = await contrattiDi(vMarco);
  verifica(lista.length === 2 && lista.some((c) => c.chiave === `C:${cMarco.id}`) && lista.some((c) => c.chiave === "BC:758/26"), "commessa del CRM + progetto BConsole (sigla MPI), non quelli di Luca né di altre sigle", lista.map((c) => c.chiave));
  const crm = lista.find((c) => c.origine === "CRM")!;
  const pgCrm = riepilogoPagamenti(crm);
  verifica(pgCrm.stato === "PARZIALE" && pgCrm.incassato === 6100 && pgCrm.residuo === 6100, "commessa: acconto pagato, manca il saldo", pgCrm);
  const bc = lista.find((c) => c.origine === "BCONSOLE")!;
  const pgBc = riepilogoPagamenti(bc);
  verifica(bc.clienteNome === "Bianchi Luca" && bc.descrizione === "Pergola bioclimatica" && bc.fatture.length === 2, "progetto BConsole con cliente, descrizione e fatture");
  verifica(pgBc.incassato === 9150 && pgBc.residuo === 3050 && pgBc.stato === "PARZIALE", "pagamenti BConsole: una fattura pagata, l'altra a metà", pgBc);
  verifica(riepilogoProvvigione(crm).stato === "DA_CONTROLLARE", "senza controllo la provvigione è «da controllare»");
  verifica(filtra(lista, { q: "pergola" }).length === 1 && filtra(lista, { q: "55/2026" }).length === 1 && filtra(lista, { q: "rivoli pvc" }).length === 1, "ricerca libera per prodotto, n. fattura, comune");

  console.log("3. La fatturazione controlla e inserisce la provvigione");
  g.__utente = marco;
  let r = await redirectA(salvaProvvigione(fd({ contratto: crm.chiave, utenteId: marco.id, base: "10000", percentuale: "50", torna: "/contratti" })));
  verifica(r?.includes("ufficio fatturazione") && (await prisma.provvigione.count()) === 0, "il commerciale non può scriversi la provvigione", r);
  g.__utente = giorgia;
  r = await redirectA(salvaProvvigione(fd({ contratto: crm.chiave, utenteId: marco.id, base: String(crm.imponibile), percentuale: "8", note: "contratto ok", clienteNome: crm.clienteNome, torna: `/contratti?persona=${marco.id}&aperto=x#c-x` })));
  verifica(r?.includes("Provvigione salvata") && r.includes("#c-x"), "provvigione salvata, si torna al contratto aperto", r);
  verifica((await prisma.utente.findUnique({ where: { id: marco.id } }))?.provvigionePercentuale === 8, "l'8% diventa la percentuale abituale di Marco");
  await redirectA(salvaProvvigione(fd({ contratto: "BC:758/26", utenteId: marco.id, base: "10000", percentuale: "6", torna: "/contratti" })));
  lista = await contrattiDi(vMarco);
  const pvCrm = riepilogoProvvigione(lista.find((c) => c.origine === "CRM")!);
  verifica(pvCrm.importo === 800 && pvCrm.maturata === 400 && pvCrm.daLiquidare === 400 && pvCrm.stato === "DA_LIQUIDARE", "8% di 10.000 = 800 €, maturati 400 (il cliente ha pagato metà)", pvCrm);
  const pvBc = riepilogoProvvigione(lista.find((c) => c.origine === "BCONSOLE")!);
  verifica(pvBc.importo === 600 && pvBc.maturata === 450, "BConsole: 6% di 10.000 = 600 €, maturati 450 (pagato il 75%)", pvBc);

  console.log("4. Pagamenti al commerciale");
  const prov = (await prisma.provvigione.findFirst({ where: { contratto: crm.chiave } }))!;
  r = await redirectA(registraLiquidazione(fd({ provvigioneId: prov.id, importo: "900", data: "2026-11-03", torna: "/contratti" })));
  verifica(r?.includes("al massimo 800.00"), "non si paga più della provvigione", r);
  r = await redirectA(registraLiquidazione(fd({ provvigioneId: prov.id, importo: "400", data: "2026-11-03", note: "busta paga ottobre", torna: "/contratti" })));
  verifica(r?.includes("registrato"), "pagamento di 400 € registrato");
  lista = await contrattiDi(vMarco);
  const dopo = riepilogoProvvigione(lista.find((c) => c.origine === "CRM")!);
  verifica(dopo.liquidata === 400 && dopo.daLiquidare === 0 && dopo.stato === "IN_MATURAZIONE" && dopo.futura === 400, "liquidati 400, gli altri 400 maturano col saldo", dopo);
  const t = totali(lista);
  verifica(t.provvigioni === 1400 && t.liquidate === 400 && t.daLiquidare === 450, "totali dell'area: provvigioni, liquidate, da liquidare", t);
  r = await redirectA(salvaProvvigione(fd({ contratto: crm.chiave, utenteId: marco.id, base: "1000", percentuale: "8", torna: "/contratti" })));
  verifica(r?.includes("già stati liquidati"), "non si può abbassare la provvigione sotto quanto già pagato", r);
  r = await redirectA(eliminaProvvigione(fd({ id: prov.id, torna: "/contratti" })));
  verifica(r?.includes("annulla prima"), "non si toglie una provvigione già pagata in parte", r);
  const liq = (await prisma.liquidazioneProvvigione.findFirst())!;
  g.__utente = marco;
  await redirectA(annullaLiquidazione(fd({ id: liq.id, torna: "/contratti" })));
  verifica((await prisma.liquidazioneProvvigione.count()) === 1, "il commerciale non può annullare i pagamenti");
  r = await redirectA(salvaPercentualeAbituale(fd({ utenteId: marco.id, percentuale: "20", torna: "https://altro.it" })));
  verifica(r?.includes(";/contratti?errore=") && (await prisma.utente.findUnique({ where: { id: marco.id } }))?.provvigionePercentuale === 8, "il commerciale non cambia la sua percentuale (e si torna solo al CRM)", r);
  g.__utente = giorgia;
  await redirectA(annullaLiquidazione(fd({ id: liq.id, torna: "/contratti" })));
  r = await redirectA(eliminaProvvigione(fd({ id: prov.id, torna: "/contratti" })));
  verifica(r?.includes("da controllare") && (await prisma.provvigione.count()) === 1, "annullato il pagamento, la provvigione si può togliere");

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}

main().catch((e) => { console.error(e); ko++; }).finally(async () => { await prisma.$disconnect(); process.exit(ko ? 1 : 0); });

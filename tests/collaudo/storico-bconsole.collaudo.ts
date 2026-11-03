// Collaudo: storico BConsole nella scheda cliente (fatture importate con i pagamenti e progetti BConsole).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/storico-bconsole.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { storicoBConsole, variantiNome } from "../../src/lib/clienti/storico-bconsole";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Scadenza","FatturaVendita","ProgettoBC","Brand","Cliente" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const c = await prisma.cliente.create({ data: { nome: "Luca Armentano", codiceFiscale: "RMNLCU92H29L219V", brandId: b.id } });
  const altro = await prisma.cliente.create({ data: { nome: "Mario Rossi", brandId: b.id } });
  // fattura agganciata per codice fiscale (clienteId vuoto), fattura con il nome rovesciato, fattura di un altro
  const f1 = await prisma.fatturaVendita.create({ data: { chiave: "BCV|4334", numero: "426/FE/2026", data: new Date("2026-09-23"), clienteNome: "ARMENTANO LUCA", codiceFiscale: "RMNLCU92H29L219V", imponibile: 16818.18, totale: 18500, venditore: "UPE", progetto: "708/26", descrizione: "Acconto per fornitura vetrate Vepa" } });
  const f2 = await prisma.fatturaVendita.create({ data: { chiave: "BCV|4331", numero: "32/FO/2026", data: new Date("2026-09-18"), clienteNome: "ARMENTANO LUCA", imponibile: 2727.27, totale: 3000, venditore: "UPE", progetto: "709/26" } });
  await prisma.fatturaVendita.create({ data: { chiave: "BCV|1", numero: "1/2026", data: new Date("2026-01-10"), clienteNome: "ROSSI MARIO", clienteId: altro.id, imponibile: 100, totale: 122 } });
  await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Fattura 426", controparte: "Armentano", importo: 18500, pagatoManuale: 18500, stato: "PAGATA", fatturaVenditaId: f1.id, origine: "FATTURA_VENDITA", chiaveImport: "BCV:1" } });
  await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Fattura 32", controparte: "Armentano", importo: 3000, pagatoManuale: 1000, stato: "PARZIALE", fatturaVenditaId: f2.id, origine: "FATTURA_VENDITA", chiaveImport: "BCV:2" } });
  await prisma.progettoBC.create({ data: { id: "1319", numero: "708/26", clienteNome: "ARMENTANO LUCA", descrizione: "Vetrate Rif.prev. n.763/2026;", tipologia: "P&C", stato: "In corso", totaleOfferto: 37000, creatoIl: new Date("2026-09-18") } });
  await prisma.progettoBC.create({ data: { id: "1320", numero: "709/26", clienteNome: "ARMENTANO LUCA", descrizione: "Climatizzazione Rif.prev. n.764/2026;", tipologia: "Solaris", stato: "In corso", totaleOfferto: 6000, creatoIl: new Date("2026-09-18") } });

  verifica(variantiNome("Luca  Armentano").includes("Armentano Luca"), "nome e cognome anche al contrario");
  const s = await storicoBConsole(c);
  verifica(s.fatture.length === 2 && s.fatture.every((f) => f.numero !== "1/2026"), "le 2 fatture di Armentano (per codice fiscale e per nome rovesciato), non quelle di altri", s.fatture.map((f) => f.numero));
  verifica(s.progetti.length === 2 && s.progetti.some((p) => p.descrizione?.includes("Vetrate")), "i 2 progetti BConsole (vetrate e climatizzazione)");
  verifica(s.totali.fatturato === 21500 && s.totali.incassato === 19500 && s.totali.residuo === 2000, "fatturato, pagato e da incassare", s.totali);
  verifica((await storicoBConsole(altro)).fatture.length === 1, "l'altro cliente vede solo la sua");
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { await prisma.$disconnect(); process.exit(ko ? 1 : 0); });

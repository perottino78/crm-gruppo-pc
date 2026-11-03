// Collaudo: import offerte e ordini clienti BConsole (sola lettura) e loro comparsa nello storico della scheda cliente.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/documenti-bconsole.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { importaDocumentiBC, type DocumentoBCIn } from "../../src/lib/clienti/documenti-bconsole";
import { storicoBConsole } from "../../src/lib/clienti/storico-bconsole";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "DocumentoBC","Brand","Cliente" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const luca = await prisma.cliente.create({ data: { nome: "Luca Armentano", cellulare: "334 615 8825", brandId: b.id } });
  const anna = await prisma.cliente.create({ data: { nome: "Anna Gallo", email: "anna@email.it", brandId: b.id } });
  const doc: DocumentoBCIn[] = [
    { id: "OFF|3475", tipo: "OFFERTA", numero: "763/2026", data: "2026-09-18T12:00:00Z", clienteNome: "ARMENTANO LUCA", idana: "33335", tel: "3346158825", agente: "UPE", riferimento: "Vetrate", stato: "Confermato", imponibile: 16818.18, marchio: "P&C", righe: [{ dsc: "VETRATE PANORAMICHE", qta: 1, imponibile: 16818.18, iva: "10%" }] },
    { id: "ORD|1205", tipo: "ORDINE", numero: "351/2026", data: "2026-09-18T12:00:00Z", clienteNome: "ARMENTANO LUCA", idana: "33335", email: "luca.armentano5@gmail.com", stato: "In corso", imponibile: 16818.18, totale: 18500, pagamento: "Finanziamento", offertaRif: "763/2026", progetto: "708/26" },
    { id: "OFF|9", tipo: "OFFERTA", numero: "9/2026", clienteNome: "GALLO ANNA", email: "ANNA@email.it", imponibile: 900 },
    { id: "OFF|10", tipo: "OFFERTA", numero: "10/2026", clienteNome: "SCONOSCIUTO SPA", imponibile: 100 },
    { id: "XXX|1", tipo: "OFFERTA", numero: "1", clienteNome: "x" },
  ];
  const prova = await importaDocumentiBC(doc, true);
  verifica(prova.nuovi === 4 && prova.scartati === 1 && (await prisma.documentoBC.count()) === 0, "la prova conta e non scrive nulla", prova);
  const e = await importaDocumentiBC(doc);
  verifica(e.nuovi === 4 && e.conCliente === 3 && e.senzaCliente === 1 && e.esempiSenzaCliente[0].includes("SCONOSCIUTO"), "4 documenti: 3 agganciati (telefono, nome rovesciato, email), 1 senza cliente", e);
  const d1 = await prisma.documentoBC.findUnique({ where: { id: "ORD|1205" } });
  verifica(d1?.clienteId === luca.id && d1.offertaRif === "763/2026" && d1.totale === 18500, "l'ordine di Armentano è suo, con offerta e importi");
  verifica((await prisma.documentoBC.findUnique({ where: { id: "OFF|9" } }))?.clienteId === anna.id, "agganciato anche per email (maiuscole indifferenti)");
  const e2 = await importaDocumentiBC([{ ...doc[0], stato: "Archiviato" }]);
  verifica(e2.aggiornati === 1 && e2.nuovi === 0 && (await prisma.documentoBC.count()) === 4 && (await prisma.documentoBC.findUnique({ where: { id: "OFF|3475" } }))?.stato === "Archiviato", "rilanciando si aggiorna, niente doppioni");
  const s = await storicoBConsole(luca);
  verifica(s.offerte.length === 1 && s.ordini.length === 1 && s.offerte[0].righe[0].dsc === "VETRATE PANORAMICHE", "nella scheda di Armentano: 1 offerta con le righe e 1 ordine");
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { await prisma.$disconnect(); process.exit(ko ? 1 : 0); });

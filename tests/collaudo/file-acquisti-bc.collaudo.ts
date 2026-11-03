// Collaudo: file (XML/PDF) e «come è stata pagata» delle fatture d'acquisto importate da BConsole.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/file-acquisti-bc.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { importaFileAcquistiBC } from "../../src/lib/amministrazione/file-acquisti-bconsole";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const b64 = (s: string) => Buffer.from(s).toString("base64");

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Documento","Scadenza","FatturaAcquisto" CASCADE');
  const f1 = await prisma.fatturaAcquisto.create({ data: { chiave: "BCA|10628", fornitoreNome: "DIMAR S.P.A.", numero: "1586/2026", data: new Date("2026-10-31"), totale: 257.96, origine: "BCONSOLE" } });
  await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", descrizione: "Fattura 1586", controparte: "DIMAR", importo: 257.96, pagatoManuale: 257.96, stato: "PAGATA", note: "Saldata in BConsole il 31/10/2026", chiaveImport: `FA:${f1.id}:bc27775` } });
  // fattura caricata prima dall'XML (chiave diversa): si ritrova dalla rata
  const f2 = await prisma.fatturaAcquisto.create({ data: { chiave: "XML|IT123|55", fornitoreNome: "IDROCENTRO", numero: "55/2026", data: new Date("2026-09-01"), totale: 100, origine: "XML" } });
  await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", descrizione: "Fattura 55", controparte: "IDROCENTRO", importo: 100, metodoPagamento: "RiBa", chiaveImport: `FA:${f2.id}:bc900` } });
  const dati = [
    { bcId: "10628", rate: [{ bcId: "27775", pagataIl: "2026-10-31T12:00:00Z", metodo: "Bonifico", banca: "BPER" }], file: [{ nome: "Fattura 1586-2026 DIMAR.xml", mime: "application/xml", base64: b64("<?xml version='1.0'?><FatturaElettronica/>") }, { nome: "001351202694400357.pdf", mime: "application/pdf", base64: b64("%PDF-1.4 prova") }] },
    { bcId: "10435", rate: [{ bcId: "900", pagataIl: "2026-09-30T12:00:00Z", metodo: "Bonifico", banca: "Intesa" }], file: [{ nome: "Fattura 55.xml", mime: "application/xml", base64: b64("<x/>") }] },
    { bcId: "999", rate: [{ bcId: "1" }], file: [] },
  ];
  const e = await importaFileAcquistiBC(dati);
  verifica(e.trovate === 2 && e.nonTrovate === 1 && e.fileNuovi === 3 && e.rateAggiornate === 2, "2 fatture trovate (una dalla rata), 3 file, 2 rate con il pagamento", e);
  const doc = await prisma.documento.findMany({ where: { entitaId: f1.id } });
  verifica(doc.length === 2 && doc.every((d) => d.cartella === "Fattura") && doc.some((d) => d.mime === "application/pdf"), "PDF e XML nella cartella «Fattura» della fattura");
  const s1 = await prisma.scadenza.findFirst({ where: { chiaveImport: `FA:${f1.id}:bc27775` } });
  verifica(s1?.pagataIl?.toISOString().startsWith("2026-10-31") && s1.metodoPagamento === "Bonifico" && s1.bancaPagamento === "BPER", "rata: pagata il 31/10 con bonifico su BPER");
  verifica((await prisma.scadenza.findFirst({ where: { chiaveImport: `FA:${f2.id}:bc900` } }))?.metodoPagamento === "RiBa", "quanto scritto nel CRM non si sovrascrive (RiBa resta)");
  const e2 = await importaFileAcquistiBC(dati);
  verifica(e2.fileNuovi === 0 && e2.fileGiaPresenti === 3 && (await prisma.documento.count()) === 3, "rilanciando nessun file doppio");
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { await prisma.$disconnect(); process.exit(ko ? 1 : 0); });

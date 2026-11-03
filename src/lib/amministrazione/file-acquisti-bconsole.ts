// File (XML della fattura elettronica, PDF) e dati di pagamento delle fatture d'acquisto importate da BConsole.
// Rilanciabile: i file già presenti (stesso nome) non si ricaricano; data/metodo/banca si scrivono solo se vuoti.
import { prisma } from "@/lib/prisma";

export type FileAcquistoIn = {
  /** id della fattura in BConsole (la fattura nel CRM ha chiave "BCA|<id>") */
  bcId: string;
  /** id delle rate BConsole: servono anche a ritrovare le fatture già caricate prima dall'XML */
  rate?: { bcId: string; pagataIl?: string | null; metodo?: string | null; banca?: string | null }[];
  file?: { nome: string; mime: string; base64: string }[];
};

const MAX_FILE = 4 * 1024 * 1024;

export async function importaFileAcquistiBC(elenco: FileAcquistoIn[]) {
  const e = { ricevute: elenco.length, trovate: 0, nonTrovate: 0, fileNuovi: 0, fileGiaPresenti: 0, fileTroppoGrandi: 0, rateAggiornate: 0, esempiNonTrovate: [] as string[] };
  for (const x of elenco) {
    let fa = await prisma.fatturaAcquisto.findUnique({ where: { chiave: `BCA|${x.bcId}` }, select: { id: true, numero: true } });
    if (!fa && x.rate?.length) {
      const s = await prisma.scadenza.findFirst({ where: { OR: x.rate.map((r) => ({ chiaveImport: { endsWith: `:bc${r.bcId}` } })) }, select: { chiaveImport: true } });
      const id = s?.chiaveImport?.split(":")[1];
      if (id) fa = await prisma.fatturaAcquisto.findUnique({ where: { id }, select: { id: true, numero: true } });
    }
    if (!fa) { e.nonTrovate++; if (e.esempiNonTrovate.length < 10) e.esempiNonTrovate.push(x.bcId); continue; }
    e.trovate++;
    for (const f of x.file ?? []) {
      const contenuto = Buffer.from(f.base64, "base64");
      if (!contenuto.length) continue;
      if (contenuto.length > MAX_FILE) { e.fileTroppoGrandi++; continue; }
      const gia = await prisma.documento.findFirst({ where: { entita: "FATTURA_ACQUISTO", entitaId: fa.id, nome: f.nome }, select: { id: true } });
      if (gia) { e.fileGiaPresenti++; continue; }
      await prisma.documento.create({ data: { entita: "FATTURA_ACQUISTO", entitaId: fa.id, cartella: "Fattura", nome: f.nome.slice(0, 200), mime: f.mime, dimensione: contenuto.length, contenuto, caricatoDaNome: "Import BConsole" } });
      e.fileNuovi++;
    }
    for (const r of x.rate ?? []) {
      if (!r.pagataIl && !r.metodo && !r.banca) continue;
      const s = await prisma.scadenza.findFirst({ where: { chiaveImport: `FA:${fa.id}:bc${r.bcId}` }, select: { id: true, pagataIl: true, metodoPagamento: true, bancaPagamento: true } });
      if (!s) continue;
      const dati: Record<string, unknown> = {};
      if (!s.pagataIl && r.pagataIl) dati.pagataIl = new Date(r.pagataIl);
      if (!s.metodoPagamento && r.metodo) dati.metodoPagamento = r.metodo.slice(0, 120);
      if (!s.bancaPagamento && r.banca) dati.bancaPagamento = r.banca.slice(0, 160);
      if (Object.keys(dati).length) { await prisma.scadenza.update({ where: { id: s.id }, data: dati }); e.rateAggiornate++; }
    }
  }
  return e;
}

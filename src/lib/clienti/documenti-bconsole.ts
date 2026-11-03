// Offerte e ordini clienti di BConsole: importati in sola lettura e agganciati al cliente del CRM
// (n. anagrafica BConsole, email, telefono o nome anche rovesciato). Rilanciabile: stessi id → aggiorna, niente doppioni.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { indiceClienti, type DatiCliente } from "./bconsole";

export type RigaDocumentoBC = { dsc: string; qta?: number | null; imponibile?: number | null; iva?: string | null };
export type DocumentoBCIn = {
  id: string; tipo: "OFFERTA" | "ORDINE"; numero: string; data?: string | null; clienteNome: string; idana?: string | null;
  tel?: string | null; cell?: string | null; email?: string | null; agente?: string | null; riferimento?: string | null; stato?: string | null;
  imponibile?: number | null; totale?: number | null; marchio?: string | null; pagamento?: string | null; offertaRif?: string | null; progetto?: string | null;
  righe?: RigaDocumentoBC[];
};

export async function importaDocumentiBC(elenco: DocumentoBCIn[], prova = false) {
  const esistenti = await prisma.cliente.findMany({ select: { id: true, nome: true, telefono: true, cellulare: true, email: true, piva: true, codiceFiscale: true, bconsoleId: true } });
  const { trova } = indiceClienti(esistenti);
  const gia = new Set((await prisma.documentoBC.findMany({ where: { id: { in: elenco.map((d) => d.id) } }, select: { id: true } })).map((d) => d.id));
  const esito = { ricevuti: elenco.length, nuovi: 0, aggiornati: 0, conCliente: 0, senzaCliente: 0, scartati: 0, esempiSenzaCliente: [] as string[] };
  for (const d of elenco) {
    if (!d?.id || !/^(OFF|ORD)\|/.test(d.id) || !d.numero || !d.clienteNome) { esito.scartati++; continue; }
    const c = trova({ bconsoleId: d.idana ?? null, nome: d.clienteNome, telefono: d.tel ?? null, cellulare: d.cell ?? null, email: d.email?.toLowerCase() ?? null, piva: null, codiceFiscale: null } as unknown as DatiCliente);
    if (c) esito.conCliente++; else { esito.senzaCliente++; if (esito.esempiSenzaCliente.length < 15) esito.esempiSenzaCliente.push(`${d.tipo} ${d.numero} ${d.clienteNome}`); }
    if (gia.has(d.id)) esito.aggiornati++; else esito.nuovi++;
    if (prova) continue;
    const dati = {
      tipo: d.tipo, numero: d.numero, data: d.data ? new Date(d.data) : null, clienteId: c?.id ?? null, clienteNome: d.clienteNome, idana: d.idana ?? null,
      agente: d.agente ?? null, riferimento: d.riferimento ?? null, stato: d.stato ?? null, imponibile: d.imponibile ?? 0, totale: d.totale ?? 0,
      marchio: d.marchio ?? null, pagamento: d.pagamento ?? null, offertaRif: d.offertaRif ?? null, progetto: d.progetto ?? null,
      righe: (d.righe ?? []) as unknown as Prisma.InputJsonValue,
    };
    await prisma.documentoBC.upsert({ where: { id: d.id }, update: dati, create: { id: d.id, ...dati } });
  }
  return esito;
}

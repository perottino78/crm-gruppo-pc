// Storico BConsole nella scheda cliente: le fatture di vendita importate (con i pagamenti) e i progetti/commesse BConsole.
// Il cliente si riconosce dal collegamento fatto all'import, dal codice fiscale / P.IVA o dal nome (anche "COGNOME NOME").
import { prisma } from "@/lib/prisma";
import { residuoScadenza } from "@/lib/amministrazione/server";
import { incassatoScadenza, segno, cent } from "@/lib/provvigioni/calcoli";

export type FatturaStorico = {
  id: string; numero: string; data: Date; tipo: string; descrizione: string | null; progetto: string | null; brand: string | null;
  imponibile: number; totale: number; incassato: number; residuo: number; venditore: string | null;
};
export type DocumentoStorico = {
  id: string; tipo: string; numero: string; data: Date | null; riferimento: string | null; stato: string | null; imponibile: number; totale: number;
  marchio: string | null; agente: string | null; pagamento: string | null; offertaRif: string | null; progetto: string | null;
  righe: { dsc: string; qta?: number | null; imponibile?: number | null; iva?: string | null }[];
};
export type ProgettoStorico = { numero: string; descrizione: string | null; tipologia: string | null; stato: string | null; capoProgetto: string | null; totaleOfferto: number; creatoIl: Date | null };

/** "Luca Armentano" e "ARMENTANO LUCA" sono la stessa persona: varianti del nome per la ricerca. */
export function variantiNome(nome: string): string[] {
  const parole = nome.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const v = new Set([parole.join(" ")]);
  if (parole.length === 2) v.add(`${parole[1]} ${parole[0]}`);
  return [...v].filter(Boolean);
}

export async function storicoBConsole(c: { id: string; nome: string; piva?: string | null; codiceFiscale?: string | null }) {
  const nomi = variantiNome(c.nome);
  const perNome = nomi.map((n) => ({ clienteNome: { equals: n, mode: "insensitive" as const } }));
  const fatture = await prisma.fatturaVendita.findMany({
    where: {
      OR: [
        { clienteId: c.id },
        ...(c.codiceFiscale?.trim() ? [{ codiceFiscale: { equals: c.codiceFiscale.trim(), mode: "insensitive" as const } }] : []),
        ...(c.piva?.trim() ? [{ partitaIva: c.piva.trim() }] : []),
        { AND: [{ clienteId: null }, { OR: perNome }] },
      ],
    },
    orderBy: { data: "desc" },
    take: 200,
  });
  const scadenze = fatture.length
    ? await prisma.scadenza.findMany({ where: { tipo: "INCASSO", fatturaVenditaId: { in: fatture.map((f) => f.id) } }, include: { abbinamenti: { select: { importo: true } } } })
    : [];
  const progettiNumeri = [...new Set(fatture.map((f) => f.progetto?.trim()).filter((x): x is string => !!x))];
  const progetti = await prisma.progettoBC.findMany({
    where: { OR: [...(progettiNumeri.length ? [{ numero: { in: progettiNumeri } }] : []), ...perNome] },
    orderBy: { creatoIl: "desc" },
    take: 100,
  });
  const documenti = await prisma.documentoBC.findMany({
    where: { OR: [{ clienteId: c.id }, { AND: [{ clienteId: null }, { OR: perNome }] }] },
    orderBy: [{ data: "desc" }, { numero: "desc" }],
    take: 200,
  });
  const doc = (d: (typeof documenti)[number]): DocumentoStorico => ({
    id: d.id, tipo: d.tipo, numero: d.numero, data: d.data, riferimento: d.riferimento, stato: d.stato, imponibile: d.imponibile, totale: d.totale,
    marchio: d.marchio, agente: d.agente, pagamento: d.pagamento, offertaRif: d.offertaRif, progetto: d.progetto,
    righe: Array.isArray(d.righe) ? (d.righe as DocumentoStorico["righe"]) : [],
  });
  const righe: FatturaStorico[] = fatture.map((f) => {
    const sue = scadenze.filter((s) => s.fatturaVenditaId === f.id);
    const incassato = cent(sue.reduce((t, s) => t + incassatoScadenza({ importo: s.importo, residuo: residuoScadenza(s), stato: s.stato }), 0));
    const totale = cent(segno(f.tipoDocumento) * f.totale);
    return {
      id: f.id, numero: f.numero, data: f.data, tipo: f.tipoDocumento, descrizione: f.descrizione ?? f.causale, progetto: f.progetto, brand: f.brand,
      imponibile: cent(segno(f.tipoDocumento) * f.imponibile), totale, incassato, residuo: sue.length ? cent(Math.max(0, totale - incassato)) : 0, venditore: f.venditore,
    };
  });
  return {
    offerte: documenti.filter((d) => d.tipo === "OFFERTA").map(doc),
    ordini: documenti.filter((d) => d.tipo === "ORDINE").map(doc),
    fatture: righe,
    progetti: progetti.map((p): ProgettoStorico => ({ numero: p.numero, descrizione: p.descrizione, tipologia: p.tipologia, stato: p.stato, capoProgetto: p.capoProgetto, totaleOfferto: p.totaleOfferto, creatoIl: p.creatoIl })),
    totali: { fatturato: cent(righe.reduce((t, f) => t + f.totale, 0)), incassato: cent(righe.reduce((t, f) => t + f.incassato, 0)), residuo: cent(righe.reduce((t, f) => t + f.residuo, 0)) },
  };
}

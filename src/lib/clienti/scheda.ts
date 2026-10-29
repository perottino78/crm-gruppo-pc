// Dati della scheda cliente organizzati per pratica: ogni offerta con la sua commessa,
// il flusso fra uffici, i task aperti e i documenti/acquisti collegati.
import { prisma } from "@/lib/prisma";
import type { Utente } from "@prisma/client";
import { FASI_DEFAULT, STATI_CHIUSI } from "@/lib/flusso";
import { numeroCommessa } from "@/lib/commesse";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { puoAmministrazione } from "@/lib/amministrazione/server";
import { passiPratica, ordinaPratiche, type Passo, type Esito } from "@/lib/clienti/pratica";

export type PraticaCliente = {
  id: string;
  numeroOfferta: number | null;
  data: Date;
  oggetto: string | null;
  brand: string;
  commerciale: string;
  statoOfferta: string;
  archiviata: boolean;
  totale: number;
  commessa: { id: string; numero: string; stato: string; responsabile: string | null } | null;
  passi: Passo[];
  esito: Esito;
  percentuale: number;
  taskAperti: { id: string; titolo: string; ufficio: string; assegnatoNome: string | null; stato: string }[];
  rilievo: { dataOra: Date; stato: string } | null;
  conteggi: { ordini: number; bolle: number; fatture: number; file: number };
};

export type VoceDiario = { data: Date; tipo: string; colore: string; testo: string; chi: string | null; link?: string };

export async function praticheCliente(u: Pick<Utente, "ruolo">, clienteId: string) {
  const [preventivi, fasiDb] = await Promise.all([
    prisma.preventivo.findMany({
      where: { clienteId },
      orderBy: { createdAt: "desc" },
      include: {
        brand: { select: { nome: true } },
        commerciale: { select: { nome: true } },
        commessa: {
          include: {
            responsabile: { select: { nome: true } },
            tasks: { orderBy: { createdAt: "asc" } },
            rilievi: { orderBy: { dataOra: "desc" }, take: 1 },
            eventi: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        },
      },
    }),
    prisma.flussoFase.findMany({ orderBy: { ordine: "asc" } }),
  ]);
  const fasi = (fasiDb.length ? fasiDb : FASI_DEFAULT).map((f) => ({ chiave: f.chiave, nome: f.nome, ufficio: f.ufficio }));

  const idComm = preventivi.flatMap((p) => (p.commessa ? [p.commessa.id] : []));
  const vediAcquisti = puoGestireOrdini(u), vediFatture = puoAmministrazione(u);
  const [ordini, righeBolla, righeFatt, docs] = await Promise.all([
    vediAcquisti && idComm.length
      ? prisma.ordineFornitore.findMany({
          where: { commessaId: { in: idComm } },
          select: { id: true, numero: true, anno: true, stato: true, dataOrdine: true, commessaId: true, fornitore: { select: { ragioneSociale: true } } },
          orderBy: { dataOrdine: "desc" },
        })
      : [],
    vediAcquisti && idComm.length ? prisma.rigaBolla.findMany({ where: { commessaId: { in: idComm } }, select: { bollaId: true, commessaId: true } }) : [],
    vediFatture && idComm.length ? prisma.rigaFatturaAcquisto.findMany({ where: { commessaId: { in: idComm } }, select: { fatturaId: true, commessaId: true } }) : [],
    prisma.documento.groupBy({
      by: ["entita", "entitaId"],
      where: {
        OR: [
          { entita: "CLIENTE", entitaId: clienteId },
          ...(preventivi.length ? [{ entita: "PREVENTIVO", entitaId: { in: preventivi.map((p) => p.id) } }] : []),
          ...(idComm.length ? [{ entita: "COMMESSA", entitaId: { in: idComm } }] : []),
        ],
      },
      _count: { _all: true },
    }),
  ]);
  const nDoc = (entita: string, id: string) => docs.find((d) => d.entita === entita && d.entitaId === id)?._count._all ?? 0;
  const distinti = (righe: { commessaId: string | null }[], chiave: (r: never) => string, cid: string) =>
    new Set(righe.filter((r) => r.commessaId === cid).map((r) => chiave(r as never))).size;

  const pratiche: PraticaCliente[] = preventivi.map((p) => {
    const c = p.commessa;
    const { passi, esito, percentuale } = passiPratica({
      statoOfferta: p.stato,
      commessa: c ? { stato: c.stato, tasks: c.tasks } : null,
      fasi,
    });
    return {
      id: p.id,
      numeroOfferta: p.numeroOfferta,
      data: p.createdAt,
      oggetto: p.oggetto,
      brand: p.brand.nome,
      commerciale: p.commerciale.nome,
      statoOfferta: p.stato,
      archiviata: p.archiviato,
      totale: c?.totaleVendita || p.totaleNetto,
      commessa: c ? { id: c.id, numero: numeroCommessa(c), stato: c.stato, responsabile: c.responsabile?.nome ?? null } : null,
      passi,
      esito,
      percentuale,
      taskAperti: (c && !["CHIUSA", "LAVORI_ESEGUITI", "ANNULLATA"].includes(c.stato) ? c.tasks : [])
        .filter((t) => !STATI_CHIUSI.includes(t.stato))
        .map((t) => ({ id: t.id, titolo: t.titolo, ufficio: t.ufficio, assegnatoNome: t.assegnatoNome, stato: t.stato })),
      rilievo: c?.rilievi[0] ? { dataOra: c.rilievi[0].dataOra, stato: c.rilievi[0].stato } : null,
      conteggi: {
        ordini: c ? ordini.filter((o) => o.commessaId === c.id).length : 0,
        bolle: c ? distinti(righeBolla, (r: { bollaId: string }) => r.bollaId, c.id) : 0,
        fatture: c ? distinti(righeFatt, (r: { fatturaId: string }) => r.fatturaId, c.id) : 0,
        file: nDoc("PREVENTIVO", p.id) + (c ? nDoc("COMMESSA", c.id) : 0),
      },
    };
  });

  const commesseInfo = preventivi.flatMap((p) => (p.commessa ? [{ ...p.commessa, numeroTxt: numeroCommessa(p.commessa) }] : []));
  const fileTotali = docs.reduce((s, d) => s + d._count._all, 0);

  return {
    pratiche: ordinaPratiche(pratiche),
    commesse: commesseInfo,
    ordini,
    vediAcquisti,
    fileTotali,
    fileCliente: nDoc("CLIENTE", clienteId),
  };
}

/** Diario unico del cliente: attività, offerte, commesse, passaggi fra uffici e note di commessa. */
export function diarioCliente(input: {
  attivita: { dataOra: Date; tipo: string; oggetto: string; utente: { nome: string } | null }[];
  appuntamenti: { dataOra: Date; tipo: string; stato: string; utente: { nome: string } }[];
  pratiche: PraticaCliente[];
  commesse: { id: string; numeroTxt: string; createdAt: Date; tasks: { titolo: string; ufficio: string; stato: string; completatoIl: Date | null; completatoDaNome: string | null }[]; eventi: { testo: string; utenteNome: string | null; createdAt: Date }[] }[];
}): VoceDiario[] {
  const TIPO_ATT: Record<string, [string, string]> = {
    NOTA: ["Nota", "#8b5cf6"], CHIAMATA: ["Chiamata", "#0ea5e9"], EMAIL: ["Email", "#6366f1"], TASK: ["Task", "#f59e0b"],
  };
  const voci: VoceDiario[] = [
    ...input.attivita.map((a) => ({ data: a.dataOra, tipo: TIPO_ATT[a.tipo]?.[0] ?? a.tipo, colore: TIPO_ATT[a.tipo]?.[1] ?? "#737373", testo: a.oggetto, chi: a.utente?.nome ?? null })),
    ...input.appuntamenti.map((a) => ({ data: a.dataOra, tipo: "Appuntamento", colore: "#db2777", testo: `${a.tipo.toLowerCase()} · ${a.stato.toLowerCase()}`, chi: a.utente.nome })),
    ...input.pratiche.map((p) => ({ data: p.data, tipo: "Offerta", colore: "#2563eb", testo: `Offerta ${p.numeroOfferta ?? ""}${p.oggetto ? ` — ${p.oggetto}` : ""}`.trim(), chi: p.commerciale, link: `/preventivi/${p.id}` })),
    ...input.commesse.flatMap((c) => [
      { data: c.createdAt, tipo: "Commessa", colore: "#0d9488", testo: `Aperta commessa ${c.numeroTxt}`, chi: null, link: `/commesse/${c.id}` },
      ...c.tasks.filter((t) => t.completatoIl).map((t) => ({ data: t.completatoIl as Date, tipo: "Fatto", colore: "#16a34a", testo: `${t.titolo} (${c.numeroTxt})`, chi: t.completatoDaNome, link: `/commesse/${c.id}` })),
      ...c.eventi.map((e) => ({ data: e.createdAt, tipo: "Pratica", colore: "#64748b", testo: `${e.testo} (${c.numeroTxt})`, chi: e.utenteNome, link: `/commesse/${c.id}` })),
    ]),
  ];
  return voci.sort((a, b) => b.data.getTime() - a.data.getTime());
}

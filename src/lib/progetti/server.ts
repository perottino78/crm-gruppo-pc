// «I miei progetti» lato server: le commesse dei clienti del commerciale (o di chi vede di più) con fasi, consegna e pagamenti.
import { prisma } from "@/lib/prisma";
import type { Utente } from "@prisma/client";
import { scopePreventivoWhere } from "@/lib/scope";
import { FASI_DEFAULT } from "@/lib/flusso";
import { numeroCommessa } from "@/lib/commesse";
import { passiPratica, type Passo } from "@/lib/clienti/pratica";
import { residuoScadenza } from "@/lib/amministrazione/server";
import type { ProgettoMin } from "./miei";

export type Progetto = ProgettoMin & {
  id: string;
  clienteId: string;
  commercialeId: string;
  comune: string | null;
  brand: string;
  passi: Passo[];
  corrente: Passo | null;
  dataContratto: Date;
  kitConsegnato: boolean;
};

export async function progettiDi(utente: Utente): Promise<Progetto[]> {
  const scope = scopePreventivoWhere(utente);
  const [commesse, fasiDb] = await Promise.all([
    prisma.commessa.findMany({
      where: { preventivo: scope },
      include: {
        cliente: { select: { nome: true, comune: true } },
        brand: { select: { nome: true } },
        preventivo: { select: { oggetto: true, stato: true, commercialeId: true, commerciale: { select: { nome: true } } } },
        tasks: { select: { faseChiave: true, stato: true, ufficio: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.flussoFase.findMany({ orderBy: { ordine: "asc" }, select: { chiave: true, nome: true, ufficio: true } }),
  ]);
  // pagamenti del cliente: scadenze d'incasso della commessa e delle fatture di vendita agganciate alla commessa
  const ids = commesse.map((c) => c.id);
  const fatture = ids.length ? await prisma.fatturaVendita.findMany({ where: { commessaId: { in: ids } }, select: { id: true, commessaId: true } }) : [];
  const commessaDiFattura = new Map(fatture.map((f) => [f.id, f.commessaId!]));
  const scadenze = ids.length
    ? await prisma.scadenza.findMany({
        where: { tipo: "INCASSO", stato: { notIn: ["ANNULLATA", "SOSTITUITA"] }, OR: [{ commessaId: { in: ids } }, ...(fatture.length ? [{ fatturaVenditaId: { in: fatture.map((f) => f.id) } }] : [])] },
        select: { id: true, commessaId: true, fatturaVenditaId: true, importo: true, pagatoManuale: true, ritenuta: true, abbinamenti: { select: { importo: true } } },
      })
    : [];
  const conKit = new Set(ids.length ? (await prisma.consegnaKit.findMany({ where: { commessaId: { in: ids } }, select: { commessaId: true } })).map((k) => k.commessaId) : []);
  const scadenzeDi = new Map<string, typeof scadenze>();
  for (const x of scadenze) {
    const cid = x.commessaId ?? (x.fatturaVenditaId ? commessaDiFattura.get(x.fatturaVenditaId) : undefined);
    if (cid) scadenzeDi.set(cid, [...(scadenzeDi.get(cid) ?? []), x]);
  }
  const fasi = fasiDb.length ? fasiDb : FASI_DEFAULT.map((f) => ({ chiave: f.chiave, nome: f.nome, ufficio: f.ufficio }));
  return commesse.map((c) => {
    const { passi, corrente } = passiPratica({ statoOfferta: c.preventivo.stato, commessa: { stato: c.stato, tasks: c.tasks }, fasi });
    // pagato: dalle scadenze d'incasso della commessa; senza scadenze, dai flag acconto/saldo della commessa
    const sc = scadenzeDi.get(c.id) ?? [];
    const pagato = sc.length
      ? sc.reduce((s, x) => s + Math.max(0, x.importo - Math.max(0, residuoScadenza(x))), 0)
      : (c.saldoIncassato ? c.totaleVendita : c.accontoIncassato ? (c.accontoImportoIncassato ?? c.accontoImporto) : 0);
    return {
      id: c.id,
      clienteId: c.clienteId,
      cliente: c.cliente.nome,
      comune: c.cliente.comune,
      brand: c.brand.nome,
      numero: numeroCommessa(c),
      oggetto: c.preventivo.oggetto,
      commerciale: c.preventivo.commerciale.nome,
      commercialeId: c.preventivo.commercialeId,
      stato: c.stato,
      consegnaPrevista: c.consegnaPrevista,
      totale: c.totaleVendita,
      pagato: Math.round(pagato * 100) / 100,
      accontoIncassato: c.accontoIncassato,
      passi,
      corrente,
      dataContratto: c.createdAt,
      kitConsegnato: conKit.has(c.id),
    };
  });
}

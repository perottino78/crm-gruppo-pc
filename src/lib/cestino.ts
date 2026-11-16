// Cestino: prima di eliminare una campagna, un lead, un cliente o un'offerta se ne fa una copia completa (con i dati collegati) che resta
// 30 giorni; l'amministrazione la ripristina da Impostazioni › Registro e cestino. Ogni eliminazione e ripristino va anche nel
// registro «chi ha fatto cosa» (RegistroAmministrazione).
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const GIORNI_CESTINO = 30;
export type TipoCestino = "CAMPAGNA" | "LEAD" | "CLIENTE" | "PREVENTIVO";
type Tabella = { modello: string; righe: Record<string, unknown>[] };
type Collega = { modello: string; id: string; campo: string; valore: string };
export type DatiCestino = { tabelle: Tabella[]; collega?: Collega[] };

const json = <T,>(x: T) => JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue;

/** Copia completa di quello che si sta per eliminare (in ordine di ripristino). */
export async function fotografia(tipo: TipoCestino, id: string): Promise<{ nome: string; dati: DatiCestino } | null> {
  if (tipo === "CAMPAGNA") {
    const c = await prisma.campagna.findUnique({ where: { id } });
    if (!c) return null;
    const [varianti, invii] = await Promise.all([prisma.campagnaVariante.findMany({ where: { campagnaId: id } }), prisma.campagnaInvio.findMany({ where: { campagnaId: id } })]);
    return { nome: c.nome, dati: { tabelle: [{ modello: "campagna", righe: [c] }, { modello: "campagnaVariante", righe: varianti }, { modello: "campagnaInvio", righe: invii }] } };
  }
  if (tipo === "LEAD") {
    const l = await prisma.lead.findUnique({ where: { id } });
    if (!l) return null;
    const [eventi, email, clienti] = await Promise.all([
      prisma.leadEvento.findMany({ where: { leadId: id } }), prisma.emailLead.findMany({ where: { leadId: id } }),
      prisma.cliente.findMany({ where: { leadOrigineId: id }, select: { id: true } }),
    ]);
    return { nome: l.nome, dati: { tabelle: [{ modello: "lead", righe: [l] }, { modello: "leadEvento", righe: eventi }, { modello: "emailLead", righe: email }], collega: clienti.map((c) => ({ modello: "cliente", id: c.id, campo: "leadOrigineId", valore: id })) } };
  }
  if (tipo === "PREVENTIVO") {
    const p = await prisma.preventivo.findUnique({ where: { id }, include: { cliente: { select: { nome: true } } } });
    if (!p) return null;
    const { cliente, ...preventivo } = p;
    const [sezioni, righe, optional, promemoria, email, solaris] = await Promise.all([
      prisma.sezionePreventivo.findMany({ where: { preventivoId: id } }), prisma.rigaPreventivo.findMany({ where: { preventivoId: id } }),
      prisma.rigaOptional.findMany({ where: { riga: { preventivoId: id } } }), prisma.promemoriaInviato.findMany({ where: { preventivoId: id } }),
      prisma.emailOfferta.findMany({ where: { preventivoId: id } }), prisma.solarisProgetto.findMany({ where: { preventivoId: id } }),
    ]);
    const fotoSolaris = solaris.length ? await prisma.solarisFoto.findMany({ where: { progettoId: { in: solaris.map((x) => x.id) } } }) : [];
    const nome = `Offerta${p.numeroOfferta ? ` n. ${p.numeroOfferta}` : ""} — ${cliente.nome}`;
    return {
      nome,
      dati: {
        tabelle: [{ modello: "preventivo", righe: [preventivo] }, { modello: "sezionePreventivo", righe: sezioni }, { modello: "rigaPreventivo", righe: righe },
          { modello: "rigaOptional", righe: optional }, { modello: "promemoriaInviato", righe: promemoria }, { modello: "emailOfferta", righe: email },
          { modello: "solarisProgetto", righe: solaris }, { modello: "solarisFoto", righe: fotoSolaris }],
      },
    };
  }
  const c = await prisma.cliente.findUnique({ where: { id } });
  if (!c) return null;
  const [appuntamenti, attivita, referenti, indirizzi, correlazioni, invii, documenti, documentiBC] = await Promise.all([
    prisma.appuntamento.findMany({ where: { clienteId: id } }), prisma.attivita.findMany({ where: { clienteId: id } }),
    prisma.referente.findMany({ where: { clienteId: id } }), prisma.indirizzoCliente.findMany({ where: { clienteId: id } }),
    prisma.clienteCorrelazione.findMany({ where: { OR: [{ clienteId: id }, { correlatoId: id }] } }),
    prisma.campagnaInvio.findMany({ where: { clienteId: id } }), prisma.documento.findMany({ where: { entita: "CLIENTE", entitaId: id } }),
    prisma.documentoBC.findMany({ where: { clienteId: id }, select: { id: true } }),
  ]);
  return {
    nome: c.nome,
    dati: {
      tabelle: [{ modello: "cliente", righe: [c] }, { modello: "referente", righe: referenti }, { modello: "indirizzoCliente", righe: indirizzi }, { modello: "clienteCorrelazione", righe: correlazioni },
        { modello: "attivita", righe: attivita }, { modello: "appuntamento", righe: appuntamenti }, { modello: "campagnaInvio", righe: invii }, { modello: "documento", righe: documenti }],
      collega: documentiBC.map((d) => ({ modello: "documentoBC", id: d.id, campo: "clienteId", valore: id })),
    },
  };
}

/** Mette nel cestino (da chiamare PRIMA di eliminare) e scrive nel registro. */
export async function mettiNelCestino(tipo: TipoCestino, id: string, chi: { id?: string | null; nome?: string | null }, adesso = new Date()) {
  const f = await fotografia(tipo, id);
  if (!f) return null;
  const scadeIl = new Date(adesso.getTime() + GIORNI_CESTINO * 86_400_000);
  const r = await prisma.cestino.create({ data: { tipo, rifId: id, nome: f.nome, dati: json(f.dati), eliminatoDaId: chi.id ?? null, eliminatoDaNome: chi.nome ?? null, eliminatoIl: adesso, scadeIl } });
  await prisma.registroAmministrazione.create({ data: { entita: tipo, entitaId: id, azione: "ELIMINATO", dettaglio: `${f.nome} (nel cestino fino al ${scadeIl.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })})`, utenteNome: chi.nome ?? null } }).catch(() => null);
  return r;
}

/** Ripristina: rimette le righe salvate (quelle già presenti si saltano) e i collegamenti. */
export async function ripristina(cestinoId: string, chi: { nome?: string | null }): Promise<{ ok: true; nome: string } | { ok: false; errore: string }> {
  const c = await prisma.cestino.findUnique({ where: { id: cestinoId } });
  if (!c) return { ok: false, errore: "Elemento non trovato nel cestino" };
  if (c.ripristinatoIl) return { ok: false, errore: "Già ripristinato" };
  const dati = c.dati as unknown as DatiCestino;
  try {
    await prisma.$transaction(async (tx) => {
      const t = tx as unknown as Record<string, { createMany: (a: { data: unknown[]; skipDuplicates: boolean }) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
      for (const tab of dati.tabelle) if (tab.righe.length) await t[tab.modello].createMany({ data: tab.righe, skipDuplicates: true });
      for (const k of dati.collega ?? []) await t[k.modello].updateMany({ where: { id: k.id, [k.campo]: null }, data: { [k.campo]: k.valore } });
      await tx.cestino.update({ where: { id: c.id }, data: { ripristinatoIl: new Date(), ripristinatoDaNome: chi.nome ?? null } });
    }, { timeout: 60_000 });
  } catch (e) {
    return { ok: false, errore: `ripristino non riuscito: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}` };
  }
  await prisma.registroAmministrazione.create({ data: { entita: c.tipo, entitaId: c.rifId, azione: "RIPRISTINATO", dettaglio: c.nome, utenteNome: chi.nome ?? null } }).catch(() => null);
  return { ok: true, nome: c.nome };
}

/** Svuota il cestino dagli elementi scaduti (dopo 30 giorni). */
export async function svuotaScaduti(adesso = new Date()) {
  return (await prisma.cestino.deleteMany({ where: { scadeIl: { lt: adesso } } })).count;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { doppioniImportati, leadDaAvanzare, appuntamentiDeiLead, FASI_DA_FISSARE } from "@/lib/calendario/riordino";
import { ESITI } from "@/lib/automazioni/percorsi";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const NOTA_IMPORT = "Creato dall'importazione degli appuntamenti di BConsole.";
const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });

/**
 * Riordino dopo l'importazione degli appuntamenti di BConsole: toglie gli appuntamenti importati che doppiano quelli già fissati
 * in P&C ONE (e i clienti creati dall'importazione rimasti senza nulla), poi fa avanzare i lead rimasti appesi la cui persona ha
 * già l'appuntamento in calendario, come se la telefonista li avesse esitati a mano (storico sintetico, nessuna email).
 * GET = prova (elenco di cosa farebbe), POST = esegue. Rilanciabile.
 */
async function esegui(prova: boolean) {
  const [appuntamenti, clienti, leads, utenti] = await Promise.all([
    prisma.appuntamento.findMany({ select: { id: true, chiaveImport: true, clienteId: true, utenteId: true, tipo: true, dataOra: true, stato: true, luogo: true, titolo: true, createdAt: true } }),
    prisma.cliente.findMany({ select: { id: true, nome: true, telefono: true, cellulare: true, email: true, noteLibere: true, leadOrigineId: true } }),
    prisma.lead.findMany({
      where: { fase: { in: FASI_DA_FISSARE } },
      select: { id: true, nome: true, telefono: true, email: true, fase: true, createdAt: true, clienteGenerato: { select: { id: true } }, eventi: { where: { tipo: "lead.esito" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
    }),
    prisma.utente.findMany({ select: { id: true, nome: true, ruolo: true } }),
  ]);
  const nomeCliente = new Map(clienti.map((c) => [c.id, c.nome]));
  const nomeUtente = new Map(utenti.map((u) => [u.id, u.nome]));
  const perIdApp = new Map(appuntamenti.map((a) => [a.id, a]));

  // 1) doppioni
  const doppi = doppioniImportati(appuntamenti, clienti);
  const via = new Set(doppi.map((d) => d.id));
  const descriviApp = (id: string) => { const a = perIdApp.get(id)!; return `${nomeCliente.get(a.clienteId) ?? "?"} — ${quando(a.dataOra)} (${nomeUtente.get(a.utenteId) ?? "?"})`; };
  // clienti creati dall'importazione che restano senza appuntamenti
  const clientiDoppi = [...new Set(doppi.map((d) => perIdApp.get(d.id)!.clienteId))].filter((cid) =>
    clienti.find((c) => c.id === cid)?.noteLibere === NOTA_IMPORT && !clienti.find((c) => c.id === cid)?.leadOrigineId &&
    appuntamenti.every((a) => a.clienteId !== cid || via.has(a.id)));
  let clientiTolti = 0;
  if (!prova) {
    await prisma.appuntamento.deleteMany({ where: { id: { in: [...via] }, chiaveImport: { startsWith: "BC|" } } });
    for (const cid of clientiDoppi) {
      try { await prisma.cliente.delete({ where: { id: cid } }); clientiTolti++; } catch { /* ha altri dati collegati: resta */ }
    }
  }

  // 2) lead appesi con l'appuntamento già fissato
  const daAvanzare = leadDaAvanzare(
    leads.map((l) => ({ id: l.id, nome: l.nome, telefono: l.telefono, email: l.email, fase: l.fase, createdAt: l.createdAt, clienteId: l.clienteGenerato?.id ?? null, ultimoEsitoIl: l.eventi[0]?.createdAt ?? null })),
    appuntamenti, clienti, via, new Set(utenti.filter((u) => u.ruolo === "TELEFONISTA").map((u) => u.id)),
  );
  const adesso = new Date();
  const perLead = new Map(leads.map((l) => [l.id, l]));
  const clientiConLead = new Set(clienti.filter((c) => c.leadOrigineId).map((c) => c.id));
  for (const d of daAvanzare) {
    if (prova) continue;
    const lead = perLead.get(d.leadId)!;
    const venditore = nomeUtente.get(d.utenteId) ?? null;
    const collegaCliente = !lead.clienteGenerato && !clientiConLead.has(d.clienteId);
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: d.leadId },
        data: {
          fase: d.esito, appuntamentoIl: d.dataOra, appuntamentoId: d.appuntamentoId, venditoreId: d.utenteId,
          indirizzoAppuntamento: d.esito === "APPUNTAMENTO_CASA" ? d.luogo : null,
          scadenzaAzione: d.dataOra, nonGestitoIl: null,
        },
      });
      // niente email: l'appuntamento è già stato preso (e confermato) quando è stato fissato
      await tx.invioProgrammato.updateMany({ where: { leadId: d.leadId, stato: "IN_ATTESA" }, data: { stato: "ANNULLATO", errore: "appuntamento già fissato nel calendario" } });
      await tx.leadEvento.create({
        data: {
          leadId: d.leadId, tipo: "lead.esito", utenteNome: "Automatico",
          testo: `${ESITI[d.esito].nome} — ${quando(d.dataOra)}${venditore ? ` con ${venditore}` : ""} · aggiornato in automatico: l'appuntamento era già nel calendario (fissato prima del passaggio a P&C ONE), classificazione e prequalifica superate`,
        },
      });
      if (collegaCliente) await tx.cliente.update({ where: { id: d.clienteId }, data: { leadOrigineId: d.leadId } });
    });
    if (collegaCliente) clientiConLead.add(d.clienteId);
  }

  return {
    ok: true, prova,
    doppioni: doppi.length, clientiDaTogliere: clientiDoppi.length, clientiTolti,
    leadAvanzati: daAvanzare.length,
    elencoDoppioni: doppi.map((d) => ({ tolgo: descriviApp(d.id), tengo: descriviApp(d.tieni) })),
    elencoLead: daAvanzare.map((d) => ({ lead: perLead.get(d.leadId)!.nome, eraIn: perLead.get(d.leadId)!.fase, diventa: d.esito, appuntamento: descriviApp(d.appuntamentoId), passato: d.dataOra < adesso })),
  };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (req.nextUrl.searchParams.get("diagnosi") === "1") return NextResponse.json(await diagnosi());
  return NextResponse.json(await esegui(true));
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await esegui(false));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}

/** Sola lettura: i lead ancora da lavorare e gli appuntamenti trovati per la stessa persona (per capire perché restano appesi). */
async function diagnosi() {
  const [appuntamenti, clienti, leads, utenti] = await Promise.all([
    prisma.appuntamento.findMany({ select: { id: true, chiaveImport: true, clienteId: true, utenteId: true, tipo: true, dataOra: true, stato: true, luogo: true, titolo: true, createdAt: true } }),
    prisma.cliente.findMany({ select: { id: true, nome: true, telefono: true, cellulare: true, email: true } }),
    prisma.lead.findMany({
      where: { fase: { in: FASI_DA_FISSARE } },
      select: { id: true, nome: true, telefono: true, email: true, fase: true, createdAt: true, scadenzaAzione: true, clienteGenerato: { select: { id: true } }, eventi: { where: { tipo: "lead.esito" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, testo: true, utenteNome: true } } },
    }),
    prisma.utente.findMany({ select: { id: true, nome: true, ruolo: true } }),
  ]);
  const ut = new Map(utenti.map((u) => [u.id, u]));
  const mappa = appuntamentiDeiLead(
    leads.map((l) => ({ id: l.id, nome: l.nome, telefono: l.telefono, email: l.email, fase: l.fase, createdAt: l.createdAt, clienteId: l.clienteGenerato?.id ?? null, ultimoEsitoIl: l.eventi[0]?.createdAt ?? null })),
    appuntamenti, clienti,
  );
  const righe = leads.map((l) => ({
    lead: l.nome, fase: l.fase, arrivato: quando(l.createdAt), ultimoEsito: l.eventi[0] ? `${quando(l.eventi[0].createdAt)} ${l.eventi[0].testo} (${l.eventi[0].utenteNome ?? "?"})` : null,
    appuntamenti: (mappa.get(l.id) ?? []).map((a) => `${quando(a.dataOra)} · ${a.tipo} · ${a.stato} · ${ut.get(a.utenteId)?.nome ?? "?"} (${ut.get(a.utenteId)?.ruolo ?? "?"}) · ${a.chiaveImport ? "BConsole" : "ONE"} · ${a.titolo ?? ""}`),
  }));
  return { leadAperti: leads.length, conAppuntamenti: righe.filter((r) => r.appuntamenti.length).length, righe: righe.filter((r) => r.appuntamenti.length) };
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FASI_APERTE } from "@/lib/automazioni/percorsi";
import { chiaveGiorno, inizioGiorno } from "@/lib/calendario/tempo";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

/** Sola lettura: i lead aperti scaduti (prima di oggi) di una telefonista, con l'appuntamento collegato, per capire perché restano lì. */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const persona = req.nextUrl.searchParams.get("persona") ?? "";
  const t = await prisma.utente.findFirst({ where: { nome: { contains: persona, mode: "insensitive" } }, select: { id: true, nome: true } });
  const oggi = inizioGiorno(chiaveGiorno(new Date()));
  const leads = await prisma.lead.findMany({
    where: { telefonistaId: t?.id, fase: { in: FASI_APERTE }, nonGestitoIl: null, scadenzaAzione: { lt: oggi } },
    select: { id: true, fase: true, scadenzaAzione: true, venditoreId: true, appuntamentoId: true, clienteGenerato: { select: { id: true } } },
    orderBy: { scadenzaAzione: "asc" },
  });
  const appIds = leads.map((l) => l.appuntamentoId).filter((x): x is string => !!x);
  const cliIds = leads.map((l) => l.clienteGenerato?.id).filter((x): x is string => !!x);
  const [apps, perCliente] = await Promise.all([
    prisma.appuntamento.findMany({ where: { id: { in: appIds } }, select: { id: true, dataOra: true, stato: true, esito: true } }),
    prisma.appuntamento.findMany({ where: { clienteId: { in: cliIds } }, select: { clienteId: true, dataOra: true, stato: true, esito: true }, orderBy: { dataOra: "desc" } }),
  ]);
  const conteggio: Record<string, number> = {};
  const righe = leads.map((l) => {
    const a = apps.find((x) => x.id === l.appuntamentoId);
    const altri = perCliente.filter((x) => x.clienteId === l.clienteGenerato?.id);
    const tipo = `${l.fase} | app.collegato: ${a ? `${a.stato}${a.esito ? " con esito" : ""}${a.dataOra < new Date() ? " passato" : " futuro"}` : "nessuno"} | app. del cliente: ${altri.map((x) => `${x.stato}${x.dataOra < new Date() ? " passato" : " futuro"}`).join(",") || "nessuno"}`;
    conteggio[tipo] = (conteggio[tipo] ?? 0) + 1;
    return { id: l.id, scadenza: l.scadenzaAzione, tipo };
  });
  return NextResponse.json({ telefonista: t?.nome, scaduti: leads.length, perTipo: conteggio, righe: righe.slice(0, 60) });
}

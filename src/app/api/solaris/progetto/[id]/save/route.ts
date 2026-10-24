import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const utente = await getCurrentUser();
  if (!utente) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await params;

  const progetto = await prisma.solarisProgetto.findUnique({ where: { id } });
  if (!progetto) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }
  if (!isAmministratore(utente) && progetto.commercialeId !== utente.id) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json() as {
    statoJson?: Record<string, unknown>;
    kwp?: number;
    produzioneStimaKwh?: number;
    risparmioAnno1?: number;
    rientroAnni?: number;
    risparmio25anni?: number;
    autonomiaPercent?: number;
    nomeCliente?: string;
    indirizzo?: string;
    orientamento?: number;
    inclinazione?: number;
    numeroPannelli?: number;
    batteria?: number;
    panelId?: string;
    inverterId?: string;
    consumoKwh?: number;
    prezzoEnergia?: number;
    detrazioneFlag?: number;
    costoKwp?: number;
    costoBatteria?: number;
    categoriaImpianto?: string;
    spiEsterno?: boolean;
    checklistJson?: Record<string, boolean>;
  };

  await prisma.solarisProgetto.update({
    where: { id },
    data: {
      statoJson: body.statoJson as Prisma.InputJsonValue | undefined,
      kwp: body.kwp ?? undefined,
      produzioneStimaKwh: body.produzioneStimaKwh ?? undefined,
      risparmioAnno1: body.risparmioAnno1 ?? undefined,
      rientroAnni: body.rientroAnni ?? undefined,
      risparmio25anni: body.risparmio25anni ?? undefined,
      autonomiaPercent: body.autonomiaPercent ?? undefined,
      nomeCliente: body.nomeCliente ?? undefined,
      indirizzo: body.indirizzo ?? undefined,
      orientamento: body.orientamento ?? undefined,
      inclinazione: body.inclinazione ?? undefined,
      numeroPannelli: body.numeroPannelli ?? undefined,
      batteria: body.batteria ?? undefined,
      panelId: body.panelId ?? undefined,
      inverterId: body.inverterId ?? undefined,
      consumoKwh: body.consumoKwh ?? undefined,
      prezzoEnergia: body.prezzoEnergia ?? undefined,
      detrazioneFlag: body.detrazioneFlag ?? undefined,
      costoKwp: body.costoKwp ?? undefined,
      costoBatteria: body.costoBatteria ?? undefined,
      categoriaImpianto: body.categoriaImpianto ?? undefined,
      spiEsterno: body.spiEsterno ?? undefined,
      checklistJson: body.checklistJson as Prisma.InputJsonValue | undefined,
    },
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoFareCampagne } from "@/app/campagne-actions";
import { rapportoPerPeriodo } from "@/lib/campagne/report";

export const dynamic = "force-dynamic";

/** Report delle campagne per settimana o mese in Excel (punto e virgola). Solo chi gestisce le campagne. */
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!(await puoFareCampagne(u))) return NextResponse.json({ error: "non autorizzato" }, { status: 403 });
  const per = req.nextUrl.searchParams.get("per") === "settimana" ? "settimana" : "mese";
  const campagne = await prisma.campagna.findMany({
    where: { inviataIl: { not: null } },
    select: { id: true, nome: true, inviataIl: true, createdAt: true, invii: { select: { stato: true, apertaIl: true, clicIl: true } } },
  });
  const righe = rapportoPerPeriodo(campagne, per);
  const cella = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const testa = ["Periodo", "Campagne", "Destinatari", "Inviate", "Consegnate", "Rimbalzi", "Disiscritti", "Aperte", "% aperte", "Clic", "% clic"];
  const corpo = righe.map((r) => [r.etichetta, r.campagne, r.destinatari, r.inviate, r.consegnate, r.rimbalzate, r.disiscritti, r.aperte, String(r.apertePerc).replace(".", ","), r.clic, String(r.clicPerc).replace(".", ",")].map(cella).join(";"));
  return new NextResponse("﻿" + [testa.map(cella).join(";"), ...corpo].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="report-campagne-${per}.csv"` },
  });
}

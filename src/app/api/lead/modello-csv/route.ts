import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { modelloCsv } from "@/lib/lead/importa";

export const dynamic = "force-dynamic";

/** File modello da compilare per importare i lead (con i marchi veri di ONE). */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("Accedi a P&C ONE.", { status: 401 });
  const marchi = (await prisma.brand.findMany({ select: { nome: true }, orderBy: { nome: "asc" } })).map((b) => b.nome);
  return new NextResponse(modelloCsv(marchi), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="modello-lead-P&C-ONE.csv"` } });
}

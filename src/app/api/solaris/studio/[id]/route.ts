import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const utente = await getCurrentUser();
  if (!utente) {
    return new NextResponse("Non autorizzato", { status: 401 });
  }

  const { id } = await params;

  const progetto = await prisma.solarisProgetto.findUnique({
    where: { id },
  });

  if (!progetto) {
    return new NextResponse("Progetto non trovato", { status: 404 });
  }

  if (!isAmministratore(utente) && progetto.commercialeId !== utente.id) {
    return new NextResponse("Non autorizzato", { status: 403 });
  }

  const componenti = await prisma.solarisComponente.findMany({
    where: { attivo: true },
    orderBy: [{ categoria: "asc" }, { potenzaW: "asc" }],
  });

  const pannelli = componenti
    .filter((c) => c.categoria === "PANNELLO")
    .map((c) => ({
      id: c.id,
      n: c.nome,
      w: c.potenzaW,
      price: c.prezzoVendita,
      cost: c.costoAcquisto,
      ...((c.misureJson as Record<string, unknown>) ?? {}),
    }));

  const inverter = componenti
    .filter((c) => c.categoria === "INVERTER")
    .map((c) => ({
      id: c.id,
      n: c.nome,
      price: c.prezzoVendita,
      cost: c.costoAcquisto,
      ibrido: c.ibrido,
    }));

  const solarisInit = {
    progettoId: progetto.id,
    preventivoId: progetto.preventivoId,
    isAmministratore: isAmministratore(utente),
    stato: (progetto.statoJson as Record<string, unknown> | null) ?? null,
    catalogo: pannelli.length > 0 || inverter.length > 0
      ? { pannelli, inverter }
      : null,
  };

  const htmlPath = path.join(process.cwd(), "public", "solaris-studio", "studio.html");
  let html: string;
  try {
    html = fs.readFileSync(htmlPath, "utf-8");
  } catch {
    return new NextResponse("Template Studio non trovato", { status: 500 });
  }

  const inject = `<script>window.SOLARIS_INIT=${JSON.stringify(solarisInit)};</script>`;
  html = html.replace("</head>", inject + "\n</head>");

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}

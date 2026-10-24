import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getSolarisLivello } from "@/lib/auth";
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

  const livello = getSolarisLivello(utente);
  if (!livello) {
    return new NextResponse("Accesso Solaris non abilitato", { status: 403 });
  }

  const { id } = await params;

  const progetto = await prisma.solarisProgetto.findUnique({
    where: { id },
  });

  if (!progetto) {
    return new NextResponse("Progetto non trovato", { status: 404 });
  }

  // COMMERCIALE vede solo i propri progetti; AMMINISTRATORE e TECNICO vedono tutto
  if (livello === "COMMERCIALE" && progetto.commercialeId !== utente.id) {
    return new NextResponse("Non autorizzato", { status: 403 });
  }

  const componenti = await prisma.solarisComponente.findMany({
    where: { attivo: true },
    orderBy: [{ categoria: "asc" }, { potenzaW: "asc" }],
  });

  const mostraCosti = livello === "AMMINISTRATORE";

  const pannelli = componenti
    .filter((c) => c.categoria === "PANNELLO")
    .map((c) => ({
      id: c.id,
      n: c.nome,
      w: c.potenzaW,
      price: livello !== "TECNICO" ? c.prezzoVendita : null,
      cost: mostraCosti ? c.costoAcquisto : null,
      ...((c.misureJson as Record<string, unknown>) ?? {}),
    }));

  const inverter = componenti
    .filter((c) => c.categoria === "INVERTER")
    .map((c) => ({
      id: c.id,
      n: c.nome,
      kw: c.potenzaW / 1000,
      faseTipo: c.faseTipo,
      price: livello !== "TECNICO" ? c.prezzoVendita : null,
      cost: mostraCosti ? c.costoAcquisto : null,
      ibrido: c.ibrido,
    }));

  const solarisInit = {
    progettoId: progetto.id,
    preventivoId: progetto.preventivoId,
    solarisLivello: livello,
    // mantenuto per retrocompatibilità con lo studio HTML esistente
    isAmministratore: livello === "AMMINISTRATORE",
    stato: (progetto.statoJson as Record<string, unknown> | null) ?? null,
    categoriaImpianto: progetto.categoriaImpianto ?? null,
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

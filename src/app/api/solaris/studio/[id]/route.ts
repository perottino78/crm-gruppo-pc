import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getSolarisLivello } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { CATALOGO_STEALTH } from "@/lib/solaris/stealth";
import { haChiaveGoogleMaps } from "@/lib/solaris/google-mappe";

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

  const leggiCatalogo = () =>
    prisma.solarisComponente.findMany({
      where: { attivo: true },
      orderBy: [{ categoria: "asc" }, { potenzaW: "asc" }],
    });
  let componenti = await leggiCatalogo();

  // Prodotti Stealth Energy: caricati da soli la prima volta (prezzi a 0, li completa l'amministratore).
  // Si guarda anche fra i disattivati, così un prodotto spento a mano non torna.
  const nomiStealth = CATALOGO_STEALTH.map((c) => c.nome);
  const giaCaricati = await prisma.solarisComponente.count({ where: { nome: { in: nomiStealth } } });
  if (giaCaricati < nomiStealth.length) {
    const solaris = await prisma.brand.findFirst({ where: { nome: "Solaris" }, select: { id: true } });
    if (solaris) {
      await prisma.solarisComponente.createMany({
        data: CATALOGO_STEALTH.map((c) => ({
          brandId: solaris.id,
          categoria: c.categoria,
          nome: c.nome,
          potenzaW: c.potenzaW,
          faseTipo: c.faseTipo,
          ibrido: c.ibrido,
          note: c.note,
          misureJson: c.misureJson as object,
          prezzoVendita: 0,
          costoAcquisto: 0,
        })),
        skipDuplicates: true,
      });
      componenti = await leggiCatalogo();
    }
  }

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
      hyb: c.ibrido,
      ...((c.misureJson as Record<string, unknown>) ?? {}),
    }));

  const batterie = componenti
    .filter((c) => c.categoria === "BATTERIA")
    .map((c) => ({
      id: c.id,
      n: c.nome,
      kwh: c.potenzaW / 1000,
      price: livello !== "TECNICO" ? c.prezzoVendita : null,
      cost: mostraCosti ? c.costoAcquisto : null,
      note: c.note,
      ...((c.misureJson as Record<string, unknown>) ?? {}),
    }));

  const solarisInit = {
    progettoId: progetto.id,
    preventivoId: progetto.preventivoId,
    solarisLivello: livello,
    // mantenuto per retrocompatibilità con lo studio HTML esistente
    isAmministratore: livello === "AMMINISTRATORE",
    stato: (progetto.statoJson as Record<string, unknown> | null) ?? null,
    categoriaImpianto: progetto.categoriaImpianto ?? null,
    // con la chiave Google la mappa del passo 1 e le foto del tetto arrivano da Google
    googleMappe: await haChiaveGoogleMaps().catch(() => false),
    catalogo: pannelli.length > 0 || inverter.length > 0 || batterie.length > 0
      ? { pannelli, inverter, batterie }
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

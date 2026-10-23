import { NextRequest, NextResponse } from "next/server";
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
    dataUri: string;
    nome?: string;
    tipo?: string;
  };

  if (!body.dataUri) {
    return NextResponse.json({ error: "dataUri mancante" }, { status: 400 });
  }

  const foto = await prisma.solarisFoto.create({
    data: {
      progettoId: id,
      dataUri: body.dataUri,
      nome: body.nome ?? null,
      tipo: body.tipo ?? "TETTO",
    },
  });

  return NextResponse.json({ ok: true, fotoId: foto.id });
}

export async function GET(
  _req: NextRequest,
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

  const foto = await prisma.solarisFoto.findMany({
    where: { progettoId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, nome: true, tipo: true, dataUri: true, createdAt: true },
  });

  return NextResponse.json(foto);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const utente = await getCurrentUser();
  if (!utente) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const fotoId = searchParams.get("fotoId");

  if (!fotoId) {
    return NextResponse.json({ error: "fotoId mancante" }, { status: 400 });
  }

  const progetto = await prisma.solarisProgetto.findUnique({ where: { id } });
  if (!progetto) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }
  if (!isAmministratore(utente) && progetto.commercialeId !== utente.id) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  await prisma.solarisFoto.delete({ where: { id: fotoId, progettoId: id } });

  return NextResponse.json({ ok: true });
}

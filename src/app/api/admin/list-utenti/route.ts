import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Diagnostica una tantum: elenca utenti (senza esporre password) per verificare
// email/username disponibili durante l'attivazione del sistema di login.
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const utenti = await prisma.utente.findMany({
    select: { id: true, nome: true, email: true, ruolo: true, username: true, mustChangePassword: true, passwordHash: true },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(
    utenti.map((u) => ({ ...u, haPassword: !!u.passwordHash, passwordHash: undefined }))
  );
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificaPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const DEBOLI = ["123456", "12345678", "123456789", "password", "qwerty", "000000", "111111"];

// Una tantum: chi ha ancora una password di default (es. 123456) deve cambiarla al prossimo clic nel CRM.
export async function POST(req: NextRequest) {
  if ((req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key")) !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const utenti = await prisma.utente.findMany({ where: { passwordHash: { not: null }, mustChangePassword: false }, select: { id: true, nome: true, passwordHash: true } });
  const segnati: string[] = [];
  for (const u of utenti) {
    for (const p of DEBOLI) {
      if (await verificaPassword(p, u.passwordHash!)) {
        await prisma.utente.update({ where: { id: u.id }, data: { mustChangePassword: true } });
        segnati.push(u.nome);
        break;
      }
    }
  }
  return NextResponse.json({ controllati: utenti.length, segnati });
}

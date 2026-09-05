import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Bootstrap: imposta username+password per un utente esistente (identificato via email),
// protetto dalla stessa chiave x-seed-key delle altre route admin. Serve per attivare il
// primo accesso amministratore (che altrimenti non potrebbe usare l'UI di reset in
// Impostazioni, essendo quella raggiungibile solo dopo aver già effettuato il login).
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const email = body?.email as string | undefined;
  const password = body?.password as string | undefined;
  const username = (body?.username as string | undefined) ?? email;
  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: "email e password (min 6 caratteri) obbligatori" }, { status: 400 });
  }

  const utente = await prisma.utente.findUnique({ where: { email } });
  if (!utente) return NextResponse.json({ error: `utente con email ${email} non trovato` }, { status: 404 });

  const passwordHash = await hashPassword(password);
  await prisma.utente.update({
    where: { id: utente.id },
    data: { passwordHash, username, mustChangePassword: true },
  });

  return NextResponse.json({ ok: true, utenteId: utente.id, username });
}

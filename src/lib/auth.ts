import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession, SESSION_COOKIE_NAME, SESSION_DURATA_GIORNI } from "@/lib/session";
import type { Utente } from "@prisma/client";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verificaPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function creaSessione(utenteId: string): Promise<void> {
  const token = await signSession({ utenteId, exp: Date.now() + SESSION_DURATA_GIORNI * 24 * 60 * 60 * 1000 });
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATA_GIORNI * 24 * 60 * 60,
  });
}

export async function distruggiSessione(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

// Utente correntemente loggato (o null). Da usare in Server Component / Server Action.
// Il middleware garantisce già che le pagine protette non siano raggiungibili senza sessione
// valida: questa funzione serve a recuperare i dati freschi dell'utente (ruolo incluso) per
// applicare il filtro dati e per personalizzare l'interfaccia.
export async function getCurrentUser(): Promise<Utente | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySession(token);
  if (!payload) return null;
  return prisma.utente.findUnique({ where: { id: payload.utenteId } });
}

export function isAmministratore(utente: Pick<Utente, "ruolo"> | null | undefined): boolean {
  return utente?.ruolo === "AMMINISTRATORE";
}

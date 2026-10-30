import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PERSONALE_BCONSOLE, pianoImportUtenti } from "@/lib/utenti/bconsole";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Carica nel CRM il personale scelto da BConsole (elenco in src/lib/utenti/bconsole.ts).
// Senza password: nessuno entra finché l'amministratore non imposta l'accesso da Impostazioni.
// Non duplica: riconosce per email, username o nome; sugli utenti già presenti completa solo i campi vuoti.
// ?prova=1 mostra cosa farebbe senza scrivere nulla.
// ?ruoli=dgirodo,lpinto porta al ruolo dell'elenco anche chi c'è già (solo per gli username indicati, deciso da Ugo).
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prova = req.nextUrl.searchParams.get("prova") === "1";
  const forzaRuolo = new Set((req.nextUrl.searchParams.get("ruoli") ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

  const [utenti, brand] = await Promise.all([
    prisma.utente.findMany({ include: { brandAutorizzati: { select: { id: true } } } }),
    prisma.brand.findMany({ select: { id: true, nome: true } }),
  ]);
  const esistenti = utenti.map((u) => ({ id: u.id, nome: u.nome, email: u.email, username: u.username, ruolo: u.ruolo, ufficio: u.ufficio, brandIds: u.brandAutorizzati.map((b) => b.id) }));
  const piano = pianoImportUtenti(PERSONALE_BCONSOLE, esistenti, brand);

  if (!prova) {
    for (const a of piano) {
      if (a.tipo === "CREA") {
        await prisma.utente.create({
          data: {
            nome: a.persona.nome, email: a.email, username: a.persona.username, ruolo: a.persona.ruolo, ufficio: a.persona.ufficio,
            passwordHash: null, mustChangePassword: true,
            brandAutorizzati: a.brandIds.length ? { connect: a.brandIds.map((id) => ({ id })) } : undefined,
          },
        });
      } else if (a.tipo === "COMPLETA") {
        await prisma.utente.update({
          where: { id: a.id },
          data: { ...a.dati, brandAutorizzati: a.brandIds.length ? { connect: a.brandIds.map((id) => ({ id })) } : undefined },
        });
      }
    }
  }

  // Cambi di ruolo espliciti: solo per chi è già nel CRM e solo se il ruolo è diverso
  const ruoliCambiati: { nome: string; da: string; a: string }[] = [];
  for (const a of piano) {
    if (a.tipo === "CREA" || !forzaRuolo.has(a.persona.username.toLowerCase()) || a.ruoloNelCrm === a.persona.ruolo) continue;
    if (!prova) await prisma.utente.update({ where: { id: a.id }, data: { ruolo: a.persona.ruolo } });
    ruoliCambiati.push({ nome: a.persona.nome, da: a.ruoloNelCrm, a: a.persona.ruolo });
  }

  const riga = (a: (typeof piano)[number]) => ({
    nome: a.persona.nome, username: a.persona.username, ruolo: a.persona.ruolo, ufficio: a.persona.ufficio,
    ...(a.tipo !== "CREA" ? { ruoloNelCrm: a.ruoloNelCrm } : {}),
    ...(a.tipo === "COMPLETA" ? { completati: Object.keys(a.dati) } : {}),
    marchi: a.tipo === "INVARIATO" ? [] : a.brandIds.map((id) => brand.find((b) => b.id === id)?.nome),
  });
  return NextResponse.json({
    prova,
    marchiNelCrm: brand.map((b) => b.nome),
    creati: piano.filter((a) => a.tipo === "CREA").map(riga),
    completati: piano.filter((a) => a.tipo === "COMPLETA").map(riga),
    invariati: piano.filter((a) => a.tipo === "INVARIATO").map(riga),
    ruoliCambiati,
  });
}

// «← Torna al preventivo» dello Studio: porta nell'offerta pannelli, inverter, batteria, installazione e la foto del tetto con i pannelli.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { portaSolarisInOfferta, type ComponenteStudio } from "@/lib/solaris/porta-in-offerta";

const MAX_FOTO = 3_500_000; // caratteri del data URI (le richieste su Vercel stanno sotto i 4,5 MB)

function componente(v: unknown): ComponenteStudio | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const nome = typeof o.nome === "string" ? o.nome.slice(0, 200) : "";
  if (!nome) return null;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
  return { nome, potenzaW: Math.round(num(o.potenzaW)), prezzo: num(o.prezzo) };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const utente = await getCurrentUser();
  if (!utente) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const foto = typeof body.foto === "string" && body.foto.length <= MAX_FOTO ? body.foto : null;
  const esito = await portaSolarisInOfferta(id, utente, {
    pannello: componente(body.pannello),
    inverter: componente(body.inverter),
    fotoDataUri: foto,
  });
  if (!esito.ok) return NextResponse.json({ error: esito.errore, preventivoId: esito.preventivoId }, { status: 400 });
  revalidatePath(`/preventivi/${esito.preventivoId}`);
  revalidatePath(`/preventivi/${esito.preventivoId}/stampa`);
  return NextResponse.json(esito);
}

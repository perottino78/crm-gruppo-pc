import { NextRequest, NextResponse } from "next/server";
import { configGoogle, elencaCalendariGoogle } from "@/lib/calendario/google";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

/** Diagnosi in sola lettura: tutti i calendari che l'account Google collegato vede e quelli salvati in P&C ONE. */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = await configGoogle();
  let suGoogle: unknown = null;
  try { suGoogle = (await elencaCalendariGoogle()).map((c) => ({ nome: c.nome, accesso: c.accesso, id: c.id.slice(0, 12) })); }
  catch (e) { suGoogle = { errore: e instanceof Error ? e.message : String(e) }; }
  return NextResponse.json({ collegato: cfg.collegato, stato: cfg.stato, salvati: cfg.calendari.map((c) => ({ nome: c.nome, utenteId: c.utenteId, scrivi: c.scrivi, id: c.id.slice(0, 12) })), suGoogle });
}

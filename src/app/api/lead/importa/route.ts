import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { importaRighe } from "@/lib/lead/importa-server";
import type { Modo, RigaLead } from "@/lib/lead/importa";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PER_RICHIESTA = 3000;
const testo = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

/** POST JSON { modo: "CAMPAGNE" | "TELEFONISTE", esegui, nomeFile, righe[] }: controlla o salva un gruppo di righe (il browser manda il file a pezzi). */
export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u || !(u.ruolo === "AMMINISTRATORE" || puo(u, "lead.importa"))) return NextResponse.json({ ok: false, errore: "Non hai il permesso di importare contatti." }, { status: 403 });
  let corpo: { modo?: string; esegui?: boolean; nomeFile?: string; righe?: Partial<RigaLead>[] };
  try { corpo = await req.json(); } catch { return NextResponse.json({ ok: false, errore: "Richiesta non valida." }, { status: 400 }); }
  const modo: Modo = corpo.modo === "TELEFONISTE" ? "TELEFONISTE" : "CAMPAGNE";
  if (!Array.isArray(corpo.righe) || corpo.righe.length === 0) return NextResponse.json({ ok: false, errore: "Nessuna riga da controllare." }, { status: 400 });
  if (corpo.righe.length > MAX_PER_RICHIESTA) return NextResponse.json({ ok: false, errore: `Troppe righe in una volta (massimo ${MAX_PER_RICHIESTA}).` }, { status: 400 });
  const righe: RigaLead[] = corpo.righe.map((r) => ({
    riga: Number(r.riga) || 0, nome: testo(r.nome, 200), telefono: testo(r.telefono, 80), email: testo(r.email, 200), marchio: testo(r.marchio, 60),
    provenienza: testo(r.provenienza, 120), comune: testo(r.comune, 120), cap: testo(r.cap, 20), prodotto: testo(r.prodotto, 120), note: testo(r.note, 2000),
  }));
  return NextResponse.json(await importaRighe(righe, modo, corpo.esegui === true, testo(corpo.nomeFile, 120) || "file", { id: u.id, nome: u.nome }));
}

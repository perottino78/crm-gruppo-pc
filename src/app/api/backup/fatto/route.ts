import { NextResponse, type NextRequest } from "next/server";
import { chiaveValida, registraEsito } from "@/lib/backup/server";
import { esitoDaModulo } from "@/lib/backup/regole";

export const dynamic = "force-dynamic";

// Backup sul NAS: il resoconto che manda lo script alla fine (file, byte, errori, spazio libero sul NAS).
export async function POST(req: NextRequest) {
  if (!(await chiaveValida(req))) return new Response("chiave mancante o sbagliata\n", { status: 401 });
  const fd = new URLSearchParams(await req.text());
  const e = esitoDaModulo(Object.fromEntries(fd.entries()), new Date());
  await registraEsito(e);
  return NextResponse.json({ ok: true });
}

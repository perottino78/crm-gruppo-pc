import { NextRequest, NextResponse } from "next/server";
import { importaFileAcquistiBC, type FileAcquistoIn } from "@/lib/amministrazione/file-acquisti-bconsole";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// File (XML/PDF) e dati di pagamento delle fatture d'acquisto importate da BConsole: array JSON di FileAcquistoIn (blocchi < 4 MB).
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let elenco: FileAcquistoIn[];
  try {
    elenco = JSON.parse(await req.text());
    if (!Array.isArray(elenco)) throw new Error("serve un array");
  } catch (e) {
    return NextResponse.json({ error: `JSON non valido: ${(e as Error).message}` }, { status: 400 });
  }
  return NextResponse.json(await importaFileAcquistiBC(elenco));
}

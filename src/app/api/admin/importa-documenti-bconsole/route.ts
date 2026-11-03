import { NextRequest, NextResponse } from "next/server";
import { importaDocumentiBC, type DocumentoBCIn } from "@/lib/clienti/documenti-bconsole";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Offerte e ordini clienti di BConsole (storico in sola lettura): array JSON di DocumentoBCIn. ?prova=1 conta soltanto.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let elenco: DocumentoBCIn[];
  try {
    elenco = JSON.parse(await req.text());
    if (!Array.isArray(elenco)) throw new Error("serve un array");
  } catch (e) {
    return NextResponse.json({ error: `JSON non valido: ${(e as Error).message}` }, { status: 400 });
  }
  return NextResponse.json(await importaDocumentiBC(elenco, req.nextUrl.searchParams.get("prova") === "1"));
}

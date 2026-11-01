import { NextRequest, NextResponse } from "next/server";
import { importaProgettiBC, type ProgettoIn } from "@/lib/report/progetti";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Progetti (commesse) di BConsole per i margini nei report: array JSON di ProgettoIn. ?prova=1 conta soltanto.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let elenco: ProgettoIn[];
  try {
    elenco = JSON.parse(await req.text());
    if (!Array.isArray(elenco)) throw new Error("serve un array");
  } catch (e) {
    return NextResponse.json({ error: `JSON non valido: ${(e as Error).message}` }, { status: 400 });
  }
  return NextResponse.json(await importaProgettiBC(elenco, req.nextUrl.searchParams.get("prova") === "1"));
}

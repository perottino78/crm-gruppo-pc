import { NextRequest, NextResponse } from "next/server";
import { caricaCoprifili } from "@/lib/listini/coprifili-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;

/** Coprifili, angolari e listelli in PVC (INDOOR › SERRAMENTI › PVC — Coprifili e angolari): GET = prova, POST = carica (rilanciabile). */
export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await caricaCoprifili(true));
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await caricaCoprifili(false));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}

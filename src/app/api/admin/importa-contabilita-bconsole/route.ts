import { NextRequest, NextResponse } from "next/server";
import { importaVenditaBC, importaAcquistoBC, esitoVuoto, type DocumentoBC } from "@/lib/amministrazione/bconsole";
import { registra } from "@/lib/amministrazione/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Importa fatture di vendita e d'acquisto lette da BConsole (array JSON di DocumentoBC, a blocchi).
// Rilanciabile: niente doppioni, aggiorna solo lo stato delle rate venute da BConsole. ?prova=1 conta soltanto.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prova = req.nextUrl.searchParams.get("prova") === "1";
  let elenco: DocumentoBC[];
  try {
    elenco = JSON.parse(await req.text());
    if (!Array.isArray(elenco)) throw new Error("serve un array");
  } catch (e) {
    return NextResponse.json({ error: `JSON non valido: ${(e as Error).message}` }, { status: 400 });
  }
  const e = esitoVuoto();
  for (const d of elenco) {
    try {
      if (!d.numero || !/^\d{4}-\d{2}-\d{2}$/.test(d.data)) { e.scartate++; continue; }
      if (d.tipo === "VENDITA") await importaVenditaBC(d, e, prova);
      else if (d.tipo === "ACQUISTO") await importaAcquistoBC(d, e, prova);
      else e.scartate++;
    } catch (err) {
      e.scartate++;
      if (e.avvisi.length < 30) e.avvisi.push(`${d.tipo} ${d.numero} ${d.controparte}: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  if (!prova && (e.nuove || e.aggiornate)) await registra("Importazione", null, "Contabilità BConsole", `${elenco.length} documenti: ${e.nuove} nuovi, ${e.aggiornate} aggiornati, ${e.doppie} già presenti`, "Import BConsole");
  return NextResponse.json(e);
}

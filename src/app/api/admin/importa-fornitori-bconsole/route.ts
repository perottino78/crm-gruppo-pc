import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { convertiFornitore, campiDaCompletare, chiaveNome, normalizzaPiva, type FornitoreBConsole } from "@/lib/fornitori/bconsole";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Importa i fornitori letti da BConsole (array JSON nel corpo). Chiave anche in query (?key=) perché
// la chiamata parte dal browser aperto su BConsole con un POST "semplice" (text/plain, senza preflight).
// Non duplica: riconosce il fornitore per P.IVA o per nome; sui fornitori già presenti completa solo i campi vuoti.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prova = req.nextUrl.searchParams.get("prova") === "1";
  let elenco: FornitoreBConsole[];
  try {
    elenco = JSON.parse(await req.text());
    if (!Array.isArray(elenco)) throw new Error("serve un array");
  } catch (e) {
    return NextResponse.json({ error: `JSON non valido: ${(e as Error).message}` }, { status: 400 });
  }

  const esistenti = await prisma.soggetto.findMany();
  const perPiva = new Map(esistenti.filter((s) => normalizzaPiva(s.partitaIva)).map((s) => [normalizzaPiva(s.partitaIva)!, s]));
  const perNome = new Map(esistenti.map((s) => [chiaveNome(s.ragioneSociale), s]));
  const esito = { creati: [] as string[], aggiornati: [] as string[], invariati: [] as string[] };

  for (const f of elenco) {
    const d = convertiFornitore(f);
    const trovato = (d.partitaIva && perPiva.get(d.partitaIva)) || perNome.get(chiaveNome(d.ragioneSociale));
    if (trovato) {
      const extra = campiDaCompletare(trovato as unknown as Record<string, unknown>, d as unknown as Record<string, unknown>);
      const ruoli = trovato.ruoli.includes("FORNITORE") ? trovato.ruoli : [...trovato.ruoli, "FORNITORE"];
      const cambia = Object.keys(extra).length > 0 || ruoli !== trovato.ruoli;
      if (cambia && !prova) {
        await prisma.soggetto.update({
          where: { id: trovato.id },
          data: { ...extra, ruoli, note: trovato.note?.includes("Importato da BConsole") ? trovato.note : [trovato.note, d.note].filter(Boolean).join("\n") },
        });
      }
      (cambia ? esito.aggiornati : esito.invariati).push(d.ragioneSociale);
    } else {
      if (!prova) {
        const nuovo = await prisma.soggetto.create({ data: { ...d, ruoli: ["FORNITORE"] } });
        perNome.set(chiaveNome(nuovo.ragioneSociale), nuovo);
        if (nuovo.partitaIva) perPiva.set(normalizzaPiva(nuovo.partitaIva)!, nuovo);
      }
      esito.creati.push(d.ragioneSociale);
    }
  }
  return NextResponse.json({ prova, ricevuti: elenco.length, creati: esito.creati.length, aggiornati: esito.aggiornati.length, invariati: esito.invariati.length, dettaglio: esito });
}

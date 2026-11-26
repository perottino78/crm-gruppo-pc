import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { contrattiDi, gestisceProvvigioni, personeVisibili } from "@/lib/provvigioni/server";
import { csvReport, reportMensile } from "@/lib/provvigioni/report";

export const dynamic = "force-dynamic";

// Esporta in Excel (CSV con «;») il report «Provvigioni da pagare» del mese: ?mese=AAAA-MM (di partenza il mese in corso,
// che guarda la situazione alla fine del mese scorso). Solo chi gestisce le provvigioni. /api è fuori dal middleware: qui serve l'utente.
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "accesso richiesto" }, { status: 401 });
  if (!gestisceProvvigioni(u)) return NextResponse.json({ error: "non autorizzato" }, { status: 403 });
  const m = req.nextUrl.searchParams.get("mese") ?? "";
  const mese = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : chiaveGiorno(new Date()).slice(0, 7);
  const contratti = await contrattiDi(await personeVisibili(u));
  const { gruppi } = reportMensile(contratti, mese);
  return new NextResponse(csvReport(gruppi), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="provvigioni-da-pagare-${mese}.csv"`,
    },
  });
}

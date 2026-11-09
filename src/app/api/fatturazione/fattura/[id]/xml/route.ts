import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { puoFatturazione } from "@/lib/fatturazione/server";
import { nomeFileXml } from "@/lib/fatturazione/xml";
import { sezionale } from "@/lib/fatturazione/tabelle";

export const dynamic = "force-dynamic";

/** File XML FatturaPA della fattura emessa, da caricare sul portale dell'Agenzia/intermediario. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoFatturazione(u)) return new Response("Non autorizzato", { status: 401 });
  const { id } = await params;
  const f = await prisma.fatturaEmessa.findUnique({ where: { id }, select: { xml: true, progressivo: true, sezionale: true, stato: true } });
  if (!f?.xml) return new Response("La fattura non ha ancora l'XML (va emessa).", { status: 404 });
  const nome = `${f.stato === "PROVA" ? "PROVA_" : ""}${nomeFileXml(`${sezionale(f.sezionale).estensione}${f.progressivo}`)}`;
  return new Response(f.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "private, no-store" } });
}

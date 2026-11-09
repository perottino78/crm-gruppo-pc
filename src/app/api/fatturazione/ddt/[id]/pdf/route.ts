import { getCurrentUser } from "@/lib/auth";
import { datiPdfDdt, puoFatturazione } from "@/lib/fatturazione/server";
import { pdfDdt } from "@/lib/fatturazione/pdf";
import { nomeFileSicuro } from "@/lib/ordini/calcoli";

export const dynamic = "force-dynamic";

/** PDF del DDT di uscita (da stampare in due copie e far firmare). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoFatturazione(u)) return new Response("Non autorizzato", { status: 401 });
  const { id } = await params;
  const p = await datiPdfDdt(id);
  if (!p) return new Response("DDT non trovato", { status: 404 });
  const pdf = pdfDdt(p.dati);
  const nome = nomeFileSicuro(`DDT ${p.dati.numero.replace(/\//g, "-")} ${p.ddt.clienteNome}.pdf`);
  const scarica = new URL(req.url).searchParams.has("scarica");
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${scarica ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "private, no-store" } });
}

import { getCurrentUser } from "@/lib/auth";
import { datiPdfFattura, puoFatturazione } from "@/lib/fatturazione/server";
import { pdfFattura } from "@/lib/fatturazione/pdf";
import { nomeFileSicuro } from "@/lib/ordini/calcoli";

export const dynamic = "force-dynamic";

/** PDF di cortesia della fattura (della bozza: anteprima). ?scarica per scaricarlo. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoFatturazione(u)) return new Response("Non autorizzato", { status: 401 });
  const { id } = await params;
  const p = await datiPdfFattura(id);
  if (!p) return new Response("Fattura non trovata", { status: 404 });
  const pdf = pdfFattura(p.dati);
  const nome = nomeFileSicuro(`Fattura ${p.dati.numero.replace(/\//g, "-")} ${p.fattura.clienteNome}.pdf`);
  const scarica = new URL(req.url).searchParams.has("scarica");
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${scarica ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "private, no-store" } });
}

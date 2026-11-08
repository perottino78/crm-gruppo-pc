import { getCurrentUser } from "@/lib/auth";
import { datiPdfOrdine, puoGestireOrdini } from "@/lib/ordini/server";
import { pdfOrdineFornitore, senzaPrezzi } from "@/lib/ordini/pdfOrdine";
import { nomeFileSicuro } from "@/lib/ordini/calcoli";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoGestireOrdini(u)) return new Response("Non autorizzato", { status: 401 });
  const { id } = await params;
  const p = await datiPdfOrdine(id);
  if (!p) return new Response("Ordine non trovato", { status: 404 });
  // ?prezzi=0: lista prodotti senza prezzi (quella che si manda al fornitore)
  const pdf = pdfOrdineFornitore(new URL(req.url).searchParams.get("prezzi") === "0" ? senzaPrezzi(p.dati) : p.dati);
  const nome = nomeFileSicuro(`Ordine ${p.dati.numero.replace("/", "-")} ${p.ordine.fornitore.ragioneSociale}.pdf`);
  const scarica = new URL(req.url).searchParams.has("scarica");
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${scarica ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "private, no-store" } });
}

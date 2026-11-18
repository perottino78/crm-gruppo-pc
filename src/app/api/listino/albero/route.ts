// Albero leggero del listino di un marchio (Indoor/Outdoor → categoria → sottogruppo → prodotto) per «Sfoglia il listino»
// nel materiale del rilievo. Solo per chi è collegato; usa l'albero già in memoria dell'offerta.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { tassonomiaListino } from "@/lib/listini/tassonomia";

export const dynamic = "force-dynamic";

export type AlberoLeggero = { nome: string; gruppi: { nome: string; voci: { value: string; label: string }[]; sottogruppi: { nome: string; voci: { value: string; label: string }[] }[] }[] }[];

export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ albero: [] });
  const t = await tassonomiaListino(brandId);
  const voci = (l: { value: string; label: string; disabilitato?: string }[]) => l.filter((x) => !x.disabilitato && !/PLACEHOLDER/.test(x.value)).map((x) => ({ value: x.value, label: x.label }));
  const albero: AlberoLeggero = t.map((f) => ({
    nome: f.nome,
    gruppi: f.gruppi.map((g) => ({ nome: g.nome, voci: voci(g.tipologie), sottogruppi: (g.sottogruppi ?? []).map((s) => ({ nome: s.nome, voci: voci(s.tipologie) })) })),
  }));
  return NextResponse.json({ albero });
}

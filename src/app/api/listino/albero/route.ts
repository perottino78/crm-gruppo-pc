// Albero leggero del listino di un marchio (Indoor/Outdoor → categoria → sottogruppo → prodotto) per «Sfoglia il listino»
// nel materiale del rilievo. Solo per chi è collegato; usa l'albero già in memoria dell'offerta.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assicuraCoprifili } from "@/lib/listini/coprifili-server";
import { tassonomiaListino } from "@/lib/listini/tassonomia";

export const dynamic = "force-dynamic";

type Asse = { valore: string; label: string };
export type VoceLeggera = { value: string; label: string; /** le due tendine (Ugo 22/11/2026: «anche i serramenti stessa cosa») */ assi?: [Asse, Asse] };
export type AlberoLeggero = { nome: string; gruppi: { nome: string; voci: VoceLeggera[]; sottogruppi: { nome: string; voci: VoceLeggera[] }[] }[] }[];

export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ albero: [] });
  await assicuraCoprifili();
  const t = await tassonomiaListino(brandId);
  const voci = (l: { value: string; label: string; disabilitato?: string; assiZenith?: { categoria: Asse; modello: Asse }; assiIsomax?: { modello: Asse; apertura: Asse } }[]): VoceLeggera[] =>
    l.filter((x) => !x.disabilitato && !/PLACEHOLDER/.test(x.value)).map((x) => ({
      value: x.value, label: x.label,
      ...(x.assiZenith ? { assi: [x.assiZenith.categoria, x.assiZenith.modello] as [Asse, Asse] } : x.assiIsomax ? { assi: [x.assiIsomax.modello, x.assiIsomax.apertura] as [Asse, Asse] } : {}),
    }));
  const albero: AlberoLeggero = t.map((f) => ({
    nome: f.nome,
    gruppi: f.gruppi.map((g) => ({ nome: g.nome, voci: voci(g.tipologie), sottogruppi: (g.sottogruppi ?? []).map((s) => ({ nome: s.nome, voci: voci(s.tipologie) })) })),
  }));
  return NextResponse.json({ albero });
}

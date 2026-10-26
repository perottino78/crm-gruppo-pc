// Esportazione in CSV per Excel (separatore ; e virgola decimale) di scadenzario e prima nota.
// /api è fuori dal middleware: il controllo di accesso è fatto qui.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { utenteAmministrazione, residuoScadenza } from "@/lib/amministrazione/server";
import { whereScadenze, whereMovimenti } from "@/lib/amministrazione/filtri";

const num = (n: number) => n.toFixed(2).replace(".", ",");
const data = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "");
const cella = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (righe: string[][]) => "\uFEFF" + righe.map((r) => r.map((c) => cella(c ?? "")).join(";")).join("\r\n");

export async function GET(req: NextRequest) {
  const u = await utenteAmministrazione();
  if (!u) return new Response("Non autorizzato", { status: 401 });
  const p = Object.fromEntries(req.nextUrl.searchParams.entries());
  const oggi = new Date().toISOString().slice(0, 10);

  if (p.vista === "movimenti") {
    const movimenti = await prisma.movimentoFinanziario.findMany({
      where: whereMovimenti(p), orderBy: [{ data: "asc" }, { createdAt: "asc" }],
      include: { conto: { select: { nome: true } }, abbinamenti: { include: { scadenza: { select: { controparte: true, descrizione: true } } } } },
    });
    const righe = [["Data", "Valuta", "Conto", "Descrizione", "Entrate", "Uscite", "Stato", "Categoria", "Abbinato a", "Origine", "Note"]];
    for (const m of movimenti) {
      righe.push([
        data(m.data), data(m.dataValuta), m.conto.nome, m.descrizione,
        m.importo > 0 ? num(m.importo) : "", m.importo < 0 ? num(-m.importo) : "",
        m.stato, m.categoria ?? "", m.abbinamenti.map((a) => `${a.scadenza.controparte} - ${a.scadenza.descrizione} (${num(a.importo)})`).join(" | "),
        m.origine, m.note ?? "",
      ]);
    }
    return new Response(csv(righe), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="prima-nota-${oggi}.csv"` } });
  }

  const scadenze = await prisma.scadenza.findMany({
    where: whereScadenze(p), include: { abbinamenti: true },
    orderBy: [{ dataScadenza: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  const righe = [["Scadenza", "Tipo", "Controparte", "Descrizione", "N. documento", "Importo", "Da saldare", "Stato", "Categoria", "Brand", "Note"]];
  for (const s of scadenze) {
    righe.push([
      data(s.dataScadenza), s.tipo === "INCASSO" ? "Incasso" : "Pagamento", s.controparte, s.descrizione, s.numeroDocumento ?? "",
      num(s.importo), s.stato === "ANNULLATA" ? "0,00" : num(residuoScadenza(s)), s.stato, s.categoria ?? "", s.brand ?? "", s.note ?? "",
    ]);
  }
  return new Response(csv(righe), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="scadenzario-${oggi}.csv"` } });
}

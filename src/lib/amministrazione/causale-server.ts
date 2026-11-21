// Causali proposte per gli incassi di un elenco di scadenze (scadenzario, fattura di vendita): una sola lettura delle fatture collegate.
import { prisma } from "@/lib/prisma";
import { causaleIncasso, fatturaPer, tipoIncasso, type FatturaPerCausale } from "./causale";

type S = { id: string; tipo: string; origine: string; descrizione: string; commessaId: string | null; fatturaVenditaId: string | null; numeroDocumento: string | null };

export async function causaliIncassi(scadenze: S[]): Promise<Map<string, string>> {
  const incassi = scadenze.filter((s) => s.tipo === "INCASSO");
  const out = new Map<string, string>();
  if (!incassi.length) return out;
  const fvIds = [...new Set(incassi.map((s) => s.fatturaVenditaId).filter(Boolean) as string[])];
  const cIds = [...new Set(incassi.map((s) => s.commessaId).filter(Boolean) as string[])];
  const fatture = fvIds.length || cIds.length
    ? await prisma.fatturaVendita.findMany({ where: { OR: [...(fvIds.length ? [{ id: { in: fvIds } }] : []), ...(cIds.length ? [{ commessaId: { in: cIds } }] : [])] }, select: { id: true, numero: true, tipoDocumento: true, data: true, commessaId: true } })
    : [];
  const perId = new Map(fatture.map((f) => [f.id, f]));
  const perCommessa = new Map<string, FatturaPerCausale[]>();
  for (const f of fatture) if (f.commessaId) perCommessa.set(f.commessaId, [...(perCommessa.get(f.commessaId) ?? []), f]);
  for (const s of incassi) {
    const fv = s.fatturaVenditaId ? perId.get(s.fatturaVenditaId) : undefined;
    const tipo = tipoIncasso({ origine: s.origine, tipoDocumento: fv?.tipoDocumento, descrizione: s.descrizione });
    const numero = fv?.numero ?? (s.commessaId ? fatturaPer(tipo, perCommessa.get(s.commessaId) ?? [])?.numero : undefined) ?? s.numeroDocumento;
    out.set(s.id, causaleIncasso(tipo, numero));
  }
  return out;
}

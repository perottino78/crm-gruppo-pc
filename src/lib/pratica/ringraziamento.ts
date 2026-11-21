// Spunta «✉️ Manda il ringraziamento al cliente» quando si registra un incasso (Ugo, 21/11/2026: la mette a mano chi registra, non è preselezionata).
// Si propone solo sul primo incasso di una pratica (acconto non ancora incassato, niente finanziamento, ringraziamento mai mandato).
import { prisma } from "@/lib/prisma";

type ScadenzaIncasso = { id: string; commessaId: string | null; fatturaVenditaId: string | null };

/** Id delle scadenze d'incasso su cui mostrare la spunta del ringraziamento. */
export async function praticheDaRingraziare(scadenze: ScadenzaIncasso[]): Promise<Set<string>> {
  if (!scadenze.length) return new Set();
  const fvIds = [...new Set(scadenze.map((s) => s.fatturaVenditaId).filter(Boolean) as string[])];
  const fv = fvIds.length ? await prisma.fatturaVendita.findMany({ where: { id: { in: fvIds }, commessaId: { not: null } }, select: { id: true, commessaId: true } }) : [];
  const commessaDiFv = new Map(fv.map((f) => [f.id, f.commessaId!]));
  const praticaDi = (s: ScadenzaIncasso) => s.commessaId ?? (s.fatturaVenditaId ? commessaDiFv.get(s.fatturaVenditaId) ?? null : null);
  const ids = [...new Set(scadenze.map(praticaDi).filter(Boolean) as string[])];
  if (!ids.length) return new Set();
  const pronte = await prisma.commessa.findMany({
    where: { id: { in: ids }, accontoIncassato: false, ringraziamentoInviatoIl: null, NOT: { accontoTipo: "FINANZIAMENTO" }, stato: { notIn: ["ANNULLATA"] } },
    select: { id: true },
  });
  const ok = new Set(pronte.map((c) => c.id));
  return new Set(scadenze.filter((s) => { const p = praticaDi(s); return !!p && ok.has(p); }).map((s) => s.id));
}

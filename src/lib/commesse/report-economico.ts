// Report economico di una pratica/progetto (come in BConsole): venduto, costi per voce e margine.
// Stesse fonti della «Scheda costi» della pratica: fasi con costo, costo dell'operatore sui passaggi, materiale e costi manuali.
import { prisma } from "@/lib/prisma";
import { puo, type ConPermessi } from "@/lib/permessi/catalogo";
import { costiMaterialeCommesse } from "@/lib/ordini/server";
import { numeroCommessa } from "@/lib/commesse";

/** Chi vede il report economico: amministratore, chi ha il permesso Report o Amministrazione. */
export function puoVedereReportEconomico(u: ConPermessi | null | undefined): boolean {
  return puo(u, "report") || puo(u, "amministrazione");
}

export type VoceCosto = { data: Date; voce: string; tipo: "Manodopera" | "Materiale" | "Fatture fornitori" | "Altro"; importo: number };
export type ReportEconomico = {
  id: string; numero: string; cliente: string; clienteId: string; brand: string; stato: string; oggetto: string | null;
  vendutoImponibile: number; vendutoIvaInclusa: number; accontoIncassato: number | null;
  voci: VoceCosto[]; perTipo: Record<VoceCosto["tipo"], number>; costiTotali: number; margine: number; marginePerc: number; righeSenzaCosto: number;
};

const cent = (n: number) => Math.round(n * 100) / 100;

export async function reportEconomico(commessaId: string): Promise<ReportEconomico | null> {
  const c = await prisma.commessa.findUnique({
    where: { id: commessaId },
    include: {
      cliente: { select: { id: true, nome: true } }, brand: { select: { nome: true } }, preventivo: { select: { oggetto: true } },
      fasi: { where: { stato: "CHIUSA", costoTotale: { gt: 0 } }, select: { nome: true, assegnatoNome: true, costoTotale: true, chiusaIl: true, createdAt: true } },
      tasks: { where: { costoLavoro: { gt: 0 } }, select: { titolo: true, lavoroDaNome: true, minuti: true, costoLavoro: true, completatoIl: true, createdAt: true } },
      costiManuali: { select: { data: true, descrizione: true, categoria: true, importo: true } },
    },
  });
  if (!c) return null;
  const materiale = (await costiMaterialeCommesse([c.id])).get(c.id) ?? { voci: [], righeSenzaCosto: 0 };
  const voci: VoceCosto[] = [
    ...c.fasi.map((f) => ({ data: f.chiusaIl ?? f.createdAt, voce: `Fase: ${f.nome}${f.assegnatoNome ? ` (${f.assegnatoNome})` : ""}`, tipo: "Manodopera" as const, importo: f.costoTotale })),
    ...c.tasks.map((t) => ({ data: t.completatoIl ?? t.createdAt, voce: `Passaggio: ${t.titolo}${t.lavoroDaNome ? ` (${t.lavoroDaNome})` : ""} · ${t.minuti} min`, tipo: "Manodopera" as const, importo: t.costoLavoro })),
    ...materiale.voci.map((v) => ({ data: v.data, voce: v.voce, tipo: "Materiale" as const, importo: v.importo })),
    ...c.costiManuali.map((m) => ({
      data: m.data, voce: m.descrizione, importo: m.importo,
      tipo: (m.categoria === "ACQUISTO_MATERIALE" ? "Materiale" : m.categoria === "FATTURA_FORNITORE" ? "Fatture fornitori" : "Altro") as VoceCosto["tipo"],
    })),
  ].sort((a, b) => a.data.getTime() - b.data.getTime());
  const perTipo: ReportEconomico["perTipo"] = { Manodopera: 0, Materiale: 0, "Fatture fornitori": 0, Altro: 0 };
  for (const v of voci) perTipo[v.tipo] = cent(perTipo[v.tipo] + v.importo);
  const costiTotali = cent(voci.reduce((t, v) => t + v.importo, 0));
  const margine = cent(c.totaleImponibile - costiTotali);
  return {
    id: c.id, numero: numeroCommessa(c), cliente: c.cliente.nome, clienteId: c.cliente.id, brand: c.brand.nome, stato: c.stato, oggetto: c.preventivo.oggetto,
    vendutoImponibile: c.totaleImponibile, vendutoIvaInclusa: c.totaleVendita, accontoIncassato: c.accontoIncassato ? (c.accontoImportoIncassato ?? null) : null,
    voci, perTipo, costiTotali, margine, marginePerc: c.totaleImponibile > 0 ? cent((margine / c.totaleImponibile) * 100) : 0, righeSenzaCosto: materiale.righeSenzaCosto,
  };
}

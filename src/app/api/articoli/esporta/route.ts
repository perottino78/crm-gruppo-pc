// Esportazione del catalogo articoli (con i filtri dell'elenco) in Excel o CSV.
// Le colonne sono quelle del modello d'importazione: il file si può modificare e ricaricare.
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { puoVedereArticoli, filtroArticoli, categorieRegola, type FiltriArticoli } from "@/lib/articoli/server";
import { calcolaArticolo, testoRegola } from "@/lib/articoli/prezzi";
import { COLONNE } from "@/lib/articoli/importa";
import { scriviXlsx, scriviCsv, type Cella } from "@/lib/articoli/foglio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || !puoVedereArticoli(u)) return new Response("Non autorizzato", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const p = Object.fromEntries(sp.entries()) as FiltriArticoli & { formato?: string };
  const [cat, regole] = await Promise.all([prisma.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true } }), categorieRegola()]);
  const lista = await prisma.articolo.findMany({ where: filtroArticoli(p, cat), include: { fornitore: { select: { ragioneSociale: true } } }, orderBy: [{ codice: "asc" }] });
  const extra = ["COSTO CALCOLATO", "MARGINE EFFETTIVO %", "RICARICO EFFETTIVO (×)", "REGOLA APPLICATA", "PREZZO IVATO", "AGGIORNATO IL"];
  const righe: Cella[][] = [[...COLONNE.map((c) => c.titolo), ...extra]];
  for (const a of lista) {
    const c = calcolaArticolo(a, regole);
    const cc = cat.find((x) => x.id === a.categoriaId);
    const madre = cc?.padreId ? cat.find((x) => x.id === cc.padreId) : undefined;
    const val: Record<string, Cella> = {
      codice: a.codice, codiceFornitore: a.codiceFornitore, descrizione: a.descrizione, descrizioneEstesa: a.descrizioneEstesa,
      categoria: madre?.nome ?? cc?.nome ?? "", sottocategoria: madre ? cc?.nome : "", fornitore: a.fornitore?.ragioneSociale, marca: a.marca,
      divisione: a.divisione, um: a.um, aliquotaIva: a.aliquotaIva, prezzoListino: a.prezzoListino, sconti: a.sconti,
      costoAcquisto: a.prezzoListino === null ? a.costoAcquisto : null, metodoPrezzo: a.metodoPrezzo,
      ricarico: a.metodoPrezzo === "RICARICO" ? a.valorePrezzo : null, margine: a.metodoPrezzo === "MARGINE" ? a.valorePrezzo : null,
      prezzoVendita: c.vendita, ean: a.ean, immagineUrl: a.immagineUrl?.startsWith("http") ? a.immagineUrl : null, note: a.note, attivo: a.attivo ? "SI" : "NO",
    };
    righe.push([...COLONNE.map((k) => val[k.campo] ?? null), c.costo, c.margine, c.coefficiente, c.regola ? `${testoRegola(c.regola)} (${c.regola.da})` : "", c.ivato, a.updatedAt.toLocaleDateString("it-IT")]);
  }
  const oggi = new Date().toISOString().slice(0, 10);
  if (p.formato === "csv") {
    return new Response(scriviCsv(righe), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="articoli-${oggi}.csv"`, "Cache-Control": "private, no-store" } });
  }
  const dec = COLONNE.map((c, i) => (["prezzoListino", "costoAcquisto", "prezzoVendita"].includes(c.campo) ? i : -1)).filter((i) => i >= 0);
  const buf = scriviXlsx([{ nome: "Articoli", righe, larghezze: [...COLONNE.map((c) => c.larghezza), 14, 12, 12, 22, 12, 12], numeriDecimali: [...dec, COLONNE.length, COLONNE.length + 4] }]);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="articoli-${oggi}.xlsx"`, "Cache-Control": "private, no-store" } });
}

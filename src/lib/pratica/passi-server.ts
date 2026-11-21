// Dati del percorso guidato della pratica: legge il database e li passa alla logica pura di passi.ts.
import { prisma } from "@/lib/prisma";
import { passiPratica, type DatiPassi } from "./passi";

export async function datiPassiDiCommessa(commessaId: string): Promise<(DatiPassi & { stato: string }) | null> {
  const c = await prisma.commessa.findUnique({
    where: { id: commessaId },
    select: {
      stato: true, accontoTipo: true, accontoIncassato: true, finanziamentoStato: true, fatturaAccontoIl: true, progettoCreatoIl: true, benvenutoIl: true,
      materialeCompletoIl: true, saldoIncassato: true, riordinoIl: true,
      rilievi: { select: { stato: true } },
      righeOrdine: { select: { daMagazzino: true, ordinato: true, createdAt: true } },
      pose: { select: { stato: true } },
    },
  });
  if (!c) return null;
  const kit = await prisma.consegnaKit.count({ where: { commessaId } });
  const rilieviAttivi = c.rilievi.filter((r) => r.stato !== "ANNULLATO");
  const daOrdinare = c.righeOrdine.filter((r) => !r.daMagazzino);
  const viaLibera = c.accontoTipo === "FINANZIAMENTO" ? c.finanziamentoStato === "APPROVATO" : c.accontoIncassato;
  // posa finita = lavori eseguiti (una posa «parziale» resta COMPLETATA ma la pratica resta in POSA); fissata = c'è una posa aperta
  const posaFinita = c.stato === "LAVORI_ESEGUITI" || c.stato === "CHIUSA" || (c.stato !== "POSA" && c.pose.some((p) => p.stato === "COMPLETATA"));
  const posaFissata = posaFinita || c.pose.some((p) => p.stato !== "ANNULLATA" && p.stato !== "COMPLETATA");
  // riordino dopo una posa parziale: il materiale aggiunto da allora va ordinato
  const nuove = c.riordinoIl ? daOrdinare.filter((r) => r.createdAt >= c.riordinoIl!) : [];
  const riordino = c.riordinoIl ? { ordinato: nuove.length > 0 && nuove.every((r) => r.ordinato) } : null;
  return {
    stato: c.stato,
    fatturaAccontoIl: c.fatturaAccontoIl, progettoCreatoIl: c.progettoCreatoIl, benvenutoIl: c.benvenutoIl, viaLibera,
    rilievoFissato: rilieviAttivi.length > 0, rilievoCaricato: rilieviAttivi.some((r) => r.stato === "ESEGUITO"),
    ordinato: daOrdinare.length > 0 && daOrdinare.every((r) => r.ordinato), materialeCompleto: !!c.materialeCompletoIl, saldoIncassato: c.saldoIncassato,
    posaFissata, posaFinita, kitConsegnato: kit > 0 || c.stato === "CHIUSA", riordino,
  };
}

export async function passiDiCommessa(commessaId: string) {
  const d = await datiPassiDiCommessa(commessaId);
  return d ? { dati: d, ...passiPratica(d) } : null;
}

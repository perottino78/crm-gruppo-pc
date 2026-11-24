// Totali dell'offerta (imponibile scontato e IVA), condivisi da azioni dei preventivi e Solaris Studio.
import { prisma } from "@/lib/prisma";
import { importoRigaOfferta, riepilogoIvaRighe } from "@/lib/preventivi/iva";

// totaleNetto memorizzato è l'imponibile SCONTATO (imponibile lordo * (1 - sconto/100));
// l'IVA viene calcolata su tale importo scontato, coerentemente con le offerte cartacee P&C.
// Se e' attivo il "prezzo manuale" (vedi aggiornaPrezzoManuale), il calcolo dalle righe
// viene del tutto bypassato: totaleNetto/totaleIva si ricavano a ritroso dal totale finale
// scritto a mano e dall'aliquota IVA corrente, ignorando righe e scontoPercentuale.
export async function ricalcolaTotali(preventivoId: string) {
  const preventivoAttuale = await prisma.preventivo.findUnique({ where: { id: preventivoId } });
  if (!preventivoAttuale) return;

  if (preventivoAttuale.prezzoManualeAttivo && preventivoAttuale.prezzoManualeTotale != null) {
    const totaleManuale = preventivoAttuale.prezzoManualeTotale;
    const totaleNetto = totaleManuale / (1 + preventivoAttuale.aliquotaIva / 100);
    await prisma.preventivo.update({
      where: { id: preventivoId },
      data: { totaleNetto, totaleIva: totaleManuale - totaleNetto },
    });
    return;
  }

  const righe = await prisma.rigaPreventivo.findMany({
    where: { preventivoId },
    include: { optionali: true },
  });
  const imponibileLordo = righe.reduce((sum, r) => {
    const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    return sum + r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
  }, 0);
  const sconto = preventivoAttuale.scontoPercentuale ?? 0;
  const totaleNetto = imponibileLordo * (1 - sconto / 100);
  const preventivo = await prisma.preventivo.update({
    where: { id: preventivoId },
    data: { totaleNetto },
  });
  // IVA per riga (ognuna con la sua aliquota, o quella dell'offerta)
  const iva = riepilogoIvaRighe(righe.map((r) => ({ importo: importoRigaOfferta(r), aliquota: r.aliquotaIva })), sconto, preventivo.aliquotaIva).reduce((t, x) => t + x.iva, 0);
  await prisma.preventivo.update({
    where: { id: preventivoId },
    data: { totaleIva: Math.round(iva * 100) / 100 },
  });
}

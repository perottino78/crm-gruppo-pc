// Quanto ha incassato una pratica e se il rilievo può partire (50% del totale, finanziamento approvato o sblocco dell'amministratore).
import { prisma } from "@/lib/prisma";
import { residuoScadenza } from "@/lib/amministrazione/server";
import { viaLiberaRilievo, sogliaRilievo } from "./soglia";

export async function statoSogliaRilievo(commessaId: string) {
  const c = await prisma.commessa.findUnique({
    where: { id: commessaId },
    select: { accontoTipo: true, finanziamentoStato: true, totaleVendita: true, accontoIncassato: true, accontoImportoIncassato: true, accontoImporto: true, saldoIncassato: true, saldoImporto: true, rilievoSbloccatoIl: true },
  });
  if (!c) return null;
  const fatture = await prisma.fatturaVendita.findMany({ where: { commessaId }, select: { id: true } });
  const scadenze = await prisma.scadenza.findMany({
    where: { tipo: "INCASSO", stato: { notIn: ["ANNULLATA", "SOSTITUITA"] }, OR: [{ commessaId }, ...(fatture.length ? [{ fatturaVenditaId: { in: fatture.map((f) => f.id) } }] : [])] },
    select: { importo: true, pagatoManuale: true, ritenuta: true, abbinamenti: { select: { importo: true } } },
  });
  const daScadenze = scadenze.reduce((t, s) => t + Math.max(0, s.importo - residuoScadenza(s)), 0);
  // incassi segnati nella pratica e non ancora passati allo scadenzario
  const daPratica = (c.accontoIncassato ? c.accontoImportoIncassato ?? c.accontoImporto : 0) + (c.saldoIncassato ? c.saldoImporto ?? 0 : 0);
  const incassato = Math.round(Math.max(daScadenze, daPratica) * 100) / 100;
  const viaLibera = viaLiberaRilievo({ accontoTipo: c.accontoTipo, finanziamentoStato: c.finanziamentoStato, totale: c.totaleVendita, incassato, sbloccato: !!c.rilievoSbloccatoIl });
  return { incassato, totale: c.totaleVendita, soglia: sogliaRilievo(c.totaleVendita), viaLibera, sbloccato: !!c.rilievoSbloccatoIl };
}

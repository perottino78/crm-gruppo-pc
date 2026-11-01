// Progetti (commesse) di BConsole con valore offerto e costi imputati: servono per i margini nei report.
// Rilanciabile: aggiorna i numeri dei progetti già presenti (sono dati di BConsole, nel CRM non si modificano).
import { prisma } from "@/lib/prisma";
import { lineaDaTesto } from "./categorie";

export type ProgettoIn = {
  id: string; numero: string; clienteNome: string; descrizione?: string | null; tipologia?: string | null; capoProgetto?: string | null; stato?: string | null;
  totaleOfferto?: number; costoAttuale?: number; fattureAcquisto?: number; costiPersonale?: number; creatoIl?: string | null;
};

export async function importaProgettiBC(elenco: ProgettoIn[], prova = false) {
  const esito = { nuovi: 0, aggiornati: 0, scartati: 0 };
  const gia = new Set((await prisma.progettoBC.findMany({ where: { id: { in: elenco.map((p) => String(p.id)) } }, select: { id: true } })).map((p) => p.id));
  for (const p of elenco) {
    if (!p.id || !p.numero) { esito.scartati++; continue; }
    const tip = p.tipologia ?? "";
    const dati = {
      numero: p.numero, clienteNome: (p.clienteNome || "").trim() || "—", descrizione: p.descrizione?.trim() || null, tipologia: tip || null,
      capoProgetto: p.capoProgetto || null, stato: p.stato || null,
      categoria: lineaDaTesto(p.descrizione) ?? (/solaris/i.test(tip) ? "Fotovoltaico" : /pura/i.test(tip) ? "Depurazione acqua" : null),
      totaleOfferto: Number(p.totaleOfferto) || 0, costoAttuale: Number(p.costoAttuale) || 0, fattureAcquisto: Number(p.fattureAcquisto) || 0, costiPersonale: Number(p.costiPersonale) || 0,
      creatoIl: p.creatoIl && /^\d{4}-\d{2}-\d{2}$/.test(p.creatoIl) ? new Date(`${p.creatoIl}T12:00:00Z`) : null,
    };
    if (gia.has(String(p.id))) esito.aggiornati++; else esito.nuovi++;
    if (!prova) await prisma.progettoBC.upsert({ where: { id: String(p.id) }, create: { id: String(p.id), ...dati }, update: dati });
  }
  return esito;
}

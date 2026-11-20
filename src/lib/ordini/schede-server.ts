// Moduli di rilievo pronti (richiesta di Ugo 20/11/2026: dall'ufficio ordini non trovava i moduli interattivi, perché finché nessuno
// salvava un modello l'ordine diceva «Nessun modello»). Una volta sola si creano i modelli pronti (standard, NEW LIPARI, SEEGLASS)
// che non ci sono ancora per nome; poi restano modificabili o disattivabili in Ordini fornitori › Moduli di rilievo, e non tornano.
import { prisma } from "@/lib/prisma";
import { MODELLI_PRONTI } from "./scheda-produzione";

const CHIAVE = "schede_pronte_versione";
const VERSIONE = "1";

export async function assicuraModelliPronti(): Promise<number> {
  const fatto = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE }, select: { valore: true } });
  if (fatto?.valore === VERSIONE) return 0;
  const esistenti = new Set((await prisma.schedaProduzioneModello.findMany({ select: { nome: true } })).map((m) => m.nome.trim().toLowerCase()));
  const nuovi = MODELLI_PRONTI.filter((m) => !esistenti.has(m.nome.trim().toLowerCase()));
  if (nuovi.length) await prisma.schedaProduzioneModello.createMany({ data: nuovi.map((m) => ({ nome: m.nome, html: m.html, creatoDaNome: "P&C ONE (modello pronto)" })) });
  await prisma.configurazione.upsert({ where: { chiave: CHIAVE }, update: { valore: VERSIONE }, create: { chiave: CHIAVE, valore: VERSIONE } });
  return nuovi.length;
}

import { prisma } from "@/lib/prisma";
import { TABELLE_PREDEFINITE, normalizzaTabella, type TabellaFinanziamento } from "./tabelle";

export const CHIAVE_TABELLE = "finanziamento_tabelle";

/** Tabelle in uso: quelle salvate in Impostazioni, altrimenti quelle del simulatore. */
export async function leggiTabelleFinanziamento(): Promise<TabellaFinanziamento[]> {
  const c = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE_TABELLE }, select: { valore: true } });
  if (!c?.valore) return TABELLE_PREDEFINITE.map((t) => ({ ...t }));
  try {
    const arr = JSON.parse(c.valore);
    if (!Array.isArray(arr)) return TABELLE_PREDEFINITE.map((t) => ({ ...t }));
    const ok = arr.map((x) => normalizzaTabella(x)).filter((x): x is TabellaFinanziamento => typeof x !== "string");
    return ok;
  } catch {
    return TABELLE_PREDEFINITE.map((t) => ({ ...t }));
  }
}

export async function salvaTabelleFinanziamento(t: TabellaFinanziamento[]) {
  const valore = JSON.stringify(t);
  await prisma.configurazione.upsert({ where: { chiave: CHIAVE_TABELLE }, create: { chiave: CHIAVE_TABELLE, valore }, update: { valore } });
}

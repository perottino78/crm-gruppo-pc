// Ruoli e permessi, zone commerciali: lato server.
import { prisma } from "@/lib/prisma";
import { PROFILI_INIZIALI, TUTTI_PERMESSI, visibilitaDi, type Visibilita } from "./catalogo";
import { ZONE_INIZIALI, provinceDi } from "@/lib/zone/regioni";

/** Alla prima apertura: i profili di partenza e le zone Piemonte, Liguria, Valle d'Aosta, Lombardia. */
export async function assicuraIniziali() {
  if (!(await prisma.profiloAccesso.count())) {
    await prisma.profiloAccesso.createMany({ data: PROFILI_INIZIALI.map((p, i) => ({ ...p, ordine: i })) });
  }
  if (!(await prisma.zonaCommerciale.count())) {
    await prisma.zonaCommerciale.createMany({ data: ZONE_INIZIALI.map((nome, i) => ({ nome, regioni: [nome], ordine: i })) });
  }
}

export const pulisciPermessi = (l: string[]) => TUTTI_PERMESSI.filter((p) => l.includes(p));

/**
 * Ricalcola per ogni utente le province e i colleghi che vede con la visibilità "La sua zona":
 * le zone di cui è responsabile più la sua zona; i colleghi sono quelli assegnati a quelle zone.
 */
export async function ricalcolaVisibilita() {
  const [zone, utenti] = await Promise.all([
    prisma.zonaCommerciale.findMany({ where: { attiva: true } }),
    prisma.utente.findMany({ select: { id: true, ruolo: true, ufficio: true, profiloId: true, visibilita: true, zonaId: true, visibileProvince: true, visibileUtenti: true } }),
  ]);
  for (const u of utenti) {
    let province: string[] = [], colleghi: string[] = [];
    if (visibilitaDi(u) === "ZONA") {
      const mie = zone.filter((z) => z.responsabileId === u.id || z.id === u.zonaId);
      province = provinceDi(mie.flatMap((z) => z.regioni), mie.flatMap((z) => z.provinceExtra));
      const ids = new Set(mie.map((z) => z.id));
      colleghi = utenti.filter((x) => x.id !== u.id && ((x.zonaId && ids.has(x.zonaId)) || mie.some((z) => z.responsabileId === x.id))).map((x) => x.id).sort();
    }
    const uguale = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    if (!uguale(province, [...u.visibileProvince].sort()) || !uguale(colleghi, [...u.visibileUtenti].sort())) {
      await prisma.utente.update({ where: { id: u.id }, data: { visibileProvince: province, visibileUtenti: colleghi } });
    }
  }
}

/** Assegna il profilo a un utente (copia permessi e visibilità); null = torna ai permessi predefiniti del ruolo. */
export async function assegnaProfilo(utenteId: string, profiloId: string | null) {
  const p = profiloId ? await prisma.profiloAccesso.findUnique({ where: { id: profiloId } }) : null;
  await prisma.utente.update({
    where: { id: utenteId },
    data: p ? { profiloId: p.id, permessi: p.permessi, visibilita: p.visibilita } : { profiloId: null, permessi: [], visibilita: null },
  });
}

/** Dopo aver cambiato un profilo: aggiorna tutti quelli che lo hanno. */
export async function propagaProfilo(profiloId: string) {
  const p = await prisma.profiloAccesso.findUnique({ where: { id: profiloId } });
  if (!p) return 0;
  return (await prisma.utente.updateMany({ where: { profiloId }, data: { permessi: p.permessi, visibilita: p.visibilita as Visibilita } })).count;
}

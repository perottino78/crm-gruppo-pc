// Calcoli per la pagina Costi e ricavi (lato server).
import { prisma } from "@/lib/prisma";
import { cent } from "./estratto";
import { lineaDi, ripartisci, type Linea } from "./linee";

export const CATEGORIE_INTERNE = ["Giroconto fra conti", "Prelievo / versamento contanti"];

export type Periodo = { da: Date; a: Date; etichetta: string; preset: string };

const utc = (a: number, m: number, g = 1) => new Date(Date.UTC(a, m, g));

/** Periodo dai parametri: preset (mese, mese-scorso, trimestre, anno, anno-scorso, 12mesi) o da/a personalizzati. */
export function periodoDa(p: { preset?: string; da?: string; a?: string }): Periodo {
  const o = new Date();
  const A = o.getUTCFullYear(), M = o.getUTCMonth();
  const valida = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
  const da = valida(p.da), a = valida(p.a);
  if (da && a && a >= da) {
    return { da, a: new Date(a.getTime() + 86400000), preset: "personalizzato", etichetta: `${da.toLocaleDateString("it-IT", { timeZone: "UTC" })} – ${a.toLocaleDateString("it-IT", { timeZone: "UTC" })}` };
  }
  const mese = (d: Date) => d.toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
  switch (p.preset) {
    case "mese": return { da: utc(A, M), a: utc(A, M + 1), preset: "mese", etichetta: mese(utc(A, M)) };
    case "mese-scorso": return { da: utc(A, M - 1), a: utc(A, M), preset: "mese-scorso", etichetta: mese(utc(A, M - 1)) };
    case "trimestre": { const q = Math.floor(M / 3) * 3; return { da: utc(A, q), a: utc(A, q + 3), preset: "trimestre", etichetta: `${q / 3 + 1}° trimestre ${A}` }; }
    case "anno-scorso": return { da: utc(A - 1, 0), a: utc(A, 0), preset: "anno-scorso", etichetta: `Anno ${A - 1}` };
    case "12mesi": return { da: utc(A, M - 11), a: utc(A, M + 1), preset: "12mesi", etichetta: "Ultimi 12 mesi" };
    default: return { da: utc(A, 0), a: utc(A + 1, 0), preset: "anno", etichetta: `Anno ${A}` };
  }
}

/** Peso lordo di ciascuna linea in ogni commessa (dalle righe del preventivo). */
export async function pesiLineeCommesse(commesse: { id: string; preventivoId: string; brandNome: string }[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (!commesse.length) return out;
  const righe = await prisma.rigaPreventivo.findMany({
    where: { preventivoId: { in: commesse.map((c) => c.preventivoId) } },
    include: { prodotto: { select: { tipologia: true, brandId: true } }, optionali: { select: { prezzoUnitario: true, quantita: true } } },
  });
  const chiavi = [...new Set(righe.filter((r) => r.prodotto).map((r) => `${r.prodotto!.brandId}|${r.prodotto!.tipologia}`))];
  const modelli = chiavi.length
    ? await prisma.modelloProdotto.findMany({
        where: { OR: chiavi.map((k) => ({ brandId: k.split("|")[0], tipologia: k.slice(k.indexOf("|") + 1) })) },
        select: { brandId: true, tipologia: true, famiglia: true, gruppo: true },
      })
    : [];
  const mappaModelli = new Map(modelli.map((m) => [`${m.brandId}|${m.tipologia}`, m]));
  const perPreventivo = new Map(commesse.map((c) => [c.preventivoId, c]));
  for (const r of righe) {
    const c = perPreventivo.get(r.preventivoId);
    if (!c) continue;
    const valore = (r.prezzoUnitario + r.optionalPrezzo) * r.quantita + r.optionali.reduce((t, o) => t + o.prezzoUnitario * o.quantita, 0);
    if (valore <= 0) continue;
    const m = r.prodotto ? mappaModelli.get(`${r.prodotto.brandId}|${r.prodotto.tipologia}`) : undefined;
    const linea = lineaDi(m?.famiglia, m?.gruppo, c.brandNome, r.prodotto?.tipologia);
    const pesi = out.get(c.id) ?? new Map<string, number>();
    pesi.set(linea, (pesi.get(linea) ?? 0) + valore);
    out.set(c.id, pesi);
  }
  // commesse senza righe valorizzate: tutto sulla linea di ripiego del brand
  for (const c of commesse) if (!out.has(c.id)) out.set(c.id, new Map([[lineaDi(null, null, c.brandNome), 1]]));
  return out;
}

export type CostiCommessa = { manodopera: number; materiale: number; altro: number; totale: number; righeSenzaCosto: number };

/** Costi registrati per commessa, con la stessa logica della scheda commessa. */
export async function costiCommesse(ids: string[]): Promise<Map<string, CostiCommessa>> {
  const out = new Map<string, CostiCommessa>();
  if (!ids.length) return out;
  const [fasi, ordini, manuali] = await Promise.all([
    prisma.faseCommessa.findMany({ where: { commessaId: { in: ids }, stato: "CHIUSA", costoTotale: { gt: 0 } }, select: { commessaId: true, costoTotale: true } }),
    prisma.rigaOrdine.findMany({ where: { commessaId: { in: ids } }, select: { commessaId: true, costoEffettivo: true } }),
    prisma.costoManuale.findMany({ where: { commessaId: { in: ids } }, select: { commessaId: true, categoria: true, importo: true } }),
  ]);
  for (const id of ids) {
    const man = manuali.filter((m) => m.commessaId === id);
    // se è registrato il totale acquisti (ACQUISTO_MATERIALE), i costi riga per riga non si sommano (come nella scheda commessa)
    const haTotaleAcquisti = man.some((m) => m.categoria === "ACQUISTO_MATERIALE");
    const ord = haTotaleAcquisti ? [] : ordini.filter((o) => o.commessaId === id);
    const manodopera = cent(fasi.filter((f) => f.commessaId === id).reduce((t, f) => t + f.costoTotale, 0));
    const materiale = cent(ord.reduce((t, o) => t + (o.costoEffettivo ?? 0), 0) + man.filter((m) => m.categoria === "ACQUISTO_MATERIALE").reduce((t, m) => t + m.importo, 0));
    const altro = cent(man.filter((m) => m.categoria !== "ACQUISTO_MATERIALE").reduce((t, m) => t + m.importo, 0));
    out.set(id, { manodopera, materiale, altro, totale: cent(manodopera + materiale + altro), righeSenzaCosto: ord.filter((o) => o.costoEffettivo === null).length });
  }
  return out;
}

export type RigaMargine = {
  id: string; numero: string; cliente: string; brand: string; stato: string; data: Date;
  linea: string; vendita: number; costi: CostiCommessa; margine: number; marginePerc: number | null;
};

export async function analisiCompetenza(periodo: Periodo, brand?: string) {
  const commesse = await prisma.commessa.findMany({
    where: { createdAt: { gte: periodo.da, lt: periodo.a }, stato: { not: "ANNULLATA" }, ...(brand ? { brand: { nome: brand } } : {}) },
    include: { cliente: { select: { nome: true } }, brand: { select: { nome: true } } },
    orderBy: { createdAt: "asc" },
  });
  const pesi = await pesiLineeCommesse(commesse.map((c) => ({ id: c.id, preventivoId: c.preventivoId, brandNome: c.brand.nome })));
  const costi = await costiCommesse(commesse.map((c) => c.id));
  const perLinea = new Map<string, { venduto: number; commesse: number; venditaConCosti: number; costi: number }>();
  const righe: RigaMargine[] = [];
  for (const c of commesse) {
    const p = pesi.get(c.id)!;
    const quote = ripartisci(c.totaleImponibile, p);
    const k = costi.get(c.id)!;
    const principale = [...p.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const [linea, v] of quote) {
      const x = perLinea.get(linea) ?? { venduto: 0, commesse: 0, venditaConCosti: 0, costi: 0 };
      x.venduto = cent(x.venduto + v);
      if (linea === principale) x.commesse++;
      if (k.totale > 0) {
        x.venditaConCosti = cent(x.venditaConCosti + v);
        x.costi = cent(x.costi + (c.totaleImponibile > 0 ? (k.totale * v) / c.totaleImponibile : 0));
      }
      perLinea.set(linea, x);
    }
    const margine = cent(c.totaleImponibile - k.totale);
    righe.push({
      id: c.id, numero: `C${c.anno}-${String(c.numero).padStart(3, "0")}`, cliente: c.cliente.nome, brand: c.brand.nome, stato: c.stato, data: c.createdAt,
      linea: principale, vendita: c.totaleImponibile, costi: k, margine, marginePerc: k.totale > 0 && c.totaleImponibile > 0 ? (margine / c.totaleImponibile) * 100 : null,
    });
  }
  return {
    venduto: cent(commesse.reduce((t, c) => t + c.totaleImponibile, 0)),
    vendutoIvato: cent(commesse.reduce((t, c) => t + c.totaleVendita, 0)),
    numeroCommesse: commesse.length,
    perLinea: [...perLinea.entries()].map(([linea, v]) => ({ linea, ...v, marginePerc: v.venditaConCosti > 0 ? ((v.venditaConCosti - v.costi) / v.venditaConCosti) * 100 : null })).sort((a, b) => b.venduto - a.venduto),
    margini: righe,
  };
}

type Voce = { voce: string; totale: number; dettaglio: { id: string; data: Date; descrizione: string; importo: number; conto: string }[] };

function aggiungi(m: Map<string, Voce>, voce: string, importo: number, mov: { id: string; data: Date; descrizione: string; conto: { nome: string } }) {
  const v = m.get(voce) ?? { voce, totale: 0, dettaglio: [] };
  v.totale = cent(v.totale + importo);
  v.dettaglio.push({ id: mov.id, data: mov.data, descrizione: mov.descrizione, importo: cent(importo), conto: mov.conto.nome });
  m.set(voce, v);
}

async function movimentiAnalisi(da: Date, a: Date) {
  return prisma.movimentoFinanziario.findMany({
    where: { data: { gte: da, lt: a } },
    include: { conto: { select: { nome: true } }, abbinamenti: { include: { scadenza: { select: { commessaId: true, categoria: true, brand: true, controparte: true } } } } },
    orderBy: { data: "asc" },
  });
}
type MovAnalisi = Awaited<ReturnType<typeof movimentiAnalisi>>[number];

const eInterno = (m: MovAnalisi) => m.origine === "STORNO" || !!m.stornatoDaId || CATEGORIE_INTERNE.includes(m.categoria ?? "");
const delBrand = (m: MovAnalisi, brand?: string) => !brand || m.divisione === brand || m.abbinamenti.some((x) => x.scadenza.brand === brand);

/** Bilancino di cassa: incassi per linea/categoria e uscite per categoria, dai movimenti di prima nota. */
export async function analisiCassa(periodo: Periodo, brand?: string) {
  const movimenti = await movimentiAnalisi(periodo.da, periodo.a);
  const idCommesse = [...new Set(movimenti.flatMap((m) => m.abbinamenti.map((x) => x.scadenza.commessaId).filter(Boolean) as string[]))];
  const commesse = idCommesse.length ? await prisma.commessa.findMany({ where: { id: { in: idCommesse } }, select: { id: true, preventivoId: true, brand: { select: { nome: true } } } }) : [];
  const pesi = await pesiLineeCommesse(commesse.map((c) => ({ id: c.id, preventivoId: c.preventivoId, brandNome: c.brand.nome })));
  const ricavi = new Map<string, Voce>(), costi = new Map<string, Voce>();
  let interni = 0, nonAttribuiti = 0;
  for (const m of movimenti) {
    if (eInterno(m)) { interni = cent(interni + Math.abs(m.importo)); continue; }
    if (!delBrand(m, brand)) { if (brand && !m.divisione && !m.abbinamenti.some((x) => x.scadenza.brand)) nonAttribuiti++; continue; }
    const entrata = m.importo > 0;
    const dest = entrata ? ricavi : costi;
    let coperto = 0;
    for (const ab of m.abbinamenti) {
      coperto += ab.importo;
      if (entrata && ab.scadenza.commessaId && pesi.has(ab.scadenza.commessaId)) {
        for (const [linea, q] of ripartisci(ab.importo, pesi.get(ab.scadenza.commessaId)!)) aggiungi(dest, linea, q, m);
      } else {
        aggiungi(dest, ab.scadenza.categoria ?? (entrata ? "Altri incassi" : "Fornitori (con scadenza)"), ab.importo, m);
      }
    }
    const resto = cent(Math.abs(m.importo) - coperto);
    if (resto > 0.004) aggiungi(dest, m.stato === "REGISTRATO" && m.categoria ? m.categoria : "Da classificare", resto, m);
  }
  const ord = (x: Map<string, Voce>) => [...x.values()].sort((a, b) => (a.voce === "Da classificare" ? 1 : b.voce === "Da classificare" ? -1 : b.totale - a.totale));
  const totRicavi = cent([...ricavi.values()].reduce((t, v) => t + v.totale, 0));
  const totCosti = cent([...costi.values()].reduce((t, v) => t + v.totale, 0));
  return { ricavi: ord(ricavi), costi: ord(costi), totRicavi, totCosti, risultato: cent(totRicavi - totCosti), interni, nonAttribuiti };
}

/** Andamento degli ultimi 12 mesi (fino al mese di fine periodo): venduto, entrate e uscite. */
export async function andamentoMensile(periodo: Periodo, brand?: string) {
  const fine = new Date(periodo.a.getTime() - 1);
  const mesi = Array.from({ length: 12 }, (_, i) => utc(fine.getUTCFullYear(), fine.getUTCMonth() - 11 + i));
  const da = mesi[0], a = utc(fine.getUTCFullYear(), fine.getUTCMonth() + 1);
  const [commesse, movimenti] = await Promise.all([
    prisma.commessa.findMany({ where: { createdAt: { gte: da, lt: a }, stato: { not: "ANNULLATA" }, ...(brand ? { brand: { nome: brand } } : {}) }, select: { createdAt: true, totaleImponibile: true } }),
    movimentiAnalisi(da, a),
  ]);
  const chiave = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  return mesi.map((m) => {
    const k = chiave(m);
    const mov = movimenti.filter((x) => chiave(x.data) === k && !eInterno(x) && delBrand(x, brand));
    return {
      mese: m,
      venduto: cent(commesse.filter((c) => chiave(c.createdAt) === k).reduce((t, c) => t + c.totaleImponibile, 0)),
      entrate: cent(mov.filter((x) => x.importo > 0).reduce((t, x) => t + x.importo, 0)),
      uscite: cent(-mov.filter((x) => x.importo < 0).reduce((t, x) => t + x.importo, 0)),
    };
  });
}

export type { Linea };

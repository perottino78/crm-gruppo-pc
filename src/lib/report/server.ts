// Dati della pagina Report (lato server): vendite, acquisti, commesse BConsole, scadenze aperte, banche.
import { prisma } from "@/lib/prisma";
import { saldoConto, residuoScadenza } from "@/lib/amministrazione/server";
import { SIGLE_COMMERCIALI, NOMI_COMMERCIALI } from "@/lib/clienti/bconsole";
import type { Periodo } from "@/lib/amministrazione/analisi";
import { cent, somma, marginiCommesse, marginePer, perMese, anzianita, giorniIncasso, previsioneCassa, bancaDi, type ScadenzaR, type VenditaR } from "./calcoli";

const GIORNO = 86400000;
const marchioDi = (b: string | null) => (!b ? "P&C" : /pura/i.test(b) ? "Purafonte" : /solaris/i.test(b) ? "Solaris" : b);

/** Nome del venditore dalla sigla BConsole (MGI → Massimo Giordano); le sigle sconosciute restano come sono. */
export async function nomiVenditori(): Promise<(sigla: string | null) => string> {
  const utenti = await prisma.utente.findMany({ where: { username: { in: Object.values(SIGLE_COMMERCIALI) } }, select: { username: true, nome: true } });
  const perUser = new Map(utenti.map((u) => [u.username!, u.nome]));
  return (s) => {
    if (!s) return "Senza venditore";
    const u = SIGLE_COMMERCIALI[s.toUpperCase()];
    return u ? perUser.get(u) ?? NOMI_COMMERCIALI[u] ?? s : `${s} (sigla BConsole)`;
  };
}

export async function datiReport(periodo: Periodo, brand?: string) {
  const oggi = new Date();
  const finePeriodo = new Date(Math.min(periodo.a.getTime(), oggi.getTime()));
  const giorniPeriodo = Math.max(1, Math.round((finePeriodo.getTime() - periodo.da.getTime()) / GIORNO));
  const nelPeriodo = { gte: periodo.da, lt: periodo.a };

  const fv = await prisma.fatturaVendita.findMany({
    where: { data: nelPeriodo },
    select: { data: true, imponibile: true, totale: true, venditore: true, progetto: true, categoria: true, brand: true, clienteNome: true, clienteId: true, tipoDocumento: true },
  });
  const vendite = fv.filter((f) => !brand || marchioDi(f.brand) === brand);

  // commesse BConsole toccate dalle vendite del periodo: per il margine servono tutte le loro fatture (anche fuori periodo)
  const numeri = [...new Set(vendite.map((v) => v.progetto).filter((x): x is string => !!x))];
  const [venditeCommesse, acquistiCommesse, progetti] = numeri.length
    ? await Promise.all([
        prisma.fatturaVendita.findMany({ where: { progetto: { in: numeri } }, select: { data: true, imponibile: true, venditore: true, progetto: true, categoria: true, brand: true, clienteNome: true } }),
        prisma.fatturaAcquisto.findMany({ where: { progetto: { in: numeri }, tipoDocumento: { not: "PROFORMA" } }, select: { data: true, imponibile: true, fornitoreNome: true, progetto: true } }),
        prisma.progettoBC.findMany({ where: { numero: { in: numeri } } }),
      ])
    : [[], [], []];
  const margini = marginiCommesse(venditeCommesse, acquistiCommesse, progetti);

  // acquisti del periodo (le proforma no: le sostituisce la fattura). Con un marchio scelto: solo quelli delle sue commesse.
  const faTutte = await prisma.fatturaAcquisto.findMany({
    where: { data: nelPeriodo, tipoDocumento: { not: "PROFORMA" }, stato: { not: "SOSTITUITA" } },
    select: { data: true, imponibile: true, fornitoreNome: true, progetto: true },
  });
  const acquisti = brand ? faTutte.filter((a) => a.progetto && numeri.includes(a.progetto)) : faTutte;

  // scadenze aperte → crediti, debiti, cassa prevista
  const sc = await prisma.scadenza.findMany({
    where: { stato: { in: ["APERTA", "PARZIALE"] }, ...(brand ? { brand } : {}) },
    select: { tipo: true, importo: true, pagatoManuale: true, ritenuta: true, dataScadenza: true, controparte: true, abbinamenti: { select: { importo: true } } },
  });
  const scadenze: ScadenzaR[] = sc.map((s) => ({ tipo: s.tipo as "INCASSO" | "PAGAMENTO", residuo: residuoScadenza(s), dataScadenza: s.dataScadenza, controparte: s.controparte })).filter((s) => s.residuo > 0.004);
  const incassi = scadenze.filter((s) => s.tipo === "INCASSO"), pagamenti = scadenze.filter((s) => s.tipo === "PAGAMENTO");
  const crediti = cent(incassi.reduce((t, s) => t + s.residuo, 0));
  const scaduto = cent(incassi.filter((s) => s.dataScadenza && s.dataScadenza < oggi).reduce((t, s) => t + s.residuo, 0));
  const debiti = cent(pagamenti.reduce((t, s) => t + s.residuo, 0));
  const debitiScaduti = cent(pagamenti.filter((s) => s.dataScadenza && s.dataScadenza < oggi).reduce((t, s) => t + s.residuo, 0));

  const conti = await prisma.contoFinanziario.findMany({ where: { attivo: true }, orderBy: { ordine: "asc" } });
  const saldi = await Promise.all(conti.map(async (c) => ({ nome: c.nome, banca: c.banca, tipo: c.tipo, saldo: await saldoConto(c.id) })));
  const saldoOggi = cent(saldi.reduce((t, c) => t + c.saldo, 0));

  // quanto costano le banche: fatture delle banche (interessi, commissioni, anticipi) e commissioni sui conti
  const movBanca = await prisma.movimentoFinanziario.findMany({
    where: { data: nelPeriodo, importo: { lt: 0 }, categoria: { in: ["Commissioni e spese bancarie", "Costi e commissioni per cessioni"] } },
    select: { importo: true, conto: { select: { nome: true, banca: true } } },
  });
  const costiBanca = new Map<string, { fatture: number; commissioni: number }>();
  for (const a of faTutte) {
    const b = bancaDi(a.fornitoreNome);
    if (!b) continue;
    const x = costiBanca.get(b) ?? { fatture: 0, commissioni: 0 };
    x.fatture += a.imponibile; costiBanca.set(b, x);
  }
  for (const m of movBanca) {
    const b = bancaDi(m.conto.banca) ?? bancaDi(m.conto.nome) ?? m.conto.nome;
    const x = costiBanca.get(b) ?? { fatture: 0, commissioni: 0 };
    x.commissioni += -m.importo; costiBanca.set(b, x);
  }
  const banche = [...costiBanca.entries()].map(([banca, x]) => ({ banca, fatture: cent(x.fatture), commissioni: cent(x.commissioni), totale: cent(x.fatture + x.commissioni) })).sort((a, b) => b.totale - a.totale);

  // da dove arrivano i clienti che comprano (provenienza marketing)
  const idClienti = [...new Set(vendite.map((v) => v.clienteId).filter((x): x is string => !!x))];
  const origini = new Map((idClienti.length ? await prisma.cliente.findMany({ where: { id: { in: idClienti } }, select: { id: true, origine: true } }) : []).map((c) => [c.id, c.origine]));

  const nome = await nomiVenditori();
  const ricavi = cent(vendite.reduce((t, v) => t + v.imponibile, 0));
  const costi = cent(acquisti.reduce((t, a) => t + a.imponibile, 0));
  const fatturatoIvato = cent(vendite.reduce((t, v) => t + v.totale, 0));
  const valutabili = margini.filter((m) => m.valutabile);
  const ricValut = valutabili.reduce((t, m) => t + m.ricavo, 0);
  const margValut = valutabili.reduce((t, m) => t + m.margine, 0);
  const vr = vendite as VenditaR[];

  return {
    oggi, giorniPeriodo,
    kpi: {
      ricavi, costi, fatturatoIvato, nFatture: vendite.length, crediti, scaduto, debiti, debitiScaduti, saldoOggi,
      dso: giorniIncasso(crediti, fatturatoIvato, giorniPeriodo),
      margineCommesse: ricValut ? margValut / ricValut : null, commesseValutabili: valutabili.length, commesse: margini.length,
      clienti: new Set(vendite.map((v) => v.clienteId ?? v.clienteNome)).size,
      ticketMedio: vendite.filter((v) => v.imponibile > 0).length ? ricavi / vendite.filter((v) => v.imponibile > 0).length : 0,
    },
    mesi: perMese(vendite, acquisti, periodo.da, periodo.a),
    perVenditore: somma(vr, (v) => nome(v.venditore), (v) => v.imponibile),
    marginiVenditore: marginePer(margini, (m) => nome(m.venditore)),
    perCategoria: somma(vr, (v) => v.categoria ?? "Altro", (v) => v.imponibile),
    marginiCategoria: marginePer(margini, (m) => m.categoria),
    perMarchio: somma(vr, (v) => marchioDi(v.brand), (v) => v.imponibile),
    perOrigine: somma(vendite, (v) => (v.clienteId ? origini.get(v.clienteId) : null) || "Non indicata", (v) => v.imponibile),
    clienti: somma(vr, (v) => v.clienteNome, (v) => v.imponibile),
    fornitori: somma(acquisti, (a) => a.fornitoreNome, (a) => a.imponibile),
    margini: margini.map((m) => ({ ...m, venditoreNome: nome(m.venditore) })),
    anzianitaCrediti: anzianita(incassi, oggi),
    anzianitaDebiti: anzianita(pagamenti, oggi),
    debitori: somma(incassi.filter((s) => s.dataScadenza && s.dataScadenza < oggi), (s) => s.controparte, (s) => s.residuo),
    cassa: previsioneCassa(saldoOggi, scadenze, oggi, 13),
    scadenzeCassa: scadenze.map((s) => ({ t: s.tipo === "INCASSO" ? "I" : "P", r: s.residuo, d: s.dataScadenza?.toISOString() ?? null })),
    saldi, banche,
  };
}
export type DatiReport = Awaited<ReturnType<typeof datiReport>>;

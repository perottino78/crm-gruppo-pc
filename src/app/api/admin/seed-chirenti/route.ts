import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FORNITORE_CHIRENTI, PREFISSO_CHIRENTI, RICARICO_CHIRENTI, SISTEMI_CHIRENTI, descrizioneChirenti, eChirenti, optionalChirenti, partiChirenti, prodottiChirenti } from "@/lib/listini/chirenti";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const kP = (p: Riga) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;
const kO = (o: { categoria: string; nome: string }, gruppo: string) => `${gruppo}|${o.categoria}|${o.nome}`;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/s\.?\s*r\.?\s*l\.?/g, "srl").replace(/[^a-z0-9]/g, "");

/**
 * Vetrate Chirenti Book Pro Cam / Solco Pro Cam (VETRATE › Book Pro Cam, Solco Pro Cam): tariffa al m² temperato/stratificato,
 * optional, modelli con foto e il fornitore CHIRENTI SRL (per P.IVA o nome; si completano solo i campi vuoti).
 * GET = prova, POST = carica (rilanciabile).
 */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) return { error: "brand P&C non trovato" };
  const righe = prodottiChirenti();
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, optCreati: 0, optAggiornati: 0, optRimossi: 0, fornitore: "", campiFornitoreCompletati: [] as string[] };

  // fornitore: per P.IVA o nome, creato se manca, completati solo i campi vuoti (mai sopra a ciò che è stato scritto a mano)
  const fornitori = await prisma.soggetto.findMany({ where: { OR: [{ partitaIva: FORNITORE_CHIRENTI.partitaIva }, { ruoli: { has: "FORNITORE" } }] } });
  let fornitore = fornitori.find((f) => f.partitaIva === FORNITORE_CHIRENTI.partitaIva) ?? fornitori.find((f) => norm(f.ragioneSociale) === norm(FORNITORE_CHIRENTI.ragioneSociale)) ?? null;
  if (!fornitore) {
    st.fornitore = "creato";
    if (!prova) fornitore = await prisma.soggetto.create({ data: { ...FORNITORE_CHIRENTI, ruoli: ["FORNITORE"] } });
  } else {
    st.fornitore = "già presente";
    const mancanti = Object.fromEntries(Object.entries(FORNITORE_CHIRENTI).filter(([k]) => {
      const v = (fornitore as Record<string, unknown>)[k];
      return v === null || v === undefined || v === "";
    }));
    st.campiFornitoreCompletati = Object.keys(mancanti);
    const ruoli = fornitore.ruoli.includes("FORNITORE") ? fornitore.ruoli : [...fornitore.ruoli, "FORNITORE"];
    if (!prova && (Object.keys(mancanti).length || ruoli !== fornitore.ruoli)) await prisma.soggetto.update({ where: { id: fornitore.id }, data: { ...mancanti, ruoli } });
  }

  // tariffe al m² (startsWith «VETRATA_» comprende anche Scintilla/Brillante/Fisso: si filtrano le sole tipologie Chirenti in JS)
  const esistenti = (await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_CHIRENTI } } })).filter((p) => eChirenti(p.tipologia));
  const mappa = new Map(esistenti.map((p) => [kP(p), p]));
  for (const p of righe) {
    const e = mappa.get(kP(p));
    if (!e) {
      st.prodottiCreati++;
      if (!prova) await prisma.prodotto.create({ data: { brandId: brand.id, ...p, coefficienteRicarico: 1 } });
    } else if (e.prezzoBase !== p.prezzoBase || e.coefficienteRicarico !== 1) {
      st.prodottiAggiornati++;
      if (!prova) await prisma.prodotto.update({ where: { id: e.id }, data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 } });
    }
  }

  // modelli: gruppo del sistema (in tendina VETRATE › …), foto, descrizione, fornitore e costo d'acquisto (vendita ÷ ricarico)
  if (!prova) {
    for (const tipologia of [...new Set(righe.map((r) => r.tipologia))]) {
      const s = SISTEMI_CHIRENTI[partiChirenti(tipologia)!.sistema];
      const dati = { descrizioneTecnica: descrizioneChirenti(tipologia) ?? "", famiglia: "OUTDOOR", gruppo: s.gruppo, immagineUrl: s.foto, modalitaCalcolo: "MQ_CON_MINIMI", parametriCalcolo: { arrotondamentoCm: 5 } };
      const acquisto = { fornitoreId: fornitore!.id, codiceFornitore: `${s.nome.toUpperCase()} ${partiChirenti(tipologia)!.vetro === "TEMP" ? "CAMERA TEMP" : "CAMERA STRAT"}`, scontoAcquisto: Math.round((1 - 1 / RICARICO_CHIRENTI) * 100) };
      const e = await prisma.modelloProdotto.findUnique({ where: { brandId_tipologia: { brandId: brand.id, tipologia } } });
      if (!e) await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia, ...dati, ...acquisto } });
      else await prisma.modelloProdotto.update({
        where: { id: e.id },
        data: { ...dati, ...(e.fornitoreId ? {} : { fornitoreId: acquisto.fornitoreId }), ...(e.codiceFornitore ? {} : { codiceFornitore: acquisto.codiceFornitore }), ...(e.scontoAcquisto != null ? {} : { scontoAcquisto: acquisto.scontoAcquisto }) },
      });
    }
  }

  // optional per gruppo (listino vuoto, gruppiApplicabili = gruppo del sistema, come Scintilla)
  const opt = optionalChirenti();
  const gruppi = Object.values(SISTEMI_CHIRENTI).map((s) => s.gruppo);
  const optEsistenti = (await prisma.optional.findMany({ where: { brandId: brand.id, listino: null, gruppiApplicabili: { hasSome: gruppi } } })).filter((o) => o.gruppiApplicabili.length === 1 && gruppi.includes(o.gruppiApplicabili[0]));
  const mappaO = new Map(optEsistenti.map((o) => [kO(o, o.gruppiApplicabili[0]), o]));
  for (const o of opt) {
    const e = mappaO.get(kO(o, o.gruppo));
    if (!e) {
      st.optCreati++;
      if (!prova) await prisma.optional.create({ data: { brandId: brand.id, categoria: o.categoria, nome: o.nome, tipoPrezzo: o.tipoPrezzo, valore: o.valore, unita: o.unita, listino: null, gruppiApplicabili: [o.gruppo] } });
    } else if (e.valore !== o.valore || e.tipoPrezzo !== o.tipoPrezzo || e.unita !== o.unita) {
      st.optAggiornati++;
      if (!prova) await prisma.optional.update({ where: { id: e.id }, data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo, unita: o.unita } });
    }
  }
  const chiaviO = new Set(opt.map((o) => kO(o, o.gruppo)));
  for (const v of optEsistenti.filter((o) => !chiaviO.has(kO(o, o.gruppiApplicabili[0])))) {
    st.optRimossi++;
    if (prova) continue;
    const usata = await prisma.rigaOptional.count({ where: { optionalId: v.id } });
    if (usata) await prisma.optional.update({ where: { id: v.id }, data: { attivo: false } });
    else await prisma.optional.delete({ where: { id: v.id } });
  }
  return { ok: true, prova, tariffe: righe.map((r) => `${r.tipologia}: ${r.prezzoBase} €/m²`), optional: opt.length, ...st };
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await esegui(true));
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await esegui(false));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CATALOGO_STEALTH } from "@/lib/solaris/stealth";
import {
  VOCI_SOLARIS_BC, PREFISSO_SOLARIS_BC, FAMIGLIA_SOLARIS, posizioneSolarisBC, varianteSolarisBC, scontoAcquistoBC,
  descrizioneSolarisBC, inProvvigioneSolarisBC, nomePulito, PREZZI_STEALTH_BC, PANNELLI_STUDIO_BC,
} from "@/lib/listini/solaris-bconsole";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
// Postgres (jsonb) riordina le chiavi: per confrontare si ordinano ovunque
const canonico = (v: unknown): string => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Listino Solaris da BConsole (fotovoltaico, pompe di calore AMG) + prezzi Stealth in Solaris Studio. GET = prova, POST = carica.
 * Rilanciabile e senza doppioni: crea solo i modelli/prezzi che mancano; i prezzi già presenti non si toccano (possono essere stati
 * aumentati), del modello si completano solo i campi vuoti (foto, descrizione, fornitore, codice, sconto).
 */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "Solaris" }, select: { id: true } });
  if (!brand) return { error: "marchio Solaris non trovato" };
  const st = { voci: VOCI_SOLARIS_BC.length, prezziCreati: 0, prezziGiaPresenti: 0, modelliCreati: 0, modelliCompletati: 0, fornitoriAbbinati: 0, studioAggiornati: 0, studioGiaConPrezzo: 0, pannelliStudioCreati: 0, schedeStealthAggiornate: 0, pannelliStudioAggiornati: 0 };

  const fornitori = await prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, select: { id: true, ragioneSociale: true } });
  const fornitoreDi = (nome: string) => {
    const n = norm(nome);
    return n ? fornitori.find((f) => norm(f.ragioneSociale) === n || (n.length >= 6 && norm(f.ragioneSociale).startsWith(n.slice(0, 12)))) ?? null : null;
  };

  const esistenti = await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_SOLARIS_BC } }, select: { tipologia: true } });
  const conPrezzo = new Set(esistenti.filter((p) => p.tipologia.startsWith(PREFISSO_SOLARIS_BC)).map((p) => p.tipologia));
  const modelli = new Map((await prisma.modelloProdotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_SOLARIS_BC } } })).map((m) => [m.tipologia, m]));

  for (const v of VOCI_SOLARIS_BC) {
    const pos = posizioneSolarisBC(v.tipologia);
    if (!pos) continue;
    if (conPrezzo.has(v.tipologia)) st.prezziGiaPresenti++;
    else {
      st.prezziCreati++;
      if (!prova) await prisma.prodotto.create({ data: { brandId: brand.id, tipologia: v.tipologia, colore: varianteSolarisBC(v.um), altezzaMm: 0, larghezzaMm: 0, prezzoBase: v.vendita, coefficienteRicarico: 1, descrizione: nomePulito(v.nome) } });
    }
    const f = fornitoreDi(v.fornitore);
    if (f) st.fornitoriAbbinati++;
    const pieno = {
      immagineUrl: v.immagine, descrizioneTecnica: descrizioneSolarisBC(v), famiglia: FAMIGLIA_SOLARIS, gruppo: pos.gruppo,
      fornitoreId: f?.id ?? null, codiceFornitore: v.codiceFornitore || v.codice, scontoAcquisto: scontoAcquistoBC(v),
    };
    const m = modelli.get(v.tipologia);
    if (!m) {
      st.modelliCreati++;
      if (!prova) await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia: v.tipologia, modalitaCalcolo: "GRIGLIA", inProvvigione: inProvvigioneSolarisBC(v), ...pieno } });
    } else {
      // solo i campi vuoti: quanto cambiato a mano nella scheda del modello resta
      const dati = Object.fromEntries(Object.entries(pieno).filter(([k, val]) => val != null && (m as Record<string, unknown>)[k] == null));
      if (Object.keys(dati).length) {
        st.modelliCompletati++;
        if (!prova) await prisma.modelloProdotto.update({ where: { id: m.id }, data: dati });
      }
    }
  }

  // Solaris Studio: prezzi Stealth solo dove sono ancora a 0
  const studio = await prisma.solarisComponente.findMany({ where: { nome: { in: Object.keys(PREZZI_STEALTH_BC) } }, select: { id: true, nome: true, prezzoVendita: true, costoAcquisto: true } });
  for (const c of studio) {
    const p = PREZZI_STEALTH_BC[c.nome];
    if (c.prezzoVendita > 0) { st.studioGiaConPrezzo++; continue; }
    st.studioAggiornati++;
    if (!prova) await prisma.solarisComponente.update({ where: { id: c.id }, data: { prezzoVendita: p.vendita, ...(c.costoAcquisto > 0 || !p.costo ? {} : { costoAcquisto: p.costo }) } });
  }
  // schede tecniche Stealth dello Studio: dati ufficiali del produttore (misure, pesi, tensioni, garanzia); i prezzi non si toccano
  const stealthDb = await prisma.solarisComponente.findMany({ where: { nome: { in: CATALOGO_STEALTH.map((c) => c.nome) } }, select: { id: true, nome: true, misureJson: true } });
  for (const c of CATALOGO_STEALTH) {
    const r = stealthDb.find((x) => x.nome === c.nome);
    if (!r || canonico(r.misureJson) === canonico(c.misureJson)) continue;
    st.schedeStealthAggiornate++;
    if (!prova) await prisma.solarisComponente.update({ where: { id: r.id }, data: { misureJson: c.misureJson as object, note: c.note } });
  }

  // pannelli VDS di BConsole nel catalogo di Solaris Studio (per nome): creati se mancano, misure e scheda aggiornate (mai i prezzi)
  const pannelliDb = await prisma.solarisComponente.findMany({ where: { categoria: "PANNELLO" }, select: { id: true, nome: true, misureJson: true } });
  for (const p of PANNELLI_STUDIO_BC) {
    const misure = { w: p.w, h: p.h, spessoreMm: p.spessoreMm, specs: p.specs };
    const note = `Da BConsole (${p.codice}).${p.daConfermare ? " Misure e peso della famiglia VDS-S144/M6H (scheda 430–450 W): il 460 W Total Black non è citato, da confermare." : ""}`;
    const r = pannelliDb.find((x) => x.nome === p.nome);
    if (!r) {
      st.pannelliStudioCreati++;
      if (!prova) await prisma.solarisComponente.create({ data: { brandId: brand.id, categoria: "PANNELLO", nome: p.nome, potenzaW: p.potenzaW, prezzoVendita: p.vendita, costoAcquisto: p.costo, misureJson: misure, note } });
    } else if (canonico(r.misureJson) !== canonico(misure)) {
      st.pannelliStudioAggiornati++;
      if (!prova) await prisma.solarisComponente.update({ where: { id: r.id }, data: { misureJson: misure, note } });
    }
  }
  return { ok: true, prova, ...st };
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

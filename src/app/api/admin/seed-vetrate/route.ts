import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/nubes_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/nubes_modelli.json";
import optionaliData from "../../../../../prisma/seed-data/nubes_optional.json";

export const dynamic = "force-dynamic";
// ~2.400 prezzi Nubes Mob: creati in blocco (createMany), ma l'eventuale aggiornamento
// prezzo per prezzo puo' richiedere piu' dei 10s di default.
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

type ProdottoRow = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number };
type ModelloRow = {
  tipologia: string;
  immagineUrl: string | null;
  descrizioneTecnica: string;
  famiglia: string;
  gruppo: string;
};
type OptionalRow = {
  categoria: string;
  nome: string;
  tipoPrezzo: string;
  valore: number;
  unita: string | null;
  sporgenzaMm: number | null;
  larghezzaMm: number | null;
  listino: string | null;
  note: string | null;
  gruppiApplicabili: string[];
};

const TIPOLOGIE_PREFIXES = ["NUBES_", "NESOS_", "ERMES_"];
// Listino Nubes Mob 2025 (copertura mobile 50/66/75/80%): prezzi gia' di vendita
// (struttura = listino -50% x 3,3; motorizzazione = listino x 2), vedi nubes_prodotti.json.
const PREFISSO_MOB = "NUBES_MOB_";
// Vecchio segnaposto "prezzo su richiesta" sostituito dal listino reale.
const SEGNAPOSTO_MOB = "NUBES_MOB";
const LISTINO_OPTIONAL_MOB = "NUBES_MOB";

const keyProdotto = (p: { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number }) =>
  `${p.tipologia}|${p.colore}|${p.altezzaMm}|${p.larghezzaMm}`;
const keyOptional = (o: { categoria: string; nome: string; listino: string | null }) => `${o.categoria}|${o.nome}|${o.listino ?? ""}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({
      where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
    });
    const mappaProdotti = new Map(prodottiEsistenti.map((p) => [keyProdotto(p), p]));

    const daCreare: ProdottoRow[] = [];
    let prodottiAggiornati = 0;
    let prodottiInvariati = 0;
    for (const p of prodottiNuovi) {
      const esistente = mappaProdotti.get(keyProdotto(p));
      if (!esistente) {
        daCreare.push(p);
      } else if (esistente.prezzoBase !== p.prezzoBase || esistente.coefficienteRicarico !== 1) {
        await prisma.prodotto.update({
          where: { id: esistente.id },
          data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 },
        });
        prodottiAggiornati++;
      } else {
        prodottiInvariati++;
      }
    }
    if (daCreare.length > 0) {
      await prisma.prodotto.createMany({
        data: daCreare.map((p) => ({
          brandId: brand.id,
          tipologia: p.tipologia,
          colore: p.colore,
          altezzaMm: p.altezzaMm,
          larghezzaMm: p.larghezzaMm,
          prezzoBase: p.prezzoBase,
          coefficienteRicarico: 1,
        })),
        skipDuplicates: true,
      });
    }

    // Rimozione SOLO per Nubes Mob (segnaposto "prezzo su richiesta" + eventuali fasce
    // NUBES_MOB_* non piu' a listino). Fix/TT/Nesos/Ermes non vengono mai toccati.
    // Una riga gia' usata in un preventivo non si cancella mai (resta come storico).
    const chiaviNuove = new Set(prodottiNuovi.map(keyProdotto));
    const candidatiRimozione = prodottiEsistenti.filter(
      (p) => (p.tipologia === SEGNAPOSTO_MOB || p.tipologia.startsWith(PREFISSO_MOB)) && !chiaviNuove.has(keyProdotto(p))
    );
    let prodottiRimossi = 0;
    let prodottiConservatiPercheUsati = 0;
    if (candidatiRimozione.length > 0) {
      const usati = await prisma.rigaPreventivo.findMany({
        where: { prodottoId: { in: candidatiRimozione.map((p) => p.id) } },
        select: { prodottoId: true },
      });
      const idUsati = new Set(usati.map((u) => u.prodottoId));
      const daRimuovere = candidatiRimozione.filter((p) => !idUsati.has(p.id));
      prodottiConservatiPercheUsati = candidatiRimozione.length - daRimuovere.length;
      if (daRimuovere.length > 0) {
        const r = await prisma.prodotto.deleteMany({ where: { id: { in: daRimuovere.map((p) => p.id) } } });
        prodottiRimossi = r.count;
      }
    }

    const modelli = modelliData as ModelloRow[];
    for (const m of modelli) {
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } },
        create: {
          brandId: brand.id,
          tipologia: m.tipologia,
          immagineUrl: m.immagineUrl,
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
        },
        update: {
          immagineUrl: m.immagineUrl,
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
        },
      });
    }

    // Accessori Nubes Mob (listino x 2), legati al solo listino NUBES_MOB.
    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, listino: LISTINO_OPTIONAL_MOB },
    });
    const mappaOptional = new Map(optionaliEsistenti.map((o) => [keyOptional(o), o]));
    let optCreati = 0;
    let optAggiornati = 0;
    let optInvariati = 0;
    for (const o of optionaliNuovi) {
      const esistente = mappaOptional.get(keyOptional(o));
      if (!esistente) {
        await prisma.optional.create({
          data: {
            brandId: brand.id,
            categoria: o.categoria,
            nome: o.nome,
            tipoPrezzo: o.tipoPrezzo,
            valore: o.valore,
            unita: o.unita,
            sporgenzaMm: o.sporgenzaMm,
            larghezzaMm: o.larghezzaMm,
            listino: o.listino,
            note: o.note,
            gruppiApplicabili: o.gruppiApplicabili,
          },
        });
        optCreati++;
      } else if (
        esistente.valore !== o.valore ||
        esistente.tipoPrezzo !== o.tipoPrezzo ||
        esistente.unita !== o.unita ||
        esistente.note !== o.note ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        await prisma.optional.update({
          where: { id: esistente.id },
          data: {
            tipoPrezzo: o.tipoPrezzo,
            valore: o.valore,
            unita: o.unita,
            note: o.note,
            gruppiApplicabili: o.gruppiApplicabili,
          },
        });
        optAggiornati++;
      } else {
        optInvariati++;
      }
    }
    // Optional NUBES_MOB non piu' a listino: rimossi solo se mai usati in un preventivo.
    const chiaviOpt = new Set(optionaliNuovi.map(keyOptional));
    const optObsoleti = optionaliEsistenti.filter((o) => !chiaviOpt.has(keyOptional(o)));
    let optRimossi = 0;
    if (optObsoleti.length > 0) {
      const usati = await prisma.rigaOptional.findMany({
        where: { optionalId: { in: optObsoleti.map((o) => o.id) } },
        select: { optionalId: true },
      });
      const idUsati = new Set(usati.map((u) => u.optionalId));
      const r = await prisma.optional.deleteMany({
        where: { id: { in: optObsoleti.filter((o) => !idUsati.has(o.id)).map((o) => o.id) } },
      });
      optRimossi = r.count;
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati: daCreare.length,
      prodottiAggiornati,
      prodottiInvariati,
      prodottiRimossi,
      prodottiConservatiPercheUsati,
      modelliAggiornati: modelli.length,
      optCreati,
      optAggiornati,
      optInvariati,
      optRimossi,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const prodottiCount = await prisma.prodotto.count({
    where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
  });
  const prodottiMobCount = await prisma.prodotto.count({
    where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_MOB } },
  });
  const modelliCount = await prisma.modelloProdotto.count({
    where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
  });
  const optionalMobCount = await prisma.optional.count({ where: { brandId: brand.id, listino: LISTINO_OPTIONAL_MOB } });

  return NextResponse.json({ ok: true, dryRun: true, prodottiCount, prodottiMobCount, modelliCount, optionalMobCount });
}

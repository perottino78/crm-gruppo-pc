import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/nuvola_prodotti.json";
import optionaliData from "../../../../../prisma/seed-data/nuvola_optionals.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const PREFISSO = "NUVOLA_";
const LISTINO_FAMIGLIA = "NUVOLA";

type ProdottoRow = {
  tipologia: string;
  colore: string;
  altezzaMm: number;
  larghezzaMm: number;
  prezzoBase: number;
};

type OptionalRow = {
  categoria: string;
  nome: string;
  tipoPrezzo: string;
  valore: number;
  unita: string | null;
  sporgenzaMm: number | null;
  larghezzaMm: number | null;
  note: string | null;
  listino: string;
  gruppiApplicabili: string[];
};

const keyProdotto = (p: { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number }) =>
  `${p.tipologia}|${p.colore}|${p.altezzaMm}|${p.larghezzaMm}`;

// Chiave stabile basata su campi che non cambiano con questa migrazione (non include il listino,
// che stiamo affinando da "bucket di famiglia" a "tipologia esatta per submodello").
const keyOptional = (o: { categoria: string; nome: string; sporgenzaMm: number | null; larghezzaMm: number | null }) =>
  `${o.categoria}|${o.nome}|${o.sporgenzaMm}|${o.larghezzaMm}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
    if (!brand) {
      return NextResponse.json({ error: "brand P&C non trovato, esegui prima il seed principale" }, { status: 400 });
    }

    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({
      where: { brandId: brand.id, tipologia: { startsWith: PREFISSO } },
    });
    const mappaProdotti = new Map(prodottiEsistenti.map((p) => [keyProdotto(p), p]));

    const daCreare: ProdottoRow[] = [];
    let prodottiAggiornati = 0;
    for (const p of prodottiNuovi) {
      const esistente = mappaProdotti.get(keyProdotto(p));
      if (!esistente) {
        daCreare.push(p);
      } else {
        if (esistente.prezzoBase !== p.prezzoBase || esistente.coefficienteRicarico !== 1) {
          await prisma.prodotto.update({
            where: { id: esistente.id },
            data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 },
          });
          prodottiAggiornati++;
        }
        mappaProdotti.delete(keyProdotto(p));
      }
    }

    let prodottiCreati = 0;
    for (let i = 0; i < daCreare.length; i += 500) {
      const chunk = daCreare.slice(i, i + 500).map((p) => ({
        brandId: brand.id,
        tipologia: p.tipologia,
        colore: p.colore,
        altezzaMm: p.altezzaMm,
        larghezzaMm: p.larghezzaMm,
        prezzoBase: p.prezzoBase,
        coefficienteRicarico: 1,
      }));
      const res = await prisma.prodotto.createMany({ data: chunk });
      prodottiCreati += res.count;
    }

    // Optional: match sui campi stabili (categoria/nome/sporgenza/larghezza), NON sul listino
    // — che qui stiamo affinando da bucket unico di famiglia a tipologia esatta per submodello,
    // cosi' le righe esistenti (create dalla vecchia route con listino di famiglia) vengono
    // aggiornate in-place invece di essere duplicate.
    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, OR: [{ listino: LISTINO_FAMIGLIA }, { listino: { startsWith: PREFISSO } }] },
    });
    const mappaOptional = new Map(optionaliEsistenti.map((o) => [keyOptional(o), o]));

    const optDaCreare: OptionalRow[] = [];
    let optionaliAggiornati = 0;
    for (const o of optionaliNuovi) {
      const esistente = mappaOptional.get(keyOptional(o));
      if (!esistente) {
        optDaCreare.push(o);
      } else {
        if (
          esistente.valore !== o.valore ||
          esistente.note !== o.note ||
          esistente.unita !== o.unita ||
          esistente.listino !== o.listino ||
          JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
        ) {
          await prisma.optional.update({
            where: { id: esistente.id },
            data: {
              valore: o.valore,
              unita: o.unita,
              note: o.note,
              tipoPrezzo: o.tipoPrezzo,
              listino: o.listino,
              gruppiApplicabili: o.gruppiApplicabili,
            },
          });
          optionaliAggiornati++;
        }
        mappaOptional.delete(keyOptional(o));
      }
    }

    let optionaliCreati = 0;
    for (let i = 0; i < optDaCreare.length; i += 500) {
      const chunk = optDaCreare.slice(i, i + 500).map((o) => ({
        brandId: brand.id,
        categoria: o.categoria,
        nome: o.nome,
        tipoPrezzo: o.tipoPrezzo,
        valore: o.valore,
        unita: o.unita,
        sporgenzaMm: o.sporgenzaMm,
        larghezzaMm: o.larghezzaMm,
        note: o.note,
        listino: o.listino,
        gruppiApplicabili: o.gruppiApplicabili,
      }));
      const res = await prisma.optional.createMany({ data: chunk });
      optionaliCreati += res.count;
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati,
      prodottiAggiornati,
      prodottiInvariati: prodottiNuovi.length - daCreare.length - prodottiAggiornati,
      optionaliCreati,
      optionaliAggiornati,
      optionaliInvariati: optionaliNuovi.length - optDaCreare.length - optionaliAggiornati,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

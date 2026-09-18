import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/tendacaduta_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/tendacaduta_modelli.json";
import optionaliData from "../../../../../prisma/seed-data/tendacaduta_optional.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

type ProdottoRow = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number };
type ModelloRow = { tipologia: string; descrizioneTecnica: string; famiglia: string; gruppo: string; immagineUrl?: string | null };
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

// Tipologie della Sezione 4 (2026) gestite da questa route: match esatto, mai
// prefix/startsWith (Prisma compila startsWith in LIKE 'prefix%' dove "_" e'
// wildcard SQL per un singolo carattere - vedi bug gia' corretto altrove).
// Include le 16 nuove sotto-tipologie 3000/3000 con guide/3000 cavetto/T4 e le
// 54 combinazioni Ombra Box Inox (6 size/comando x 9 tessuti tecnici). Tutto il
// resto del catalogo Tende a caduta (5000S/7000T/7000E/Orizzonte/EvoZip*) NON
// e' toccato da questa route.
const TIPOLOGIE_GESTITE = [
  "TENDACADUTA_3000CAVETTO_ROUND_CAVETTO4",
  "TENDACADUTA_3000CAVETTO_ROUND_TONDINO6",
  "TENDACADUTA_3000CAVETTO_SENZACASS",
  "TENDACADUTA_3000CAVETTO_SQUARE_CAVETTO4",
  "TENDACADUTA_3000CAVETTO_SQUARE_TONDINO6",
  "TENDACADUTA_3000GUIDE_ROUND",
  "TENDACADUTA_3000GUIDE_SENZACASS",
  "TENDACADUTA_3000GUIDE_SQUARE",
  "TENDACADUTA_3000_ROUND",
  "TENDACADUTA_3000_ROUND_BRACCI",
  "TENDACADUTA_3000_SENZACASS",
  "TENDACADUTA_3000_SENZACASS_BRACCI",
  "TENDACADUTA_3000_SQUARE",
  "TENDACADUTA_3000_SQUARE_BRACCI",
  "TENDACADUTA_OMBRABOXINOX_100A_OPATEXFLAT",
  "TENDACADUTA_OMBRABOXINOX_100A_OPATEXPROZIPDECO",
  "TENDACADUTA_OMBRABOXINOX_100A_SCREEN5500",
  "TENDACADUTA_OMBRABOXINOX_100A_SCREENOSCURANTE",
  "TENDACADUTA_OMBRABOXINOX_100A_SOLTIS88VEOZIP",
  "TENDACADUTA_OMBRABOXINOX_100A_SOLTIS92",
  "TENDACADUTA_OMBRABOXINOX_100A_SOLTIS96",
  "TENDACADUTA_OMBRABOXINOX_100A_SOLTISB92",
  "TENDACADUTA_OMBRABOXINOX_100A_SOLTISW96W88",
  "TENDACADUTA_OMBRABOXINOX_100M_OPATEXFLAT",
  "TENDACADUTA_OMBRABOXINOX_100M_OPATEXPROZIPDECO",
  "TENDACADUTA_OMBRABOXINOX_100M_SCREEN5500",
  "TENDACADUTA_OMBRABOXINOX_100M_SCREENOSCURANTE",
  "TENDACADUTA_OMBRABOXINOX_100M_SOLTIS88VEOZIP",
  "TENDACADUTA_OMBRABOXINOX_100M_SOLTIS92",
  "TENDACADUTA_OMBRABOXINOX_100M_SOLTIS96",
  "TENDACADUTA_OMBRABOXINOX_100M_SOLTISB92",
  "TENDACADUTA_OMBRABOXINOX_100M_SOLTISW96W88",
  "TENDACADUTA_OMBRABOXINOX_125A_OPATEXFLAT",
  "TENDACADUTA_OMBRABOXINOX_125A_OPATEXPROZIPDECO",
  "TENDACADUTA_OMBRABOXINOX_125A_SCREEN5500",
  "TENDACADUTA_OMBRABOXINOX_125A_SCREENOSCURANTE",
  "TENDACADUTA_OMBRABOXINOX_125A_SOLTIS88VEOZIP",
  "TENDACADUTA_OMBRABOXINOX_125A_SOLTIS92",
  "TENDACADUTA_OMBRABOXINOX_125A_SOLTIS96",
  "TENDACADUTA_OMBRABOXINOX_125A_SOLTISB92",
  "TENDACADUTA_OMBRABOXINOX_125A_SOLTISW96W88",
  "TENDACADUTA_OMBRABOXINOX_125M_OPATEXFLAT",
  "TENDACADUTA_OMBRABOXINOX_125M_OPATEXPROZIPDECO",
  "TENDACADUTA_OMBRABOXINOX_125M_SCREEN5500",
  "TENDACADUTA_OMBRABOXINOX_125M_SCREENOSCURANTE",
  "TENDACADUTA_OMBRABOXINOX_125M_SOLTIS88VEOZIP",
  "TENDACADUTA_OMBRABOXINOX_125M_SOLTIS92",
  "TENDACADUTA_OMBRABOXINOX_125M_SOLTIS96",
  "TENDACADUTA_OMBRABOXINOX_125M_SOLTISB92",
  "TENDACADUTA_OMBRABOXINOX_125M_SOLTISW96W88",
  "TENDACADUTA_OMBRABOXINOX_85A_OPATEXFLAT",
  "TENDACADUTA_OMBRABOXINOX_85A_OPATEXPROZIPDECO",
  "TENDACADUTA_OMBRABOXINOX_85A_SCREEN5500",
  "TENDACADUTA_OMBRABOXINOX_85A_SCREENOSCURANTE",
  "TENDACADUTA_OMBRABOXINOX_85A_SOLTIS88VEOZIP",
  "TENDACADUTA_OMBRABOXINOX_85A_SOLTIS92",
  "TENDACADUTA_OMBRABOXINOX_85A_SOLTIS96",
  "TENDACADUTA_OMBRABOXINOX_85A_SOLTISB92",
  "TENDACADUTA_OMBRABOXINOX_85A_SOLTISW96W88",
  "TENDACADUTA_OMBRABOXINOX_85M_OPATEXFLAT",
  "TENDACADUTA_OMBRABOXINOX_85M_OPATEXPROZIPDECO",
  "TENDACADUTA_OMBRABOXINOX_85M_SCREEN5500",
  "TENDACADUTA_OMBRABOXINOX_85M_SCREENOSCURANTE",
  "TENDACADUTA_OMBRABOXINOX_85M_SOLTIS88VEOZIP",
  "TENDACADUTA_OMBRABOXINOX_85M_SOLTIS92",
  "TENDACADUTA_OMBRABOXINOX_85M_SOLTIS96",
  "TENDACADUTA_OMBRABOXINOX_85M_SOLTISB92",
  "TENDACADUTA_OMBRABOXINOX_85M_SOLTISW96W88",
  "TENDACADUTA_T4_ROUND",
  "TENDACADUTA_T4_SENZACASS",
];

// Listini usati dagli Optional per lo scoping (solo le 16 famiglie non-Ombra;
// Ombra Box Inox non ha righe Optional prezzate nel catalogo).
const LISTINI_GESTITI = [
  "TENDACADUTA_3000CAVETTO_ROUND_CAVETTO4",
  "TENDACADUTA_3000CAVETTO_ROUND_TONDINO6",
  "TENDACADUTA_3000CAVETTO_SENZACASS",
  "TENDACADUTA_3000CAVETTO_SQUARE_CAVETTO4",
  "TENDACADUTA_3000CAVETTO_SQUARE_TONDINO6",
  "TENDACADUTA_3000GUIDE_ROUND",
  "TENDACADUTA_3000GUIDE_SENZACASS",
  "TENDACADUTA_3000GUIDE_SQUARE",
  "TENDACADUTA_3000_ROUND",
  "TENDACADUTA_3000_ROUND_BRACCI",
  "TENDACADUTA_3000_SENZACASS",
  "TENDACADUTA_3000_SENZACASS_BRACCI",
  "TENDACADUTA_3000_SQUARE",
  "TENDACADUTA_3000_SQUARE_BRACCI",
  "TENDACADUTA_T4_ROUND",
  "TENDACADUTA_T4_SENZACASS",
];

const keyProdotto = (p: { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number }) =>
  `${p.tipologia}|${p.colore}|${p.altezzaMm}|${p.larghezzaMm}`;
const keyOptional = (o: { categoria: string; nome: string; listino: string | null }) => `${o.categoria}|${o.nome}|${o.listino ?? ""}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    // Prodotti (griglia prezzi) - bulk insert: la sola Ombra Box Inox porta
    // ~12.500 righe, una create() per riga rischierebbe il timeout serverless.
    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({
      where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE } },
    });
    const mappaProdotti = new Map(prodottiEsistenti.map((p) => [keyProdotto(p), p]));

    const daCreare: ProdottoRow[] = [];
    const daAggiornare: { id: string; prezzoBase: number }[] = [];
    let prodottiInvariati = 0;
    for (const p of prodottiNuovi) {
      const esistente = mappaProdotti.get(keyProdotto(p));
      if (!esistente) {
        daCreare.push(p);
      } else if (esistente.prezzoBase !== p.prezzoBase || esistente.coefficienteRicarico !== 1) {
        daAggiornare.push({ id: esistente.id, prezzoBase: p.prezzoBase });
      } else {
        prodottiInvariati++;
      }
    }

    let prodottiCreati = 0;
    const CHUNK = 2000;
    for (let i = 0; i < daCreare.length; i += CHUNK) {
      const chunk = daCreare.slice(i, i + CHUNK);
      const res = await prisma.prodotto.createMany({
        data: chunk.map((p) => ({
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
      prodottiCreati += res.count;
    }

    let prodottiAggiornati = 0;
    for (const u of daAggiornare) {
      await prisma.prodotto.update({ where: { id: u.id }, data: { prezzoBase: u.prezzoBase, coefficienteRicarico: 1 } });
      prodottiAggiornati++;
    }

    // Cleanup: rimuove prodotti orfani (es. le vecchie righe 3000/3000GUIDE/T4/
    // 3000CAVETTO_ROUND/_TONDINOROUND, ora sostituite dalle nuove sotto-tipologie)
    const chiaviNuoveProd = new Set(prodottiNuovi.map(keyProdotto));
    const prodottiDaRimuovere = prodottiEsistenti.filter((p) => !chiaviNuoveProd.has(keyProdotto(p)));
    let prodottiRimossi = 0;
    if (prodottiDaRimuovere.length > 0) {
      const res = await prisma.prodotto.deleteMany({ where: { id: { in: prodottiDaRimuovere.map((p) => p.id) } } });
      prodottiRimossi = res.count;
    }

    // Modelli (descrizione + immagine)
    const modelli = modelliData as ModelloRow[];
    for (const m of modelli) {
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } },
        create: {
          brandId: brand.id,
          tipologia: m.tipologia,
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
        },
        update: {
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
        },
      });
    }
    const tipologieModelliNuovi = new Set(modelli.map((m) => m.tipologia));
    const modelliOrfani = await prisma.modelloProdotto.findMany({
      where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE }, NOT: { tipologia: { in: Array.from(tipologieModelliNuovi) } } },
    });
    let modelliRimossi = 0;
    if (modelliOrfani.length > 0) {
      const res = await prisma.modelloProdotto.deleteMany({ where: { id: { in: modelliOrfani.map((m) => m.id) } } });
      modelliRimossi = res.count;
    }

    // Optional (Motorizzazione/Telecomandi/Sensori/Supplementi + Maggiorazione tessuto preservata)
    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, listino: { in: LISTINI_GESTITI } },
    });
    const mappaOptional = new Map(optionaliEsistenti.map((o) => [keyOptional(o), o]));

    const optDaCreare: OptionalRow[] = [];
    const optDaAggiornare: { id: string; o: OptionalRow }[] = [];
    let optInvariati = 0;
    for (const o of optionaliNuovi) {
      const esistente = mappaOptional.get(keyOptional(o));
      if (!esistente) {
        optDaCreare.push(o);
      } else if (
        esistente.valore !== o.valore ||
        esistente.tipoPrezzo !== o.tipoPrezzo ||
        esistente.unita !== o.unita ||
        esistente.note !== o.note ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        optDaAggiornare.push({ id: esistente.id, o });
      } else {
        optInvariati++;
      }
    }

    // Bulk insert: con ~500 righe Optional (Motorizzazione/Telecomandi/Sensori
    // per 3+ famiglie) una create() sequenziale per riga rischia il timeout
    // serverless (gia' verificato in produzione su questa stessa route).
    let optCreati = 0;
    if (optDaCreare.length > 0) {
      const res = await prisma.optional.createMany({
        data: optDaCreare.map((o) => ({
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
        })),
        skipDuplicates: true,
      });
      optCreati = res.count;
    }

    let optAggiornati = 0;
    for (const { id, o } of optDaAggiornare) {
      await prisma.optional.update({
        where: { id },
        data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo, unita: o.unita, note: o.note, gruppiApplicabili: o.gruppiApplicabili },
      });
      optAggiornati++;
    }
    const chiaviNuoveOpt = new Set(optionaliNuovi.map(keyOptional));
    const optionaliDaRimuovere = optionaliEsistenti.filter((o) => !chiaviNuoveOpt.has(keyOptional(o)));
    let optRimossi = 0;
    if (optionaliDaRimuovere.length > 0) {
      const res = await prisma.optional.deleteMany({ where: { id: { in: optionaliDaRimuovere.map((o) => o.id) } } });
      optRimossi = res.count;
    }

    // Dedup idempotente: rimuove righe duplicate esatte (stessa categoria+nome+listino)
    // che possono essersi create per race-condition tra chiamate concorrenti al seed.
    const tuttiOptionali = await prisma.optional.findMany({
      where: { brandId: brand.id, listino: { in: LISTINI_GESTITI } },
      orderBy: { id: "asc" },
    });
    const gruppiPerChiave = new Map<string, typeof tuttiOptionali>();
    for (const o of tuttiOptionali) {
      const k = keyOptional(o);
      const arr = gruppiPerChiave.get(k);
      if (arr) arr.push(o);
      else gruppiPerChiave.set(k, [o]);
    }
    const idDuplicatiDaRimuovere: string[] = [];
    for (const arr of gruppiPerChiave.values()) {
      if (arr.length > 1) {
        for (const dup of arr.slice(1)) idDuplicatiDaRimuovere.push(dup.id);
      }
    }
    if (idDuplicatiDaRimuovere.length > 0) {
      await prisma.optional.deleteMany({ where: { id: { in: idDuplicatiDaRimuovere } } });
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati,
      prodottiAggiornati,
      prodottiInvariati,
      prodottiRimossi,
      modelliAggiornati: modelli.length,
      modelliRimossi,
      optCreati,
      optAggiornati,
      optInvariati,
      optRimossi,
      optDuplicatiRimossi: idDuplicatiDaRimuovere.length,
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

  const prodottiCount = await prisma.prodotto.count({ where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE } } });
  const modelliCount = await prisma.modelloProdotto.count({ where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE } } });
  const optionaliCount = await prisma.optional.count({ where: { brandId: brand.id, listino: { in: LISTINI_GESTITI } } });

  return NextResponse.json({ ok: true, dryRun: true, prodottiCount, modelliCount, optionaliCount });
}

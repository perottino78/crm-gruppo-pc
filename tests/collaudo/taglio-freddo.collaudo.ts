// Collaudo: serramenti in alluminio a taglio freddo e verande caricati dalla rotta e usati in un'offerta (prezzo al m²).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/taglio-freddo.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivoPerMisura, aggiungiOptionalARiga } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-taglio-freddo/route";
import { tassonomiaListino } from "../../src/lib/listini/tassonomia";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-taglio-freddo", { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  // il vecchio segnaposto «in arrivo»
  await prisma.prodotto.create({ data: { brandId: b.id, tipologia: "SERRAMENTI_ALLUMINIOFREDDO_PLACEHOLDER", colore: "PLACEHOLDER", larghezzaMm: 0, altezzaMm: 0, prezzoBase: 0 } });
  await prisma.modelloProdotto.create({ data: { brandId: b.id, tipologia: "SERRAMENTI_ALLUMINIOFREDDO_PLACEHOLDER", famiglia: "INDOOR", gruppo: "SERRAMENTI", modalitaCalcolo: "GRIGLIA" } });

  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === 10 && (await prisma.prodotto.count()) === 1, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === 10 && r1.optCreati === 12 && r1.segnapostoTolto === 1, "tariffe e optional caricati, segnaposto tolto", r1);
  verifica(!(await prisma.modelloProdotto.findFirst({ where: { tipologia: "SERRAMENTI_ALLUMINIOFREDDO_PLACEHOLDER" } })), "anche il modello segnaposto è sparito");
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0 && r2.optCreati === 0 && r2.optAggiornati === 0, "rilancio senza doppioni", r2);
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia: "TAGLIOFREDDO_PIEG_VC" } });
  verifica(m?.gruppo === "SERRAMENTI" && m.famiglia === "INDOOR" && m.modalitaCalcolo === "MQ_CON_MINIMI" && m.immagineUrl === "/immagini/taglio-freddo/pieghevole.jpg", "nei Serramenti, al m², con la foto", m);

  const albero = await tassonomiaListino(b.id);
  const serr = albero.find((f) => f.nome === "INDOOR")?.gruppi.find((gr) => gr.nome === "SERRAMENTI");
  const sg = serr?.sottogruppi?.find((s) => s.nome === "Alluminio — Taglio freddo e verande");
  verifica(sg?.tipologie.length === 10 && sg.tipologie.every((t) => t.assiIsomax && t.haMisura), "nell'albero dell'offerta: 10 voci con le 2 tendine (sistema → vetro) e la misura", sg);

  const c = await prisma.cliente.create({ data: { nome: "Rossi", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  // pieghevole vetrocamera 247 × 218 cm → 250 × 220 = 5,5 m² × 757,44 = 4.165,92 €
  await aggiungiRigaPreventivoPerMisura(fd({ preventivoId: pr.id, brandId: b.id, tipologia: "TAGLIOFREDDO_PIEG_VC", larghezza: "247", altezza: "218", quantita: "1" }));
  const riga = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id } });
  verifica(Math.abs(riga.prezzoUnitario - 4165.92) < 0.01 && riga.misuraLarghezza === 247, "247×218 cm → 5,5 m² a 4.165,92 €", riga);
  const opt = async (nome: string, quantita = "1") => {
    const o = await prisma.optional.findFirstOrThrow({ where: { nome: { startsWith: nome }, listino: "TAGLIOFREDDO" } });
    await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: o.id, quantita }));
    return prisma.rigaOptional.findFirstOrThrow({ where: { rigaId: riga.id, optionalId: o.id } });
  };
  verifica((await opt("Altri colori")).prezzoUnitario === 416.59, "altri colori +10% = 416,59 €");
  verifica((await opt("Sconto oltre 10")).prezzoUnitario === -208.3, "sconto quantità −5% = −208,30 €");
  const sm = await opt("Smontaggio", "6");
  verifica(sm.quantita === 6 && sm.prezzoUnitario === 24, "smontaggio vecchia veranda: 6 m² a 24 €", sm);
  const p = await prisma.preventivo.findUniqueOrThrow({ where: { id: pr.id } });
  verifica(Math.abs(p.totaleNetto - (4165.92 + 416.59 - 208.3 + 144)) < 0.02, "totale dell'offerta con supplementi e sconto", p.totaleNetto);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

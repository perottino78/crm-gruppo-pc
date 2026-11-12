// Collaudo: serramenti PVC Plasma 30 (doppio e triplo vetro) caricati dalla rotta e usati in un'offerta (prezzo dalla griglia + optional).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/plasma30.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivoPerMisura, aggiungiOptionalARiga } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-plasma30/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-plasma30", { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  await prisma.prodotto.create({ data: { brandId: b.id, tipologia: "SERRAMENTI_PVC_PLASMA30_PLACEHOLDER", colore: "PLACEHOLDER", altezzaMm: 0, larghezzaMm: 0, prezzoBase: 0 } });

  console.log("1. Caricamento");
  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati > 2000 && (await prisma.prodotto.count({ where: { tipologia: { startsWith: "PLASMA30" } } })) === 0, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === prova.prodottiCreati && r1.optCreati === prova.optCreati, "griglie e optional caricati", r1);
  verifica(r1.segnapostoTolto === 1 && (await prisma.prodotto.count({ where: { tipologia: "SERRAMENTI_PVC_PLASMA30_PLACEHOLDER" } })) === 0, "tolto il segnaposto «in arrivo»");
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0 && r2.optCreati === 0, "rilancio senza doppioni", r2);
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia: "PLASMA30TV_F1A" } });
  verifica(m?.gruppo === "SERRAMENTI" && m.immagineUrl === "/immagini/fidra/f1a.png" && m.descrizioneTecnica?.includes("triplo vetro"), "modello nei Serramenti con disegno e scheda Plasma 30", m);
  verifica(await prisma.modelloProdotto.count({ where: { tipologia: { startsWith: "PLASMA30" } } }) === 24, "24 modelli (doppio e triplo vetro)");
  verifica(await prisma.prodotto.count({ where: { tipologia: { startsWith: "OPTIMA_" } } }) === 0, "non tocca altri listini");

  console.log("2. Offerta");
  const c = await prisma.cliente.create({ data: { nome: "Rossi", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  await aggiungiRigaPreventivoPerMisura(fd({ preventivoId: pr.id, brandId: b.id, tipologia: "PLASMA30_F1A", larghezza: "750", altezza: "1150", quantita: "2" }));
  const riga = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id }, include: { prodotto: true } });
  verifica(riga.prezzoUnitario === 1036.8 && riga.prodotto?.larghezzaMm === 800 && riga.prodotto?.altezzaMm === 1200, "750×1150 → fascia 800×1200 a 1.036,80 €", riga);
  const sat = await prisma.optional.findFirstOrThrow({ where: { listino: "PLASMA30_F", nome: { startsWith: "Vetro satinato" } } });
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: sat.id, quantita: "1" }));
  const col = await prisma.optional.findFirstOrThrow({ where: { listino: "PLASMA30", nome: { startsWith: "Rovere gold (AP 23) — pellicola sui due lati" } } });
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: col.id, quantita: "1" }));
  const ro = await prisma.rigaOptional.findMany({ where: { rigaId: riga.id }, include: { optional: true } });
  verifica(ro.find((x) => x.optional.id === sat.id)?.prezzoUnitario === 90, "vetro satinato +90 € ad anta");
  verifica(Math.abs((ro.find((x) => x.optional.id === col.id)?.prezzoUnitario ?? 0) - 414.72) < 0.01, "pellicola standard sui due lati +20% sulla riga (2 pezzi × 1.036,80)", ro.map((x) => x.prezzoUnitario));

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

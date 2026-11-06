// Collaudo: porte a vetro per vetrate caricate dalla rotta e usate in un'offerta.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/porte-vetro.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivo, aggiungiOptionalARiga } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-porte-vetro/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-porte-vetro", { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === 3 && (await prisma.prodotto.count()) === 0, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === 3 && r1.optCreati === 8, "porte e optional caricati", r1);
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.optCreati === 0, "rilancio senza doppioni", r2);
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia: "PORTAVETRO_PTV" } });
  verifica(m?.gruppo === "VETRATE PORTE" && m.famiglia === "OUTDOOR", "nelle Vetrate, famiglia a parte", m);

  const c = await prisma.cliente.create({ data: { nome: "Rossi", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  const porta = await prisma.prodotto.findFirstOrThrow({ where: { tipologia: "PORTAVETRO_PAL", colore: { startsWith: "Telaio a 4 lati" } } });
  await aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: porta.id, quantita: "1" }));
  const riga = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id } });
  verifica(riga.prezzoUnitario === 2608, "porta vetro e alluminio a 2.608 € (1.630 + 60%)", riga.prezzoUnitario);
  const anti = await prisma.optional.findFirstOrThrow({ where: { nome: { startsWith: "Maniglione antipanico" } } });
  const alta = await prisma.optional.findFirstOrThrow({ where: { nome: { startsWith: "Altezza oltre" } } });
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: anti.id, quantita: "1" }));
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: alta.id, quantita: "1" }));
  const ro = await prisma.rigaOptional.findMany({ where: { rigaId: riga.id } });
  verifica(ro.some((x) => x.prezzoUnitario === 483.2) && ro.some((x) => Math.abs(x.prezzoUnitario - 130.4) < 0.01), "antipanico 483,20 € e altezza +5% (130,40 €)", ro.map((x) => x.prezzoUnitario));

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

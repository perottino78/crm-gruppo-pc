// Collaudo: pergola Tempra (STABYLA) caricata dalla rotta e usata in un'offerta con il prezzo a misura.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/tempra.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivoPerMisura, aggiungiOptionalARiga } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-tempra/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-tempra", { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === 420 && (await prisma.prodotto.count()) === 0, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === 420 && r1.optCreati === 6, "griglie e optional caricati", r1);
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0 && r2.optCreati === 0, "rilancio senza doppioni", r2);
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia: "STABYLA_A701_AU" } });
  verifica(m?.gruppo === "PERGOLE" && m.immagineUrl === "/immagini/tempra/a701.jpg", "nelle Pergole con la foto", m);

  const c = await prisma.cliente.create({ data: { nome: "Rossi", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  // esempio del listino: A701 autoportante 8680×4000 = 18.144 € → 29.030,40 € di vendita
  await aggiungiRigaPreventivoPerMisura(fd({ preventivoId: pr.id, brandId: b.id, tipologia: "STABYLA_A701_AU", larghezza: "8500", altezza: "3800", quantita: "1" }));
  const riga = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id } });
  verifica(Math.abs(riga.prezzoUnitario - 29030.4) < 0.01, "8500×3800 → fascia 8680×4000 a 29.030,40 €", riga.prezzoUnitario);
  const strip = await prisma.optional.findFirstOrThrow({ where: { nome: { startsWith: "Strip LED white da 5 m" } } });
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: strip.id, quantita: "4" }));
  const ro = await prisma.rigaOptional.findFirstOrThrow({ where: { rigaId: riga.id } });
  verifica(ro.quantita === 4 && ro.prezzoUnitario === 880, "4 strip LED da 5 m a 880 € l'una", ro);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

// Collaudo: pedane autoportanti caricate dalla rotta e usate in un'offerta con il prezzo a misura.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/pedane.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivoPerMisura } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-pedane/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-pedane", { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === 684 && (await prisma.prodotto.count()) === 0, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === 684, "4 pedane × 171 misure caricate", r1);
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0, "rilancio senza doppioni", r2);
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia: "PEDANA_WPC" } });
  verifica(m?.gruppo === "PAVIMENTI" && m.immagineUrl === "/immagini/pedane/pedana-wpc.jpg", "nei Pavimenti con la foto", m);

  const c = await prisma.cliente.create({ data: { nome: "Bar Centrale", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  // 380 × 620 cm → fascia 400 × 650: WPC listino 11.700 € → 23.400 € di vendita
  await aggiungiRigaPreventivoPerMisura(fd({ preventivoId: pr.id, brandId: b.id, tipologia: "PEDANA_WPC", larghezza: "380", altezza: "620", quantita: "1" }));
  const riga = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id } });
  verifica(riga.prezzoUnitario === 23400 && riga.misuraLarghezza === 380, "380×620 cm in WPC → 23.400 € (fascia 400×650, listino 11.700 × 2)", riga);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

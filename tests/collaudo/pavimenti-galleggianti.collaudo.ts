// Collaudo: pavimenti galleggianti caricati dalla rotta e usate in un'offerta con il prezzo a misura.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/pedane.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivo, aggiungiOptionalARiga } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-pavimenti-galleggianti/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-pavimenti-galleggianti", { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  const segnaposto = await prisma.prodotto.create({ data: { brandId: b.id, tipologia: "PAVGALLEGGIANTI_PLACEHOLDER", colore: "PLACEHOLDER", altezzaMm: 0, larghezzaMm: 0, prezzoBase: 0 } });
  // un optional della rotta WPC nello stesso gruppo: la rotta galleggianti non lo tocca
  await prisma.optional.create({ data: { brandId: b.id, categoria: "Accessori", nome: "Clip WPC", valore: 1, listino: "WPC_DECK", gruppiApplicabili: ["PAVIMENTI"] } });
  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === 41 && prova.prodottiRimossi === 0 && (await prisma.prodotto.count()) === 1, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === 41 && r1.optCreati === r1.optional && r1.segnapostoTolto === 1, "piastrelle, pezzi speciali e servizi caricati; tolto «in arrivo»", r1);
  verifica(!(await prisma.prodotto.findUnique({ where: { id: segnaposto.id } })) && (await prisma.optional.count({ where: { nome: "Clip WPC" } })) === 1, "segnaposto via, optional WPC intatto");
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0 && r2.optCreati === 0 && r2.optRimossi === 0, "rilancio senza doppioni", r2);
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia: "PAVGAL_GEA_60X60" } });
  verifica(m?.gruppo === "PAVIMENTI" && m.immagineUrl === "/immagini/pavimenti-galleggianti/gea.jpg", "nei Pavimenti con la foto", m);

  const c = await prisma.cliente.create({ data: { nome: "Rossi terrazzo", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  const pia = await prisma.prodotto.findFirstOrThrow({ where: { tipologia: "PAVGAL_GEA_60X60", colore: { startsWith: "Argento — GEA 60AG" } } });
  await aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: pia.id, quantita: "40" }));
  const riga = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id } });
  verifica(riga.quantita === 40 && riga.prezzoUnitario === 91.05, "40 m² di Gea 60×60 a 91,05 €/m²", riga);
  const pied = await prisma.optional.findFirstOrThrow({ where: { listino: "PAVGAL_F60X60" } });
  const posa = await prisma.optional.findFirstOrThrow({ where: { nome: { startsWith: "Posa in opera" } } });
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: pied.id, quantita: "40" }));
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: posa.id, quantita: "40" }));
  const tot = await prisma.preventivo.findUniqueOrThrow({ where: { id: pr.id } });
  verifica(tot.totaleNetto === null || Math.abs((tot.totaleNetto ?? 0) - 40 * (91.05 + 44.44 + 50)) < 0.05, "totale: piastrelle + piedini + posa al m²", tot.totaleNetto);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

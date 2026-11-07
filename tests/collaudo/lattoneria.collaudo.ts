// Collaudo: lattoneria in alluminio caricata dalla rotta e usata in un'offerta (prezzo a peso, al metro × lunghezza o al pezzo).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/lattoneria.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivo } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-lattoneria/route";
import { ARTICOLI_LATTONERIA, COLORI_LATTONERIA } from "../../src/lib/listini/lattoneria";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-lattoneria", { method: m, headers: { "x-seed-key": KEY } });
const TOT = ARTICOLI_LATTONERIA.length * COLORI_LATTONERIA.length;

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  // un prodotto con prefisso simile non va toccato («_» nel LIKE)
  await prisma.prodotto.create({ data: { brandId: b.id, tipologia: "LATTX_ALTRO", colore: "X", larghezzaMm: 0, altezzaMm: 0, prezzoBase: 5 } });
  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === TOT && (await prisma.prodotto.count()) === 1, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === TOT && r1.prodottiRimossi === 0, `${ARTICOLI_LATTONERIA.length} articoli × ${COLORI_LATTONERIA.length} colori caricati`, r1);
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0, "rilancio senza doppioni", r2);
  verifica(await prisma.prodotto.count({ where: { tipologia: "LATTX_ALTRO" } }) === 1, "non tocca altri prodotti");
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia: "LATT_ANG50X50" } });
  verifica(m?.famiglia === "OUTDOOR" && m.gruppo === "LATTONERIA" && m.descrizioneTecnica?.includes("0,405 kg al metro"), "in Outdoor › Lattoneria con il peso al metro", m);

  const c = await prisma.cliente.create({ data: { nome: "Rossi Mario", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  // Angolare 50×50 15/10 RAL 7016: 0,405 kg/m × 16 €/kg × 2 = 13,00 €/m → pezzi da 250 cm = 32,50 €
  const ang = await prisma.prodotto.findFirstOrThrow({ where: { tipologia: "LATT_ANG50X50", colore: { startsWith: "RAL 7016" } } });
  verifica(ang.prezzoBase === 13, "angolare 50×50 RAL 7016 = 13,00 €/m", ang);
  await aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: ang.id, lattCm: "250", quantita: "4" }));
  const r = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id, prodottoId: ang.id } });
  verifica(r.prezzoUnitario === 32.5 && r.quantita === 4 && r.misuraLarghezza === 250 && r.misuraAltezza === null, "4 pezzi da 250 cm a 32,50 € l'uno", r);
  // Staffa per canale 333 bianca, al pezzo: 25 × 4 × 2,7 /1000 × 0,48 = 0,1296 kg × 14 × 2 = 3,60 €
  const st = await prisma.prodotto.findFirstOrThrow({ where: { tipologia: "LATT_STAFFA333", colore: { startsWith: "Bianco" } } });
  await aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: st.id, quantita: "6" }));
  const rs = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id, prodottoId: st.id } });
  verifica(rs.prezzoUnitario === 3.6 && rs.quantita === 6 && rs.misuraLarghezza === null, "6 staffe al pezzo a 3,60 €", rs);
  const p = await prisma.preventivo.findUniqueOrThrow({ where: { id: pr.id } });
  verifica(Math.abs(p.totaleNetto - (4 * 32.5 + 6 * 3.6)) < 0.01, "totale dell'offerta 151,60 €", p.totaleNetto);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

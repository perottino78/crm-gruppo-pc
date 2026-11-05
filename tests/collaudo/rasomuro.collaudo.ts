// Collaudo: listino porte raso muro (MYA, KIUSO, STRIP) caricato dalla rotta e usato in un'offerta.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/rasomuro.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivo, aggiungiOptionalARiga } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-rasomuro/route";
import * as seedIsomax from "../../src/app/api/admin/seed-isomax/route";
import { listiniRasomuro } from "../../src/lib/listini/rasomuro";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string, url: string) => new NextRequest(`http://x${url}`, { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  // una voce Isomax senza listino nello stesso gruppo: non deve comparire sulle porte raso muro
  await prisma.optional.create({ data: { brandId: b.id, categoria: "Serratura", nome: "Serratura magnetica Isomax", valore: 30, gruppiApplicabili: ["PORTE INTERNE"] } });

  console.log("1. Caricamento");
  const prova = await (await seed.GET(req("GET", "/api/admin/seed-rasomuro"))).json();
  verifica(prova.prova && prova.prodottiCreati > 100 && (await prisma.prodotto.count()) === 0, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST", "/api/admin/seed-rasomuro"))).json();
  verifica(r1.ok && r1.prodottiCreati === prova.prodottiCreati && r1.optCreati === prova.optCreati, "caricati prodotti e accessori", r1);
  const r2 = await (await seed.POST(req("POST", "/api/admin/seed-rasomuro"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0 && r2.optCreati === 0 && r2.optRimossi === 0, "rilancio: niente doppioni", r2);
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia: "RASOMURO_MYA_BATT_H215" } });
  verifica(m?.gruppo === "PORTE INTERNE" && m.immagineUrl === "/immagini/rasomuro/mya-battente.jpg", "nella sezione Porte interne con la foto", m);

  console.log("2. Offerta");
  const c = await prisma.cliente.create({ data: { nome: "Rossi", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  const porta = await prisma.prodotto.findFirstOrThrow({ where: { tipologia: "RASOMURO_MYA_BATT_H215", colore: { startsWith: "Telaio filo muro sp. 44" } } });
  await aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: porta.id, quantita: "1", rmL: "78", rmH: "215" }));
  const riga = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id } });
  verifica(riga.prezzoUnitario === 865 && riga.misuraLarghezza === 78 && riga.misuraAltezza === 215, "porta 78 × 215 a 865 €", riga);
  await aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: porta.id, quantita: "1", rmL: "50", rmH: "215" }));
  const riga2 = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id }, orderBy: { id: "desc" } });
  verifica(riga2.misuraLarghezza === null, "misura fuori listino non scritta", riga2);

  const tutte = await prisma.optional.findMany({ where: { brandId: b.id } });
  const tip = porta.tipologia;
  const visibili = tutte.filter((o) => (o.listino === null || o.listino === tip || listiniRasomuro(tip).includes(o.listino ?? "")) && (!tip.startsWith("RASOMURO_") || o.listino !== null || o.gruppiApplicabili.length === 0));
  verifica(visibili.some((o) => o.nome === "Laccato opaco") && visibili.some((o) => o.nome.startsWith("AS 001")) && visibili.some((o) => o.nome.startsWith("900 P")), "finiture, fonoisolamento e maniglie sulla battente");
  verifica(!visibili.some((o) => o.nome.includes("Isomax")) && !visibili.some((o) => o.nome.startsWith("B 131")), "niente voci Isomax né chiusure da scorrevole");
  const laccato = visibili.find((o) => o.nome === "Laccato opaco")!;
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: laccato.id, quantita: "1" }));
  const tot = await prisma.preventivo.findUniqueOrThrow({ where: { id: pr.id } });
  verifica(tot.totaleNetto === null || Math.abs((tot.totaleNetto ?? 0) - (865 * 2 + 413)) < 0.01, "totale con la finitura laccata", tot.totaleNetto);

  console.log("3. Il caricamento Isomax non cancella le voci raso muro");
  const prima = await prisma.optional.count({ where: { listino: { startsWith: "RASOMURO" } } });
  await seedIsomax.POST(req("POST", "/api/admin/seed-isomax"));
  verifica((await prisma.optional.count({ where: { listino: { startsWith: "RASOMURO" } } })) === prima, "voci raso muro ancora tutte lì", prima);
  verifica((await prisma.rigaOptional.count()) === 1, "la finitura scelta nell'offerta resta");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

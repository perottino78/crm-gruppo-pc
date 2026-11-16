// Collaudo: listino Solaris da BConsole (fotovoltaico, pompe di calore AMG) caricato dalla rotta, senza doppioni, nell'albero del
// listino e in un'offerta; prezzi Stealth in Solaris Studio solo dove sono a 0.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/solaris-bconsole.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivo } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-solaris-bconsole/route";
import { tassonomiaListino } from "../../src/lib/listini/tassonomia";
import { VOCI_SOLARIS_BC } from "../../src/lib/listini/solaris-bconsole";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-solaris-bconsole", { method: m, headers: { "x-seed-key": KEY } });
const dove = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (!String((e as { digest?: string }).digest ?? e).includes("NEXT_REDIRECT")) throw e; } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","SolarisComponente","Cliente","Utente","Brand","Soggetto" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "Solaris" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  const stealth = await prisma.soggetto.create({ data: { ragioneSociale: "Stealth Energy Technology", ruoli: ["FORNITORE"] } });
  // Solaris Studio: un inverter ancora a 0 e uno con il prezzo messo a mano (non va toccato)
  await prisma.solarisComponente.create({ data: { brandId: b.id, categoria: "INVERTER", nome: "Stealth ST-INV-T10.0 10 kW trifase (ibrido)", potenzaW: 10000, prezzoVendita: 0, costoAcquisto: 0 } });
  await prisma.solarisComponente.create({ data: { brandId: b.id, categoria: "INVERTER", nome: "Stealth ST-INV-S6.0 6 kW (ibrido)", potenzaW: 6000, prezzoVendita: 990, costoAcquisto: 0 } });

  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prezziCreati === VOCI_SOLARIS_BC.length && (await prisma.prodotto.count()) === 0, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prezziCreati === VOCI_SOLARIS_BC.length && r1.modelliCreati === VOCI_SOLARIS_BC.length, `${VOCI_SOLARIS_BC.length} prodotti con il loro prezzo`, r1);
  verifica(r1.studioAggiornati === 1 && r1.studioGiaConPrezzo === 1, "Solaris Studio: prezzo messo solo dove era a 0", r1);
  const t10 = await prisma.solarisComponente.findFirstOrThrow({ where: { nome: { contains: "T10.0" } } });
  const s6 = await prisma.solarisComponente.findFirstOrThrow({ where: { nome: { contains: "S6.0" } } });
  verifica(t10.prezzoVendita === 3920 && t10.costoAcquisto === 1225 && s6.prezzoVendita === 990, "inverter T10 a 3.920 € (costo 1.225), S6 resta 990 € scritto a mano", { t10, s6 });

  const voceT10 = VOCI_SOLARIS_BC.find((v) => v.codice.includes("ST-INV-T10"))!;
  const m = await prisma.modelloProdotto.findFirstOrThrow({ where: { tipologia: voceT10.tipologia } });
  verifica(m.famiglia === "SOLARIS" && m.gruppo === "FOTOVOLTAICO" && m.fornitoreId === stealth.id && m.scontoAcquisto === 68.75 && !!m.immagineUrl?.startsWith("/immagini/solaris-bc/"),
    "modello: Solaris › Fotovoltaico, fornitore Stealth abbinato, costo come sconto, foto", m);
  await prisma.modelloProdotto.update({ where: { id: m.id }, data: { descrizioneTecnica: "scritta a mano" } });
  await prisma.prodotto.updateMany({ where: { tipologia: voceT10.tipologia }, data: { prezzoBase: 4100 } });
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prezziCreati === 0 && r2.modelliCreati === 0 && r2.modelliCompletati === 0 && r2.studioAggiornati === 0, "rilancio senza doppioni", r2);
  verifica((await prisma.prodotto.findFirstOrThrow({ where: { tipologia: voceT10.tipologia } })).prezzoBase === 4100
    && (await prisma.modelloProdotto.findFirstOrThrow({ where: { id: m.id } })).descrizioneTecnica === "scritta a mano", "prezzo aumentato e descrizione scritta a mano restano");

  const pann = await prisma.solarisComponente.findMany({ where: { categoria: "PANNELLO" }, orderBy: { potenzaW: "asc" } });
  verifica(r1.pannelliStudioCreati === 2 && pann.length === 2 && (pann[0].misureJson as { w: number; h: number }).h === 1.98 && pann[1].prezzoVendita === 380 && r2.pannelliStudioCreati === 0,
    "Solaris Studio: pannelli VDS 370 W (1,98 × 1,00 m) e 460 W creati una volta sola", pann.map((x) => [x.nome, x.misureJson]));

  const albero = await tassonomiaListino(b.id);
  const testo = JSON.stringify(albero);
  verifica(testo.includes("FOTOVOLTAICO") && testo.includes("Impianti completi (kit)") && testo.includes("Inverter") && testo.includes("POMPE DI CALORE E CALDAIE AMG"),
    "nel listino: SOLARIS › FOTOVOLTAICO (kit, inverter…) e POMPE DI CALORE E CALDAIE AMG");

  const c = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  const kit = VOCI_SOLARIS_BC.find((v) => v.codice === "KIT6KWH/10KWSOL")!;
  const prodKit = await prisma.prodotto.findFirstOrThrow({ where: { tipologia: kit.tipologia } });
  await dove(aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: prodKit.id, quantita: "1" })));
  const cavo = VOCI_SOLARIS_BC.find((v) => v.um === "m")!;
  const prodCavo = await prisma.prodotto.findFirstOrThrow({ where: { tipologia: cavo.tipologia } });
  await dove(aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: prodCavo.id, quantita: "20" })));
  const righe = await prisma.rigaPreventivo.findMany({ where: { preventivoId: pr.id }, orderBy: { ordine: "asc" } });
  verifica(righe.length === 2 && righe[0].prezzoUnitario === 14000, "nell'offerta: impianto 6 kW + 10 kWh a 14.000 €", righe.map((r) => r.prezzoUnitario));
  verifica(Math.abs((righe[1].prezzoUnitario ?? 0) * (righe[1].quantita ?? 0) - cavo.vendita * 20) < 0.01, "cavo al metro: 20 m × prezzo al metro", righe[1]);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

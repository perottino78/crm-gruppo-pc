// Collaudo: coprifili, angolari e listelli in PVC (EXTE) caricati dalla rotta, scelti nell'offerta al metro e con il costo EXTE nell'ordine.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/coprifili.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivo } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-coprifili/route";
import { catalogoCoprifili } from "../../src/lib/listini/coprifili";
import { tassonomiaListino } from "../../src/lib/listini/tassonomia";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-coprifili", { method: m, headers: { "x-seed-key": KEY } });
const TOT = catalogoCoprifili().prodotti.length;

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand","Soggetto" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === TOT && (await prisma.prodotto.count()) === 0, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === TOT && r1.modelli === 81, `81 articoli EXTE, ${TOT} voci con i colori`, r1);
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0 && (await prisma.soggetto.count({ where: { ragioneSociale: "EXTE" } })) === 1, "rilancio senza doppioni, un solo fornitore EXTE", r2);
  const m = await prisma.modelloProdotto.findFirstOrThrow({ where: { tipologia: "COPRIF_65025030" } });
  verifica(m.famiglia === "INDOOR" && m.gruppo === "SERRAMENTI" && m.codiceFornitore === "65025030" && m.scontoAcquisto === 50 && !m.descrizioneTecnica?.includes("€"), "Indoor › Coprifili e angolari, codice EXTE e sconto d'acquisto sul modello, nessun prezzo nella descrizione", m);

  // Coprifilo piatto 30: bianco 59,74 €/100 m → 0,60 €/m costo, 1,20 €/m vendita; antracite (rivestito 271,14) → 2,71 → 5,42; Salamander +15%
  const piatto = await prisma.prodotto.findMany({ where: { tipologia: "COPRIF_65025030" } });
  const pr = (inizio: string) => piatto.find((p) => p.colore.startsWith(inizio))?.prezzoBase;
  verifica(pr("Bianco —") === 1.2 && pr("Antracite") === 5.42 && pr("Bianco Salamander") === 1.38 && pr("Rovere chiaro") === 5.7, "coprifilo piatto 30: bianco 1,20 €/m, antracite 5,42, Salamander +15%, rovere chiaro +5%", piatto.map((p) => [p.colore, p.prezzoBase]));
  // un articolo senza pellicolato a catalogo ha solo i bianchi
  const p25 = await prisma.prodotto.findMany({ where: { tipologia: "COPRIF_65025025" } });
  verifica(p25.length === 2 && p25.every((p) => p.colore.startsWith("Bianco")), "piatto 25: solo bianco e bianco Salamander (niente pellicolati a catalogo)", p25.map((p) => p.colore));

  const albero = await tassonomiaListino(b.id);
  const gruppo = albero.find((f) => f.nome === "INDOOR")?.gruppi.find((x) => x.nome === "SERRAMENTI · Coprifili PVC");
  verifica(!!gruppo, "nell'albero del listino (Indoor › Coprifili e angolari)", albero.map((f) => [f.nome, f.gruppi.map((x) => x.nome)]));

  const sg = gruppo?.sottogruppi?.find((x) => x.nome === "Listino completo");
  verifica(!!sg && sg.tipologie.length === 81 && sg.tipologie.every((t) => t.assiIsomax), "in Serramenti › Coprifili PVC, tutti con le due tendine (tipo di profilo → misura)", sg?.tipologie.length);
  const t30 = sg?.tipologie.find((t) => t.value === "COPRIF_65025030");
  verifica(t30?.assiIsomax?.modello.label === "Coprifili piatti" && /30/.test(t30.assiIsomax.apertura.label), "coprifilo piatto 30: tendina tipo «Coprifili piatti», misura con 30", t30?.assiIsomax);
  const { assicuraCoprifili } = await import("../../src/lib/listini/coprifili-server");
  verifica((await assicuraCoprifili()) !== undefined && (await assicuraCoprifili()) === null, "si carica da solo all'apertura dell'offerta (una volta sola)");

  const c = await prisma.cliente.create({ data: { nome: "Rossi Mario", brandId: b.id } });
  const prev = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  const ant = piatto.find((p) => p.colore.startsWith("Antracite"))!;
  await aggiungiRigaPreventivo(fd({ preventivoId: prev.id, prodottoId: ant.id, lattCm: "250", quantita: "4" }));
  const r = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: prev.id, prodottoId: ant.id } });
  verifica(r.prezzoUnitario === 13.55 && r.quantita === 4 && r.misuraLarghezza === 250, "4 pezzi da 250 cm di coprifilo 30 antracite a 13,55 € l'uno", r);
  const { datiAcquisto } = await import("../../src/lib/ordini/server");
  const acq = await datiAcquisto([{ ...r, prodotto: { brandId: b.id, tipologia: "COPRIF_65025030" } }]);
  verifica(Math.abs((acq.get(r.id)?.costoPrevisto ?? 0) - 27.1) < 0.01 && acq.get(r.id)?.fornitoreNome === "EXTE", "nell'ordine: fornitore EXTE, costo previsto = listino EXTE (27,10 €)", acq.get(r.id));

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

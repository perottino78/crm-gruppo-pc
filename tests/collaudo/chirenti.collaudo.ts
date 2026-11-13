// Collaudo: vetrate Chirenti (Book Pro Cam / Solco Pro Cam) caricate dalla rotta, fornitore senza doppioni e prezzo al m² in un'offerta.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/chirenti.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivoPerMisura, aggiungiOptionalARiga } from "../../src/app/actions";
import * as seed from "../../src/app/api/admin/seed-chirenti/route";
import { tassonomiaListino } from "../../src/lib/listini/tassonomia";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/seed-chirenti", { method: m, headers: { "x-seed-key": KEY } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","ModelloProdotto","Cliente","Utente","Brand","Soggetto" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  // Scintilla già a listino: non va toccata
  await prisma.prodotto.create({ data: { brandId: b.id, tipologia: "VETRATA_SCINTILLA", colore: "TARIFFA AL M²", larghezzaMm: 100, altezzaMm: 100, prezzoBase: 640 } });
  await prisma.modelloProdotto.create({ data: { brandId: b.id, tipologia: "VETRATA_SCINTILLA", famiglia: "OUTDOOR", gruppo: "VETRATE SCINTILLA", modalitaCalcolo: "MQ_CON_MINIMI" } });
  // il fornitore c'è già (scritto a mano, con un'email diversa da tenere)
  await prisma.soggetto.create({ data: { ragioneSociale: "Chirenti S.r.l.", ruoli: ["FORNITORE"], email: "mario@chirenti.it" } });

  const prova = await (await seed.GET(req("GET"))).json();
  verifica(prova.prova && prova.prodottiCreati === 4 && (await prisma.prodotto.count()) === 1, "la prova non scrive nulla", prova);
  const r1 = await (await seed.POST(req("POST"))).json();
  verifica(r1.ok && r1.prodottiCreati === 4 && r1.optCreati === 14 && r1.fornitore === "già presente", "4 tariffe e 14 optional; fornitore riconosciuto per nome", r1);
  const f = await prisma.soggetto.findMany();
  verifica(f.length === 1 && f[0].email === "mario@chirenti.it" && f[0].partitaIva === "05041370759" && f[0].iban === "IT30Y0326879530052555395260" && f[0].emailOrdini === "ordini@chirenti.it",
    "nessun doppione: completati P.IVA, IBAN, email ordini; l'email scritta a mano resta", f[0]);
  const r2 = await (await seed.POST(req("POST"))).json();
  verifica(r2.prodottiCreati === 0 && r2.prodottiAggiornati === 0 && r2.optCreati === 0 && r2.optAggiornati === 0 && r2.campiFornitoreCompletati.length === 0, "rilancio senza doppioni", r2);
  verifica((await prisma.prodotto.findFirst({ where: { tipologia: "VETRATA_SCINTILLA" } }))?.prezzoBase === 640, "Scintilla non toccata");

  const m = await prisma.modelloProdotto.findFirstOrThrow({ where: { tipologia: "VETRATA_BOOKPROCAM_TEMP" } });
  verifica(m.gruppo === "VETRATE BOOK PRO CAM" && m.modalitaCalcolo === "MQ_CON_MINIMI" && m.immagineUrl === "/immagini/vetrate/book-pro-cam.jpg" && m.fornitoreId === f[0].id && m.scontoAcquisto === 68.75 && (m.parametriCalcolo as { areaMinimaM2?: number })?.areaMinimaM2 === 3,
    "modello con foto, al m² (minimo 3 m²), fornitore Chirenti e costo d'acquisto (vendita ÷ 3,2)", m);
  const albero = await tassonomiaListino(b.id);
  const vet = albero.find((x) => x.nome === "OUTDOOR")?.gruppi.find((gr) => gr.nome === "VETRATE");
  const nomi = vet?.sottogruppi?.map((s) => s.nome) ?? [];
  verifica(nomi.includes("Book Pro Cam (a libro, vetrocamera)") && nomi.includes("Solco Pro Cam (scorrevole, vetrocamera)") && nomi.includes("Scintilla"), "in VETRATE accanto a Scintilla", nomi);

  const c = await prisma.cliente.create({ data: { nome: "Robusti", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  // Solco stratificato 250 × 240 cm = 6 m² × 1.059 = 6.354 € (+ serratura 192)
  await aggiungiRigaPreventivoPerMisura(fd({ preventivoId: pr.id, brandId: b.id, tipologia: "VETRATA_SOLCOPROCAM_STRAT", larghezza: "250", altezza: "240", quantita: "1" }));
  const riga = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id } });
  verifica(Math.abs(riga.prezzoUnitario - 6354) < 0.01, "Solco stratificato 250×240 cm → 6 m² a 6.354 €", riga.prezzoUnitario);
  const ser = await prisma.optional.findFirstOrThrow({ where: { nome: { startsWith: "Serratura" }, gruppiApplicabili: { has: "VETRATE SOLCO PRO CAM" } } });
  await aggiungiOptionalARiga(fd({ preventivoId: pr.id, rigaId: riga.id, optionalId: ser.id, quantita: "1" }));
  const p = await prisma.preventivo.findUniqueOrThrow({ where: { id: pr.id } });
  verifica(Math.abs(p.totaleNetto - 6546) < 0.02, "con la serratura con cilindro: 6.546 €", p.totaleNetto);
  // Book temperato 247 × 238 → 250 × 240 (arrotondato ai 5 cm) = 6 m² × 1.227 = 7.362 €
  await aggiungiRigaPreventivoPerMisura(fd({ preventivoId: pr.id, brandId: b.id, tipologia: "VETRATA_BOOKPROCAM_TEMP", larghezza: "247", altezza: "238", quantita: "1" }));
  const r3 = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id, prodotto: { tipologia: "VETRATA_BOOKPROCAM_TEMP" } } });
  verifica(Math.abs(r3.prezzoUnitario - 7362) < 0.01, "Book temperato 247×238 cm → arrotondato 250×240 → 7.362 €", r3.prezzoUnitario);
  // vetrata piccola 120 × 150 cm = 1,8 m² → fatturati i 3 m² minimi × 1.059 = 3.177 €
  await aggiungiRigaPreventivoPerMisura(fd({ preventivoId: pr.id, brandId: b.id, tipologia: "VETRATA_BOOKPROCAM_STRAT", larghezza: "120", altezza: "150", quantita: "1" }));
  const r4 = await prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id, prodotto: { tipologia: "VETRATA_BOOKPROCAM_STRAT" } } });
  verifica(Math.abs(r4.prezzoUnitario - 3177) < 0.01, "120×150 cm (1,8 m²) → minimo fatturabile 3 m² = 3.177 €", r4.prezzoUnitario);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

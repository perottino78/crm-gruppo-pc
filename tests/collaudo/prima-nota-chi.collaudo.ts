// Collaudo (richieste di Rocco, PDF «modifiche per PC ONE»): nel movimento a mano il «Chi» con le sue fatture da saldare,
// ordine dello scadenzario.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/prima-nota-chi.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { nuovoMovimento } from "../../src/app/amministrazione-actions";
import { GET as chiGET } from "../../src/app/api/amministrazione/chi/route";
import { residuoScadenza } from "../../src/lib/amministrazione/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const tace = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (!String((e as { digest?: string }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e; } };
const chiedi = async (qs: string) => (await chiGET(new NextRequest(`http://x/api/amministrazione/chi?${qs}`))).json();

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "AbbinamentoScadenza","MovimentoFinanziario","Scadenza","Cliente","Soggetto","ContoFinanziario","ChiusuraMese","RegistroAmministrazione","Utente","Brand" CASCADE');
  const giorgia = await prisma.utente.create({ data: { nome: "Giorgia", email: "g@x.it", username: "giorgia", ruolo: "AMMINISTRATIVO" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const cassa = await prisma.contoFinanziario.create({ data: { nome: "Cassa", tipo: "CASSA", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  const vepa = await prisma.soggetto.create({ data: { ragioneSociale: "Vepa Srl", ruoli: ["FORNITORE"] } });
  const altro = await prisma.soggetto.create({ data: { ragioneSociale: "Il Mastro srls", ruoli: ["FORNITORE"] } });
  const f1 = await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", controparte: "Vepa Srl", soggettoId: vepa.id, descrizione: "Fattura 12", numeroDocumento: "12", importo: 300, dataScadenza: new Date("2026-10-01T12:00:00Z") } });
  const f2 = await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", controparte: "VEPA SRL", descrizione: "Fattura 15 (scritta a mano)", importo: 200, dataScadenza: new Date("2026-11-01T12:00:00Z") } });
  await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", controparte: "Il Mastro srls", soggettoId: altro.id, descrizione: "Fattura 7", importo: 99 } });

  console.log("1. Ricerca del «chi» e fatture da pagare");
  g.__utente = cri;
  verifica((await chiGET(new NextRequest("http://x/api/amministrazione/chi?q=vepa"))).status === 401, "chi non è dell'amministrazione non vede nulla");
  g.__utente = giorgia;
  const r = await chiedi("q=vep");
  verifica(r.risultati.length === 1 && r.risultati[0].chiave === `S:${vepa.id}` && r.risultati[0].info === "fornitore", "trova il fornitore mentre si scrive", r);
  const s = await chiedi(`scadenze=S:${vepa.id}&tipo=PAGAMENTO`);
  verifica(s.scadenze.length === 2 && s.scadenze[0].id === f1.id, "le sue fatture aperte, anche quelle scritte a mano col suo nome, dalla più vecchia", s.scadenze.map((x: { descrizione: string }) => x.descrizione));

  console.log("2. Uscita che salda le fatture spuntate");
  await tace(nuovoMovimento(fd({ contoId: cassa.id, data: "2026-11-10", verso: "uscita", importo: "400", descrizione: "", chi: `S:${vepa.id}`, chiNome: "Vepa Srl", scadenze: [f2.id, f1.id] })));
  const m = await prisma.movimentoFinanziario.findFirstOrThrow({ include: { abbinamenti: true } });
  verifica(m.importo === -400 && m.descrizione === "Pagamento Vepa Srl" && m.note === "Chi: Vepa Srl", "movimento creato con descrizione e chi", m);
  const [a1, a2] = await Promise.all([f1, f2].map((f) => prisma.scadenza.findUniqueOrThrow({ where: { id: f.id }, include: { abbinamenti: true } })));
  verifica(a1.stato === "PAGATA" && residuoScadenza(a1) === 0, "la fattura più vecchia è saldata", a1.stato);
  verifica(a2.stato === "PARZIALE" && residuoScadenza(a2) === 100, "con 400 € la seconda resta da pagare per 100 €", [a2.stato, residuoScadenza(a2)]);
  verifica(m.stato === "ABBINATO", "il movimento risulta abbinato", m.stato);

  console.log("3. Senza spunte: movimento come prima");
  await tace(nuovoMovimento(fd({ contoId: cassa.id, data: "2026-11-10", verso: "uscita", importo: "20", descrizione: "Caffè", categoria: "Spese generali" })));
  const c = await prisma.movimentoFinanziario.findFirstOrThrow({ where: { descrizione: "Caffè" } });
  verifica(c.stato === "REGISTRATO" && c.categoria === "Spese generali", "registrato nella categoria", c);
  const resto = await chiedi(`scadenze=S:${vepa.id}&tipo=PAGAMENTO`);
  verifica(resto.scadenze.length === 1 && resto.scadenze[0].residuo === 100, "di Vepa resta da pagare solo il residuo", resto.scadenze);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

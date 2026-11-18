// Collaudo: appuntamento di rilievo fissato dal calendario e collegato al progetto del cliente (richiesta di Ugo 18/11/2026).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/rilievo-progetto.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as K from "../../src/app/calendario-actions";
import { eventiPeriodo } from "../../src/lib/calendario/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d.split(";")[2] ?? ""); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Appuntamento","Documento","TaskPratica","CommessaEvento","Commessa","Preventivo","Cliente","Utente","Brand","Rilievo","Configurazione" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", ruolo: "AMMINISTRATORE" } });
  const tec = await prisma.utente.create({ data: { nome: "Paolo Tecnico", email: "tec@x.it", ruolo: "TECNICO" } });
  const tec2 = await prisma.utente.create({ data: { nome: "Luca Tecnico", email: "tec2@x.it", ruolo: "TECNICO" } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id, indirizzo: "Via Roma 1", comune: "Rosta" } });
  const altro = await prisma.cliente.create({ data: { nome: "BIANCHI ANNA", brandId: brand.id } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: ugo.id, oggetto: "Serramenti" } });
  const c = await prisma.commessa.create({ data: { numero: 7, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });
  const prevB = await prisma.preventivo.create({ data: { clienteId: altro.id, brandId: brand.id, commercialeId: ugo.id } });
  const cB = await prisma.commessa.create({ data: { numero: 8, anno: 2026, preventivoId: prevB.id, clienteId: altro.id, brandId: brand.id } });
  g.__utente = ugo;
  const quando = new Date("2026-11-25T09:00:00Z");
  const a = await prisma.appuntamento.create({ data: { clienteId: cli.id, utenteId: tec.id, tipo: "SOPRALLUOGO", dataOra: quando, note: "Citofono 3", creatoDaNome: "Ugo Perottino" } });
  // un documento caricato per il rilievo nella scheda del cliente (prima di collegare)
  await prisma.documento.create({ data: { entita: "CLIENTE", entitaId: cli.id, cartella: "Rilievi misura", nome: "pianta.pdf", mime: "application/pdf", dimensione: 3, contenuto: Buffer.from("pdf") } });

  console.log("1. Collegamento al progetto");
  const no = await dove(K.collegaAppuntamentoProgetto(fd({ id: a.id, commessaId: cB.id })));
  verifica(no?.includes("non è di questo cliente") && !(await prisma.appuntamento.findUniqueOrThrow({ where: { id: a.id } })).commessaId, "il progetto di un altro cliente è rifiutato", no);
  const si = await dove(K.collegaAppuntamentoProgetto(fd({ id: a.id, commessaId: c.id })));
  const ril = await prisma.rilievo.findMany({ where: { commessaId: c.id } });
  verifica(si?.includes("C2026-007") && (await prisma.appuntamento.findUniqueOrThrow({ where: { id: a.id } })).commessaId === c.id, "collegato al progetto C2026-007", si);
  verifica(ril.length === 1 && ril[0].tecnicoId === tec.id && ril[0].dataOra.getTime() === quando.getTime() && ril[0].stato === "PROGRAMMATO" && ril[0].note === "Citofono 3" && ril[0].indirizzo?.includes("Via Roma 1"),
    "nasce il rilievo della pratica (stesso tecnico, giorno, ora, note e indirizzo)", ril);
  verifica((await prisma.documento.findFirstOrThrow({ where: { nome: "pianta.pdf" } })).entita === "COMMESSA", "il documento del rilievo passa nella pratica («Rilievi misura»)");
  verifica(!!(await prisma.commessaEvento.findFirst({ where: { commessaId: c.id, testo: { contains: "collegato al progetto" } } })), "nello storico della pratica");
  await dove(K.collegaAppuntamentoProgetto(fd({ id: a.id, commessaId: c.id })));
  verifica((await prisma.rilievo.count({ where: { commessaId: c.id } })) === 1, "ricollegare non crea doppioni");

  console.log("2. Calendario: si vede una volta sola");
  const ev = await eventiPeriodo({ da: new Date("2026-11-24T00:00:00Z"), a: new Date("2026-11-26T00:00:00Z") });
  verifica(ev.length === 1 && ev[0].tipo === "APPUNTAMENTO", "un solo impegno (l'appuntamento), non anche il rilievo", ev.map((e) => e.id));

  console.log("3. Spostato o annullato dal calendario: il rilievo segue");
  await dove(K.spostaAppuntamentoA(fd({ id: a.id, dataOra: "2026-11-26T15:00" })));
  const r2 = await prisma.rilievo.findFirstOrThrow({ where: { commessaId: c.id } });
  const a2 = await prisma.appuntamento.findUniqueOrThrow({ where: { id: a.id } });
  verifica(r2.dataOra.getTime() === a2.dataOra.getTime() && a2.dataOra.getTime() !== quando.getTime(), "spostato: il rilievo ha il nuovo giorno e ora", { r2: r2.dataOra, a2: a2.dataOra });
  await dove(K.modificaAppuntamento(fd({ id: a.id, utenteId: tec2.id, dataOra: "2026-11-26T15:00", tipo: "SOPRALLUOGO" })));
  verifica((await prisma.rilievo.findFirstOrThrow({ where: { commessaId: c.id } })).tecnicoId === tec2.id, "cambiato il tecnico: anche nel rilievo");
  await dove(K.esitoAppuntamento(fd({ id: a.id, stato: "ANNULLATO" })));
  verifica((await prisma.rilievo.findFirstOrThrow({ where: { commessaId: c.id } })).stato === "ANNULLATO", "annullato: anche il rilievo della pratica");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

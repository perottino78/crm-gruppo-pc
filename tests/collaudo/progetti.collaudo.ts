// Collaudo: progetti come in BConsole — consegna prevista, materiale dal listino a tendine (solo acquisto), azioni sulle righe
// spuntate (sposta in un altro progetto dello stesso cliente, togli, task) e albero del listino condiviso con l'offerta.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/progetti.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as C from "../../src/app/commesse-actions";
import { tassonomiaListino } from "../../src/lib/listini/tassonomia";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d.split(";")[2] ?? ""); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "OrdineFornitore","RigaOrdine","CommessaEvento","TaskPratica","Commessa","RigaPreventivo","Preventivo","Cliente","Soggetto","Utente","Brand","ModelloProdotto","Prodotto" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", ruolo: "AMMINISTRATORE" } });
  const mastro = await prisma.soggetto.create({ data: { ragioneSociale: "IL MASTRO SRLS", ruoli: ["FORNITORE"], scontoFornitore: 50 } });
  await prisma.modelloProdotto.createMany({ data: [
    { brandId: brand.id, tipologia: "SCOSSALINA_PROVA", famiglia: "OUTDOOR", gruppo: "LATTONERIA", fornitoreId: mastro.id },
    { brandId: brand.id, tipologia: "TAPPO_PROVA", famiglia: "OUTDOOR", gruppo: "LATTONERIA", fornitoreId: mastro.id },
  ] });
  await prisma.prodotto.createMany({ data: [
    { brandId: brand.id, tipologia: "SCOSSALINA_PROVA", colore: "Bianco", larghezzaMm: 1000, altezzaMm: 200, prezzoBase: 40 },
    { brandId: brand.id, tipologia: "SCOSSALINA_PROVA", colore: "Bianco", larghezzaMm: 2000, altezzaMm: 200, prezzoBase: 70 },
    { brandId: brand.id, tipologia: "TAPPO_PROVA", colore: "Marrone", larghezzaMm: 0, altezzaMm: 0, prezzoBase: 12 },
  ] });
  const cli = await prisma.cliente.create({ data: { nome: "ARMENTANO LUCA", brandId: brand.id } });
  const altro = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id } });
  const progetto = async (clienteId: string, numero: number, oggetto: string) => {
    const p = await prisma.preventivo.create({ data: { clienteId, brandId: brand.id, commercialeId: ugo.id, oggetto } });
    return prisma.commessa.create({ data: { numero, anno: 2026, preventivoId: p.id, clienteId, brandId: brand.id } });
  };
  const vetrate = await progetto(cli.id, 8, "Vetrate"), clima = await progetto(cli.id, 9, "Climatizzazione"), estraneo = await progetto(altro.id, 10, "Porte");
  g.__utente = ugo;

  console.log("1. Consegna prevista del progetto");
  await C.salvaConsegnaPrevista(fd({ id: vetrate.id, consegnaPrevista: "2026-11-30" }));
  verifica((await prisma.commessa.findUniqueOrThrow({ where: { id: vetrate.id } })).consegnaPrevista?.toISOString().startsWith("2026-11-30"), "consegna salvata");
  await C.salvaConsegnaPrevista(fd({ id: vetrate.id, consegnaPrevista: "2026-12-15" }));
  verifica(await prisma.commessaEvento.findFirst({ where: { commessaId: vetrate.id, testo: { contains: "30/11/2026 → 15/12/2026" } } }), "lo spostamento della consegna va nello storico");

  console.log("2. L'albero del listino è lo stesso dell'offerta");
  const albero = await tassonomiaListino(brand.id);
  const latt = albero.find((f) => f.nome === "OUTDOOR")?.gruppi.find((gr) => gr.nome === "LATTONERIA");
  verifica(latt && latt.tipologie.length === 2 && latt.tipologie.find((t) => t.value === "TAPPO_PROVA")?.varianti?.length === 1, "OUTDOOR › LATTONERIA con i due modelli (il tappo con la sua variante)", latt);

  console.log("3. Materiale dal listino a tendine (solo acquisto)");
  const tappo = await prisma.prodotto.findFirstOrThrow({ where: { tipologia: "TAPPO_PROVA" } });
  const d1 = await dove(C.complementoDaListino(fd({ preventivoId: vetrate.id, prodottoId: tappo.id, quantita: "4" })));
  const rT = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: vetrate.id, descrizione: { contains: "Marrone" } } });
  verifica(rT.complemento && rT.quantita === 4 && rT.fornitoreId === mastro.id && rT.costoPrevisto === 24, "tappo: 4 pezzi, fornitore del listino, costo 12 × 4 − 50% = 24", rT);
  verifica(d1?.includes("fattoMateriale=") && d1.endsWith("#materiale-pratica"), "si torna al materiale con la conferma", d1);
  await dove(C.complementoDaListinoPerMisura(fd({ preventivoId: vetrate.id, brandId: brand.id, tipologia: "SCOSSALINA_PROVA", larghezza: "1500", altezza: "150", quantita: "2" })));
  const rS = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: vetrate.id, descrizione: { contains: "1500" } } });
  verifica(rS.prezzoAcquisto === 70 && rS.costoPrevisto === 70 && rS.descrizione.includes("Bianco"), "scossalina 1500: fascia 2000 del listino, costo 70 × 2 − 50%", rS);
  const fuori = await dove(C.complementoDaListinoPerMisura(fd({ preventivoId: vetrate.id, brandId: brand.id, tipologia: "SCOSSALINA_PROVA", larghezza: "5000", altezza: "150" })));
  verifica(fuori?.includes("avviso=") && fuori.includes("fuori listino"), "misura fuori listino: avviso", fuori);

  console.log("4. Azioni sulle righe spuntate");
  const ordinata = await prisma.rigaOrdine.create({ data: { commessaId: vetrate.id, descrizione: "Già ordinata", quantita: 1, complemento: true, ordinato: true } });
  const dS = await dove(C.spostaRigheProgetto(fd({ commessaId: vetrate.id, progettoDestinazione: clima.id, riga: [rT.id, ordinata.id] })));
  verifica((await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rT.id } })).commessaId === clima.id, "il tappo passa al progetto clima");
  verifica((await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: ordinata.id } })).commessaId === vetrate.id, "la riga già ordinata resta dov'è");
  verifica(dS?.includes("1 righe spostate") && await prisma.commessaEvento.count({ where: { testo: { contains: "Marrone" }, commessaId: { in: [vetrate.id, clima.id] } } }) >= 2, "scritto nello storico di entrambi i progetti", dS);
  const dX = await dove(C.spostaRigheProgetto(fd({ commessaId: vetrate.id, progettoDestinazione: estraneo.id, riga: [rS.id] })));
  verifica(dX?.includes("stesso cliente") && (await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rS.id } })).commessaId === vetrate.id, "in un progetto di un altro cliente no", dX);
  const offerta = await prisma.rigaOrdine.create({ data: { commessaId: vetrate.id, rigaPreventivoId: "rp-1", descrizione: "Vetrata dell'offerta", quantita: 1 } });
  const dE = await dove(C.eliminaRigheMateriale(fd({ commessaId: vetrate.id, riga: [rS.id, offerta.id] })));
  verifica(!(await prisma.rigaOrdine.findUnique({ where: { id: rS.id } })) && await prisma.rigaOrdine.findUnique({ where: { id: offerta.id } }), "tolto il materiale aggiunto, la riga dell'offerta resta");
  verifica(dE?.includes("1 righe tolte") && dE.includes("1 righe non tolte"), "messaggio con quelle tolte e quelle no", dE);
  await dove(C.taskDaRighe(fd({ commessaId: vetrate.id, ufficioTask: "MAGAZZINO", titoloTask: "Preparare i pezzi", riga: [offerta.id, ordinata.id] })));
  const t = await prisma.taskPratica.findFirst({ where: { commessaId: vetrate.id, ufficio: "MAGAZZINO" } });
  verifica(t?.titolo === "Preparare i pezzi" && t.descrizione?.includes("Vetrata dell'offerta") && t.descrizione.includes("Già ordinata"), "task al magazzino con l'elenco delle righe", t);

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

// Collaudo: distinta base (kit) dei modelli — gestione nella scheda del modello, pezzi «sempre» aggiunti da soli al materiale
// del progetto (dall'offerta e dal listino), correlati facoltativi proposti, variante senza doppioni, togli con il kit.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/kit.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as C from "../../src/app/commesse-actions";
import * as K from "../../src/app/kit-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d.split(";")[2] ?? ""); } };
const lancia = async (p: Promise<unknown>) => { try { await p; return false; } catch (e) { return !(e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "OrdineFornitore","RigaOrdine","CommessaEvento","Commessa","RigaPreventivo","Preventivo","Cliente","Soggetto","Utente","Brand","ModelloProdotto","Prodotto","Articolo","ComponenteKit" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", ruolo: "AMMINISTRATORE" } });
  const tecnico = await prisma.utente.create({ data: { nome: "Marco Tecnico", email: "marco@gruppopec.com", ruolo: "TECNICO" } });
  const vepa = await prisma.soggetto.create({ data: { ragioneSociale: "VEPA SRL", ruoli: ["FORNITORE"] } });
  const ferr = await prisma.soggetto.create({ data: { ragioneSociale: "FERRAMENTA SPA", ruoli: ["FORNITORE"] } });
  await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia: "PANORAMICA_PROVA", famiglia: "OUTDOOR", gruppo: "VETRATE", fornitoreId: vepa.id } });
  await prisma.prodotto.createMany({ data: [
    { brandId: brand.id, tipologia: "PANORAMICA_PROVA", colore: "Bianco", larghezzaMm: 3000, altezzaMm: 2500, prezzoBase: 3000 },
    { brandId: brand.id, tipologia: "PANORAMICA_PROVA", colore: "Bianco", larghezzaMm: 5000, altezzaMm: 2500, prezzoBase: 5000 },
  ] });
  const p5 = await prisma.prodotto.findFirstOrThrow({ where: { larghezzaMm: 5000 } });
  await prisma.articolo.create({ data: { codice: "ANG-40", descrizione: "Angolare alluminio 40×40", fornitoreId: ferr.id, costoAcquisto: 5, um: "ml" } });

  console.log("1. Distinta base nella scheda del modello");
  g.__utente = tecnico;
  verifica(await lancia(K.aggiungiComponenteKit(fd({ brandId: brand.id, tipologia: "PANORAMICA_PROVA", descrizione: "X" }))), "senza permesso listini non si modifica");
  g.__utente = ugo;
  const base = { brandId: brand.id, tipologia: "PANORAMICA_PROVA" };
  const d1 = await dove(K.aggiungiComponenteKit(fd({ ...base, articolo: "ANG-40 — Angolare alluminio 40×40", quantita: "2", calcolo: "METRO" })));
  await dove(K.aggiungiComponenteKit(fd({ ...base, descrizione: "Kit viteria e guarnizioni", quantita: "1", calcolo: "FISSO", costoUnitario: "3,50" })));
  await dove(K.aggiungiComponenteKit(fd({ ...base, descrizione: "Legno di finitura", quantita: "1", calcolo: "PEZZO", facoltativo: "on" })));
  const errA = await dove(K.aggiungiComponenteKit(fd({ ...base, articolo: "NON-ESISTE" })));
  const errD = await dove(K.aggiungiComponenteKit(fd({ ...base, quantita: "1" })));
  const kit = await prisma.componenteKit.findMany({ orderBy: { ordine: "asc" } });
  verifica(kit.length === 3 && kit[0].descrizione === "Angolare alluminio 40×40" && kit[0].fornitoreId === ferr.id && kit[0].costoUnitario === 5, "angolare dall'articolo: descrizione, fornitore e costo dell'anagrafica", kit[0]);
  verifica(kit[1].costoUnitario === 3.5 && kit[1].calcolo === "FISSO" && kit[2].facoltativo, "viteria una volta per riga, legno facoltativo");
  verifica(d1?.includes("kitOk=") && d1.endsWith("#kit") && errA?.includes("non trovato") && errD?.includes("descrizione"), "messaggi di conferma e di errore", [d1, errA, errD]);

  console.log("2. Dall'offerta al materiale: il kit entra da solo");
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: ugo.id, oggetto: "Vetrate" } });
  await prisma.rigaPreventivo.create({ data: { preventivoId: prev.id, prodottoId: p5.id, prezzoUnitario: 5000, quantita: 1, misuraLarghezza: 4200, misuraAltezza: 2400 } });
  const c = await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });
  await C.generaRigheOrdine(fd({ id: c.id }));
  const righe = await prisma.rigaOrdine.findMany({ where: { commessaId: c.id } });
  const madre = righe.find((r) => r.rigaPreventivoId)!;
  const ang = righe.find((r) => r.descrizione.startsWith("Angolare"));
  const vit = righe.find((r) => r.descrizione.startsWith("Kit viteria"));
  verifica(madre?.prodottoId === p5.id, "la riga dell'offerta ricorda il prodotto di listino");
  verifica(ang?.kitDiId === madre.id && ang.quantita === 9 && ang.costoPrevisto === 45 && ang.fornitoreId === ferr.id && ang.complemento, "angolare: 2 al metro × 4,2 m = 8,4 → 9 pezzi, 45 € dal fornitore dell'articolo", ang);
  verifica(vit?.quantita === 1 && vit.costoPrevisto === 3.5 && vit.fornitoreId === vepa.id, "viteria 1 pezzo, fornitore del modello", vit);
  verifica(!righe.some((r) => r.descrizione === "Legno di finitura"), "il facoltativo non entra da solo");
  await C.generaRigheOrdine(fd({ id: c.id }));
  verifica(await prisma.rigaOrdine.count({ where: { commessaId: c.id } }) === 3, "rigenerare l'elenco non crea doppioni");

  console.log("3. Correlato facoltativo aggiunto a mano");
  const legno = kit[2];
  const d3 = await dove(C.aggiungiCorrelato(fd({ rigaId: madre.id, componenteId: legno.id })));
  verifica(await prisma.rigaOrdine.count({ where: { commessaId: c.id, kitDiId: madre.id, descrizione: "Legno di finitura" } }) === 1 && d3?.includes("Correlato aggiunto"), "legno aggiunto come pezzo del kit", d3);

  console.log("4. Dal listino a tendine: il prodotto porta il suo kit");
  const d4 = await dove(C.complementoDaListinoPerMisura(fd({ preventivoId: c.id, brandId: brand.id, tipologia: "PANORAMICA_PROVA", larghezza: "2800", altezza: "2400", quantita: "2" })));
  const v2 = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: c.id, descrizione: { contains: "2800" }, kitDiId: null } });
  const ang2 = await prisma.rigaOrdine.findFirst({ where: { kitDiId: v2.id, descrizione: { startsWith: "Angolare" } } });
  verifica(ang2?.quantita === 12 && d4?.includes("2 pezzi del kit"), "angolare: 2 al metro × 2,8 m × 2 vetrate = 11,2 → 12", { ang2, d4 });

  console.log("5. Togli una riga: va via con il suo kit");
  await dove(C.eliminaRigheMateriale(fd({ commessaId: c.id, riga: [v2.id] })));
  verifica(await prisma.rigaOrdine.count({ where: { kitDiId: v2.id } }) === 0 && !(await prisma.rigaOrdine.findUnique({ where: { id: v2.id } })), "vetrata e pezzi del suo kit tolti");

  console.log("6. Variante dell'offerta: il kit si rigenera senza doppioni");
  await prisma.rigaOrdine.update({ where: { id: vit!.id }, data: { ordinato: true } });
  await prisma.preventivo.update({ where: { id: prev.id }, data: { confermatoIl: null } });
  await dove(C.salvaVariante(fd({ preventivoId: prev.id })));
  const dopo = await prisma.rigaOrdine.findMany({ where: { commessaId: c.id } });
  const madreNuova = dopo.find((r) => r.rigaPreventivoId)!;
  const viterie = dopo.filter((r) => r.descrizione.startsWith("Kit viteria"));
  verifica(dopo.filter((r) => r.descrizione.startsWith("Angolare")).length === 1, "un solo angolare dopo la variante", dopo.map((r) => r.descrizione));
  verifica(viterie.length === 1 && viterie[0].ordinato && viterie[0].kitDiId === madreNuova.id, "la viteria già ordinata non si duplica e resta collegata alla riga", viterie);

  console.log("7. Togli un pezzo dalla distinta base");
  await dove(K.eliminaComponenteKit(fd({ id: legno.id })));
  verifica(await prisma.componenteKit.count() === 2, "pezzo tolto dalla distinta");

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

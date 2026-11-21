// Collaudo: percorso guidato del progetto — acconto → «Crea progetto» → rilievo → rilievi caricati → prodotti con il fornitore → «Conferma materiale»
// → ordini ai fornitori (bloccati prima) → arrivo in magazzino; le pratiche già avviate non hanno blocchi.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/progetto-percorso.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as C from "../../src/app/commesse-actions";
import * as O from "../../src/app/ordini-actions";
import { percorsoDiCommessa } from "../../src/lib/progetti/percorso-server";
import { verificaMaterialeCommessa } from "../../src/lib/magazzino/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d.split(";")[2] ?? ""); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "TaskPratica","FlussoFase","OrdineFornitore","RigaOrdine","CommessaEvento","Commessa","RigaPreventivo","Preventivo","Cliente","Soggetto","Utente","Brand","Rilievo","RilievoAllegato","Configurazione" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", ruolo: "AMMINISTRATORE" } });
  const fidra = await prisma.soggetto.create({ data: { ragioneSociale: "FIDRA SRL", ruoli: ["FORNITORE"], emailOrdini: "ordini@fidra.it" } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id, comune: "Rosta" } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: ugo.id, oggetto: "Serramenti" } });
  await prisma.rigaPreventivo.create({ data: { preventivoId: prev.id, testoLibero: "Finestra 2 ante 1200×1400", prezzoUnitario: 900, quantita: 2, ordine: 1 } });
  const c = await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id, accontoImporto: 900 } });
  g.__utente = ugo;
  const quando = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16);

  console.log("1. Apertura pratica (Giorgia): prima il progetto, poi dentro la fattura di acconto");
  let p = (await percorsoDiCommessa(c.id))!;
  verifica(p.fase === "DA_CREARE" && p.ordiniBloccati, "da creare, anche senza incasso", p.etichetta);
  const r1 = await dove(C.registraFatturaAcconto(fd({ commessaId: c.id })));
  verifica(r1?.includes("pav=") && !(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).fatturaAccontoIl, "fattura di acconto rifiutata prima del progetto", r1);

  console.log("2. Progetto creato prima dell'incasso: il rilievo aspetta l'acconto");
  const r2 = await dove(C.creaProgetto(fd({ commessaId: c.id })));
  verifica(r2?.includes("pok=") && !!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).progettoCreatoIl, "progetto creato", r2);
  await dove(C.registraFatturaAcconto(fd({ commessaId: c.id })));
  verifica(!!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).fatturaAccontoIl, "fattura di acconto segnata dentro il progetto");
  verifica(!!(await prisma.commessaEvento.findFirst({ where: { commessaId: c.id, testo: { contains: "Progetto creato" } } })), "nello storico");
  await C.programmaRilievo(fd({ commessaId: c.id, tecnicoId: ugo.id, dataOra: quando }));
  verifica((await prisma.rilievo.count({ where: { commessaId: c.id } })) === 0, "senza acconto incassato il rilievo non si fissa");
  await dove(C.registraBenvenuto(fd({ commessaId: c.id, note: "Cliente contento" })));
  verifica(!!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).benvenutoIl, "chiamata di benvenuto salvata");
  await prisma.commessa.update({ where: { id: c.id }, data: { accontoIncassato: true, accontoIncassatoIl: new Date() } });

  console.log("3. Appuntamento di rilievo e caricamento rilievi");
  await C.programmaRilievo(fd({ commessaId: c.id, tecnicoId: ugo.id, dataOra: quando }));
  const ril = await prisma.rilievo.findFirstOrThrow({ where: { commessaId: c.id } });
  p = (await percorsoDiCommessa(c.id))!;
  verifica(p.etichetta === "Carica i rilievi", "rilievo fissato", p.etichetta);
  await prisma.taskPratica.create({ data: { commessaId: c.id, faseChiave: "RILIEVO", ufficio: "TECNICO", titolo: "Eseguire il rilievo" } });
  await dove(C.caricaRilievo(fd({ rilievoId: ril.id, misure: "Soggiorno L 1200 × H 1400" })));
  verifica(!!(await prisma.taskPratica.findFirstOrThrow({ where: { faseChiave: "RILIEVO" } })).completatoIl && !!(await prisma.taskPratica.findFirst({ where: { faseChiave: "ORDINI", ufficio: "ORDINI" } })), "rilievo caricato: task del tecnico chiuso e task all'ufficio ordini");

  console.log("4. Prodotti e materiale; gli ordini sono bloccati");
  await dove(C.aggiungiComplemento(fd({ commessaId: c.id, tipo: "T", descrizione: "Coprifilo 70 mm", quantita: "4" })));
  p = (await percorsoDiCommessa(c.id))!;
  verifica(p.etichetta === "Completa il materiale" && !p.puoConfermare, "righe senza fornitore: non si conferma", p.etichetta);
  const rConf0 = await dove(C.confermaMaterialeProgetto(fd({ commessaId: c.id })));
  verifica(rConf0?.includes("pav="), "«Conferma materiale» rifiutato", rConf0);
  await prisma.rigaOrdine.updateMany({ where: { commessaId: c.id }, data: { fornitoreId: fidra.id, fornitoreNome: "FIDRA SRL" } });
  p = (await percorsoDiCommessa(c.id))!;
  verifica(p.puoConfermare && p.etichetta === "Pronto da confermare", "pronto da confermare", p.etichetta);
  const righe = await prisma.rigaOrdine.findMany({ where: { commessaId: c.id } });
  const rOrd0 = await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id, riga: righe.map((r) => r.id) })));
  verifica(rOrd0?.includes("avviso=") && (await prisma.ordineFornitore.count()) === 0, "senza conferma non si crea nessun ordine", rOrd0);

  console.log("5. Conferma materiale: si sbloccano gli ordini");
  const rConf = await dove(C.confermaMaterialeProgetto(fd({ commessaId: c.id })));
  verifica(rConf?.includes("pok="), "materiale confermato", rConf);
  p = (await percorsoDiCommessa(c.id))!;
  verifica(!p.ordiniBloccati && p.etichetta === "Da ordinare", "ordini sbloccati", p.etichetta);
  const rOrd = await dove(O.creaOrdineDaRighe(fd({ commessaId: c.id, riga: righe.map((r) => r.id) })));
  verifica(rOrd?.includes("/ordini-fornitori/") && (await prisma.ordineFornitore.count({ where: { commessaId: c.id } })) === 1, "ordine al fornitore creato", rOrd);

  console.log("6. Ordine inviato e arrivo del materiale in magazzino");
  await prisma.rigaOrdine.updateMany({ where: { commessaId: c.id }, data: { ordinato: true, ordinatoIl: new Date() } });
  p = (await percorsoDiCommessa(c.id))!;
  verifica(p.etichetta === "Ordinato: in attesa del materiale", "ordinato", p.etichetta);
  await prisma.rigaOrdine.updateMany({ where: { commessaId: c.id }, data: { arrivato: true, arrivatoIl: new Date() } });
  await prisma.$transaction((tx) => verificaMaterialeCommessa(tx, c.id, "Magazzino"));
  p = (await percorsoDiCommessa(c.id))!;
  verifica(p.fase === "COMPLETO" && p.passi.every((x) => x.stato === "FATTO"), "materiale in magazzino: progetto completo", p.passi.map((x) => x.stato));
  verifica((await prisma.taskPratica.count({ where: { commessaId: c.id, faseChiave: "MATERIALE_COMPLETO" } })) >= 1, "partono i task di saldo e posa");

  console.log("7. Pratica già avviata prima del percorso: nessun blocco");
  const prev2 = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: ugo.id, oggetto: "Vecchia" } });
  const c2 = await prisma.commessa.create({ data: { numero: 2, anno: 2026, preventivoId: prev2.id, clienteId: cli.id, brandId: brand.id, accontoIncassato: true } });
  await prisma.rilievo.create({ data: { commessaId: c2.id, tecnicoId: ugo.id, dataOra: new Date(), stato: "ESEGUITO" } });
  const rg = await prisma.rigaOrdine.create({ data: { commessaId: c2.id, descrizione: "Vetro", quantita: 1, fornitoreId: fidra.id, fornitoreNome: "FIDRA SRL" } });
  const p2 = (await percorsoDiCommessa(c2.id))!;
  verifica(p2.legacy && !p2.ordiniBloccati, "pratica già avviata: ordini liberi", p2.etichetta);
  const rOrd2 = await dove(O.creaOrdineDaRighe(fd({ commessaId: c2.id, riga: [rg.id] })));
  verifica(rOrd2?.includes("/ordini-fornitori/"), "ordine creato senza conferma", rOrd2);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

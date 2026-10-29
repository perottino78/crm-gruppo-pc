// Collaudo: il commerciale conferma l'ordine dall'offerta → blocco, commessa, task alla contabilità.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/conferma.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/actions";
import * as C from "../../src/app/commesse-actions";
import { assicuraFlusso } from "../../src/app/flusso-actions";
import { praticheCliente } from "../../src/lib/clienti/scheda";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaFatturaAcquisto","FatturaAcquisto","MovimentoMagazzino","RigaBolla","BollaEntrata","TaskPratica","CostoManuale","Documento","OrdineFornitore","RigaOrdine","CommessaEvento","FaseCommessa","Commessa","RigaPreventivo","Preventivo","Cliente","Utente","Brand","FlussoFase" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const admin = await prisma.utente.create({ data: { nome: "Ugo", email: "ugo@prova.it", ruolo: "AMMINISTRATORE" } });
  const comm = await prisma.utente.create({ data: { nome: "Pavel", email: "pavel@prova.it", ruolo: "COMMERCIALE" } });
  const cli = await prisma.cliente.create({ data: { nome: "PAVEL CRISTIAN", brandId: brand.id, comune: "Caselette", responsabileId: comm.id } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: comm.id, oggetto: "Finestre PVC", numeroOfferta: 101, totaleNetto: 10000, totaleIva: 2200, scontoPercentuale: 0 } });
  await assicuraFlusso();
  g.__utente = comm;

  console.log("1. Cambio stato dalla tendina");
  await A.aggiornaStatoPreventivo(fd({ id: prev.id, stato: "ACCETTATO" }));
  verifica((await prisma.preventivo.findUniqueOrThrow({ where: { id: prev.id } })).stato === "ACCETTATO", "lo stato ACCETTATO viene salvato");
  await A.aggiornaStatoPreventivo(fd({ id: prev.id, stato: "APERTO" }));

  console.log("2. Conferma senza contratto");
  const r1 = await redirectA(C.confermaOrdinePreventivo(fd({ preventivoId: prev.id })));
  verifica(r1?.includes("Contratto firmato"), "senza contratto la conferma viene rifiutata con spiegazione", r1);
  verifica(!(await prisma.preventivo.findUniqueOrThrow({ where: { id: prev.id } })).confermatoIl, "offerta ancora modificabile");

  console.log("3. Contratto e foto caricati, conferma con nota");
  await prisma.documento.createMany({ data: [
    { entita: "PREVENTIVO", entitaId: prev.id, cartella: "Contratto firmato", nome: "contratto.pdf", mime: "application/pdf", dimensione: 3, contenuto: Buffer.from("pdf") },
    { entita: "PREVENTIVO", entitaId: prev.id, cartella: "Foto", nome: "facciata.jpg", mime: "image/jpeg", dimensione: 3, contenuto: Buffer.from("jpg") },
  ] });
  const r2 = await redirectA(C.confermaOrdinePreventivo(fd({ preventivoId: prev.id, nota: "Acconto 50% bonifico entro venerdì" })));
  verifica(r2?.includes("confermata=1"), "torna sull'offerta con conferma", r2);
  const p2 = await prisma.preventivo.findUniqueOrThrow({ where: { id: prev.id }, include: { commessa: { include: { tasks: { orderBy: { createdAt: "asc" } }, eventi: true } } } });
  verifica(p2.stato === "ACCETTATO" && p2.confermatoIl && p2.confermatoDaNome === "Pavel", "offerta accettata e bloccata da Pavel");
  verifica(!!p2.commessa, "commessa aperta automaticamente");
  const tasks = p2.commessa!.tasks;
  const acc = tasks.find((t) => t.faseChiave === "ACCETTAZIONE");
  verifica(acc?.completatoIl && acc.completatoDaNome === "Pavel", "fase Accettazione chiusa dal commerciale", acc);
  const prossimo = tasks.find((t) => !t.completatoIl);
  verifica(prossimo?.faseChiave === "FATT_ACCONTO" && prossimo.ufficio === "FATTURAZIONE", "task creato per la contabilità (fattura acconto)", prossimo);
  verifica(prossimo?.descrizione?.includes("Acconto 50% bonifico"), "la nota del commerciale è nel task", prossimo?.descrizione);
  verifica(p2.commessa!.eventi.some((e) => e.testo.includes("Contratto firmato allegato (1 file)") && e.testo.includes("Foto allegate: 1")), "nel diario della commessa: contratto e foto");

  console.log("4. Offerta bloccata");
  const tot = p2.totaleNetto;
  await A.aggiornaSconto(fd({ id: prev.id, scontoPercentuale: "30" }));
  await A.aggiungiRigaTestoLibero(fd({ preventivoId: prev.id, testoLibero: "extra", prezzoUnitario: "999", quantita: "1" }));
  await A.eliminaPreventivo(fd({ id: prev.id }));
  const p3 = await prisma.preventivo.findUnique({ where: { id: prev.id }, include: { righe: true } });
  verifica(p3 && p3.scontoPercentuale === 0 && p3.totaleNetto === tot && p3.righe.length === 0, "sconto, nuove righe ed eliminazione rifiutati", p3 && { s: p3.scontoPercentuale, r: p3.righe.length });
  const r3 = await redirectA(C.confermaOrdinePreventivo(fd({ preventivoId: prev.id })));
  verifica((await prisma.commessa.count()) === 1 && r3?.includes("confermata=1"), "una seconda conferma non crea doppioni");

  console.log("5. Scheda cliente");
  const s = await praticheCliente(admin, cli.id);
  verifica(s.pratiche[0].esito === "IN_CORSO" && s.pratiche[0].passi.find((x) => x.stato === "corrente")?.chiave === "FATT_ACCONTO", "nel percorso del cliente tocca alla fattura d'acconto", s.pratiche[0].passi.map((x) => x.stato));
  verifica(s.pratiche[0].conteggi.file === 2, "i 2 file sono contati sulla pratica");

  console.log("6. Sblocco solo amministratore");
  await C.sbloccaPreventivo(fd({ preventivoId: prev.id }));
  verifica(!!(await prisma.preventivo.findUniqueOrThrow({ where: { id: prev.id } })).confermatoIl, "il commerciale non può sbloccare");
  g.__utente = admin;
  await C.sbloccaPreventivo(fd({ preventivoId: prev.id }));
  verifica(!(await prisma.preventivo.findUniqueOrThrow({ where: { id: prev.id } })).confermatoIl, "l'amministratore sblocca per variante");

  console.log("7. Contratto cartaceo");
  g.__utente = comm;
  const prevB = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: comm.id, numeroOfferta: 102, totaleNetto: 500 } });
  await redirectA(C.confermaOrdinePreventivo(fd({ preventivoId: prevB.id, contrattoCartaceo: "on" })));
  const tB = await prisma.taskPratica.findFirst({ where: { commessa: { preventivoId: prevB.id }, completatoIl: null } });
  verifica(tB?.descrizione?.includes("firmato su carta"), "la contabilità vede l'avviso del contratto cartaceo", tB?.descrizione);

  console.log(`\n${ok} superati, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main();

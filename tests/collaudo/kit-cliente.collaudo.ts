// Collaudo: raccolta punti «kit al cliente» (registrazione nella pratica, foto, recensione, classifica, regole, annullamento).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/kit-cliente.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { registraKitCliente, segnaRecensioneKit, annullaKitCliente, salvaRegoleKit } from "../../src/app/kit-cliente-actions";
import { regoleKit, praticheSenzaKit } from "../../src/lib/kit/server";
import { classifica, periodoDi } from "../../src/lib/kit/punti";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const modulo = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const FOTO = JSON.stringify([{ nome: "consegna.jpg", dataUri: "data:image/jpeg;base64," + Buffer.from("finta-foto").toString("base64") }]);

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "ConsegnaKit","Documento","CommessaEvento","TaskPratica","Commessa","RigaPreventivo","Preventivo","Cliente","Brand","Configurazione","RegistroAmministrazione","Utente" CASCADE');
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  const paolo = await prisma.utente.create({ data: { nome: "Paolo Visconti", email: "paolo@x.it", username: "paolo", ruolo: "COMMERCIALE" } });
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  let n = 0;
  const pratica = async (com: { id: string }, cliente: string, stato: string) => {
    const c = await prisma.cliente.create({ data: { nome: cliente, brandId: brand.id } });
    const p = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: brand.id, commercialeId: com.id, stato: "ACCETTATO" } });
    return prisma.commessa.create({ data: { numero: ++n, anno: 2026, preventivoId: p.id, clienteId: c.id, brandId: brand.id, stato, chiusaIl: stato === "CHIUSA" ? new Date("2026-11-02T10:00:00Z") : null } });
  };
  const inOrdine = await pratica(marco, "Anna Ordini", "ORDINI");
  const finita1 = await pratica(marco, "Bruno Finito", "CHIUSA");
  const finita2 = await pratica(marco, "Carla Posa", "POSA");
  const diPaolo = await pratica(paolo, "Dario Paolo", "LAVORI_ESEGUITI");

  console.log("1. Regole di serie e pratiche senza kit");
  const r = await regoleKit();
  verifica(r.puntiConsegna === 10 && r.puntiFoto === 5 && r.puntiRecensione === 10, "10 punti, +5 foto, +10 recensione", r);
  const miei = await praticheSenzaKit(marco);
  verifica(miei.length === 2 && miei.every((x) => x.commerciale === "Marco Piccatti") && !miei.some((x) => x.id === inOrdine.id), "Marco vede solo le sue pratiche a lavoro finito", miei.map((x) => x.cliente));
  verifica((await praticheSenzaKit(ugo)).length === 3, "l'amministratore le vede tutte");

  console.log("2. Registrare la consegna");
  g.__utente = marco;
  let esito = await redirectA(registraKitCliente(modulo({ commessaId: inOrdine.id, giorno: "2026-11-10" })));
  verifica(esito?.includes("lavoro finito") && !(await prisma.consegnaKit.count()), "prima della posa non si registra", esito);
  esito = await redirectA(registraKitCliente(modulo({ commessaId: finita1.id, giorno: "2099-01-01" })));
  verifica(esito?.includes("futuro"), "niente date nel futuro", esito);
  esito = await redirectA(registraKitCliente(modulo({ commessaId: finita1.id, giorno: "2026-11-10", foto: FOTO, nota: "Contento" })));
  const k1 = await prisma.consegnaKit.findUnique({ where: { commessaId: finita1.id } });
  verifica(esito?.includes("15 punti") && k1?.punti === 15 && k1.conFoto && k1.utenteId === marco.id && k1.nota === "Contento", "con la foto: 15 punti a Marco (il commerciale dell'offerta)", { esito, k1 });
  const doc = await prisma.documento.findFirst({ where: { entita: "COMMESSA", entitaId: finita1.id } });
  verifica(doc?.cartella === "Consegna kit" && doc.mime === "image/jpeg" && doc.contenuto.toString() === "finta-foto", "la foto va nei Documenti, cartella «Consegna kit»");
  verifica((await prisma.commessaEvento.findFirst({ where: { commessaId: finita1.id } }))?.testo.includes("15 punti"), "nello storico della pratica");
  esito = await redirectA(registraKitCliente(modulo({ commessaId: finita1.id, giorno: "2026-11-11" })));
  verifica(esito?.includes("già registrato") && (await prisma.consegnaKit.count()) === 1, "una sola consegna per pratica", esito);
  esito = await redirectA(registraKitCliente(modulo({ commessaId: finita2.id, giorno: "2026-11-12", recensione: "1" })));
  verifica((await prisma.consegnaKit.findUnique({ where: { commessaId: finita2.id } }))?.punti === 20, "senza foto ma con recensione: 20 punti", esito);

  console.log("3. Recensione arrivata dopo e classifica");
  const k2 = (await prisma.consegnaKit.findUnique({ where: { commessaId: finita1.id } }))!;
  await redirectA(segnaRecensioneKit(modulo({ id: k2.id, recensione: "1" })));
  verifica((await prisma.consegnaKit.findUnique({ where: { id: k2.id } }))?.punti === 25, "recensione segnata dopo: 25 punti");
  g.__utente = paolo;
  await redirectA(registraKitCliente(modulo({ commessaId: diPaolo.id, giorno: "2026-11-13", utenteId: paolo.id, foto: FOTO, recensione: "1" })));
  const tutte = await prisma.consegnaKit.findMany();
  const k = classifica(tutte, periodoDi(new Date("2026-11-13T10:00:00Z"), "mese"));
  verifica(k[0]?.nome === "Marco Piccatti" && k[0].punti === 45 && k[0].kit === 2 && k[1]?.nome === "Paolo Visconti" && k[1].punti === 25, "classifica di novembre: Marco 45 (2 kit), Paolo 25", k);

  console.log("4. Regole e annullamento solo per l'amministrazione");
  esito = await redirectA(salvaRegoleKit(modulo({ puntiConsegna: "100", puntiFoto: "0", puntiRecensione: "0" })));
  verifica(esito?.includes("Solo l'amministrazione") && (await regoleKit()).puntiConsegna === 10, "Paolo non cambia le regole", esito);
  esito = await redirectA(annullaKitCliente(modulo({ id: k2.id })));
  verifica(esito?.includes("Solo l'amministrazione") && (await prisma.consegnaKit.count()) === 3, "Paolo non annulla le consegne", esito);
  g.__utente = ugo;
  esito = await redirectA(salvaRegoleKit(modulo({ puntiConsegna: "abc", puntiFoto: "5", puntiRecensione: "10" })));
  verifica(esito?.includes("numeri") && (await regoleKit()).puntiConsegna === 10, "punti non validi rifiutati", esito);
  esito = await redirectA(salvaRegoleKit(modulo({ puntiConsegna: "20", puntiFoto: "10", puntiRecensione: "15", premioMese: "Buono carburante 100 €", premioAnno: "Weekend per due" })));
  const r2 = await regoleKit();
  verifica(r2.puntiConsegna === 20 && r2.puntiFoto === 10 && r2.premioMese === "Buono carburante 100 €" && r2.premioAnno === "Weekend per due", "regole e premi salvati", r2);
  verifica((await prisma.consegnaKit.findUnique({ where: { id: k2.id } }))?.punti === 25, "i punti già dati non cambiano");
  esito = await redirectA(annullaKitCliente(modulo({ id: k2.id })));
  verifica(esito?.includes("annullata") && !(await prisma.consegnaKit.findUnique({ where: { id: k2.id } })) && (await prisma.documento.count({ where: { entitaId: finita1.id } })) === 1, "Ugo annulla: la consegna sparisce, la foto resta", esito);
  verifica((await prisma.registroAmministrazione.count({ where: { entita: "KIT" } })) === 2, "regole e annullamento nel registro «chi ha fatto cosa»");
  verifica((await praticheSenzaKit(ugo)).some((x) => x.id === finita1.id), "la pratica torna fra quelle senza kit");

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

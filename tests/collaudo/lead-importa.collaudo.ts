// Collaudo dell'importazione dei lead da CSV: controllo senza salvare, solo i nuovi, doppioni (lead, clienti, nel file), nessuna email.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/lead-importa.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { importaRighe } from "../../src/lib/lead/importa-server";
import { modelloCsv, righeDaCsv, type Modo } from "../../src/lib/lead/importa";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };

const UT = { id: "", nome: "Ugo" };
// stesso passaggio del browser: il file si legge e si manda a righe; qui in un colpo solo
const importaLead = async (testo: string, nomeFile: string, esegui: boolean, nome: string, modo: Modo = "TELEFONISTE") => {
  const l = righeDaCsv(testo);
  if (l.errore) return { ok: false as const, errore: l.errore, riepilogo: undefined, creati: undefined, avvisi: [] as string[] };
  return importaRighe(l.righe, modo, esegui, nomeFile, { ...UT, nome });
};

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "InvioProgrammato","EmailLead","LeadEvento","Lead","Cliente","Utente","Brand","Configurazione" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const sol = await prisma.brand.create({ data: { nome: "Solaris" } });
  const cristina = await prisma.utente.create({ data: { nome: "Cristina", email: "c@x.it", username: "cristina", ruolo: "TELEFONISTA" } });
  await prisma.lead.create({ data: { nome: "Luca Verdi", telefono: "347 0000001", email: "luca@x.it", brandId: pc.id } });
  await prisma.cliente.create({ data: { nome: "Paola Neri", telefono: "011 9999999", brandId: pc.id } });

  const csv = [
    "Nome e cognome;Telefono;Email;Marchio;Provenienza;Comune;CAP;Prodotto;Note",
    "Mario Rossi;333 1111111;mario@x.it;P&C;Fiera Torino 2026;Rosta;10090;Serramenti;Vuole il preventivo",
    "Anna Bianchi;011 9876543;;Solaris;Passaparola;Torino;10100;Fotovoltaico;",
    "Mario Rossi bis;+39 333 1111111;;P&C;;;;;",
    "Luca Verdi;;LUCA@X.IT;P&C;;;;;",
    "Paola Neri;0119999999;;P&C;;;;;",
    ";333 5555555;;P&C;;;;;",
    "Marchio Strano;333 7777777;;Pinco;;;;;",
  ].join("\r\n");

  console.log("1. Controllo (non salva)");
  const prova = await importaLead(csv, "prova.csv", false, "Ugo");
  verifica(prova.ok && prova.riepilogo?.totale === 7 && prova.riepilogo.nuovi === 3, "7 righe: 3 nuove", prova.riepilogo);
  verifica(prova.riepilogo?.doppiFile === 1 && prova.riepilogo.doppiLead === 1 && prova.riepilogo.doppiClienti === 1 && prova.riepilogo.errori === 1, "1 doppio nel file, 1 già lead, 1 già cliente, 1 errore", prova.riepilogo);
  verifica((await prisma.lead.count()) === 1, "il controllo non ha creato lead");

  console.log("2. Importazione dei soli nuovi");
  const vera = await importaLead(csv, "elenco.csv", true, "Ugo");
  verifica(vera.creati === 3, "creati 3 lead", vera.creati);
  const mario = await prisma.lead.findFirst({ where: { nome: "Mario Rossi" }, include: { eventi: true } });
  verifica(mario?.fase === "NUOVO" && mario.telefonistaId === cristina.id && mario.fonte === "FIERA" && mario.comune === "Rosta" && mario.prodotto === "Serramenti", "lead completo: fase, telefonista, provenienza, comune, prodotto", mario);
  verifica(mario?.eventi[0]?.testo.includes("elenco.csv") && mario.scadenzaAzione !== null, "storico con il nome del file e scadenza di oggi");
  const anna = await prisma.lead.findFirst({ where: { nome: "Anna Bianchi" } });
  verifica(anna?.brandId === sol.id, "marchio Solaris riconosciuto");
  const strano = await prisma.lead.findFirst({ where: { nome: "Marchio Strano" } });
  verifica(strano?.brandId === pc.id && (vera.avvisi ?? []).some((a: string) => a.includes("Pinco")), "marchio sconosciuto → P&C con avviso", vera.avvisi);
  verifica((await prisma.invioProgrammato.count()) === 0 && (await prisma.emailLead.count()) === 0, "nessuna email programmata né inviata");

  console.log("3. Stesso file ricaricato");
  const ancora = await importaLead(csv, "elenco.csv", true, "Ugo");
  verifica(ancora.creati === 0 && (await prisma.lead.count()) === 4, "niente doppioni: non crea nulla", ancora.riepilogo);
  verifica(ancora.riepilogo?.doppiLead === 4, "ora tutti e 4 i vecchi risultano già lead", ancora.riepilogo);

  console.log("4. Modello e file sbagliati");
  const m = await importaLead(modelloCsv(["P&C", "Solaris"]), "modello.csv", false, "Ugo");
  verifica(m.ok && m.riepilogo?.totale === 2 && m.riepilogo.errori === 0, "il modello scaricato si legge (2 righe di esempio, nessun errore)", m.riepilogo);
  const sbagliato = await importaLead("Telefono;Email\n333;a@b.it", "x.csv", false, "Ugo");
  verifica(!sbagliato.ok && !!(sbagliato as { errore?: string }).errore, "file senza colonna nome: errore chiaro", sbagliato.errore);

  console.log("5. Solo per le campagne (le telefoniste non li vedono)");
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  UT.id = ugo.id;
  const prima = await prisma.lead.count();
  const csvC = [
    "Nome e cognome;Email;Telefono;Marchio;Provenienza;Comune",
    "Gianni Campagna;gianni@x.it;333 8888881;Solaris;Fiera Torino 2026;Rosta",
    "Elena Mailing;elena@x.it;;P&C;Passaparola;",
    "Senza Mail;;333 8888882;P&C;;",
    "Gia Cliente;LUCA@x.it;;P&C;;",
    "Telefono Uguale;nuova@x.it;347 0000001;P&C;;",
    "Gianni Doppio;gianni@x.it;;P&C;;",
  ].join("\r\n");
  const provaC = await importaLead(csvC, "campagna.csv", false, "Ugo", "CAMPAGNE");
  verifica(provaC.riepilogo?.nuovi === 3 && provaC.riepilogo.errori === 1 && provaC.riepilogo.doppiLead === 1 && provaC.riepilogo.doppiFile === 1, "per le campagne conta l'email: 3 nuovi (anche con lo stesso telefono di un lead), 1 senza email, 1 già lead, 1 doppio nel file", provaC.riepilogo);
  const veraC = await importaLead(csvC, "campagna.csv", true, "Ugo", "CAMPAGNE");
  const gianni = await prisma.cliente.findFirst({ where: { email: "gianni@x.it" } });
  verifica(veraC.creati === 3 && gianni?.categoria === "Lead" && gianni.origine === "FIERA" && gianni.brandId === sol.id && gianni.comune === "Rosta" && gianni.tag?.startsWith("import "), "creati come anagrafica «Lead» con provenienza, marchio e comune", gianni);
  verifica((await prisma.lead.count()) === prima, "nessun lead per le telefoniste (task di oggi invariati)");
  const ancoraC = await importaLead(csvC, "campagna.csv", true, "Ugo", "CAMPAGNE");
  verifica(ancoraC.creati === 0, "rilanciare lo stesso file non crea doppioni");

  console.log("6. File grande a pezzi");
  const grande = ["Nome;Email;Provenienza"];
  for (let i = 0; i < 7000; i++) grande.push(`Contatto ${i};grande${i % 6500}@esempio.it;Fiera`); // 500 email ripetute
  const l = righeDaCsv(grande.join("\n"));
  let nuoviTot = 0, creatiTot = 0;
  const t0 = Date.now();
  for (let i = 0; i < l.righe.length; i += 3000) {
    const r = await importaRighe(l.righe.slice(i, i + 3000), "CAMPAGNE", true, "grande.csv", { ...UT });
    nuoviTot += r.riepilogo?.nuovi ?? 0; creatiTot += r.creati ?? 0;
  }
  verifica(creatiTot === 6500 && nuoviTot === 6500, "7.000 righe a pezzi da 3.000: 6.500 creati e le 500 email ripetute riconosciute", [creatiTot, nuoviTot]);
  console.log(`   (${Math.round((Date.now() - t0) / 100) / 10} s)`);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

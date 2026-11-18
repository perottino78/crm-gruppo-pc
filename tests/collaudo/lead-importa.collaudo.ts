// Collaudo dell'importazione dei lead da CSV: controllo senza salvare, solo i nuovi, doppioni (lead, clienti, nel file), nessuna email.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/lead-importa.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { importaLead } from "../../src/lib/lead/importa-server";
import { modelloCsv } from "../../src/lib/lead/importa";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };

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
  verifica(strano?.brandId === pc.id && (vera.avvisi ?? []).some((a) => a.includes("Pinco")), "marchio sconosciuto → P&C con avviso", vera.avvisi);
  verifica((await prisma.invioProgrammato.count()) === 0 && (await prisma.emailLead.count()) === 0, "nessuna email programmata né inviata");

  console.log("3. Stesso file ricaricato");
  const ancora = await importaLead(csv, "elenco.csv", true, "Ugo");
  verifica(ancora.creati === 0 && (await prisma.lead.count()) === 4, "niente doppioni: non crea nulla", ancora.riepilogo);
  verifica(ancora.riepilogo?.doppiLead === 4, "ora tutti e 4 i vecchi risultano già lead", ancora.riepilogo);

  console.log("4. Modello e file sbagliati");
  const m = await importaLead(modelloCsv(["P&C", "Solaris"]), "modello.csv", false, "Ugo");
  verifica(m.ok && m.riepilogo?.totale === 2 && m.riepilogo.errori === 0, "il modello scaricato si legge (2 righe di esempio, nessun errore)", m.riepilogo);
  const sbagliato = await importaLead("Telefono;Email\n333;a@b.it", "x.csv", false, "Ugo");
  verifica(!sbagliato.ok && !!sbagliato.errore, "file senza colonna nome: errore chiaro", sbagliato.errore);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

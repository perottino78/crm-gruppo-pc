// Collaudo: appuntamenti dal calendario di BConsole → calendario del CRM (prova, caricamento, rilancio senza doppioni, aggiornamento).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/appuntamenti-bconsole.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { POST } from "../../src/app/api/admin/importa-appuntamenti-bconsole/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const chiama = async (corpo: unknown, q = "") => (await POST(new NextRequest(`http://x/api/admin/importa-appuntamenti-bconsole?${q}`, { method: "POST", headers: { "x-seed-key": "gpc-2026-seed-x7f2" }, body: JSON.stringify(corpo) }))).json();

async function main() {
  delete process.env.SEED_SECRET;
  await prisma.$executeRawUnsafe('TRUNCATE "Appuntamento","Cliente","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const massimo = await prisma.utente.create({ data: { nome: "Massimo Giordano", email: "m@x.it", ruolo: "COMMERCIALE" } });
  const cristina = await prisma.utente.create({ data: { nome: "Cristina Centralino", email: "c@x.it", ruolo: "TELEFONISTA" } });
  const esistente = await prisma.cliente.create({ data: { nome: "NASUTI SALVATORE", telefono: "+39 333 123 4567", brandId: brand.id } });
  const ev = (id: string, title: string, extra: Record<string, string> = {}) => ({ id, title, start: "2026-09-15T18:00:00+02:00", end: "2026-09-15T19:30:00+02:00", assegnato: "Massimo Giordano", creato_da: "Info P&C", className: "in_corso", telefono: "", luogo: "Via Roma 1", origineAna: "FACEBOOK", descrizione: "", ...extra });
  const eventi = [
    ev("1", "Nasuti Salvatore - CONFERMATO Preventivo Infissi", { telefono: "3331234567" }),
    ev("2", "Binato Angela - CONFERMATO - Preventivo Vetrate", { telefono: "3470000000" }),
    ev("3", "Binato Angela - FARE CHIAMATA vetrate", { telefono: "3470000000", start: "2026-09-20T10:00:00+02:00", end: "2026-09-20T10:30:00+02:00" }),
    ev("4", "Roberto Marongiu - OCCUPATO", { assegnato: "Roberto Marongiu" }),
    ev("5", "Rossi Mario - da ricontattare", { assegnato: "Info P&C" }),
    ev("6", "Verdi Luca - CONFERMATO", { assegnato: "Pasqualino Re" }),
    ev("1", "Nasuti Salvatore - CONFERMATO Preventivo Infissi", { telefono: "3331234567" }),
  ];
  const corpo = { eventi, staff: ["Roberto Marongiu", "Pasqualino Re"] };

  console.log("1. Prova: conta senza scrivere");
  const p = await chiama(corpo, "prova=1");
  verifica(p.creati === 4 && p.interni === 1 && p.senzaIncaricato === 1 && p.clientiTrovati === 1 && p.clientiCreati === 2 && p.incaricatiNonTrovati["Pasqualino Re"] === 1, "conteggi della prova", p);
  verifica(await prisma.appuntamento.count() === 0 && await prisma.cliente.count() === 1, "nessuna scrittura");

  console.log("2. Caricamento");
  const r = await chiama(corpo);
  verifica(r.creati === 4 && r.clientiCreati === 2, "4 appuntamenti, 2 clienti nuovi (Binato una volta sola)", r);
  const a1 = await prisma.appuntamento.findFirstOrThrow({ where: { chiaveImport: "BC|1" } });
  verifica(a1.clienteId === esistente.id && a1.utenteId === massimo.id && a1.stato === "CONFERMATO" && a1.durataMin === 90 && a1.dataOra.toISOString() === "2026-09-15T16:00:00.000Z" && !a1.invitaCliente && !a1.invitoInviatoIl, "agganciato al cliente esistente per telefono, orario di Roma, nessun invito", a1);
  const a3 = await prisma.appuntamento.findFirstOrThrow({ where: { chiaveImport: "BC|3" } });
  const binato = await prisma.cliente.findFirstOrThrow({ where: { nome: "Binato Angela" } });
  verifica(a3.tipo === "TELEFONICO" && a3.clienteId === binato.id && binato.origine === "FACEBOOK" && binato.responsabileId === massimo.id, "chiamata sullo stesso cliente nuovo, provenienza e commerciale", { a3, binato });
  const a5 = await prisma.appuntamento.findFirstOrThrow({ where: { chiaveImport: "BC|5" } });
  verifica(a5.utenteId === cristina.id && a5.note?.includes("attività n. 5"), "assegnato al solo centralino → la telefonista", a5);

  console.log("3. Rilancio: niente doppioni, niente modifiche");
  await prisma.appuntamento.update({ where: { id: a1.id }, data: { stato: "COMPLETATO" } });
  const r2 = await chiama(corpo);
  verifica(r2.creati === 0 && r2.giaPresenti === 4 && await prisma.appuntamento.count() === 4 && await prisma.cliente.count() === 3, "nessun doppione", r2);
  verifica((await prisma.appuntamento.findUniqueOrThrow({ where: { id: a1.id } })).stato === "COMPLETATO", "quanto cambiato nel CRM resta");

  console.log("4. Aggiorna da BConsole");
  const r3 = await chiama({ ...corpo, eventi: [ev("1", "Nasuti Salvatore - ANNULLATO Preventivo Infissi", { telefono: "3331234567", start: "2026-09-16T09:00:00+02:00", end: "2026-09-16T10:00:00+02:00" })] }, "aggiorna=1");
  const a1b = await prisma.appuntamento.findUniqueOrThrow({ where: { id: a1.id } });
  verifica(r3.aggiornati === 1 && a1b.stato === "ANNULLATO" && a1b.dataOra.toISOString() === "2026-09-16T07:00:00.000Z" && a1b.durataMin === 60, "con ?aggiorna=1 prende data, durata e stato di BConsole", a1b);

  console.log("5. Senza chiave: rifiutato");
  const no = await POST(new NextRequest("http://x/api/admin/importa-appuntamenti-bconsole", { method: "POST", body: "{}" }));
  verifica(no.status === 401, "401 senza chiave");

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

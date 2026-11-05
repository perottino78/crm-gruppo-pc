// Collaudo: dopo l'appuntamento il commerciale sceglie «svolto», «da rifissare dal centralino» o «lo rifisso io».
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/dopo-appuntamento.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { registraEsito } from "../../src/lib/automazioni/motore";
import { rifissaDalCentralino, spostaAppuntamentoA } from "../../src/app/calendario-actions";
import { daOraRoma, perInput } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","EmailLead","InvioProgrammato","Appuntamento","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina Rege", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  g.__utente = ugo;
  const domani = new Date(Date.now() + 2 * 86400_000);

  console.log("1. Appuntamento nato da un lead: «da rifissare» torna a Cristina");
  const lead = await prisma.lead.create({ data: { nome: "Giovanni Izzo", telefono: "3331234567", brandId: b.id, telefonistaId: cri.id, fase: "IN_TARGET", comune: "Torino" } });
  const r = await registraEsito({ leadId: lead.id, esito: "APPUNTAMENTO_CASA", data: domani, venditoreId: ugo.id, indirizzo: "Piazza della Repubblica 19, Torino", utenteNome: "Cristina Rege" });
  verifica(r.ok, "appuntamento fissato dal centralino", r);
  const app = (await prisma.appuntamento.findFirst({ where: { utenteId: ugo.id } }))!;
  verifica(app, "appuntamento nel calendario del commerciale");
  const richiama = perInput(new Date(Date.now() + 3 * 86400_000)).slice(0, 10) + "T10:00";
  let d = await dove(rifissaDalCentralino(fd({ id: app.id, richiamaIl: richiama, note: "c'era solo la moglie" })));
  const l1 = (await prisma.lead.findUnique({ where: { id: lead.id }, include: { eventi: true } }))!;
  verifica(d?.includes("Mandato al centralino: Cristina Rege"), "messaggio chiaro con il nome della telefonista", d);
  verifica(l1.fase === "APPUNTAMENTO_ANNULLATO" && l1.scadenzaAzione?.getTime() === daOraRoma(richiama)!.getTime(), "il lead torna nei task di Cristina il giorno scelto", { fase: l1.fase, s: l1.scadenzaAzione });
  verifica(l1.eventi.some((e) => e.testo.includes("Da rifissare") && e.testo.includes("solo la moglie")), "la nota del commerciale è nella cronologia del lead");
  const a1 = (await prisma.appuntamento.findUnique({ where: { id: app.id } }))!;
  verifica(a1.stato === "ANNULLATO" && a1.esito?.includes("Da rifissare"), "l'appuntamento è chiuso con il motivo (libera il calendario)");
  verifica((await prisma.invioProgrammato.count({ where: { leadId: lead.id, stato: "IN_ATTESA", percorso: "APPUNTAMENTO_CASA" } })) === 0, "promemoria e lettere dell'appuntamento fermati");

  console.log("2. Appuntamento fissato a mano su un cliente senza lead: si crea il lead per Cristina");
  const cliente = await prisma.cliente.create({ data: { nome: "Kasa Valmir", brandId: b.id, telefono: "3470001111" } });
  const a2 = await prisma.appuntamento.create({ data: { clienteId: cliente.id, utenteId: ugo.id, dataOra: domani, tipo: "COMMERCIALE" } });
  d = await dove(rifissaDalCentralino(fd({ id: a2.id, richiamaIl: richiama })));
  const l2 = await prisma.lead.findFirst({ where: { nome: "Kasa Valmir" } });
  verifica(l2?.fase === "APPUNTAMENTO_ANNULLATO" && l2.telefonistaId === cri.id && l2.telefono === "3470001111", "lead creato per la telefonista con il telefono del cliente", l2);
  verifica((await prisma.cliente.findUnique({ where: { id: cliente.id } }))?.leadOrigineId === l2?.id, "collegato alla scheda cliente");
  d = await dove(rifissaDalCentralino(fd({ id: a2.id, richiamaIl: richiama })));
  verifica((await prisma.lead.count({ where: { nome: "Kasa Valmir" } })) === 1, "un secondo «da rifissare» non crea doppioni");

  console.log("3. «Lo rifisso io»: sposta alla data scelta");
  const a3 = await prisma.appuntamento.create({ data: { clienteId: cliente.id, utenteId: ugo.id, dataOra: domani, tipo: "COMMERCIALE", titolo: "Preventivo infissi" } });
  const nuova = perInput(new Date(Date.now() + 5 * 86400_000)).slice(0, 10) + "T15:30";
  d = await dove(spostaAppuntamentoA(fd({ id: a3.id, dataOra: nuova })));
  const a3b = (await prisma.appuntamento.findUnique({ where: { id: a3.id } }))!;
  verifica(a3b.dataOra.getTime() === daOraRoma(nuova)!.getTime() && a3b.titolo === "Preventivo infissi", "nuova data, resto invariato", { d, data: a3b.dataOra });

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

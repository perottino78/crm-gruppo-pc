// Collaudo: esito «Chiamata con commerciale» (vale come un appuntamento, il task passa al commerciale; se il cliente non risponde torna al centralino).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/chiamata-commerciale.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { esitoLead } from "../../src/app/lead-percorso-actions";
import { scopeLeadWhere } from "../../src/lib/scope";
import { perInput } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
const domani = (ora: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(ora, 0, 0, 0); return d; };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Lead","Appuntamento","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  const lead = await prisma.lead.create({ data: { nome: "Luca Verdi", telefono: "3405556666", fase: "IN_TARGET", brandId: b.id, telefonistaId: cri.id, prodotto: "Vetrate" } });

  console.log("1. Cristina fissa la chiamata con il commerciale");
  g.__utente = cri;
  const senza = await dove(esitoLead(fd({ leadId: lead.id, esito: "APPUNTAMENTO_TELEFONICO", data: perInput(domani(9)), ritorno: "/lead" })));
  verifica(senza?.includes("errore=") && senza.includes("commerciale"), "senza commerciale: rifiutato", senza);
  await dove(esitoLead(fd({ leadId: lead.id, esito: "APPUNTAMENTO_TELEFONICO", data: perInput(domani(9)), venditoreId: marco.id, note: "vuole parlare col commerciale", ritorno: "/lead" })));
  let l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  const chiamata = l.appuntamentoId ? await prisma.appuntamento.findUnique({ where: { id: l.appuntamentoId } }) : null;
  verifica(l.fase === "APPUNTAMENTO_TELEFONICO" && l.venditoreId === marco.id && l.scadenzaAzione?.getTime() === domani(9).getTime(), "lead in «Chiamata con commerciale» all'ora fissata", l);
  verifica(chiamata?.tipo === "TELEFONICO" && chiamata.utenteId === marco.id && chiamata.durataMin === 15 && chiamata.luogo?.includes("3405556666"), "nel calendario di Marco una telefonata di 15 minuti col numero", chiamata);
  verifica(!(await prisma.invioProgrammato.count({ where: { leadId: lead.id, stato: "IN_ATTESA" } })), "nessuna email programmata");

  console.log("2. Il task passa al commerciale");
  verifica(await prisma.lead.count({ where: { AND: [{ id: lead.id }, scopeLeadWhere(marco)] } }) === 1, "Marco vede il lead tra i suoi");

  console.log("3. Il cliente non risponde: torna al centralino");
  g.__utente = marco;
  await dove(esitoLead(fd({ leadId: lead.id, esito: "NON_RISPONDE", note: "squilla a vuoto", ritorno: "/lead" })));
  l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  const dopo = await prisma.appuntamento.findUniqueOrThrow({ where: { id: chiamata!.id } });
  verifica(l.fase === "NON_RISPONDE" && l.telefonistaId === cri.id && !!l.scadenzaAzione && !l.appuntamentoId, "lead di nuovo a Cristina («Non risponde», nuovo tentativo)", l);
  verifica(dopo.stato === "COMPLETATO" && dopo.esito?.includes("Non risponde"), "la telefonata in calendario resta svolta con l'esito", dopo);
  verifica(await prisma.lead.count({ where: { AND: [{ id: lead.id }, scopeLeadWhere(marco)] } }) === 0, "Marco non ce l'ha più tra i suoi");

  console.log("4. Nuova chiamata: il commerciale fissa l'appuntamento a casa");
  g.__utente = cri;
  await dove(esitoLead(fd({ leadId: lead.id, esito: "APPUNTAMENTO_TELEFONICO", data: perInput(domani(10)), venditoreId: marco.id, ritorno: "/lead" })));
  const seconda = (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).appuntamentoId!;
  g.__utente = marco;
  const r = await dove(esitoLead(fd({ leadId: lead.id, esito: "APPUNTAMENTO_CASA", data: perInput(domani(15)), venditoreId: marco.id, indirizzo: "Via Roma 1, Rivoli", ritorno: "/lead" })));
  l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  const visita = l.appuntamentoId ? await prisma.appuntamento.findUnique({ where: { id: l.appuntamentoId } }) : null;
  verifica(r?.includes("fatto=") && l.fase === "APPUNTAMENTO_CASA" && visita?.tipo === "COMMERCIALE" && visita.id !== seconda, "appuntamento a casa: una visita nuova in calendario", { r, l, visita });
  verifica((await prisma.appuntamento.findUniqueOrThrow({ where: { id: seconda } })).stato === "COMPLETATO", "la telefonata resta come svolta");
  verifica(await prisma.leadEvento.count({ where: { leadId: lead.id, tipo: "lead.esito", testo: { startsWith: "Chiamata con commerciale" } } }) === 2, "nello storico del lead le due chiamate fissate");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

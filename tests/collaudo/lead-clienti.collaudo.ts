// Collaudo (richieste di Rocco, PDF «modifiche per PC ONE»): marchio e provenienza del lead modificabili, eliminare lead e clienti.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/lead-clienti.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { modificaDatiLead } from "../../src/app/lead-percorso-actions";
import { eliminaCliente, eliminaLead } from "../../src/app/elimina-contatti-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
const errore = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return (e as Error).message; } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Lead","Appuntamento","Referente","IndirizzoCliente","Preventivo","Cliente","Configurazione","RegistroAmministrazione","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const sol = await prisma.brand.create({ data: { nome: "Solaris" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco", email: "r@x.it", username: "rocco", ruolo: "MARKETING" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });

  console.log("1. Marchio e provenienza del lead");
  const l = await prisma.lead.create({ data: { nome: "Anna Bianchi", telefono: "3471112222", fonte: "facebook", fase: "NUOVO", brandId: pc.id, telefonistaId: cri.id } });
  g.__utente = cri;
  const r = await dove(modificaDatiLead(fd({ leadId: l.id, nome: "Anna Bianchi", telefono: "3471112222", brandId: sol.id, fonte: "passaparola", ritorno: `/lead/${l.id}` })));
  const l2 = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  verifica(l2.brandId === sol.id && l2.fonte === "passaparola", "marchio e provenienza cambiati", l2);
  verifica(r?.includes("ok="), "torna alla pagina del lead con la conferma", r);
  const ev = await prisma.leadEvento.findFirst({ where: { leadId: l.id, tipo: "lead.dati" } });
  verifica(ev?.testo.includes("marchio «P&C» → «Solaris»") && ev.testo.includes("provenienza «facebook» → «passaparola»"), "la modifica resta nella cronologia", ev?.testo);

  console.log("2. Eliminare un lead");
  verifica((await errore(eliminaLead(fd({ id: l.id }))))?.includes("permesso"), "la telefonista senza permesso non elimina");
  const cl = await prisma.cliente.create({ data: { nome: "Anna Bianchi", brandId: sol.id, leadOrigineId: l.id } });
  g.__utente = rocco;
  const r2 = await dove(eliminaLead(fd({ id: l.id, ritorno: "/clienti?q=anna" })));
  verifica(!(await prisma.lead.findUnique({ where: { id: l.id } })) && (await prisma.leadEvento.count({ where: { leadId: l.id } })) === 0, "lead e cronologia eliminati (marketing)");
  verifica((await prisma.cliente.findUnique({ where: { id: cl.id } }))?.leadOrigineId === null, "il cliente nato dal lead resta, senza collegamento");
  verifica(r2?.startsWith("/clienti?q=anna&ok="), "torna all'elenco con i filtri di prima", r2);

  console.log("3. Eliminare un cliente");
  const conLavoro = await prisma.cliente.create({ data: { nome: "Mario Rossi", brandId: pc.id } });
  await prisma.preventivo.create({ data: { clienteId: conLavoro.id, brandId: pc.id, commercialeId: marco.id } });
  const r3 = await dove(eliminaCliente(fd({ id: conLavoro.id, ritorno: `/clienti/${conLavoro.id}?sez=anagrafica#elimina` })));
  verifica(await prisma.cliente.findUnique({ where: { id: conLavoro.id } }), "con un preventivo non si elimina");
  verifica(r3?.includes("errore=") && r3.replaceAll("+", " ").includes("1 preventivo") && r3.endsWith("#elimina"), "spiega perché e torna al riquadro", r3);
  await prisma.referente.create({ data: { clienteId: cl.id, nome: "Figlio" } });
  await prisma.appuntamento.create({ data: { clienteId: cl.id, titolo: "Sopralluogo", dataOra: new Date(), utenteId: marco.id } });
  const r4 = await dove(eliminaCliente(fd({ id: cl.id, ritorno: `/clienti/${cl.id}?sez=anagrafica#elimina` })));
  verifica(!(await prisma.cliente.findUnique({ where: { id: cl.id } })) && (await prisma.referente.count()) === 0 && (await prisma.appuntamento.count()) === 0, "senza lavoro: eliminato con contatti e appuntamenti");
  verifica(r4?.startsWith("/clienti?ok="), "dalla scheda si torna all'elenco clienti", r4);
  const reg = await prisma.registroAmministrazione.count({ where: { azione: "ELIMINATO" } });
  verifica(reg === 2, "le eliminazioni restano nel registro", reg);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

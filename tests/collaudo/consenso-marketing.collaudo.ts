// Collaudo: consenso al marketing e informativa (privacy, nov 2026), senza SMTP.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/consenso-marketing.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { registraConsenso, haConsenso, linkConsensoCliente, linkInformativa, firmaConsenso } from "../../src/lib/privacy/consensi";
import { emailCampagna } from "../../src/lib/campagne/motore";
import { whereCampagna } from "../../src/lib/campagne/regole";
import { bloccoDaTesto, INFORMATIVA_PREDEFINITA } from "../../src/lib/privacy/testi";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };

async function main() {
  await prisma.consensoMarketing.deleteMany({});
  const brand = (await prisma.brand.findFirst()) ?? (await prisma.brand.create({ data: { nome: "P&C", slug: "pc" } as never }));
  const cl = await prisma.cliente.create({ data: { nome: "Mario Rossi", email: "mario.rossi@example.com", brandId: brand.id } });
  const lead = await prisma.lead.create({ data: { nome: "Anna Verdi", email: "anna@example.com", telefono: "3331112222", fonte: "test", brandId: brand.id } as never });

  verifica(!haConsenso(cl), "senza consenso: nessun consenso");
  await registraConsenso({ clienteId: cl.id, stato: "CONCESSO", fonte: "LINK_EMAIL", ip: "1.2.3.4" });
  const c1 = await prisma.cliente.findUniqueOrThrow({ where: { id: cl.id } });
  verifica(haConsenso(c1) && !c1.disiscritto, "consenso registrato sul cliente");
  const riga = await prisma.consensoMarketing.findFirstOrThrow({ where: { clienteId: cl.id } });
  verifica(riga.fonte === "LINK_EMAIL" && riga.ip === "1.2.3.4" && !!riga.testo, "prova con fonte, IP e testo mostrato");

  await registraConsenso({ clienteId: cl.id, stato: "REVOCATO", fonte: "DISISCRIZIONE" });
  const c2 = await prisma.cliente.findUniqueOrThrow({ where: { id: cl.id } });
  verifica(!haConsenso(c2) && c2.disiscritto && !c2.consensoMarketingIl, "la revoca toglie il consenso e disiscrive");
  verifica((await prisma.consensoMarketing.count({ where: { clienteId: cl.id } })) === 2, "la storia resta (2 righe)");

  await registraConsenso({ clienteId: cl.id, stato: "CONCESSO", fonte: "CONTRATTO", utenteNome: "Ugo" });
  const c3 = await prisma.cliente.findUniqueOrThrow({ where: { id: cl.id } });
  verifica(haConsenso(c3), "un nuovo consenso toglie la disiscrizione");

  await registraConsenso({ leadId: lead.id, stato: "CONCESSO", fonte: "MODULO_RICHIEDI" });
  verifica(haConsenso(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })), "consenso sul lead");

  // email della campagna: segnaposto e tracciamento
  const cont = { oggetto: "Ciao {nome}", testo: "Informativa: {informativa}\nConsenso: {consenso}" };
  const senza = emailCampagna(cont, { id: cl.id, nome: "Mario Rossi" }, undefined, "camp1");
  verifica(senza.testo.includes(linkInformativa()) && senza.testo.includes(linkConsensoCliente(cl.id, "camp1")), "{informativa} e {consenso} diventano link");
  verifica(!/api\/traccia/.test(senza.html), "senza consenso niente pixel né clic tracciati");
  verifica(/Informativa privacy/.test(senza.html), "piè di pagina con link all'informativa");
  const con = emailCampagna(cont, { id: cl.id, nome: "Mario Rossi" }, "c-xyz", "camp1");
  verifica(/api\/traccia/.test(con.html), "con consenso il tracciamento resta");
  verifica(/[?&]t=/.test(linkConsensoCliente(cl.id)) && firmaConsenso(cl.id).length > 8, "link di consenso firmato");

  // filtro «consenso» delle campagne
  const base = { marchi: [], stati: [], categorie: [] };
  const nCon = await prisma.cliente.count({ where: whereCampagna({ ...base, consenso: "CON" }) });
  const nSenza = await prisma.cliente.count({ where: whereCampagna({ ...base, consenso: "SENZA" }) });
  const tutti = await prisma.cliente.count({ where: whereCampagna(base) });
  verifica(nCon >= 1 && nCon + nSenza === tutti, "filtro consenso: con + senza = tutti", { nCon, nSenza, tutti });
  verifica(bloccoDaTesto(INFORMATIVA_PREDEFINITA).length > 3, "informativa di partenza leggibile a blocchi");
  await prisma.consensoMarketing.deleteMany({}); await prisma.lead.delete({ where: { id: lead.id } }); await prisma.cliente.delete({ where: { id: cl.id } });
  console.log(`\n${ok} ok, ${ko} falliti`);
  if (ko) process.exit(1);
}
main().finally(() => prisma.$disconnect());

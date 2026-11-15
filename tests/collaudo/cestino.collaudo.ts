// Collaudo: cestino e registro (campagne, lead e clienti eliminati → 30 giorni → ripristino).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/cestino.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { eliminaCampagna } from "../../src/app/campagne-actions";
import { eliminaLead, eliminaCliente } from "../../src/app/elimina-contatti-actions";
import { ripristinaDalCestino } from "../../src/app/registro-actions";
import { svuotaScaduti } from "../../src/lib/cestino";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Cestino","RegistroAmministrazione","CampagnaInvio","CampagnaVariante","Campagna","LeadEvento","EmailLead","Lead","Appuntamento","Attivita","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "r@x.it", username: "rocco", ruolo: "MARKETING" } });
  const cl = await prisma.cliente.create({ data: { nome: "Rossi Mario", email: "m@x.it", brandId: b.id } });
  const camp = await prisma.campagna.create({ data: { nome: "Newsletter novembre", oggetto: "Promo", testo: "Ciao {nome}", html: "<p>tanto html</p>", formato: "HTML", stato: "INVIATA", abTest: true } });
  await prisma.campagnaVariante.create({ data: { campagnaId: camp.id, nome: "A", oggetto: "Promo A", posizione: 0 } });
  await prisma.campagnaInvio.create({ data: { campagnaId: camp.id, clienteId: cl.id, email: "m@x.it", stato: "INVIATA", inviataIl: new Date(), aperture: 2 } });

  console.log("1. Campagna eliminata da Rocco → cestino → ripristinata da Ugo");
  g.__utente = rocco;
  let x = await dove(eliminaCampagna(fd({ id: camp.id })));
  verifica(x?.includes("cestino") && !(await prisma.campagna.findUnique({ where: { id: camp.id } })), "eliminata dall'elenco, messaggio «nel cestino»", x);
  const ce = await prisma.cestino.findFirstOrThrow({ where: { rifId: camp.id } });
  verifica(ce.eliminatoDaNome === "Rocco Zaccaro" && Math.round((ce.scadeIl.getTime() - ce.eliminatoIl.getTime()) / 86_400_000) === 30, "nel cestino con chi e scadenza a 30 giorni");
  verifica((await prisma.registroAmministrazione.count({ where: { entitaId: camp.id, azione: "ELIMINATO", utenteNome: "Rocco Zaccaro" } })) === 1, "nel registro: Rocco ha eliminato la campagna");
  x = await dove(ripristinaDalCestino(fd({ id: ce.id })));
  verifica(x === "/impostazioni" || x?.includes("/impostazioni") && !x.includes("ripristinato"), "Rocco (marketing) non può ripristinare", x);
  g.__utente = ugo;
  x = await dove(ripristinaDalCestino(fd({ id: ce.id })));
  const tornata = await prisma.campagna.findUnique({ where: { id: camp.id }, include: { varianti: true, invii: true } });
  verifica(x?.includes("ripristinato") && tornata?.html === "<p>tanto html</p>" && tornata.varianti.length === 1 && tornata.invii[0]?.aperture === 2 && tornata.abTest, "Ugo la ripristina com'era: testo, gruppi, invii e statistiche", x);
  verifica((await prisma.registroAmministrazione.count({ where: { entitaId: camp.id, azione: "RIPRISTINATO", utenteNome: "Ugo Perottino" } })) === 1, "nel registro: Ugo l'ha ripristinata");
  x = await dove(ripristinaDalCestino(fd({ id: ce.id })));
  verifica(x?.includes("Già ripristinato"), "seconda volta: già ripristinato", x);

  console.log("2. Lead");
  const lead = await prisma.lead.create({ data: { nome: "Bianchi Anna", email: "a@x.it", brandId: b.id } });
  await prisma.leadEvento.create({ data: { leadId: lead.id, tipo: "nota", testo: "chiamata fatta" } });
  await prisma.cliente.update({ where: { id: cl.id }, data: { leadOrigineId: lead.id } });
  await dove(eliminaLead(fd({ id: lead.id })));
  verifica(!(await prisma.lead.findUnique({ where: { id: lead.id } })) && !(await prisma.cliente.findUniqueOrThrow({ where: { id: cl.id } })).leadOrigineId, "lead eliminato e scollegato dal cliente");
  const cl2 = await prisma.cestino.findFirstOrThrow({ where: { rifId: lead.id } });
  await dove(ripristinaDalCestino(fd({ id: cl2.id })));
  verifica((await prisma.leadEvento.count({ where: { leadId: lead.id } })) === 1 && (await prisma.cliente.findUniqueOrThrow({ where: { id: cl.id } })).leadOrigineId === lead.id, "ripristinato con la cronologia e ricollegato al cliente");

  console.log("3. Cliente");
  const c2 = await prisma.cliente.create({ data: { nome: "Verdi Luca", brandId: b.id } });
  await prisma.appuntamento.create({ data: { clienteId: c2.id, utenteId: ugo.id, dataOra: new Date(), tipo: "COMMERCIALE", durataMin: 60 } });
  await dove(eliminaCliente(fd({ id: c2.id })));
  verifica(!(await prisma.cliente.findUnique({ where: { id: c2.id } })), "cliente eliminato");
  await dove(ripristinaDalCestino(fd({ id: (await prisma.cestino.findFirstOrThrow({ where: { rifId: c2.id } })).id })));
  verifica((await prisma.appuntamento.count({ where: { clienteId: c2.id } })) === 1, "cliente ripristinato con il suo appuntamento");

  console.log("4. Dopo 30 giorni");
  await dove(eliminaCampagna(fd({ id: camp.id })));
  verifica((await svuotaScaduti(new Date(Date.now() + 29 * 86_400_000))) === 0, "a 29 giorni resta");
  verifica((await svuotaScaduti(new Date(Date.now() + 31 * 86_400_000))) === 4, "a 31 giorni il cestino si svuota da solo");

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

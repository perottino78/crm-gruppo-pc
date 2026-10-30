// Collaudo: ogni cliente nuovo entra con la provenienza giusta; filtri campagne ed esportazione.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/campagne.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/actions";
import { registraLead } from "../../src/lib/leadIngest";
import { GET as esporta } from "../../src/app/api/clienti/esporta/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const csv = async (q: string) => { const r = await esporta(new NextRequest(`http://localhost/api/clienti/esporta?${q}`)); return { status: r.status, testo: await r.text() }; };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Lead","Cliente","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  await prisma.brand.create({ data: { nome: "Solaris" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "uperottino", ruolo: "AMMINISTRATORE" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@x.it", username: "mpiccatti", ruolo: "COMMERCIALE" } });
  await prisma.utente.create({ data: { nome: "Alessia Vaccaro", email: "a@x.it", username: "alessiav", ruolo: "TELEFONISTA" } });

  console.log("1. Cliente inserito a mano");
  g.__utente = marco;
  await A.creaCliente(fd({ nome: "Rossi Mario", telefono: "347 013 6795", email: "mario@rossi.it", comune: "Rosta", cap: "10090", brandId: pc.id, origine: "FIERA" }));
  const mario = await prisma.cliente.findFirstOrThrow({ where: { nome: "Rossi Mario" } });
  verifica(mario.origine === "FIERA" && mario.responsabileId === marco.id, "provenienza FIERA e commerciale Marco", mario);

  console.log("2. Lead dalla landing page (utm_source=instagram) poi convertito in cliente");
  const r = await registraLead({ nome: "Bianchi Anna", telefono: "3331112222", brand: "solaris", fonte: "instagram" });
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r!.id } });
  verifica(lead.fonte === "INSTAGRAM", "il lead è salvato con provenienza INSTAGRAM", lead.fonte);
  g.__utente = ugo;
  await A.convertiLeadInCliente(fd({ id: lead.id }));
  const anna = await prisma.cliente.findFirstOrThrow({ where: { leadOrigineId: lead.id }, include: { brand: true } });
  verifica(anna.origine === "INSTAGRAM" && anna.brand.nome === "Solaris" && anna.responsabileId === ugo.id && anna.categoria === "Lead", "il cliente eredita provenienza e marchio del lead", anna);

  console.log("3. Lead dal simulatore e dal form, fonte scritta in modi diversi");
  await registraLead({ nome: "Verdi Luca", telefono: "3209998888", fonte: "simulatore_web" });
  await A.creaLead(fd({ nome: "Neri Sara", telefono: "3401234567", brandId: pc.id, fonte: "fb" }));
  const fonti = (await prisma.lead.findMany({ orderBy: { nome: "asc" } })).map((l) => `${l.nome}:${l.fonte}`);
  verifica(fonti.includes("Verdi Luca:SIMULATORE WEB") && fonti.includes("Neri Sara:FACEBOOK"), "fonti uniformate", fonti);

  console.log("4. Esportazione con filtri campagne");
  await prisma.cliente.create({ data: { nome: "Gialli Pia", telefono: "3405556666", brandId: pc.id, origine: "FIERA", statoLead: "COMPRATO MA NON DA NOI", responsabileId: marco.id } });
  g.__utente = null;
  verifica((await csv("provenienza=FIERA")).status === 401, "senza login non esporta");
  g.__utente = ugo;
  const tutti = await csv("provenienza=FIERA");
  verifica(tutti.testo.split("\r\n").length === 3 && tutti.testo.includes("Rossi Mario") && tutti.testo.includes("Gialli Pia"), "Excel: i 2 clienti da fiera", tutti.testo);
  const caldi = await csv("provenienza=FIERA&stato=%28nessuno%29");
  verifica(caldi.testo.split("\r\n").length === 1, "stato inesistente: solo intestazione");
  const fb = await csv("formato=facebook&provenienza=FIERA&stato=" + encodeURIComponent("(nessuna)"));
  const righeFb = fb.testo.replace(/^\uFEFF/, "").split("\r\n");
  verifica(righeFb[0] === "email,phone,fn,ln,ct,zip,country" && righeFb[1] === "mario@rossi.it,+393470136795,Mario,Rossi,Rosta,10090,it" && !fb.testo.includes("Gialli"), "Facebook: escluso chi ha già comprato altrove", righeFb);
  g.__utente = marco;
  const suoi = await csv("commerciale=" + ugo.id);
  verifica(suoi.testo.includes("Rossi Mario") && !suoi.testo.includes("Bianchi Anna"), "il commerciale esporta solo i suoi (il filtro commerciale è ignorato)", suoi.testo);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

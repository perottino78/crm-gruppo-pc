// Collaudo: richieste di Cristina e Rocco (password di default, lead assegnati ad Alessia, note e attività del lead).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/telefoniste.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { login, cambiaPassword } from "../../src/app/actions";
import { riassegnaLead, passaLeadAperti, aggiungiNotaLead, spostaProssimaAttivita, esitoLead } from "../../src/app/lead-percorso-actions";
import { impostaTelefonistaBrand } from "../../src/app/lead-actions";
import { telefonistaDefaultPerBrand } from "../../src/lib/leadIngest";
import { hashPassword, verificaPassword } from "../../src/lib/auth";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","EmailLead","InvioProgrammato","Lead","Configurazione","Utente","Brand" CASCADE');
  const pw = await hashPassword("123456");
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE", passwordHash: await hashPassword("una-buona-password") } });
  const alessia = await prisma.utente.create({ data: { nome: "Alessia Vaccaro", email: "alessia@x.it", username: "alessia", ruolo: "TELEFONISTA", passwordHash: pw } });
  const cristina = await prisma.utente.create({ data: { nome: "Cristina Rege", email: "cristina@x.it", username: "cristina", ruolo: "TELEFONISTA", passwordHash: pw } });
  await prisma.utente.updateMany({ data: { mustChangePassword: false } }); // come in produzione: password già cambiate una volta
  const b = await prisma.brand.create({ data: { nome: "P&C" } });

  console.log("1. Password di default: al primo ingresso va cambiata");
  await dove(login(fd({ username: "cristina", password: "123456" })));
  let c = (await prisma.utente.findUnique({ where: { id: cristina.id } }))!;
  verifica(c.mustChangePassword, "entrata con 123456: deve cambiare la password");
  await dove(login(fd({ username: "ugo", password: "una-buona-password" })));
  verifica(!(await prisma.utente.findUnique({ where: { id: ugo.id } }))!.mustChangePassword, "con una password buona nessun obbligo");
  g.__utente = c;
  let r = await dove(cambiaPassword(fd({ nuovaPassword: "12345678", conferma: "12345678", torna: "/lead" })));
  verifica(r?.includes("/lead?errore=") && r.includes("troppo semplice"), "una password semplice viene rifiutata, si resta sulla pagina", r);
  r = await dove(cambiaPassword(fd({ nuovaPassword: "corta", conferma: "corta", torna: "/lead" })));
  verifica(r?.includes("almeno 8"), "servono almeno 8 caratteri", r);
  r = await dove(cambiaPassword(fd({ nuovaPassword: "Serramenti2026", conferma: "Serramenti2026", torna: "/lead" })));
  c = (await prisma.utente.findUnique({ where: { id: cristina.id } }))!;
  verifica(r?.includes(";/lead") && !c.mustChangePassword && (await verificaPassword("Serramenti2026", c.passwordHash!)), "password cambiata, torna dov'era", r);

  console.log("2. Perché i lead vanno ad Alessia");
  verifica((await telefonistaDefaultPerBrand(b.id)) === alessia.id, "senza scelta: la prima telefonista in ordine alfabetico (Alessia)");
  g.__utente = ugo;
  r = await dove(impostaTelefonistaBrand(fd({ [`tel_brand_${b.id}`]: cristina.id })));
  verifica(r?.includes("Telefoniste salvate"), "telefonista del marchio salvata", r);
  verifica((await telefonistaDefaultPerBrand(b.id)) === cristina.id, "da adesso i lead P&C arrivano a Cristina");

  console.log("3. Passare i lead aperti e un lead singolo");
  const l1 = await prisma.lead.create({ data: { nome: "Mario Rossi", brandId: b.id, telefonistaId: alessia.id, fase: "IN_TARGET" } });
  const l2 = await prisma.lead.create({ data: { nome: "Anna Bianchi", brandId: b.id, telefonistaId: alessia.id, fase: "NUOVO" } });
  const chiuso = await prisma.lead.create({ data: { nome: "Chiuso Verdi", brandId: b.id, telefonistaId: alessia.id, fase: "NON_INTERESSATO" } });
  g.__utente = cristina;
  r = await dove(passaLeadAperti(fd({ da: alessia.id, a: cristina.id })));
  verifica(r?.includes("errore=") && (await prisma.lead.count({ where: { telefonistaId: cristina.id } })) === 0, "una telefonista non può spostare in blocco i lead", r);
  g.__utente = ugo;
  r = await dove(passaLeadAperti(fd({ da: alessia.id, a: cristina.id })));
  verifica(r?.includes("2 lead aperti passati a Cristina Rege"), "l'amministratore passa i 2 lead aperti", r);
  verifica((await prisma.lead.findUnique({ where: { id: chiuso.id } }))!.telefonistaId === alessia.id, "il lead chiuso resta dov'era");
  verifica((await prisma.leadEvento.count({ where: { leadId: l1.id, tipo: "lead.assegnato" } })) === 1, "nella cronologia c'è il passaggio");
  g.__utente = alessia;
  r = await dove(riassegnaLead(fd({ leadId: l1.id, telefonistaId: alessia.id, ritorno: `/lead/${l1.id}` })));
  verifica(r?.includes("errore="), "Alessia non vede più il lead di Cristina", r);
  g.__utente = cristina;
  r = await dove(riassegnaLead(fd({ leadId: l2.id, telefonistaId: alessia.id, ritorno: `/lead/${l2.id}` })));
  verifica(r?.includes(`;/lead/${l2.id}?ok=`) && (await prisma.lead.findUnique({ where: { id: l2.id } }))!.telefonistaId === alessia.id, "Cristina passa un suo lead ad Alessia", r);

  console.log("4. Nota e prossima attività dalla pagina del lead");
  r = await dove(aggiungiNotaLead(fd({ leadId: l1.id, testo: "Richiamare il marito dopo le 18", ritorno: `/lead/${l1.id}` })));
  const nota = await prisma.leadEvento.findFirst({ where: { leadId: l1.id, tipo: "lead.nota" } });
  verifica(nota?.testo === "Richiamare il marito dopo le 18" && nota.utenteNome === "Cristina Rege", "nota salvata in cronologia con chi l'ha scritta", r);
  r = await dove(spostaProssimaAttivita(fd({ leadId: l1.id, data: "2026-11-06T18:15", ritorno: `/lead/${l1.id}` })));
  const l1b = (await prisma.lead.findUnique({ where: { id: l1.id } }))!;
  verifica(l1b.scadenzaAzione?.toISOString() === "2026-11-06T17:15:00.000Z", "prossima attività spostata alle 18:15 di Roma", l1b.scadenzaAzione);
  verifica(r?.includes("Prossima attività"), "messaggio di conferma", r);

  console.log("5. Esito dalla pagina dedicata: si torna ai task di oggi");
  r = await dove(esitoLead(fd({ leadId: l1.id, esito: "NON_RISPONDE", ritorno: "/lead" })));
  verifica(r?.includes(`;/lead?fatto=${l1.id}`), "dopo l'esito torna all'elenco con il lead appena lavorato", r);
  r = await dove(esitoLead(fd({ leadId: l1.id, esito: "APPUNTAMENTO_CASA", ritorno: "/lead" })));
  verifica(r?.includes("errore=") && r.includes(`id=${l1.id}`), "errore (manca la data): torna al lead con il messaggio", r);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

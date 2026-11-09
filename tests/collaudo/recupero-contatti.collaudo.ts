// Collaudo (richieste di Rocco): «Recupero contatti» esitabili in ogni momento, modelli delle email in HTML.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/recupero-contatti.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { registraEsito } from "../../src/lib/automazioni/motore";
import { esitoLead } from "../../src/app/lead-percorso-actions";
import { salvaTestoEmail } from "../../src/app/marketing-actions";
import { PERCORSI, esitiPossibili } from "../../src/lib/automazioni/percorsi";
import { perInput } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
// il percorso in corso (che finisce con il recupero automatico dopo N mesi)
const inCorso = async (leadId: string, percorso: string) => prisma.invioProgrammato.count({ where: { leadId, stato: "IN_ATTESA", percorso } });
const finisceColRecupero = (percorso: string) => PERCORSI[percorso].at(-1)?.tipo === "RECUPERO";

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Lead","Appuntamento","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco", email: "r@x.it", username: "rocco", ruolo: "MARKETING" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });

  console.log("1. Un non interessato si richiama prima dei 3 mesi");
  const l = await prisma.lead.create({ data: { nome: "Anna Bianchi", telefono: "3471112222", email: "anna@x.it", fase: "IN_TARGET", brandId: b.id, telefonistaId: cri.id } });
  await registraEsito({ leadId: l.id, esito: "NON_INTERESSATO", utenteNome: "Cristina" });
  verifica(await inCorso(l.id, "NON_INTERESSATO") === 1 && finisceColRecupero("NON_INTERESSATO"), "parte il percorso che porta al recupero automatico fra qualche mese");
  verifica(esitiPossibili("NON_INTERESSATO").includes("APPUNTAMENTO_CASA"), "dal recupero si esita come alla prima chiamata");
  g.__utente = cri;
  const domani = new Date(Date.now() + 86_400_000); domani.setUTCHours(9, 0, 0, 0);
  const r = await dove(esitoLead(fd({ leadId: l.id, esito: "APPUNTAMENTO_CASA", data: perInput(domani), venditoreId: marco.id, indirizzo: "Via Roma 1, Rivoli", ritorno: "/lead/recupero" })));
  const dopo = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  verifica(r?.startsWith("/lead/recupero?") && r.includes("fatto="), "dopo l'esito si torna a «Recupero contatti»", r);
  verifica(dopo.fase === "APPUNTAMENTO_CASA" && await inCorso(l.id, "NON_INTERESSATO") === 0, "appuntamento fissato e recupero automatico annullato", dopo.fase);

  console.log("2. Uno che non ha mai risposto: si richiama, se ancora non risponde rientra nel recupero");
  const n = await prisma.lead.create({ data: { nome: "Paolo Neri", telefono: "3330001111", fase: "NON_RISPONDE", brandId: b.id, telefonistaId: cri.id, nonGestitoIl: new Date() } });
  await dove(esitoLead(fd({ leadId: n.id, esito: "NON_RISPONDE", ritorno: "/lead/recupero" })));
  const n2 = await prisma.lead.findUniqueOrThrow({ where: { id: n.id } });
  verifica(n2.nonGestitoIl === null && n2.fase === "NON_RISPONDE" && await inCorso(n.id, "NON_RISPONDE") === 1 && finisceColRecupero("NON_RISPONDE"), "torna nei task con nuovi tentativi e, in fondo, di nuovo il recupero", n2);

  console.log("3. Modelli delle email in HTML (Marketing)");
  g.__utente = rocco;
  const senzaTag = await dove(salvaTestoEmail(fd({ modello: "request-received", oggetto: "Grazie {nome}", testo: "solo testo", formato: "HTML" })));
  verifica(senzaTag?.includes("errore="), "HTML senza tag: rifiutato", senzaTag);
  await dove(salvaTestoEmail(fd({ modello: "request-received", oggetto: "Grazie {nome}", testo: "<html><body><h1>Ciao {nome}</h1></body></html>", formato: "HTML" })));
  const salvato = JSON.parse((await prisma.configurazione.findUniqueOrThrow({ where: { chiave: "email_testo:request-received" } })).valore);
  verifica(salvato.formato === "HTML" && salvato.testo.includes("<h1>Ciao {nome}</h1>"), "salvato come HTML", salvato);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

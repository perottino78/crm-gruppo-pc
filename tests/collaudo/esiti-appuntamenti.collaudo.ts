// Collaudo: esito degli appuntamenti (visita svolta → chiude il task del centralino; senza esito → promemoria e lista; blocco facoltativo e sblocco).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/esiti-appuntamenti.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { esitoLead } from "../../src/app/lead-percorso-actions";
import { esitoAppuntamento } from "../../src/app/calendario-actions";
import { salvaRegoleEsiti, sbloccaEsiti } from "../../src/app/esiti-actions";
import { appuntamentiSenzaEsito, regoleEsiti } from "../../src/lib/appuntamenti/esiti-server";
import { perInput, daOraRoma, chiaveGiorno, aggiungiGiorni } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
const oggi = chiaveGiorno(new Date());
const giorno = (n: number, ora = "10:00") => daOraRoma(`${aggiungiGiorni(oggi, n)}T${ora}`)!;

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Lead","Appuntamento","Cliente","Utente","Brand","Configurazione" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const admin = await prisma.utente.create({ data: { nome: "Ugo", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const gio = await prisma.utente.create({ data: { nome: "Massimo Giordano", email: "g@x.it", username: "gio", ruolo: "COMMERCIALE" } });
  await prisma.configurazione.create({ data: { chiave: "esiti_dal", valore: aggiungiGiorni(oggi, -30) } });

  console.log("1. Cristina fissa una visita, Giordano la esita «svolto»: il task di Cristina si chiude");
  const lead = await prisma.lead.create({ data: { nome: "Anna Bianchi", telefono: "3331112222", fase: "IN_TARGET", brandId: b.id, telefonistaId: cri.id, comune: "Rivoli" } });
  g.__utente = cri;
  await dove(esitoLead(fd({ leadId: lead.id, esito: "APPUNTAMENTO_CASA", data: perInput(giorno(1, "15:00")), venditoreId: gio.id, indirizzo: "Via Roma 1, Rivoli", ritorno: "/lead" })));
  let l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  verifica(l.fase === "APPUNTAMENTO_CASA" && !!l.appuntamentoId, "visita fissata in calendario", l.fase);
  g.__utente = gio;
  const r = await dove(esitoAppuntamento(fd({ id: l.appuntamentoId!, stato: "COMPLETATO", esito: "Preventivo vetrate fatto" })));
  l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  verifica(l.fase === "APPUNTAMENTO_SVOLTO" && !l.scadenzaAzione, "lead chiuso come «Appuntamento svolto»", l);
  verifica(r?.includes("task del centralino è chiuso"), "il commerciale lo vede nel messaggio", r);
  verifica(!(await prisma.invioProgrammato.count({ where: { leadId: lead.id, stato: "IN_ATTESA" } })), "nessun invio rimasto in coda");
  verifica(await prisma.leadEvento.count({ where: { leadId: lead.id, testo: { startsWith: "Appuntamento svolto · Preventivo" } } }) === 1, "nella cronologia del lead l'esito del commerciale");

  console.log("2. Visite senza esito: promemoria il giorno dopo, lista del centralino dopo 2 giorni");
  const cli = await prisma.cliente.create({ data: { nome: "Cliente Prova", brandId: b.id } });
  for (const n of [-1, -2, -3]) await prisma.appuntamento.create({ data: { clienteId: cli.id, utenteId: gio.id, dataOra: giorno(n), stato: "PROGRAMMATO" } });
  await prisma.appuntamento.create({ data: { clienteId: cli.id, utenteId: gio.id, dataOra: giorno(0, "08:00"), stato: "PROGRAMMATO" } });
  await prisma.appuntamento.create({ data: { clienteId: cli.id, utenteId: cri.id, dataOra: giorno(-3), stato: "PROGRAMMATO", tipo: "TELEFONICO" } });
  const rg = await regoleEsiti();
  verifica((await appuntamentiSenzaEsito({ giorni: rg.giorniPromemoria, utenteId: gio.id, regole: rg })).length === 3, "promemoria: 3 appuntamenti di ieri e prima (oggi no)");
  const lista = await appuntamentiSenzaEsito({ giorni: rg.giorniLista, regole: rg });
  verifica(lista.length === 2 && lista.every((a) => a.utenteId === gio.id), "lista del centralino: 2 (da 2 giorni in su), niente impegni della telefonista", lista.map((a) => a.giorni));

  console.log("3. Blocco spento di serie, poi acceso dall'amministratore e sblocco");
  const lead2 = await prisma.lead.create({ data: { nome: "Paolo Neri", telefono: "3334445555", fase: "IN_TARGET", brandId: b.id, telefonistaId: cri.id, comune: "Rosta" } });
  const fissa = () => dove(esitoLead(fd({ leadId: lead2.id, esito: "APPUNTAMENTO_CASA", data: perInput(giorno(2, "11:00")), venditoreId: gio.id, indirizzo: "Via Po 2, Rosta", ritorno: "/lead" })));
  g.__utente = cri;
  g.__utente = gio;
  verifica((await dove(salvaRegoleEsiti(fd({ giorniPromemoria: "1", giorniLista: "2", sogliaBlocco: "3", bloccoAttivo: "on" }))))?.includes("errore="), "un commerciale non cambia le regole");
  g.__utente = admin;
  verifica((await dove(salvaRegoleEsiti(fd({ giorniPromemoria: "3", giorniLista: "2", sogliaBlocco: "3" }))))?.includes("errore="), "la lista non può arrivare prima del promemoria");
  await dove(salvaRegoleEsiti(fd({ giorniPromemoria: "1", giorniLista: "2", sogliaBlocco: "3", bloccoAttivo: "on" })));
  verifica((await regoleEsiti()).bloccoAttivo, "blocco acceso");
  g.__utente = cri;
  const rifiuto = await fissa();
  verifica(rifiuto?.includes("errore=") && rifiuto.replace(/\+/g, " ").includes("senza esito"), "con 3 appuntamenti senza esito il centralino non gli dà la visita", rifiuto);
  g.__utente = admin;
  await dove(sbloccaEsiti(fd({ utenteId: gio.id, azione: "sblocca" })));
  g.__utente = cri;
  await fissa();
  verifica((await prisma.lead.findUniqueOrThrow({ where: { id: lead2.id } })).fase === "APPUNTAMENTO_CASA", "sbloccato dall'amministratore: la visita si fissa");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

// Collaudo: gestione del team (stato attivo/pausa/disattivato, mansione, passaggio del lavoro, eliminazione).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/team.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as T from "../../src/app/team-actions";
import { login } from "../../src/app/actions";
import { hashPassword } from "../../src/lib/auth";
import { telefonistaDefaultPerBrand } from "../../src/lib/leadIngest";
import { GET as esci } from "../../src/app/api/esci/route";
import { NextRequest } from "next/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent((d.split(";")[2] ?? "").replace(/\+/g, " ")); } };
const utente = (id: string) => prisma.utente.findUniqueOrThrow({ where: { id } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Assistenza","TaskPratica","Posa","Rilievo","Appuntamento","Lead","Commessa","Preventivo","Cliente","Attivita","Obiettivo","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const pw = await hashPassword("prova123");
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE", passwordHash: pw } });
  const marco = await prisma.utente.create({ data: { nome: "Marco", email: "marco@x.it", username: "marco", ruolo: "COMMERCIALE", passwordHash: pw } });
  const luca = await prisma.utente.create({ data: { nome: "Luca", email: "luca@x.it", username: "luca", ruolo: "COMMERCIALE", passwordHash: pw } });
  const cristina = await prisma.utente.create({ data: { nome: "Cristina", email: "c@x.it", username: "cristina", ruolo: "TELEFONISTA", passwordHash: pw } });
  const alessia = await prisma.utente.create({ data: { nome: "Alessia", email: "a@x.it", username: "alessia", ruolo: "TELEFONISTA", passwordHash: pw } });
  const prova = await prisma.utente.create({ data: { nome: "Creato per sbaglio", email: "s@x.it", ruolo: "COMMERCIALE" } });

  console.log("1. Solo l'amministratore");
  g.__utente = marco;
  const d0 = await dove(T.impostaStatoUtente(fd({ utenteId: luca.id, stato: "DISATTIVATO" })));
  verifica(d0?.includes("errore=") && (await utente(luca.id)).stato === "ATTIVO", "un commerciale non può cambiare lo stato", d0);

  console.log("2. Pausa: non entra più");
  g.__utente = ugo;
  const d1 = await dove(T.impostaStatoUtente(fd({ utenteId: marco.id, stato: "PAUSA", nota: "malattia fino a dicembre", ritorno: `/commerciali/${marco.id}` })));
  const m = await utente(marco.id);
  verifica(m.stato === "PAUSA" && m.statoNota === "malattia fino a dicembre" && m.statoDal, "stato, nota e data salvati", m);
  verifica(d1?.startsWith(`/commerciali/${marco.id}?ok=`), "si torna alla scheda con il messaggio", d1);
  const l1 = await dove(login(fd({ username: "marco", password: "prova123" })));
  verifica(l1 === "/login?errore=pausa", "al login: 'accesso in pausa'", l1);
  const l2 = await dove(login(fd({ username: "luca", password: "prova123" })));
  verifica(l2 === "/", "un collega attivo entra normalmente", l2);
  const r = await esci(new NextRequest("http://localhost/api/esci"));
  verifica(r.status === 307 && r.headers.get("location")?.includes("/login?errore=sessione"), "uscita forzata: sessione chiusa e ritorno al login", r.headers.get("location"));

  console.log("3. Riattivazione");
  await dove(T.impostaStatoUtente(fd({ utenteId: marco.id, stato: "ATTIVO" })));
  verifica((await utente(marco.id)).stato === "ATTIVO" && (await dove(login(fd({ username: "marco", password: "prova123" })))) === "/", "riattivato: entra di nuovo");

  console.log("4. Protezioni");
  const d2 = await dove(T.impostaStatoUtente(fd({ utenteId: ugo.id, stato: "DISATTIVATO" })));
  verifica(d2?.includes("errore=") && (await utente(ugo.id)).stato === "ATTIVO", "non si disattiva se stesso", d2);
  const d3 = await dove(T.cambiaMansioneUtente(fd({ utenteId: ugo.id, ruolo: "COMMERCIALE" })));
  verifica(d3?.includes("errore=") && (await utente(ugo.id)).ruolo === "AMMINISTRATORE", "non si toglie il ruolo di amministratore da solo", d3);

  console.log("5. Cambio di mansione");
  await dove(T.cambiaMansioneUtente(fd({ utenteId: luca.id, ruolo: "AMMINISTRATIVO", ufficio: "ORDINI" })));
  const lc = await utente(luca.id);
  verifica(lc.ruolo === "AMMINISTRATIVO" && lc.ufficio === "ORDINI", "ruolo e ufficio cambiati", lc);
  await dove(T.cambiaMansioneUtente(fd({ utenteId: luca.id, ruolo: "COMMERCIALE", ufficio: "__nessuno__" })));
  verifica((await utente(luca.id)).ufficio === null, "ufficio tolto");

  console.log("6. Marco lascia: il suo lavoro aperto passa a Luca");
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI", brandId: b.id, responsabileId: marco.id } });
  const cli2 = await prisma.cliente.create({ data: { nome: "BIANCHI", brandId: b.id, responsabileId: marco.id } });
  const pAperta = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: b.id, commercialeId: marco.id } });
  const pVinta = await prisma.preventivo.create({ data: { clienteId: cli2.id, brandId: b.id, commercialeId: marco.id, stato: "ACCETTATO" } });
  const domani = new Date(Date.now() + 86400000), ieri = new Date(Date.now() - 86400000);
  const aFut = await prisma.appuntamento.create({ data: { clienteId: cli.id, utenteId: marco.id, dataOra: domani } });
  const aPass = await prisma.appuntamento.create({ data: { clienteId: cli.id, utenteId: marco.id, dataOra: ieri, stato: "COMPLETATO" } });
  const leadV = await prisma.lead.create({ data: { nome: "Lead caldo", brandId: b.id, venditoreId: marco.id, fase: "APPUNTAMENTO_CASA" } });
  const leadNo = await prisma.lead.create({ data: { nome: "Lead perso", brandId: b.id, venditoreId: marco.id, fase: "NON_INTERESSATO" } });
  const d4 = await dove(T.passaLavoroUtente(fd({ utenteId: marco.id, aUtenteId: luca.id, ritorno: `/commerciali/${marco.id}` })));
  verifica((await prisma.cliente.count({ where: { responsabileId: luca.id } })) === 2, "clienti passati a Luca");
  verifica((await prisma.preventivo.findUniqueOrThrow({ where: { id: pAperta.id } })).commercialeId === luca.id && (await prisma.preventivo.findUniqueOrThrow({ where: { id: pVinta.id } })).commercialeId === marco.id, "offerta aperta a Luca, quella vinta resta a Marco (storico)");
  verifica((await prisma.appuntamento.findUniqueOrThrow({ where: { id: aFut.id } })).utenteId === luca.id && (await prisma.appuntamento.findUniqueOrThrow({ where: { id: aPass.id } })).utenteId === marco.id, "appuntamento futuro a Luca, quello passato resta a Marco");
  verifica((await prisma.lead.findUniqueOrThrow({ where: { id: leadV.id } })).venditoreId === luca.id && (await prisma.lead.findUniqueOrThrow({ where: { id: leadNo.id } })).venditoreId === marco.id, "lead aperto a Luca, lead chiuso resta");
  verifica(d4?.includes("Passati a Luca") && d4.includes("2 clienti"), "messaggio con il riepilogo", d4);
  await dove(T.impostaStatoUtente(fd({ utenteId: luca.id, stato: "PAUSA" })));
  const d5 = await dove(T.passaLavoroUtente(fd({ utenteId: marco.id, aUtenteId: luca.id })));
  verifica(d5?.includes("errore=") && d5.includes("non è attivo"), "non si passa lavoro a chi è in pausa", d5);
  await dove(T.impostaStatoUtente(fd({ utenteId: luca.id, stato: "ATTIVO" })));

  console.log("7. Eliminazione");
  const d6 = await dove(T.eliminaUtente(fd({ utenteId: marco.id })));
  verifica(d6?.includes("errore=") && d6.includes("Disattivato") && await prisma.utente.count({ where: { id: marco.id } }) === 1, "chi ha uno storico non si elimina: si disattiva", d6);
  const d7 = await dove(T.eliminaUtente(fd({ utenteId: prova.id })));
  verifica(d7?.startsWith("/commerciali?ok=") && await prisma.utente.count({ where: { id: prova.id } }) === 0, "chi non ha dati si elimina", d7);
  const d8 = await dove(T.eliminaUtente(fd({ utenteId: ugo.id })));
  verifica(d8?.includes("errore=") && await prisma.utente.count({ where: { id: ugo.id } }) === 1, "non si elimina se stesso");

  console.log("8. I lead nuovi non vanno a chi è in pausa");
  await prisma.configurazione.create({ data: { chiave: `lead_telefonista_${b.id}`, valore: cristina.id } });
  verifica(await telefonistaDefaultPerBrand(b.id) === cristina.id, "telefonista impostata per il marchio");
  await dove(T.impostaStatoUtente(fd({ utenteId: cristina.id, stato: "PAUSA" })));
  verifica(await telefonistaDefaultPerBrand(b.id) === alessia.id, "Cristina in pausa: i lead vanno ad Alessia");

  await prisma.$disconnect();
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

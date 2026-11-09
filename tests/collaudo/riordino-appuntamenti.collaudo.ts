// Collaudo: riordino dopo l'importazione da BConsole (doppioni, lead appesi), modifica dati del lead, sconto con 5 decimali.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/riordino-appuntamenti.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import * as rotta from "../../src/app/api/admin/riordina-appuntamenti/route";
import { modificaDatiLead } from "../../src/app/lead-percorso-actions";
import { aggiornaSconto } from "../../src/app/actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const req = (m: string) => new NextRequest("http://x/api/admin/riordina-appuntamenti", { method: m, headers: { "x-seed-key": KEY } });
const NOTA = "Creato dall'importazione degli appuntamenti di BConsole.";
const tra = (giorni: number, ora = 9) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + giorni); d.setUTCHours(ora, 0, 0, 0); return d; };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Lead","Appuntamento","RigaPreventivo","Preventivo","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const vend = await prisma.utente.create({ data: { nome: "Marco Venditore", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  // Rossi: appuntamento fissato in ONE (dal lead) e lo stesso portato da BConsole con un cliente nuovo
  const rossi = await prisma.cliente.create({ data: { nome: "Rossi Mario", telefono: "3331234567", brandId: b.id } });
  const rossiBC = await prisma.cliente.create({ data: { nome: "MARIO ROSSI", telefono: "+39 333 1234567", brandId: b.id, noteLibere: NOTA } });
  const nativo = await prisma.appuntamento.create({ data: { clienteId: rossi.id, utenteId: vend.id, dataOra: tra(3, 9) } });
  const doppio = await prisma.appuntamento.create({ data: { clienteId: rossiBC.id, utenteId: vend.id, dataOra: tra(3, 10), chiaveImport: "BC|1" } });
  // Verdi: solo in BConsole, il lead in ONE è rimasto «non risponde»
  const verdi = await prisma.cliente.create({ data: { nome: "VERDI LUCA", telefono: "3405556666", brandId: b.id, noteLibere: NOTA } });
  const bcVerdi = await prisma.appuntamento.create({ data: { clienteId: verdi.id, utenteId: vend.id, dataOra: tra(5), chiaveImport: "BC|2", luogo: "Via Roma 1, Rivoli" } });
  const lVerdi = await prisma.lead.create({ data: { nome: "Luca Verdi", telefono: "340 555 6666", fase: "NON_RISPONDE", brandId: b.id, telefonistaId: cri.id, createdAt: tra(-10), scadenzaAzione: tra(-2) } });
  await prisma.leadEvento.create({ data: { leadId: lVerdi.id, tipo: "lead.esito", testo: "Non risponde", createdAt: tra(-3) } });
  await prisma.invioProgrammato.create({ data: { leadId: lVerdi.id, run: "r1", percorso: "NON_RISPONDE", passo: 2, chiave: "r1:2", eseguiDopo: tra(1) } });
  // Neri: appuntamento in showroom già passato; lead ancora «da classificare»
  const neri = await prisma.cliente.create({ data: { nome: "Neri Paola", email: "paola@x.it", brandId: b.id } });
  await prisma.appuntamento.create({ data: { clienteId: neri.id, utenteId: vend.id, dataOra: tra(-1), chiaveImport: "BC|3", titolo: "NERI PAOLA - showroom" } });
  const lNeri = await prisma.lead.create({ data: { nome: "Paola Neri", email: "PAOLA@x.it", fase: "NUOVO", brandId: b.id, telefonistaId: cri.id, createdAt: tra(-6) } });
  // Gialli: ricontatto concordato DOPO l'appuntamento (che è vecchio): non si tocca
  const gialli = await prisma.cliente.create({ data: { nome: "Gialli Ezio", telefono: "3471112222", brandId: b.id } });
  await prisma.appuntamento.create({ data: { clienteId: gialli.id, utenteId: vend.id, dataOra: tra(-20), chiaveImport: "BC|4" } });
  const lGialli = await prisma.lead.create({ data: { nome: "Ezio Gialli", telefono: "3471112222", fase: "DA_RICHIAMARE", brandId: b.id, telefonistaId: cri.id, createdAt: tra(-30) } });
  await prisma.leadEvento.create({ data: { leadId: lGialli.id, tipo: "lead.esito", testo: "Da richiamare", createdAt: tra(-5) } });

  console.log("1. Prova: non scrive nulla");
  const p = await (await rotta.GET(req("GET"))).json();
  verifica(p.prova && p.doppioni === 1 && p.clientiDaTogliere === 1 && p.leadAvanzati === 2 && (await prisma.appuntamento.count()) === 5, "1 doppione, 1 cliente da togliere, 2 lead da avanzare", p);

  console.log("2. Esecuzione");
  const r = await (await rotta.POST(req("POST"))).json();
  verifica(r.doppioni === 1 && r.clientiTolti === 1, "doppione e cliente vuoto tolti", r);
  verifica(!(await prisma.appuntamento.findUnique({ where: { id: doppio.id } })) && await prisma.appuntamento.findUnique({ where: { id: nativo.id } }), "resta quello fissato in P&C ONE");
  verifica(!(await prisma.cliente.findUnique({ where: { id: rossiBC.id } })) && await prisma.cliente.findUnique({ where: { id: verdi.id } }), "tolto solo il cliente rimasto senza nulla");
  const v = await prisma.lead.findUniqueOrThrow({ where: { id: lVerdi.id }, include: { eventi: { orderBy: { createdAt: "desc" } }, invii: true } });
  verifica(v.fase === "APPUNTAMENTO_CASA" && v.appuntamentoId === bcVerdi.id && v.venditoreId === vend.id && v.indirizzoAppuntamento === "Via Roma 1, Rivoli" && v.scadenzaAzione?.getTime() === bcVerdi.dataOra.getTime(), "Verdi: appuntamento a casa con il venditore", v);
  verifica(v.eventi[0].tipo === "lead.esito" && v.eventi[0].testo.includes("Appuntamento fissato a CASA") && v.eventi[0].testo.includes("Marco Venditore") && v.eventi[0].utenteNome === "Automatico", "storico sintetico come un esito a mano", v.eventi[0]);
  verifica(v.invii.every((i) => i.stato === "ANNULLATO"), "le email in coda del vecchio percorso annullate");
  verifica((await prisma.cliente.findUniqueOrThrow({ where: { id: verdi.id } })).leadOrigineId === lVerdi.id, "il cliente è collegato al lead");
  const n = await prisma.lead.findUniqueOrThrow({ where: { id: lNeri.id } });
  verifica(n.fase === "APPUNTAMENTO_SHOWROOM", "Neri: appuntamento in showroom", n.fase);
  verifica((await prisma.lead.findUniqueOrThrow({ where: { id: lGialli.id } })).fase === "DA_RICHIAMARE", "Gialli: ricontatto concordato dopo l'appuntamento, non si tocca");
  const r2 = await (await rotta.POST(req("POST"))).json();
  verifica(r2.doppioni === 0 && r2.leadAvanzati === 0, "rilancio: niente da fare", r2);

  console.log("3. Modifica dei dati del lead senza farlo cliente");
  g.__utente = cri;
  const dd = await dove(modificaDatiLead(fd({ leadId: lGialli.id, ritorno: `/lead/${lGialli.id}`, nome: "Ezio Gialli", telefono: "347 111 2222", email: "Ezio@X.it", comune: "Rivoli", cap: "10098", prodotto: "Pergola" })));
  const lg = await prisma.lead.findUniqueOrThrow({ where: { id: lGialli.id }, include: { clienteGenerato: true, eventi: { where: { tipo: "lead.dati" } } } });
  verifica(dd?.includes("ok=") && lg.email === "ezio@x.it" && lg.comune === "Rivoli" && lg.prodotto === "Pergola" && !lg.clienteGenerato, "dati salvati, resta un lead", lg);
  verifica(lg.eventi[0]?.testo.includes("comune «—» → «Rivoli»") && lg.eventi[0].utenteNome === "Cristina", "la modifica resta nella cronologia", lg.eventi[0]);
  const e = await dove(modificaDatiLead(fd({ leadId: lGialli.id, ritorno: `/lead/${lGialli.id}`, nome: "Ezio Gialli", email: "non-valida" })));
  verifica(e?.includes("errore="), "email sbagliata rifiutata", e);

  console.log("4. Sconto dell'offerta con 5 decimali");
  g.__utente = ugo;
  const pr = await prisma.preventivo.create({ data: { clienteId: rossi.id, brandId: b.id, commercialeId: ugo.id } });
  await prisma.rigaPreventivo.create({ data: { preventivoId: pr.id, quantita: 1, prezzoUnitario: 10000, testoLibero: "Lavoro" } });
  await aggiornaSconto(fd({ id: pr.id, scontoPercentuale: "12,345678" }));
  const ps = await prisma.preventivo.findUniqueOrThrow({ where: { id: pr.id } });
  verifica(ps.scontoPercentuale === 12.34568 && Math.abs(ps.totaleNetto - 8765.432) < 0.0001, "12,34568% → netto 8.765,43", ps);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

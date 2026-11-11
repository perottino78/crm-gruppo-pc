// Collaudo: passaggio da Keap (coda svuotata, promemoria degli appuntamenti futuri, ricontatti come task, accensione).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/switch-keap.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import * as rotta from "../../src/app/api/admin/switch-keap/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const KEY = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const chiama = async (q: string, corpo: unknown) => (await rotta.POST(new NextRequest(`http://x/a${q}`, { method: "POST", headers: { "x-seed-key": KEY }, body: JSON.stringify(corpo) }))).json();
const fra = (ore: number) => new Date(Date.now() + ore * 3600_000);

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Lead","Appuntamento","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina Rege", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const ven = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  // appuntamento fra 2 giorni (promemoria domani), uno fra 10 ore (promemoria subito), uno escluso, uno senza venditore
  const a = await prisma.lead.create({ data: { nome: "Anna", fase: "APPUNTAMENTO_CASA", brandId: b.id, venditoreId: ven.id, appuntamentoIl: fra(48) } });
  const v = await prisma.lead.create({ data: { nome: "Vicino", fase: "APPUNTAMENTO_SHOWROOM", brandId: b.id, venditoreId: ven.id, appuntamentoIl: fra(10) } });
  const x = await prisma.lead.create({ data: { nome: "Escluso", fase: "APPUNTAMENTO_CASA", brandId: b.id, venditoreId: ven.id, appuntamentoIl: fra(30) } });
  await prisma.lead.create({ data: { nome: "Senza venditore", fase: "APPUNTAMENTO_CASA", brandId: b.id, appuntamentoIl: fra(30) } });
  await prisma.invioProgrammato.createMany({ data: [
    { leadId: a.id, run: "r1", percorso: "APPUNTAMENTO_CASA", passo: 0, chiave: "r1:0", eseguiDopo: fra(-30) },
    { leadId: x.id, run: "r2", percorso: "APPUNTAMENTO_CASA", passo: 0, chiave: "r2:0", eseguiDopo: fra(-2) },
  ] });
  // cliente con appuntamento solo in calendario (da BConsole)
  const cv = await prisma.cliente.create({ data: { nome: "Vola Romano", telefono: "3330000001", brandId: b.id } });
  await prisma.appuntamento.create({ data: { clienteId: cv.id, utenteId: ven.id, dataOra: fra(40), luogo: "Via Roma 1" } });
  // cliente per un ricontatto
  const cr = await prisma.cliente.create({ data: { nome: "Rinaldi Alesissy", email: "ale@x.it", brandId: b.id } });
  const corpo = {
    telefonista: "cristina", escludiLead: [x.id], clientiConAppuntamento: [{ keapId: "40066", clienteId: cv.id }],
    ricontatti: [
      { keapId: "33195", nome: "Alesissy Rinaldi", email: "ale@x.it", telefono: "3331112222", data: "2026-12-11T12:00", clienteId: cr.id, abbinamento: "email, telefono" },
      { keapId: "35801", nome: "Serena Porro", email: "serena@x.it", telefono: "", data: "2026-12-18T12:00" },
    ],
  };

  console.log("1. Prova: niente scritto");
  const p = await chiama("", corpo);
  verifica(p.prova && p.codaAnnullata === 2 && p.promemoria.length === 2 && p.leadCreatiPerAppuntamento.length === 1 && p.ricontattiCreati.length === 2 && await prisma.invioProgrammato.count({ where: { stato: "IN_ATTESA" } }) === 2, "prova: 2 da annullare, 2 promemoria + 1 lead da creare, 2 ricontatti", p);

  console.log("2. Esecuzione con accensione");
  const r = await chiama("?esegui=1&attiva=1", corpo);
  verifica(r.codaAnnullata === 2 && await prisma.invioProgrammato.count({ where: { stato: "ANNULLATO", errore: { contains: "Keap" } } }) === 2, "coda di prima dello switch annullata", r);
  const pa = await prisma.invioProgrammato.findMany({ where: { leadId: a.id, stato: "IN_ATTESA" }, orderBy: { passo: "asc" } });
  verifica(pa.length === 2 && Math.abs(pa[0].eseguiDopo.getTime() - fra(24).getTime()) < 120_000 && pa[0].percorso === "APPUNTAMENTO_CASA", "Anna: promemoria cliente e venditore il giorno prima", pa);
  const pv = await prisma.invioProgrammato.findMany({ where: { leadId: v.id, stato: "IN_ATTESA" } });
  verifica(pv.length === 2 && pv[0].eseguiDopo.getTime() <= Date.now(), "appuntamento fra 10 ore: promemoria subito", pv);
  verifica(!(await prisma.invioProgrammato.count({ where: { leadId: x.id, stato: "IN_ATTESA" } })), "lead escluso: nessun promemoria");
  verifica(r.promemoriaSaltati.some((s: string) => s.includes("Senza venditore")), "senza venditore: saltato", r.promemoriaSaltati);
  const lv = await prisma.lead.findFirst({ where: { nome: "Vola Romano" } });
  verifica(lv?.fase === "APPUNTAMENTO_CASA" && lv.venditoreId === ven.id && (await prisma.cliente.findUniqueOrThrow({ where: { id: cv.id } })).leadOrigineId === lv.id && await prisma.invioProgrammato.count({ where: { leadId: lv.id } }) === 2, "cliente da BConsole: lead creato con i suoi promemoria", lv);
  const lr = await prisma.lead.findFirst({ where: { nome: "Alesissy Rinaldi" }, include: { invii: true, eventi: true } });
  verifica(lr?.fase === "DA_RICHIAMARE" && lr.telefonistaId === cri.id && lr.scadenzaAzione?.toISOString() === "2026-12-11T11:00:00.000Z" && lr.invii.length === 0 && lr.note?.includes("Keap ID 33195") && lr.note.includes("Rinaldi Alesissy (email, telefono)"), "ricontatto: task di Cristina alle 12:00 di Roma, nessuna email, abbinamento nelle note", lr);
  verifica((await prisma.cliente.findUniqueOrThrow({ where: { id: cr.id } })).leadOrigineId === lr?.id, "collegato al cliente esistente");
  const lp = await prisma.lead.findFirst({ where: { nome: "Serena Porro" } });
  verifica(lp?.note?.includes("nessun cliente in P&C ONE"), "contatto senza cliente creato", lp?.note);
  verifica((await prisma.configurazione.findUnique({ where: { chiave: "automazioni_lead_attive" } }))?.valore === "1", "email automatiche accese");

  console.log("3. Rilancio: niente doppioni");
  const r2 = await chiama("?esegui=1", corpo);
  verifica(r2.ricontattiSaltati.length === 2 && r2.leadCreatiPerAppuntamento.length === 0, "ricontatti e lead non ricreati", r2);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

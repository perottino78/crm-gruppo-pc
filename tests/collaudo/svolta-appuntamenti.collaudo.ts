// Collaudo: «svolta appuntamenti» — campagna alle offerte non chiuse (CRM e BConsole), chi clicca diventa una chiamata per la
// telefonista, costo per canale con la spesa del mese. Su database LOCALE.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/svolta-appuntamenti.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { salvaCampagna } from "../../src/app/campagne-actions";
import { salvaSpeseMarketing } from "../../src/app/spese-marketing-actions";
import { contaDestinatari, filtriCampagna, accodaCampagna } from "../../src/lib/campagne/motore";
import { GET as traccia } from "../../src/app/api/traccia/[codice]/route";
import { codiceFirmato } from "../../src/lib/mail/tracciamento";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return ""; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (d.startsWith("NEXT_REDIRECT")) return decodeURIComponent(d.split(";")[2] ?? ""); throw e; } };
const clicca = (invioId: string) => traccia(new NextRequest(`http://localhost/api/traccia/x?u=${encodeURIComponent("https://gruppopec.com/promo")}`), { params: Promise.resolve({ codice: codiceFirmato(`c-${invioId}`) }) });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "SpesaMarketing","CampagnaInvio","Campagna","LeadEvento","InvioProgrammato","Lead","DocumentoBC","FatturaVendita","Commessa","RigaPreventivo","Preventivo","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cristina = await prisma.utente.create({ data: { nome: "Cristina Rege", email: "c@x.it", username: "cristina", ruolo: "TELEFONISTA" } });
  const comm = await prisma.utente.create({ data: { nome: "Nuovo Commerciale", email: "n@x.it", username: "nuovo", ruolo: "COMMERCIALE" } });
  g.__utente = ugo;
  const cli = (nome: string, email: string | null = `${nome.toLowerCase().replace(/\s/g, "")}@x.it`) => prisma.cliente.create({ data: { nome, email, telefono: "333", brandId: b.id } });
  const anna = await cli("ANNA OFFERTA CRM"), bruno = await cli("BRUNO OFFERTA BC"), carla = await cli("CARLA HA COMPRATO"), dario = await cli("DARIO MAI OFFERTA"), elena = await cli("ELENA OFFERTA VECCHIA"), franco = await cli("FRANCO ORDINE BC");
  // Anna: offerta CRM aperta a ottobre; Bruno: offerta BConsole; Carla: offerta e commessa; Elena: offerta del 2024; Franco: offerta e ordine BConsole
  await prisma.preventivo.create({ data: { clienteId: anna.id, brandId: b.id, commercialeId: comm.id, numeroOfferta: 1, totaleNetto: 8000, createdAt: new Date("2026-10-05T10:00:00Z") } });
  await prisma.documentoBC.create({ data: { id: "OFF|1", tipo: "OFFERTA", numero: "700/2026", data: new Date("2026-09-10T10:00:00Z"), clienteId: bruno.id, clienteNome: bruno.nome } });
  const pc = await prisma.preventivo.create({ data: { clienteId: carla.id, brandId: b.id, commercialeId: comm.id, numeroOfferta: 2, totaleNetto: 5000, createdAt: new Date("2026-10-01T10:00:00Z"), stato: "ACCETTATO", confermatoIl: new Date() } });
  await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: pc.id, clienteId: carla.id, brandId: b.id, totaleImponibile: 5000 } });
  await prisma.preventivo.create({ data: { clienteId: elena.id, brandId: b.id, commercialeId: comm.id, numeroOfferta: 3, totaleNetto: 3000, createdAt: new Date("2024-05-01T10:00:00Z") } });
  await prisma.documentoBC.create({ data: { id: "OFF|2", tipo: "OFFERTA", numero: "701/2026", data: new Date("2026-08-01T10:00:00Z"), clienteId: franco.id, clienteNome: franco.nome } });
  await prisma.documentoBC.create({ data: { id: "ORD|2", tipo: "ORDINE", numero: "300/2026", data: new Date("2026-08-20T10:00:00Z"), clienteId: franco.id, clienteNome: franco.nome } });

  // 1) campagna alle offerte non chiuse del 2026
  const camp = await prisma.campagna.create({ data: { nome: "Offerta ancora valida", oggetto: "{nome}, la tua offerta", testo: "Ciao {nome}", creataDa: "Ugo" } });
  await redirectA(salvaCampagna(fd({ id: camp.id, nome: "Offerta ancora valida", oggetto: "{nome}, la tua offerta", formato: "TESTO", testo: "Ciao {nome}", tracciamento: "on", situazione: "OFFERTA_APERTA", offerteDal: "2026-01-01", offerteAl: "2026-12-31", richiama: "on", richiamaTelefonistaId: cristina.id })));
  let c = await prisma.campagna.findUniqueOrThrow({ where: { id: camp.id } });
  verifica(c.situazione === "OFFERTA_APERTA" && c.richiama && c.richiamaTelefonistaId === cristina.id && c.offerteDal?.toISOString().startsWith("2025-12-31T23:00"), "salvate situazione, periodo (ora di Roma) e «chi clicca diventa una chiamata»", c);
  const n = await contaDestinatari(await filtriCampagna(c));
  verifica(n.raggiungibili === 2, "destinatari: Anna (offerta CRM) e Bruno (offerta BConsole); esclusi chi ha comprato, l'offerta del 2024 e chi non ha offerte", n);
  await accodaCampagna(c.id);
  const invii = await prisma.campagnaInvio.findMany({ where: { campagnaId: c.id } });
  verifica(invii.map((i) => i.clienteId).sort().join() === [anna.id, bruno.id].sort().join(), "in coda solo Anna e Bruno");
  // senza periodo entra anche Elena; «ha comprato» = Carla e Franco; «mai comprato» esclude Carla e Franco
  verifica((await contaDestinatari(await filtriCampagna({ ...c, offerteDal: null, offerteAl: null }))).raggiungibili === 3, "senza periodo: anche l'offerta del 2024");
  verifica((await contaDestinatari(await filtriCampagna({ ...c, situazione: "HA_COMPRATO" }))).raggiungibili === 2, "«ha già comprato»: commessa del CRM e ordine BConsole");
  verifica((await contaDestinatari(await filtriCampagna({ ...c, situazione: "MAI_COMPRATO" }))).raggiungibili === 4, "«non ha mai comprato»: tutti tranne Carla e Franco");

  // 2) Anna clicca: nasce la chiamata per Cristina
  const invAnna = invii.find((i) => i.clienteId === anna.id)!;
  await prisma.campagnaInvio.update({ where: { id: invAnna.id }, data: { stato: "INVIATA", inviataIl: new Date() } });
  const r = await clicca(invAnna.id);
  verifica(r.status === 302 && r.headers.get("location") === "https://gruppopec.com/promo", "il clic porta alla pagina della promozione");
  const annaC = await prisma.cliente.findUniqueOrThrow({ where: { id: anna.id } });
  const leadAnna = annaC.leadOrigineId ? await prisma.lead.findUnique({ where: { id: annaC.leadOrigineId }, include: { eventi: true } }) : null;
  verifica(leadAnna?.fase === "RECUPERO" && leadAnna.telefonistaId === cristina.id && leadAnna.fonte === "campagna" && leadAnna.scadenzaAzione && leadAnna.eventi.some((e) => e.testo.includes("Offerta ancora valida")), "Anna diventa un lead «Da recuperare» per Cristina, da chiamare oggi, con la nota della campagna", leadAnna);
  await clicca(invAnna.id);
  verifica((await prisma.lead.count()) === 1 && (await prisma.leadEvento.count({ where: { tipo: "campagna.clic" } })) === 1, "un secondo clic non crea doppioni");

  // 3) Bruno ha già un lead chiuso (non interessato) → riaperto; con appuntamento fissato → solo una nota
  const lb = await prisma.lead.create({ data: { nome: bruno.nome, brandId: b.id, fase: "NON_INTERESSATO", telefonistaId: cristina.id } });
  await prisma.cliente.update({ where: { id: bruno.id }, data: { leadOrigineId: lb.id } });
  await prisma.invioProgrammato.create({ data: { leadId: lb.id, run: "r", percorso: "RECUPERO", passo: 0, chiave: "r:0", eseguiDopo: new Date(Date.now() + 86400000) } });
  const invBruno = invii.find((i) => i.clienteId === bruno.id)!;
  await clicca(invBruno.id);
  const lb2 = await prisma.lead.findUniqueOrThrow({ where: { id: lb.id } });
  verifica(lb2.fase === "RECUPERO" && !!lb2.scadenzaAzione && (await prisma.invioProgrammato.count({ where: { leadId: lb.id, stato: "IN_ATTESA" } })) === 0, "Bruno «non interessato» viene riaperto e i vecchi invii in coda annullati", lb2);
  await prisma.lead.update({ where: { id: lb.id }, data: { fase: "APPUNTAMENTO_CASA", scadenzaAzione: new Date("2026-12-01T09:00:00Z") } });
  await prisma.campagnaInvio.update({ where: { id: invBruno.id }, data: { clicIl: null } });
  await clicca(invBruno.id);
  const lb3 = await prisma.lead.findUniqueOrThrow({ where: { id: lb.id } });
  verifica(lb3.fase === "APPUNTAMENTO_CASA" && lb3.scadenzaAzione?.toISOString() === "2026-12-01T09:00:00.000Z", "con l'appuntamento già fissato non cambia niente (solo una nota)");

  // 4) senza la spunta nessuna chiamata
  await prisma.campagna.update({ where: { id: c.id }, data: { richiama: false } });
  const invD = await prisma.campagnaInvio.create({ data: { campagnaId: c.id, clienteId: dario.id, email: dario.email!, stato: "INVIATA" } });
  await clicca(invD.id);
  verifica(!(await prisma.cliente.findUniqueOrThrow({ where: { id: dario.id } })).leadOrigineId, "campagna senza la spunta: il clic si conta e basta");

  // 5) costo per canale: spesa di Facebook di novembre
  const mese = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 7);
  await redirectA(salvaSpeseMarketing(fd({ mese, spesa_FACEBOOK: "1.250,50", spesa_INSTAGRAM: "", nuovo_canale: "quotalo", nuovo_importo: "80" })));
  const spese = await prisma.spesaMarketing.findMany({ where: { mese }, orderBy: { canale: "asc" } });
  verifica(spese.map((s) => `${s.canale}=${s.importo}`).join() === "FACEBOOK=1250.5,QUOTALO=80", "spese salvate (anche con la virgola), canale nuovo riconosciuto", spese);
  await redirectA(salvaSpeseMarketing(fd({ mese, spesa_FACEBOOK: "0", spesa_QUOTALO: "80" })));
  verifica((await prisma.spesaMarketing.count({ where: { mese } })) === 1, "spesa a 0 = tolta");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

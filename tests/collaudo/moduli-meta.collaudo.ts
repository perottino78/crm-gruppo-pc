// Collaudo: Impostazioni › Lead › Moduli istantanei di Meta (collega/scollega, marchio, scartati, recupero lead), lato P&C ONE.
// Gateway e Meta simulati (fetch finto). Valori tutti finti.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/moduli-meta.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { intestazioniFirmate } from "../../src/lib/meta/moduli";
import { eventIdFor } from "../../src/lib/meta/service";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
const SEGRETO = "segreto_interno_finto_0123456789abcdef";
Object.assign(process.env, {
  META_INTERNAL_SECRET: SEGRETO, META_INTERNAL_MODE: "live", META_PAGE_ID: "1039357632750262", META_EXTRA_PAGE_IDS: "107076085330590",
  META_ALLOWED_FORM_IDS: "1280816026986939", META_PAGE_BRANDS: "107076085330590=Solaris",
});
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const NUOVO = "999888777666555";
const lead = (id: string, nome: string, tel: string, form = NUOVO) => ({ id, form_id: form, created_time: "2026-11-04T10:00:00+0000", campaign_name: "FV autunno", field_data: [{ name: "full_name", values: [nome] }, { name: "phone_number", values: [tel] }, { name: "city", values: ["Torino"] }] });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","EmailLead","InvioProgrammato","MetaInboundEvent","Lead","Configurazione","Utente","Brand" CASCADE');
  const { POST: moduliPOST } = await import("../../src/app/api/lead/meta/moduli/route");
  const { POST: internoPOST } = await import("../../src/app/api/lead/meta/internal/route");
  const { collegaModuloMeta, aggiornaElencoMeta, recuperaLeadModuloMeta } = await import("../../src/app/meta-actions");
  await prisma.brand.createMany({ data: [{ nome: "P&C" }, { nome: "Solaris" }] });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Marketing", email: "r@x.it", username: "rocco", ruolo: "MARKETING" } });
  const cristina = await prisma.utente.create({ data: { nome: "Cristina Rege", email: "c@x.it", username: "cristina", ruolo: "TELEFONISTA" } });

  const firmata = (url: string, corpo: unknown, segreto = SEGRETO) => {
    const testo = JSON.stringify(corpo);
    return new NextRequest(url, { method: "POST", headers: intestazioniFirmate(segreto, testo), body: testo });
  };
  const evento = (leadgenId: string, formId: string, l: unknown) => {
    const corpo = { schema_version: 1, event_id: eventIdFor(leadgenId), mode: "live", leadgen_id: leadgenId, page_id: "107076085330590", form_id: formId, lead: l };
    const testo = JSON.stringify(corpo);
    return new NextRequest("https://one.test/api/lead/meta/internal", { method: "POST", headers: { ...intestazioniFirmate(SEGRETO, testo), "x-gpc-event-id": eventIdFor(leadgenId) }, body: testo });
  };

  console.log("1. Il gateway porta l'elenco dei moduli e chiede quelli collegati");
  let r: Response = await moduliPOST(firmata("https://one.test/api/lead/meta/moduli", { gateway_url: "https://gw.example.test", catalogo: { lettoIl: "2026-11-05T10:00:00Z", pagine: [{ id: "107076085330590", nome: "Solaris", moduli: [{ id: NUOVO, nome: "Fotovoltaico autunno", stato: "ACTIVE", leadTotali: 3 }] }] } }));
  let j = await r.json();
  verifica(r.status === 200 && JSON.stringify(j.moduli) === JSON.stringify(["1280816026986939"]), "risponde con i moduli collegati (per ora solo quello fisso)", j);
  verifica((await prisma.configurazione.findUnique({ where: { chiave: "meta_gateway_url" } }))?.valore === "https://gw.example.test", "si ricorda l'indirizzo del gateway");
  verifica((await prisma.configurazione.findUnique({ where: { chiave: "meta_catalogo" } }))?.valore.includes("Fotovoltaico autunno"), "salva l'elenco letto da Meta");
  r = await moduliPOST(firmata("https://one.test/api/lead/meta/moduli", {}, "segreto_sbagliato_0123456789abcdef"));
  verifica(r.status === 401, "firma sbagliata: 401");

  console.log("2. Lead di un modulo non collegato: non entra ma viene segnalato");
  r = await internoPOST(evento("5001", NUOVO, lead("5001", "Mario Sole", "3331112222")));
  verifica(r.status === 200 && (await prisma.lead.count()) === 0, "nessun lead creato");
  verifica((await prisma.configurazione.findUnique({ where: { chiave: "meta_scartati" } }))?.valore.includes(NUOVO), "il modulo compare tra gli scartati");

  console.log("3. Rocco collega il modulo come Solaris");
  g.__utente = cristina;
  let d = await dove(collegaModuloMeta(fd({ formId: NUOVO, brand: "Solaris" })));
  verifica(d?.includes("errore=") && d.includes("Solo amministratore e marketing"), "la telefonista non può collegare moduli", d);
  g.__utente = rocco;
  d = await dove(collegaModuloMeta(fd({ formId: NUOVO, nome: "Fotovoltaico autunno", pageId: "107076085330590", brand: "Solaris" })));
  verifica(d?.includes("collegato") && d.includes("#meta"), "conferma «collegato»", d);
  d = await dove(collegaModuloMeta(fd({ formId: "12ab", brand: "Solaris" })));
  verifica(d?.includes("ID del modulo non valido"), "ID non numerico rifiutato", d);
  j = await (await moduliPOST(firmata("https://one.test/api/lead/meta/moduli", {}))).json();
  verifica(j.moduli.includes(NUOVO), "il gateway ora lo riceve tra i collegati", j);

  console.log("4. Da adesso i lead del modulo entrano, con il marchio scelto");
  r = await internoPOST(evento("5002", NUOVO, lead("5002", "Anna Luce", "3334445555")));
  const l = await prisma.lead.findFirst({ where: { metaLeadgenId: "5002" }, include: { brand: true } });
  verifica(r.status === 200 && l?.brand.nome === "Solaris" && l.metaFormId === NUOVO, "lead creato come Solaris con il suo modulo", { status: r.status, l });
  verifica(l?.note?.includes("Campagna: FV autunno") && l.note.includes("city: Torino"), "note con campagna e risposte del modulo", l?.note);

  console.log("5. Recupero dei lead arrivati prima del collegamento (dal gateway)");
  const vere = globalThis.fetch;
  const richieste: { url: string; corpo: string }[] = [];
  globalThis.fetch = (async (u: string, init: RequestInit) => {
    richieste.push({ url: String(u), corpo: String(init.body) });
    const b = JSON.parse(String(init.body));
    if (b.azione === "lead") return new Response(JSON.stringify({ ok: true, leads: [lead("5002", "Anna Luce", "3334445555"), lead("5001", "Mario Sole", "3331112222"), lead("5003", "Senza Contatto", "")] }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, gateway_url: "https://gw.example.test", catalogo: { lettoIl: "2026-11-05T11:00:00Z", pagine: [{ id: "1039357632750262", nome: "Gruppo P&C", moduli: [{ id: "1280816026986939", nome: "Catalogo" }] }, { id: "107076085330590", nome: "Solaris", moduli: [{ id: NUOVO, nome: "Fotovoltaico autunno" }] }] } }), { status: 200 });
  }) as unknown as typeof fetch;
  d = await dove(recuperaLeadModuloMeta(fd({ formId: NUOVO, giorni: "14" })));
  verifica(d?.includes("3 lead in Meta") && d.includes("1 nuovi") && d.includes("1 c'erano già") && d.includes("1 senza telefono"), "1 nuovo, 1 già presente, 1 senza contatto", d);
  verifica(richieste[0]?.url === "https://gw.example.test/api/internal/one" && richieste[0].corpo.includes('"giorni":14'), "chiesto al gateway con i giorni scelti");
  verifica((await prisma.lead.findFirst({ where: { metaLeadgenId: "5001" }, include: { brand: true } }))?.brand.nome === "Solaris", "il lead scartato prima ora c'è, come Solaris");
  d = await dove(recuperaLeadModuloMeta(fd({ formId: "111222333444" })));
  verifica(d?.includes("Prima collega il modulo"), "modulo non collegato: niente recupero", d);
  d = await dove(aggiornaElencoMeta());
  verifica(d?.includes("2 moduli su 2 pagine"), "elenco aggiornato da Meta su richiesta", d);
  globalThis.fetch = (async () => { throw new Error("giù"); }) as unknown as typeof fetch;
  d = await dove(aggiornaElencoMeta());
  verifica(d?.includes("errore=") && d.includes("non risponde"), "gateway giù: messaggio chiaro", d);
  globalThis.fetch = vere;

  console.log("6. Scollegato: il gateway non lo riceve più tra i collegati");
  d = await dove(collegaModuloMeta(fd({ formId: NUOVO, attivo: "0" })));
  verifica(d?.includes("scollegato"), "conferma «scollegato»", d);
  j = await (await moduliPOST(firmata("https://one.test/api/lead/meta/moduli", {}))).json();
  verifica(!j.moduli.includes(NUOVO), "non più tra i collegati", j);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

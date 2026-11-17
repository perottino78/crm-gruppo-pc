// Fattura di BConsole collegata al familiare sbagliato (stesso cellulare): la riparazione la ricollega al cliente giusto.
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { POST } from "../../src/app/api/admin/ricollega-fatture-vendita/route";
import { importaVenditaBC, esitoVuoto, type DocumentoBC } from "../../src/lib/amministrazione/bconsole";
let ok = 0, ko = 0;
const verifica = (c: unknown, m: string, x?: unknown) => { if (c) { ok++; console.log("  ✓", m); } else { ko++; console.log("  ✗", m, x ?? ""); } };
(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "FatturaVendita","Scadenza","Cliente","RegistroAmministrazione" CASCADE');
  const brand = await prisma.brand.findFirst() ?? await prisma.brand.create({ data: { nome: "P&C", slug: "pc" } as never });
  const ut = await prisma.utente.findFirst() ?? await prisma.utente.create({ data: { nome: "T", email: "t@t.it", passwordHash: "x", ruolo: "AMMINISTRATORE" } as never });
  const matta = await prisma.cliente.create({ data: { nome: "Matta Roberto", telefono: "3479627188", codiceFiscale: "SCRNNL72M57L219H", bconsoleId: "33363", brandId: brand.id, responsabileId: ut.id } as never });
  const doc: DocumentoBC = { tipo: "VENDITA", bcId: "4451", sigla: "FSA", numero: "528/FE/2026", data: "2026-11-12", controparte: "SCORDA ANTONELLA", bcAnagrafica: "33522", codiceFiscale: "SCRNNL72M57L219H", imponibile: 6750, iva: 675, totale: 7425, rate: [{ bcId: "28080", descrizione: "Scad. 1/1", scadenza: "2026-11-12", importo: 7425, stato: "Insoluta" }] };
  // il CF finito sulla scheda sbagliata faceva agganciare la fattura a Matta: con la regola nuova non più
  await importaVenditaBC(doc, esitoVuoto());
  let fv = await prisma.fatturaVendita.findFirstOrThrow({ where: { chiave: "BCV|4451" } });
  verifica(fv.clienteId !== matta.id, "con la regola nuova la fattura NON va a Matta", fv.clienteId);
  // simulo il danno già fatto in produzione
  await prisma.fatturaVendita.update({ where: { id: fv.id }, data: { clienteId: matta.id, clienteNome: "Matta Roberto" } });
  const chiamata = (q: string) => POST(new NextRequest(`http://x/api/admin/ricollega-fatture-vendita${q}`, { method: "POST", headers: { "x-seed-key": process.env.SEED_SECRET || "gpc-2026-seed-x7f2" }, body: JSON.stringify([doc]) }));
  let r = await (await chiamata("")).json();
  verifica(r.prova && r.daRiparare === 1, "la prova trova 1 fattura da riparare", r);
  fv = await prisma.fatturaVendita.findFirstOrThrow({ where: { id: fv.id } });
  verifica(fv.clienteId === matta.id, "la prova non cambia nulla");
  const scorda = await prisma.cliente.create({ data: { nome: "SCORDA ANTONELLA", telefono: "3479627188", brandId: brand.id, responsabileId: ut.id } as never });
  r = await (await chiamata("?esegui=1")).json();
  fv = await prisma.fatturaVendita.findFirstOrThrow({ where: { id: fv.id } });
  verifica(fv.clienteId === scorda.id && fv.clienteNome === "SCORDA ANTONELLA", "fattura ricollegata a Scorda", [fv.clienteId, fv.clienteNome]);
  const m2 = await prisma.cliente.findUniqueOrThrow({ where: { id: matta.id } });
  verifica(m2.codiceFiscale === null, "tolto il C.F. dalla scheda di Matta");
  const sc = await prisma.scadenza.findMany({ where: { fatturaVenditaId: fv.id } });
  verifica(sc.length > 0 && sc.every((x) => x.clienteId === scorda.id), "scadenze ricollegate", sc.map((x) => x.clienteId));
  r = await (await chiamata("")).json();
  verifica(r.daRiparare === 0, "rilanciata: niente più da riparare");
  console.log(`\n${ok} controlli superati, ${ko} falliti`);
  process.exit(ko ? 1 : 0);
})();

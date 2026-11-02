// Collaudo: ruoli e permessi a spunta, zone commerciali, visibilità dei dati.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/permessi.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { salvaProfilo, eliminaProfilo, assegnaAccesso, salvaZona } from "../../src/app/permessi-actions";
import { assicuraIniziali } from "../../src/lib/permessi/server";
import { scopeClienteWhere, scopePreventivoWhere } from "../../src/lib/scope";
import { puo } from "../../src/lib/permessi/catalogo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const fresco = (id: string) => prisma.utente.findUniqueOrThrow({ where: { id } });
const clientiVisti = async (id: string) => (await prisma.cliente.findMany({ where: scopeClienteWhere(await fresco(id)), select: { nome: true }, orderBy: { nome: "asc" } })).map((c) => c.nome);

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "ProfiloAccesso","ZonaCommerciale","Preventivo","Cliente","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const resp = await prisma.utente.create({ data: { nome: "Responsabile Liguria", email: "r@x.it", username: "resp", ruolo: "COMMERCIALE" } });
  const vend = await prisma.utente.create({ data: { nome: "Venditore Genova", email: "v@x.it", username: "vend", ruolo: "COMMERCIALE" } });
  const altro = await prisma.utente.create({ data: { nome: "Venditore Torino", email: "t@x.it", username: "altro", ruolo: "COMMERCIALE" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "marketing@x.it", username: "mpec", ruolo: "MARKETING", ufficio: "MARKETING" } });
  const cli = (nome: string, provincia: string, responsabileId: string) => prisma.cliente.create({ data: { nome, provincia, responsabileId, brandId: brand.id } });
  await cli("Cliente Genova di Vend", "GE", vend.id);
  await cli("Cliente Savona senza vend", "Savona", altro.id); // della zona per provincia, anche se è di un altro
  await cli("Cliente Torino", "TO", altro.id);
  await cli("Cliente del responsabile a Milano", "MI", resp.id);

  console.log("1. Profili e zone di partenza");
  await assicuraIniziali();
  const profili = await prisma.profiloAccesso.findMany();
  const zone = await prisma.zonaCommerciale.findMany({ orderBy: { ordine: "asc" } });
  verifica(profili.length === 8 && profili.some((p) => p.nome === "Responsabile commerciale di zona" && p.visibilita === "ZONA"), "8 profili di partenza, con il responsabile di zona");
  verifica(zone.map((z) => z.nome).join(",") === "Piemonte,Liguria,Valle d'Aosta,Lombardia" && zone[1].regioni[0] === "Liguria", "zone Piemonte, Liguria, Valle d'Aosta, Lombardia");
  await assicuraIniziali();
  verifica((await prisma.profiloAccesso.count()) === 8, "rilanciato: nessun doppione");

  console.log("2. Solo l'amministratore cambia ruoli e zone");
  g.__utente = rocco;
  verifica((await redirectA(salvaZona(fd({ id: zone[1].id, nome: "Liguria" }))))?.includes("Solo l'amministratore"), "il marketing non può");

  console.log("3. Responsabile commerciale della Liguria");
  g.__utente = ugo;
  const liguria = zone[1];
  verifica((await clientiVisti(resp.id)).join("|") === "Cliente del responsabile a Milano", "prima: vede solo i suoi");
  await redirectA(salvaZona(fd({ id: liguria.id, nome: "Liguria", "r:Liguria": "on", responsabileId: resp.id })));
  const profZona = profili.find((p) => p.nome === "Responsabile commerciale di zona")!;
  await redirectA(assegnaAccesso(fd({ utenteId: resp.id, profiloId: profZona.id, zonaId: liguria.id })));
  await redirectA(assegnaAccesso(fd({ utenteId: vend.id, profiloId: "", zonaId: liguria.id })));
  const r = await fresco(resp.id);
  verifica(r.visibilita === "ZONA" && r.visibileProvince.join(",") === "GE,IM,SP,SV" && r.visibileUtenti.includes(vend.id), "province e venditori della zona calcolati", r.visibileProvince);
  verifica((await clientiVisti(resp.id)).join("|") === "Cliente Genova di Vend|Cliente Savona senza vend|Cliente del responsabile a Milano", "vede la Liguria (anche Savona scritta per esteso) e i suoi, non Torino", await clientiVisti(resp.id));
  verifica(puo(r, "report") && puo(r, "calendario.tutti") && !puo(r, "amministrazione"), "permessi del profilo: report e calendario di tutti sì, amministrazione no");
  verifica((await clientiVisti(vend.id)).join("|") === "Cliente Genova di Vend", "il venditore continua a vedere solo i suoi");
  await prisma.preventivo.create({ data: { clienteId: (await prisma.cliente.findFirstOrThrow({ where: { provincia: "GE" } })).id, brandId: brand.id, commercialeId: vend.id } });
  const prevOk = await prisma.preventivo.count({ where: scopePreventivoWhere(r) });
  verifica(prevOk === 1 && (await prisma.preventivo.count({ where: scopePreventivoWhere(await fresco(altro.id)) })) === 0, "vede le offerte del venditore della zona (il venditore di Torino no)", prevOk);

  console.log("4. Allargare la zona: Lombardia aggiunta alla Liguria");
  await redirectA(salvaZona(fd({ id: liguria.id, nome: "Liguria e Lombardia", "r:Liguria": "on", "r:Lombardia": "on", provinceExtra: "to", responsabileId: resp.id })));
  verifica((await fresco(resp.id)).visibileProvince.length === 17 && (await clientiVisti(resp.id)).length === 4, "ricalcolato da solo: 4 + 12 province + Torino aggiunta a mano", (await fresco(resp.id)).visibileProvince);

  console.log("5. Cambiare un profilo aggiorna chi ce l'ha");
  const permessiNuovi: Record<string, string> = { id: profZona.id, nome: profZona.nome, visibilita: "ZONA", "p:clienti": "on", "p:preventivi": "on", "p:calendario": "on" };
  const msg = await redirectA(salvaProfilo(fd(permessiNuovi)));
  verifica(msg?.includes("aggiornati 1 collega"), "salvato e propagato", msg);
  const r2 = await fresco(resp.id);
  verifica(!puo(r2, "report") && puo(r2, "clienti") && r2.permessi.length === 3, "il responsabile non ha più i report");

  console.log("6. Rocco responsabile dell'ufficio marketing");
  const profRM = profili.find((p) => p.nome === "Responsabile marketing")!;
  await redirectA(assegnaAccesso(fd({ utenteId: rocco.id, profiloId: profRM.id, zonaId: "", responsabileUfficio: "on" })));
  const ro = await fresco(rocco.id);
  verifica(ro.responsabileUfficio && puo(ro, "marketing") && puo(ro, "report") && puo(ro, "utenti.crea") && !puo(ro, "amministrazione"), "responsabile ufficio, marketing + report, niente amministrazione");
  verifica((await clientiVisti(rocco.id)).length === 4, "vede tutti i contatti");

  console.log("7. Profilo eliminato: si torna ai permessi del ruolo");
  const nuovo = await redirectA(salvaProfilo(fd({ nome: "Prova", copiaDa: profRM.id })));
  const prova = await prisma.profiloAccesso.findFirstOrThrow({ where: { nome: "Prova" } });
  verifica(nuovo?.includes("Prova") && prova.permessi.length === profRM.permessi.length, "creato copiando un altro profilo");
  await redirectA(assegnaAccesso(fd({ utenteId: altro.id, profiloId: prova.id, zonaId: "" })));
  await redirectA(eliminaProfilo(fd({ id: prova.id })));
  const a = await fresco(altro.id);
  verifica(a.profiloId === null && a.permessi.length === 0 && puo(a, "preventivi") && !puo(a, "marketing"), "chi lo aveva torna commerciale come prima");

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

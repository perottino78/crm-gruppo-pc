import { test } from "node:test";
import assert from "node:assert/strict";
import { permessiPredefiniti, permessiDi, puo, visibilitaDi, permessoPagina, TUTTI_PERMESSI, PROFILI_INIZIALI } from "../../src/lib/permessi/catalogo";
import { siglaProvincia, regioneDi, provinceDi, varianti, REGIONI } from "../../src/lib/zone/regioni";
import { scopeClienteWhere, scopeLeadWhere, scopePreventivoWhere } from "../../src/lib/scope";
import { vedeTutti } from "../../src/lib/calendario/eventi";

test("senza profilo: i permessi di prima per ogni ruolo", () => {
  const comm = { ruolo: "COMMERCIALE" };
  assert.ok(puo(comm, "clienti") && puo(comm, "preventivi") && puo(comm, "calendario"));
  assert.ok(!puo(comm, "ordini") && !puo(comm, "magazzino") && !puo(comm, "articoli") && !puo(comm, "calendario.tutti") && !puo(comm, "amministrazione"));
  assert.ok(puo({ ruolo: "TELEFONISTA" }, "calendario.tutti") && !puo({ ruolo: "POSATORE" }, "calendario.tutti"));
  assert.ok(puo({ ruolo: "AMMINISTRATIVO" }, "amministrazione") && puo({ ruolo: "AMMINISTRATIVO" }, "report"));
  assert.ok(puo({ ruolo: "MARKETING" }, "marketing") && puo({ ruolo: "TELEFONISTA", ufficio: "MARKETING" }, "campagne") && !puo({ ruolo: "TELEFONISTA" }, "campagne"));
  assert.ok(TUTTI_PERMESSI.every((p) => puo({ ruolo: "AMMINISTRATORE" }, p)));
  assert.equal(vedeTutti("COMMERCIALE"), false);
  assert.equal(vedeTutti({ ruolo: "COMMERCIALE", profiloId: "x", permessi: ["calendario.tutti"] }), true);
  assert.deepEqual(permessiPredefiniti("AMMINISTRATORE"), TUTTI_PERMESSI);
});

test("con profilo: valgono le spunte, l'amministratore sempre tutto", () => {
  const u = { ruolo: "COMMERCIALE", profiloId: "p1", permessi: ["clienti", "report"], visibilita: "ZONA" };
  assert.ok(puo(u, "report") && puo(u, "clienti") && !puo(u, "preventivi"));
  assert.equal(permessiDi(u).size, 2);
  assert.equal(visibilitaDi(u), "ZONA");
  assert.equal(visibilitaDi({ ruolo: "COMMERCIALE" }), "PROPRI");
  assert.equal(visibilitaDi({ ruolo: "MARKETING" }), "TUTTI");
  assert.equal(visibilitaDi({ ruolo: "AMMINISTRATORE", profiloId: "x", visibilita: "PROPRI" }), "TUTTI");
  assert.ok(puo({ ruolo: "AMMINISTRATORE", profiloId: "x", permessi: [] }, "amministrazione"));
  assert.ok(!puo(null, "clienti"));
  for (const p of PROFILI_INIZIALI) assert.ok(p.permessi.every((k) => TUTTI_PERMESSI.includes(k)), p.nome);
});

test("ogni pagina ha il suo permesso", () => {
  assert.equal(permessoPagina("/prodotti/aumenti"), "listini.modifica");
  assert.equal(permessoPagina("/prodotti/articoli/abc"), "articoli");
  assert.equal(permessoPagina("/prodotti"), "prodotti");
  assert.equal(permessoPagina("/marketing/email"), "automazioni");
  assert.equal(permessoPagina("/amministrazione/scadenzario?x=1"), "amministrazione");
  assert.equal(permessoPagina("/impostazioni/ruoli"), null);
  assert.equal(permessoPagina("/"), null);
  assert.equal(permessoPagina("/reportistica"), null);
});

test("regioni e province", () => {
  assert.equal(Object.keys(REGIONI).length, 20);
  assert.equal(Object.values(REGIONI).flat().length, 107);
  assert.equal(siglaProvincia("to"), "TO");
  assert.equal(siglaProvincia("Torino"), "TO");
  assert.equal(siglaProvincia("(CN)"), "CN");
  assert.equal(siglaProvincia("XX"), null);
  assert.equal(regioneDi("Aosta"), "Valle d'Aosta");
  assert.equal(regioneDi("SP"), "Liguria");
  assert.deepEqual(provinceDi(["Liguria"], ["pc", "zz"]), ["GE", "IM", "PC", "SP", "SV"]);
  assert.ok(varianti(["TO"]).includes("Torino") && varianti(["TO"]).includes("to"));
});

test("visibilità dei dati: suoi, zona, tutto", () => {
  const prop = { id: "u1", ruolo: "COMMERCIALE" };
  assert.deepEqual(scopePreventivoWhere(prop), { commercialeId: "u1" });
  assert.deepEqual(scopeLeadWhere(prop), { telefonistaId: "u1" });
  const zona = { id: "r1", ruolo: "COMMERCIALE", profiloId: "z", permessi: [], visibilita: "ZONA", visibileProvince: ["GE", "SP"], visibileUtenti: ["u1", "u2"] };
  const c = JSON.stringify(scopeClienteWhere(zona));
  assert.ok(c.includes('"responsabileId":{"in":["r1","u1","u2"]}') && c.includes('"provincia":{"in":') && c.includes("Genova"));
  assert.deepEqual(scopePreventivoWhere(zona).OR?.[0], { commercialeId: { in: ["r1", "u1", "u2"] } });
  assert.deepEqual(scopeLeadWhere({ ...zona, visibileUtenti: [] }), { OR: [{ telefonistaId: { in: ["r1"] } }, { venditoreId: { in: ["r1"] } }] });
  assert.deepEqual(scopeClienteWhere({ id: "m", ruolo: "MARKETING" }), {});
  assert.deepEqual(scopeClienteWhere({ id: "x", ruolo: "COMMERCIALE", profiloId: "t", permessi: [], visibilita: "TUTTI" }), {});
});

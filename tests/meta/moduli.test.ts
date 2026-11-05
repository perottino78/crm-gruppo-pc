// Moduli istantanei collegati da Impostazioni › Lead: configurazione unita, gateway che chiede a P&C ONE, elenco da Meta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggiornaModulo, annotaScartato, destinatarioOne, firmaValida, intestazioniFirmate, leggiModuli, pulisciCatalogo, spiegaErrore, unisciModuli } from "../../src/lib/meta/moduli";
import { fetchPageForms } from "../../src/lib/meta/graph";
import { handleInternalEvent, handleNotification, eventIdFor } from "../../src/lib/meta/service";
import { moduliDaOne, ricordaModuli } from "../../gateway/lib/moduli-one";
import { one } from "../../gateway/lib/handlers";
import { T, cfg, graphLead, internalHeaders, json, makeDeps, notification, rawOf, signed } from "./helpers";

const NUOVO = "999888777666555";
const ONE_URL = "https://one.example.test/api/lead/meta/internal";
const gatewayCfg = () => cfg({
  META_LOCAL_INGEST: "false",
  META_DOWNSTREAMS: "vecchio,one",
  META_DOWNSTREAM_VECCHIO_URL: "https://vecchio.example.test/hook",
  META_DOWNSTREAM_VECCHIO_SECRET: T.crmASecret,
  META_DOWNSTREAM_ONE_URL: ONE_URL,
  META_DOWNSTREAM_ONE_SECRET: T.crmBSecret,
});

test("configurazione unita: moduli fissi di Vercel + moduli collegati dal CRM con il loro marchio", () => {
  const base = cfg({ META_FORM_BRANDS: `${T.formId}=P&C` });
  const u = unisciModuli(base, [
    { formId: NUOVO, nome: "Solaris FV", brand: "Solaris", attivo: true },
    { formId: "111222333444", nome: "Spento", brand: "PTC", attivo: false },
  ]);
  assert.deepEqual(u.allowedFormIds, [T.formId, NUOVO]);
  assert.equal(u.formBrands[NUOVO], "Solaris");
  assert.equal(u.formBrands[T.formId], "P&C");
  assert.equal(u.formBrands["111222333444"], undefined, "il modulo scollegato non conta");
  assert.deepEqual(base.allowedFormIds, [T.formId], "la configurazione di partenza non cambia");
});

test("elenco salvato: lettura robusta e aggiornamento per ID", () => {
  assert.deepEqual(leggiModuli("non json"), []);
  assert.deepEqual(leggiModuli('[{"formId":"abc"},{"formId":"12345678","nome":"X"}]').map((m) => m.formId), ["12345678"]);
  let l = aggiornaModulo([], { formId: NUOVO, nome: "A", attivo: true, brand: "P&C" });
  l = aggiornaModulo(l, { formId: NUOVO, nome: "A", attivo: false, brand: "P&C" });
  assert.equal(l.length, 1);
  assert.equal(l[0].attivo, false);
  assert.equal(aggiornaModulo(l, { formId: "xx", nome: "", attivo: true }).length, 1, "ID non numerico rifiutato");
});

test("destinatario P&C ONE riconosciuto dall'indirizzo, firma andata e ritorno", () => {
  assert.equal(destinatarioOne(gatewayCfg())?.name, "one");
  assert.equal(destinatarioOne(cfg()), null);
  const corpo = JSON.stringify({ a: 1 });
  const h = intestazioniFirmate(T.crmBSecret, corpo, 1_760_000_000);
  assert.ok(firmaValida([undefined, T.crmBSecret], h["x-gpc-timestamp"], h["x-gpc-signature"], corpo, 1_760_000_100));
  assert.ok(!firmaValida([T.crmASecret], h["x-gpc-timestamp"], h["x-gpc-signature"], corpo, 1_760_000_100), "segreto di un altro CRM");
  assert.ok(!firmaValida([T.crmBSecret], h["x-gpc-timestamp"], h["x-gpc-signature"], corpo + " ", 1_760_000_100), "corpo alterato");
});

test("catalogo ripulito, scartati contati, errori spiegati", () => {
  const c = pulisciCatalogo({ lettoIl: "2026-11-05T10:00:00Z", pagine: [{ id: T.pageId, nome: "Gruppo P&C", moduli: [{ id: NUOVO, nome: "Pergole", stato: "ACTIVE", leadTotali: 12 }, { id: "<script>", nome: "x" }] }, { id: "abc" }] });
  assert.equal(c?.pagine.length, 1);
  assert.deepEqual(c?.pagine[0].moduli.map((m) => m.id), [NUOVO]);
  assert.equal(pulisciCatalogo({}), null);
  let s = annotaScartato({}, { formId: NUOVO, pageId: T.pageId }, new Date("2026-11-05T10:00:00Z"));
  s = annotaScartato(s, { formId: NUOVO, pageId: T.pageId }, new Date("2026-11-05T11:00:00Z"));
  assert.equal(s[NUOVO].n, 2);
  assert.match(spiegaErrore("graph_400_c190"), /chiave/);
  assert.match(spiegaErrore("graph_403_c200"), /Accesso ai lead/);
});

test("moduli della pagina da Meta: se serve, riprova con il token della pagina; nessun token nei risultati", async () => {
  const urls: string[] = [];
  const f = (async (u: string, init: RequestInit) => {
    urls.push(u);
    const auth = String((init.headers as Record<string, string>).Authorization);
    if (u.includes("/leadgen_forms")) {
      if (auth.includes(T.token)) return json(403, { error: { code: 200 } });
      return json(200, { data: [{ id: NUOVO, name: "Pergole", status: "ACTIVE", leads_count: 4 }, { id: "bad" }] });
    }
    return json(200, { name: "Gruppo P&C", access_token: "PAGE_TOKEN_finto" });
  }) as unknown as typeof fetch;
  const p = await fetchPageForms(T.pageId, cfg(), f);
  assert.equal(p.nome, "Gruppo P&C");
  assert.deepEqual(p.moduli.map((m) => [m.id, m.nome, m.leadTotali]), [[NUOVO, "Pergole", 4]]);
  assert.ok(urls.every((u) => !u.includes(T.token) && !u.includes("PAGE_TOKEN")), "token mai nell'URL");
  assert.ok(!JSON.stringify(p).includes("PAGE_TOKEN"));
  const ko = await fetchPageForms(T.pageId, cfg(), (async () => json(400, { error: { code: 190 } })) as unknown as typeof fetch);
  assert.equal(ko.errore, "graph_400_c190");
});

test("gateway: un modulo non nelle variabili passa se P&C ONE lo ha collegato; se ONE non risponde passa comunque; altrimenti scartato", async () => {
  for (const [extra, atteso] of [[{ moduli: [NUOVO], pagine: [] }, 1], [null, 1], [{ moduli: ["123456789"], pagine: [] }, 0]] as const) {
    const { deps } = makeDeps({ config: gatewayCfg() });
    let chiamate = 0;
    deps.moduliExtra = async () => { chiamate++; return extra as { moduli: string[]; pagine: string[] } | null; };
    const raw = rawOf(notification({ formId: NUOVO }));
    const r = await handleNotification({ raw, signature: signed(raw) }, deps);
    assert.equal(r.status, 200);
    assert.equal(r.toProcess.length, atteso, `extra=${JSON.stringify(extra)}`);
    assert.equal(chiamate, 1);
  }
  // modulo già nelle variabili: ONE non viene nemmeno interpellato
  const { deps } = makeDeps({ config: gatewayCfg() });
  let chiamate = 0;
  deps.moduliExtra = async () => { chiamate++; return { moduli: [], pagine: [] }; };
  const raw = rawOf(notification());
  assert.equal((await handleNotification({ raw, signature: signed(raw) }, deps)).toProcess.length, 1);
  assert.equal(chiamate, 0);
});

test("gateway: una pagina nuova (es. Solaris) passa se la conosce P&C ONE, anche senza toccare le variabili del gateway", async () => {
  const SOLARIS = "107076085330590";
  for (const [extra, atteso] of [[{ moduli: [NUOVO], pagine: [SOLARIS] }, 1], [{ moduli: [NUOVO], pagine: [] }, 0], [null, 0]] as const) {
    const { deps } = makeDeps({ config: gatewayCfg() });
    deps.moduliExtra = async () => extra as { moduli: string[]; pagine: string[] } | null;
    const raw = rawOf(notification({ pageId: SOLARIS, formId: NUOVO }));
    const r = await handleNotification({ raw, signature: signed(raw) }, deps);
    assert.equal(r.toProcess.length, atteso, `extra=${JSON.stringify(extra)}`);
  }
});

test("gateway → ONE: richiesta firmata con il segreto di ONE, risposta ricordata 60 secondi, ONE giù = null", async () => {
  ricordaModuli(null); // azzera
  const viste: { url: string; body: string; ok: boolean }[] = [];
  const f = (async (u: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    const body = String(init.body);
    viste.push({ url: u, body, ok: firmaValida([T.crmBSecret], h["x-gpc-timestamp"], h["x-gpc-signature"], body) });
    return json(200, { ok: true, moduli: [NUOVO, "x"], pagine: ["107076085330590"] });
  }) as unknown as typeof fetch;
  const lista = await moduliDaOne(gatewayCfg(), f, { catalogo: { pagine: [] } });
  assert.deepEqual(lista, { moduli: [NUOVO], pagine: ["107076085330590"], token: {} });
  assert.equal(viste[0].url, "https://one.example.test/api/lead/meta/moduli");
  assert.ok(viste[0].ok, "firmata con il segreto di ONE");
  assert.deepEqual((await moduliDaOne(gatewayCfg(), (async () => { throw new Error("giù"); }) as unknown as typeof fetch))?.moduli, [NUOVO], "dalla memoria");
  assert.equal(await moduliDaOne(cfg(), f), null, "senza destinatario ONE");
});

test("gateway: P&C ONE chiede elenco e lead di un modulo; senza firma giusta 401", async () => {
  const graph = (async (u: string) => {
    if (u.includes("/leadgen_forms")) return json(200, { data: [{ id: NUOVO, name: "Pergole", status: "ACTIVE" }] });
    if (u.includes(`/${NUOVO}/leads`)) return json(200, { data: [graphLead({ id: "777", form_id: NUOVO })] });
    return json(200, { name: "Gruppo P&C" });
  });
  const make = () => makeDeps({ config: gatewayCfg(), fetchImpl: graph }).deps;
  const h = one(make);
  const chiedi = (corpo: unknown, segreto = T.crmBSecret) => {
    const testo = JSON.stringify(corpo);
    return h(new Request("https://gw.example.test/api/internal/one", { method: "POST", headers: intestazioniFirmate(segreto, testo), body: testo }));
  };
  assert.equal((await chiedi({ azione: "catalogo" }, T.crmASecret)).status, 401);
  const c = await (await chiedi({ azione: "catalogo" })).json();
  assert.equal(c.catalogo.pagine[0].moduli[0].id, NUOVO);
  assert.equal(c.gateway_url, "https://gw.example.test");
  const l = await (await chiedi({ azione: "lead", form_id: NUOVO, giorni: 7 })).json();
  assert.deepEqual(l.leads.map((x: { id: string }) => x.id), ["777"]);
  assert.equal((await chiedi({ azione: "lead", form_id: "abc" })).status, 400);
});

test("ONE: evento di un modulo non collegato annotato come scartato (per poterlo collegare e recuperare)", async () => {
  const { deps } = makeDeps();
  const visti: string[] = [];
  deps.onScartato = async (ev) => { visti.push(ev.formId); };
  const corpo = JSON.stringify({ schema_version: 1, event_id: eventIdFor("4242"), mode: "live", leadgen_id: "4242", page_id: T.pageId, form_id: NUOVO, lead: graphLead({ id: "4242", form_id: NUOVO }) });
  const hh = internalHeaders(T.internal, corpo, String(Math.floor(deps.now().getTime() / 1000)));
  const r = await handleInternalEvent({ raw: Buffer.from(corpo), timestamp: hh.ts, signature: hh.sig }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(visti, [NUOVO]);
});

// ============================================================ chiavi delle pagine (Solaris senza toccare Vercel)
import { chiaviPagineDa, iscriviPagina } from "../../src/lib/meta/graph";
import { marchioDaNome, leggiPagine } from "../../src/lib/meta/moduli";
import { processDelivery } from "../../src/lib/meta/service";

test("chiave utente incollata: scambio con chiave lunga e chiavi delle pagine; nessuna chiave nell'URL tranne lo scambio previsto da Meta", async () => {
  const urls: string[] = [];
  const f = (async (u: string, init: RequestInit) => {
    urls.push(u);
    const auth = String((init.headers as Record<string, string>).Authorization ?? "");
    if (u.includes("/oauth/access_token")) return json(200, { access_token: "LUNGA_utente_finta_0123456789" });
    if (u.includes("/me/accounts")) {
      assert.ok(auth.includes("LUNGA_utente_finta"), "le pagine si leggono con la chiave lunga");
      return json(200, { data: [{ id: T.pageId, name: "Gruppo P&C", access_token: "PAGINA_pec_finta_0123456789" }, { id: "107076085330590", name: "Solaris Energia", access_token: "PAGINA_sol_finta_0123456789" }] });
    }
    if (u.includes("/app?")) return json(200, { id: "1842181417134760" });
    return json(200, { id: "99999", name: "Ugo" });
  }) as unknown as typeof fetch;
  const r = await chiaviPagineDa("UTENTE_breve_finta_0123456789", cfg(), f);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.lunga, true);
    assert.deepEqual(r.pagine.map((p) => [p.id, p.nome]), [[T.pageId, "Gruppo P&C"], ["107076085330590", "Solaris Energia"]]);
  }
  assert.ok(urls.filter((u) => !u.includes("/oauth/")).every((u) => !u.includes("finta")), "chiavi solo nell'intestazione");
  assert.equal((await chiaviPagineDa("corta", cfg(), f)).ok, false);
  const altra = (async (u: string) => (u.includes("/app?") ? json(200, { id: "123" }) : json(200, { id: "1" }))) as unknown as typeof fetch;
  const ko = await chiaviPagineDa("UTENTE_breve_finta_0123456789", cfg(), altra);
  assert.ok(!ko.ok && ko.code === "app_diversa", "chiave di un'altra app rifiutata");
});

test("attivazione lead della pagina e lettura del lead con la chiave della sua pagina", async () => {
  let viste = "";
  const ok = await iscriviPagina("107076085330590", "PAGINA_sol_finta_0123456789", cfg(), (async (u: string, init: RequestInit) => { viste = `${init.method} ${u}`; return json(200, { success: true }); }) as unknown as typeof fetch);
  assert.ok(ok.ok);
  assert.match(viste, /^POST .*\/107076085330590\/subscribed_apps\?subscribed_fields=leadgen/);
  // processDelivery usa la chiave della pagina del lead
  const { deps } = makeDeps({ config: gatewayCfg(), fetchImpl: async (u, init) => {
    if (u.startsWith("https://graph.facebook.com")) {
      assert.ok(String((init.headers as Record<string, string>).Authorization).includes("PAGINA_sol"), "chiave della pagina Solaris");
      return json(200, graphLead({ form_id: NUOVO }));
    }
    return json(200, {});
  } });
  deps.moduliExtra = async () => ({ moduli: [NUOVO], pagine: ["107076085330590"] });
  deps.tokenPagina = async (p) => (p === "107076085330590" ? "PAGINA_sol_finta_0123456789" : undefined);
  const raw = rawOf(notification({ pageId: "107076085330590", formId: NUOVO }));
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.equal(await processDelivery(deps, r.toProcess[0]), "processed");
});

test("pagine collegate dal CRM nella configurazione, marchio proposto dal nome", () => {
  const u = unisciModuli(cfg(), [], [{ id: "107076085330590", nome: "Solaris", brand: "Solaris" }]);
  assert.deepEqual(u.pageIds, [T.pageId, "107076085330590"]);
  assert.equal(u.pageBrands["107076085330590"], "Solaris");
  assert.equal(marchioDaNome("Solaris Energia srl", ["P&C", "Solaris", "PTC"], "P&C"), "Solaris");
  assert.equal(marchioDaNome("Gruppo P&C", ["P&C", "Solaris"], "P&C"), "P&C");
  assert.deepEqual(leggiPagine('[{"id":"x"},{"id":"107076085330590","nome":"S"}]').map((p) => p.id), ["107076085330590"]);
});

test("gateway: «chiave» restituisce le chiavi delle pagine, «iscrivi» usa la chiave della pagina avuta da ONE", async () => {
  ricordaModuli(null);
  const graph = async (u: string, init: RequestInit) => {
    if (u.includes("/api/lead/meta/moduli")) return json(200, { ok: true, moduli: [], pagine: ["107076085330590"], token: { "107076085330590": "PAGINA_sol_finta_0123456789" } });
    if (u.includes("/oauth/access_token")) return json(200, { access_token: "LUNGA_utente_finta_0123456789" });
    if (u.includes("/me/accounts")) return json(200, { data: [{ id: "107076085330590", name: "Solaris", access_token: "PAGINA_sol_finta_0123456789" }] });
    if (u.includes("/subscribed_apps") && init.method === "POST") return json(200, { success: true });
    if (u.includes("/app?")) return json(200, { id: "1842181417134760" });
    return json(200, { id: "1", name: "Ugo" });
  };
  const make = () => makeDeps({ config: gatewayCfg(), fetchImpl: graph }).deps;
  const h = one(make);
  const chiedi = (corpo: unknown) => { const testo = JSON.stringify(corpo); return h(new Request("https://gw.example.test/api/internal/one", { method: "POST", headers: intestazioniFirmate(T.crmBSecret, testo), body: testo })); };
  const c = await (await chiedi({ azione: "chiave", token: "UTENTE_breve_finta_0123456789" })).json();
  assert.equal(c.pagine[0].id, "107076085330590");
  assert.equal((await chiedi({ azione: "iscrivi", page_id: "107076085330590" })).status, 200);
  ricordaModuli(null);
  assert.equal((await chiedi({ azione: "iscrivi", page_id: "555" })).status, 400, "senza chiave della pagina");
});

test("chiave: pagine del Business Manager e pagine già note; se mancano autorizzazioni lo dice", async () => {
  const base = (extra: (u: string) => Response | null) => (async (u: string) => {
    const e = extra(u); if (e) return e;
    if (u.includes("/oauth/access_token")) return json(200, { access_token: "LUNGA_utente_finta_0123456789" });
    if (u.includes("/app?")) return json(200, { id: "1842181417134760" });
    if (u.includes("/me/accounts")) return json(200, { data: [] });
    if (u.includes("/me?")) return json(200, { id: "99999", name: "Ugo" });
    return json(400, { error: { code: 100 } });
  }) as unknown as typeof fetch;
  const viaBusiness = await chiaviPagineDa("UTENTE_breve_finta_0123456789", cfg(), base((u) =>
    u.includes("/me/businesses") ? json(200, { data: [{ id: "4444" }] })
    : u.includes("/4444/owned_pages") ? json(200, { data: [{ id: "107076085330590", name: "Solaris", access_token: "PAGINA_sol_finta_0123456789" }] })
    : u.includes("/4444/client_pages") ? json(200, { data: [] }) : null));
  assert.ok(viaBusiness.ok && viaBusiness.pagine[0].nome === "Solaris", "trovata nel Business Manager");
  const viaNote = await chiaviPagineDa("UTENTE_breve_finta_0123456789", cfg(), base((u) =>
    u.includes(`/${T.pageId}?`) ? json(200, { id: T.pageId, name: "Gruppo P&C", access_token: "PAGINA_pec_finta_0123456789" }) : null), [T.pageId]);
  assert.ok(viaNote.ok && viaNote.pagine[0].id === T.pageId, "trovata chiedendo la pagina nota");
  const senza = await chiaviPagineDa("UTENTE_breve_finta_0123456789", cfg(), base((u) =>
    u.includes("/me/permissions") ? json(200, { data: [{ permission: "pages_show_list", status: "granted" }, { permission: "leads_retrieval", status: "declined" }] }) : null));
  assert.ok(!senza.ok && senza.code.startsWith("permessi_mancanti:") && senza.code.includes("leads_retrieval") && !senza.code.includes("pages_show_list"), !senza.ok ? senza.code : "");
  assert.match(spiegaErrore(!senza.ok ? senza.code : ""), /mancano queste autorizzazioni: pages_read_engagement/);
});

// Collaudo: Google Calendar nei due sensi (account amministrazione, calendari «BCONSOLE»), con un Google simulato.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/google.collaudo.ts
import http from "node:http";

// ── Google finto: OAuth (codice «codice-buono»), elenco calendari, eventi in memoria ─────────────────────
type Ev = Record<string, unknown> & { id: string; etag: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
const calendari: Record<string, { nome: string; eventi: Map<string, Ev> }> = {
  "marco-vecchio@group": { nome: "Marco Piccatti BCONSOLE", eventi: new Map() },
  "marco-finale@group": { nome: "Marco Piccatti BCONSOLE finale", eventi: new Map() },
  "ugo@group": { nome: "Ugo Perottino BCONSOLE finale", eventi: new Map() },
  "festivi@group": { nome: "Festività in Italia", eventi: new Map() },
};
let n = 0;
const scritture: string[] = [];
const server = http.createServer((req, res) => {
  let corpo = "";
  req.on("data", (d) => (corpo += d));
  req.on("end", () => {
    const url = new URL(req.url!, "http://x");
    const manda = (s: number, j?: unknown) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(j === undefined ? "" : JSON.stringify(j)); };
    if (url.pathname === "/token") {
      const p = new URLSearchParams(corpo);
      if (p.get("client_secret") !== "segreto") return manda(401, { error: "invalid_client" });
      if (p.get("grant_type") === "authorization_code") {
        if (p.get("code") !== "codice-buono") return manda(400, { error: "invalid_grant", error_description: "Codice non valido" });
        const idt = `x.${Buffer.from(JSON.stringify({ email: "amministrazione@example.com" })).toString("base64url")}.y`;
        return manda(200, { access_token: "acc", refresh_token: "rifresh", id_token: idt, expires_in: 3600 });
      }
      return p.get("refresh_token") === "rifresh" ? manda(200, { access_token: "acc", expires_in: 3600 }) : manda(400, { error: "invalid_grant" });
    }
    if (req.headers.authorization !== "Bearer acc") return manda(401, { error: "auth" });
    if (url.pathname === "/calendar/v3/users/me/calendarList") return manda(200, { items: Object.entries(calendari).map(([id, c]) => ({ id, summary: c.nome, accessRole: "owner" })) });
    const m = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!m) return manda(404);
    const cal = calendari[decodeURIComponent(m[1])];
    if (!cal) return manda(404);
    const id = m[2];
    if (req.method === "GET" && !id) {
      const da = new Date(url.searchParams.get("timeMin")!), a = new Date(url.searchParams.get("timeMax")!);
      return manda(200, { items: [...cal.eventi.values()].filter((e) => { const i = new Date(e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`); return i >= da && i < a; }) });
    }
    if (req.method === "PUT" && id) { scritture.push(`PUT ${id}`); if (!cal.eventi.has(id)) return manda(404, { error: "notFound" }); const e = { ...JSON.parse(corpo), id, etag: `"e${++n}"` }; cal.eventi.set(id, e); return manda(200, e); }
    if (req.method === "POST" && !id) { const b = JSON.parse(corpo); scritture.push(`POST ${b.id}`); const e = { ...b, etag: `"e${++n}"` }; cal.eventi.set(b.id, e); return manda(200, e); }
    if (req.method === "DELETE" && id) { scritture.push(`DELETE ${id}`); return manda(cal.eventi.delete(id) ? 204 : 410); }
    manda(405);
  });
});
process.env.GOOGLE_OAUTH_BASE = "http://127.0.0.1:2610";
process.env.GOOGLE_API_BASE = "http://127.0.0.1:2610";
process.env.GOOGLE_AUTH_URL = "http://127.0.0.1:2610/auth";
process.env.GOOGLE_REDIRECT_BASE = "http://localhost:3000";

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { salvaCredenziali, salvaAbbinamentiGoogle, sincronizzaGoogleOra, scollegaGoogleOra } from "../../src/app/google-actions";
import { scollegaNextcloud } from "../../src/app/nextcloud-actions";
import { GET as collega } from "../../src/app/api/google/collega/route";
import { GET as callback } from "../../src/app/api/google/callback/route";
import { configGoogle } from "../../src/lib/calendario/google";
import { idGoogleDi as idGoogle } from "../../src/lib/calendario/googlecal";
import { eventiPeriodo } from "../../src/lib/calendario/server";
import { chiaveGiorno, daOraRoma } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const loc = (r: Response) => decodeURIComponent(r.headers.get("location") ?? "").replace(/\+/g, " ");

async function main() {
  await new Promise<void>((r) => server.listen(2610, r));
  await prisma.$executeRawUnsafe('TRUNCATE "EventoNextcloud","Riunione","Appuntamento","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  const cliente = await prisma.cliente.create({ data: { nome: "Rossi Mario", brandId: b.id } });
  const domani = chiaveGiorno(new Date(Date.now() + 86_400_000));
  // appuntamento che c'è già (prima del collegamento): non va mai toccato né scritto su Google
  const vecchio = await prisma.appuntamento.create({ data: { clienteId: cliente.id, utenteId: marco.id, dataOra: daOraRoma(`${domani}T09:00`)!, tipo: "COMMERCIALE", durataMin: 60, createdAt: new Date(Date.now() - 86_400_000) } });
  // su Google: il commerciale si segna «occupato» e un evento «libero»
  const fin = calendari["marco-finale@group"].eventi;
  fin.set("occ1", { id: "occ1", etag: '"o1"', summary: "Occupato", start: { dateTime: daOraRoma(`${domani}T15:00`)!.toISOString() }, end: { dateTime: daOraRoma(`${domani}T18:00`)!.toISOString() } });
  fin.set("lib1", { id: "lib1", etag: '"l1"', summary: "Promemoria", transparency: "transparent", start: { dateTime: daOraRoma(`${domani}T12:00`)!.toISOString() } });
  g.__utente = ugo;

  console.log("1. Credenziali e collegamento");
  let x = await dove(salvaCredenziali(fd({ clientId: "sbagliato", clientSecret: "segreto" })));
  verifica(x?.includes("apps.googleusercontent.com"), "Client ID non valido: messaggio chiaro", x);
  x = await dove(salvaCredenziali(fd({ clientId: "123-abc.apps.googleusercontent.com", clientSecret: "segreto" })));
  verifica(x?.includes("Credenziali salvate"), "credenziali salvate", x);
  const sec = await prisma.configurazione.findUnique({ where: { chiave: "google_client_secret" } });
  verifica(sec && !sec.valore.includes("segreto"), "client secret salvato cifrato");
  g.__utente = marco;
  let r = await collega(new NextRequest("http://localhost:3000/api/google/collega"));
  verifica(loc(r).includes("Solo l'amministratore"), "un commerciale non può collegare", loc(r));
  g.__utente = ugo;
  r = await collega(new NextRequest("http://localhost:3000/api/google/collega"));
  const consenso = new URL(r.headers.get("location")!);
  verifica(consenso.pathname === "/auth" && consenso.searchParams.get("access_type") === "offline" && consenso.searchParams.get("redirect_uri") === "http://localhost:3000/api/google/callback", "porta al consenso di Google (accesso permanente, indirizzo di ritorno giusto)", consenso.toString());
  r = await callback(new NextRequest(`http://localhost:3000/api/google/callback?state=falso.1.x&code=codice-buono`));
  verifica(loc(r).includes("scaduto o non valido"), "ritorno con firma falsa rifiutato", loc(r));
  r = await callback(new NextRequest(`http://localhost:3000/api/google/callback?state=${consenso.searchParams.get("state")}&code=codice-buono`));
  verifica(loc(r).includes("amministrazione@example.com") && loc(r).includes("3 calendari «BCONSOLE», 2 abbinati"), "collegato: account letto, solo i calendari BCONSOLE, abbinati alle persone", loc(r));
  let cfg = await configGoogle();
  verifica(cfg.collegato && cfg.dal, "accesso permanente salvato e data del collegamento");
  const perId = new Map(cfg.calendari.map((c) => [c.id, c]));
  verifica(perId.get("marco-finale@group")?.utenteId === marco.id && perId.get("marco-vecchio@group")?.utenteId === null && !perId.has("festivi@group"), "Marco: vince il calendario «finale», il vecchio resta fuori, i festivi non ci sono");

  console.log("2. Google → P&C ONE (occupato)");
  x = await dove(sincronizzaGoogleOra());
  verifica(x?.includes("1 impegni letti da Google"), "sincronizzazione: letto l'«occupato» (non il «libero»)", x);
  const est = (await eventiPeriodo({ da: daOraRoma(`${domani}T00:00`)!, a: daOraRoma(`${domani}T23:59`)!, utenteId: marco.id })).filter((e) => e.tipo === "ESTERNO");
  verifica(est.length === 1 && est[0].titolo.includes("Occupato"), "nel calendario di Marco compare l'occupato di Google", est.map((e) => e.titolo));
  verifica(!scritture.some((s) => s.includes(idGoogle(`APPUNTAMENTO:${vecchio.id}`))), "l'appuntamento che c'era già non viene scritto su Google");
  verifica(scritture.length === 0, "nessuna scrittura su Google per gli impegni che c'erano già", scritture);

  console.log("3. P&C ONE → Google (solo i nuovi)");
  const nuovo = await prisma.appuntamento.create({ data: { clienteId: cliente.id, utenteId: marco.id, dataOra: daOraRoma(`${domani}T11:00`)!, tipo: "COMMERCIALE", durataMin: 60, luogo: "Rosta" } });
  const daBc = await prisma.appuntamento.create({ data: { clienteId: cliente.id, utenteId: marco.id, dataOra: daOraRoma(`${domani}T16:00`)!, tipo: "COMMERCIALE", durataMin: 60, chiaveImport: "BC|999" } });
  await dove(sincronizzaGoogleOra());
  const idNuovo = idGoogle(`APPUNTAMENTO:${nuovo.id}`);
  const suG = fin.get(idNuovo);
  verifica(suG && (suG.summary as string).includes("Rossi Mario") && (suG.extendedProperties as { private: { one: string } }).private.one === `APPUNTAMENTO:${nuovo.id}`, "l'appuntamento nuovo è sul calendario Google di Marco", suG);
  verifica(!fin.has(idGoogle(`APPUNTAMENTO:${daBc.id}`)) && !calendari["marco-vecchio@group"].eventi.size, "quello portato da BConsole no; nel calendario vecchio niente");
  const est2 = (await eventiPeriodo({ da: daOraRoma(`${domani}T00:00`)!, a: daOraRoma(`${domani}T23:59`)!, utenteId: marco.id })).filter((e) => e.tipo === "ESTERNO");
  verifica(est2.length === 1, "l'evento scritto da P&C ONE non torna indietro come «Da Google» (niente doppioni)", est2.map((e) => e.titolo));
  scritture.length = 0;
  await dove(sincronizzaGoogleOra());
  verifica(scritture.length === 0, "seconda sincronizzazione: nulla da riscrivere", scritture);

  console.log("4. Vince P&C ONE");
  fin.set(idNuovo, { ...fin.get(idNuovo)!, etag: '"mano"', start: { dateTime: daOraRoma(`${domani}T17:00`)!.toISOString() } });
  await dove(sincronizzaGoogleOra());
  verifica(fin.get(idNuovo)!.start!.dateTime === daOraRoma(`${domani}T11:00`)!.toISOString(), "spostato su Google → rimesso all'ora di P&C ONE");
  const app = await prisma.appuntamento.findUnique({ where: { id: nuovo.id } });
  verifica(app?.dataOra.getTime() === daOraRoma(`${domani}T11:00`)!.getTime() && app?.stato === "PROGRAMMATO", "l'appuntamento in P&C ONE non è cambiato");
  fin.delete(idNuovo);
  await dove(sincronizzaGoogleOra());
  verifica(fin.has(idNuovo), "cancellato su Google → rimesso");
  await prisma.appuntamento.update({ where: { id: nuovo.id }, data: { stato: "ANNULLATO" } });
  await dove(sincronizzaGoogleOra());
  verifica(!fin.has(idNuovo), "annullato in P&C ONE → tolto da Google");
  verifica(fin.has("occ1") && fin.has("lib1") && !scritture.some((s) => /occ1|lib1/.test(s)), "gli impegni scritti da altri su Google non sono mai stati toccati");
  verifica((await prisma.appuntamento.findUnique({ where: { id: vecchio.id } }))?.stato === "PROGRAMMATO", "l'appuntamento che c'era già è rimasto com'era");

  console.log("5. Abbinamenti a mano, scollega");
  cfg = await configGoogle();
  const form: Record<string, string> = {};
  cfg.calendari.forEach((c, i) => { if (c.utenteId) form[`utente_${i}`] = c.utenteId; });
  x = await dove(salvaAbbinamentiGoogle(fd(form)));
  verifica(x?.includes("0 in cui P&C ONE scrive"), "togliendo «Scrivi qui» P&C ONE non scrive più", x);
  await prisma.eventoNextcloud.create({ data: { href: "/nc/x.ics", calendario: "/nc/", uid: "x", utenteId: marco.id, titolo: "Da Nextcloud", inizio: new Date(), fine: new Date(Date.now() + 3600_000) } });
  await dove(scollegaNextcloud());
  verifica((await prisma.eventoNextcloud.count({ where: { calendario: { startsWith: "google:" } } })) > 0 && (await prisma.eventoNextcloud.count({ where: { href: "/nc/x.ics" } })) === 0, "scollegare Nextcloud non toglie gli impegni di Google");
  x = await dove(scollegaGoogleOra());
  verifica(x?.includes("Google scollegato") && !(await configGoogle()).collegato && (await prisma.eventoNextcloud.count()) === 0, "scollega Google: niente più accesso né impegni letti", x);
  verifica(fin.has("occ1"), "su Google non si cancella nulla");

  console.log(`\n${ok} ok, ${ko} falliti`);
  server.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

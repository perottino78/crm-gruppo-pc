// Collaudo: sincronizzazione con i calendari Nextcloud (CalDAV) nei due sensi, con un server Nextcloud simulato.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/nextcloud.collaudo.ts
import http from "node:http";

// ── Nextcloud finto: utente «ugo», password «app-pass», calendari in memoria ──────────────────────────
const CAL = "/remote.php/dav/calendars/ugo/";
const calendari: Record<string, { nome: string; risorse: Map<string, { etag: string; ics: string }> }> = {
  [`${CAL}marco-piccatti-bconsole/`]: { nome: "Marco Piccatti BCONSOLE", risorse: new Map() },
  [`${CAL}azienda-bconsole/`]: { nome: "Azienda BCONSOLE", risorse: new Map() },
};
let n = 0;
const richieste: string[] = [];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const server = http.createServer((req, res) => {
  let corpo = "";
  req.on("data", (d) => (corpo += d));
  req.on("end", () => {
    richieste.push(`${req.method} ${req.url}`);
    if (!["ugo", "ugo@gruppopec.com"].some((l) => req.headers.authorization === `Basic ${Buffer.from(`${l}:app-pass`).toString("base64")}`)) { res.writeHead(401); return res.end(); }
    const url = decodeURIComponent(req.url!.split("?")[0]);
    if (req.method === "PROPFIND" && url === "/remote.php/dav/") {
      res.writeHead(207, { "Content-Type": "application/xml" });
      return res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/ugo/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`);
    }
    if (req.method === "PROPFIND" && url === CAL) {
      res.writeHead(207, { "Content-Type": "application/xml" });
      return res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>${CAL}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>` +
        Object.entries(calendari).map(([h, c]) => `<d:response><d:href>${h}</d:href><d:propstat><d:prop><d:displayname>${c.nome}</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join("") + `</d:multistatus>`);
    }
    const cal = Object.keys(calendari).find((h) => url.startsWith(h));
    if (!cal) { res.writeHead(404); return res.end(); }
    const ris = calendari[cal].risorse;
    if (req.method === "REPORT") {
      res.writeHead(207, { "Content-Type": "application/xml" });
      return res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">` +
        [...ris.entries()].map(([h, r]) => `<d:response><d:href>${h}</d:href><d:propstat><d:prop><d:getetag>"${r.etag}"</d:getetag><cal:calendar-data>${esc(r.ics)}</cal:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join("") + `</d:multistatus>`);
    }
    if (req.method === "PUT") { const etag = `e${++n}`; const nuovo = !ris.has(url); ris.set(url, { etag, ics: corpo }); res.writeHead(nuovo ? 201 : 204, { ETag: `"${etag}"` }); return res.end(); }
    if (req.method === "DELETE") { const c = ris.delete(url); res.writeHead(c ? 204 : 404); return res.end(); }
    if (req.method === "GET") { const r = ris.get(url); res.writeHead(r ? 200 : 404); return res.end(r?.ics ?? ""); }
    res.writeHead(405); res.end();
  });
});
const evento = (uid: string, inizio: string, fine: string, titolo: string) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `UID:${uid}`, `DTSTART;TZID=Europe/Rome:${inizio}`, `DTEND;TZID=Europe/Rome:${fine}`, `SUMMARY:${titolo}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");

import { prisma } from "../../src/lib/prisma";
import { salvaAccesso, salvaAbbinamenti, sincronizzaOra } from "../../src/app/nextcloud-actions";
import { configNextcloud } from "../../src/lib/calendario/nextcloud";
import { eventiPeriodo } from "../../src/lib/calendario/server";
import { chiaveGiorno } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };

async function main() {
  await new Promise<void>((r) => server.listen(2600, r));
  await prisma.$executeRawUnsafe('TRUNCATE "EventoNextcloud","Riunione","Appuntamento","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  const cliente = await prisma.cliente.create({ data: { nome: "Rossi Mario", brandId: b.id } });
  const domani = chiaveGiorno(new Date(Date.now() + 86_400_000)).replace(/-/g, "");
  const d10 = new Date(Date.now() + 86_400_000); 
  const app = await prisma.appuntamento.create({ data: { clienteId: cliente.id, utenteId: marco.id, dataOra: (await import("../../src/lib/calendario/tempo")).daOraRoma(`${chiaveGiorno(d10)}T10:00`)!, tipo: "COMMERCIALE", durataMin: 60 } });
  const riu = await prisma.riunione.create({ data: { titolo: "Riunione commerciale", dataOra: (await import("../../src/lib/calendario/tempo")).daOraRoma(`${chiaveGiorno(d10)}T08:00`)!, partecipanti: [marco.id, ugo.id] } });
  // su Nextcloud: lo smart working (solo lì) e il doppione BConsole dello stesso appuntamento
  const mc = `${CAL}marco-piccatti-bconsole/`;
  calendari[mc].risorse.set(`${mc}sw.ics`, { etag: "x1", ics: evento("sw-1", `${domani}T150000`, `${domani}T180000`, "Smart Working") });
  calendari[mc].risorse.set(`${mc}bc.ics`, { etag: "x2", ics: evento("bc-1", `${domani}T101000`, `${domani}T110000`, "Rossi Mario - CONFERMATO") });
  g.__utente = ugo;

  console.log("1. Collegamento e abbinamento dei calendari");
  let x = await dove(salvaAccesso(fd({ url: "http://127.0.0.1:2600", utente: "ugo", password: "sbagliata" })));
  verifica(x?.includes("401"), "password sbagliata: messaggio chiaro", x);
  x = await dove(salvaAccesso(fd({ url: "http://127.0.0.1:2600", utente: "ugo@gruppopec.com", password: "app-pass" })));
  verifica(x?.includes("2 calendari trovati"), "si entra anche con l'email: la cartella dei calendari la dice Nextcloud", x);
  x = await dove(salvaAccesso(fd({ url: "http://127.0.0.1:2600/index.php/apps/calendar", utente: "ugo", password: "app-pass" })));
  let cfg = await configNextcloud();
  verifica(x?.includes("2 calendari trovati, 1 abbinati"), "trovati i calendari, Marco abbinato dal nome (anche con l'indirizzo copiato dal browser)", x);
  verifica(cfg.calendari.find((c) => c.nome.startsWith("Marco"))?.utenteId === marco.id && !cfg.calendari.find((c) => c.nome.startsWith("Azienda"))?.utenteId, "Azienda resta senza persona");
  verifica(!JSON.stringify(await prisma.configurazione.findMany()).includes("app-pass"), "la password è salvata cifrata");
  const i = cfg.calendari.findIndex((c) => c.nome.startsWith("Marco"));
  await dove(salvaAbbinamenti(fd({ [`utente_${i}`]: marco.id, [`scrivi_${i}`]: "1" })));

  console.log("2. Prima sincronizzazione");
  x = await dove(sincronizzaOra());
  const scritti = [...calendari[mc].risorse.keys()].filter((h) => h.includes("one-"));
  verifica(scritti.length === 2 && scritti.some((h) => h.includes("appuntamento")) && scritti.some((h) => h.includes("riunione")), "appuntamento e riunione di Marco scritti nel suo calendario", { x, scritti });
  verifica(x?.includes("Scritti 2"), "riepilogo della sincronizzazione", x);
  const ev = await eventiPeriodo({ da: new Date(), a: new Date(Date.now() + 3 * 86_400_000), utenteId: marco.id });
  const est = ev.filter((e) => e.tipo === "ESTERNO");
  verifica(est.length === 1 && est[0].titolo === "Smart Working", "lo smart working compare in P&C ONE, il doppione BConsole no", est.map((e) => e.titolo));
  x = await dove(sincronizzaOra());
  verifica(x?.includes("Scritti 0, aggiornati 0, tolti 0"), "senza cambi non riscrive nulla", x);

  console.log("3. Cambi fatti su Nextcloud agli impegni di P&C ONE: vince P&C ONE");
  const hApp = scritti.find((h) => h.includes("appuntamento"))!, hRiu = scritti.find((h) => h.includes("riunione"))!;
  const r0 = calendari[mc].risorse.get(hApp)!;
  calendari[mc].risorse.set(hApp, { etag: "mosso", ics: r0.ics.replace(/DTSTART:\d{8}T\d{6}Z/, `DTSTART;TZID=Europe/Rome:${domani}T120000`).replace(/DTEND:\d{8}T\d{6}Z/, `DTEND;TZID=Europe/Rome:${domani}T133000`) });
  calendari[mc].risorse.delete(hRiu);
  x = await dove(sincronizzaOra());
  const app2 = (await prisma.appuntamento.findUnique({ where: { id: app.id } }))!;
  verifica(app2.dataOra.getTime() === app.dataOra.getTime() && app2.durataMin === app.durataMin && app2.stato === app.stato, "appuntamento spostato su Nextcloud → in P&C ONE resta com'era (P&C ONE ha la precedenza)", { x, d: app2.dataOra });
  verifica(!/DTSTART;TZID=Europe\/Rome:\d{8}T120000/.test(calendari[mc].risorse.get(hApp)?.ics ?? "") && calendari[mc].risorse.get(hApp)?.etag !== "mosso", "…e su Nextcloud torna com'è in P&C ONE", calendari[mc].risorse.get(hApp)?.ics);
  verifica((await prisma.riunione.findUnique({ where: { id: riu.id } }))?.stato !== "ANNULLATO" && [...calendari[mc].risorse.keys()].some((h) => h.includes("riunione")), "riunione cancellata su Nextcloud → non annullata in P&C ONE e riscritta su Nextcloud", x);

  console.log("4. Cambi fatti in P&C ONE vanno su Nextcloud");
  await prisma.appuntamento.update({ where: { id: app.id }, data: { titolo: "Preventivo infissi" } });
  x = await dove(sincronizzaOra());
  verifica(calendari[mc].risorse.get(hApp)?.ics.includes("Preventivo infissi") && x?.includes("aggiornati 1"), "titolo cambiato in P&C ONE → aggiornato su Nextcloud", x);
  await prisma.appuntamento.update({ where: { id: app.id }, data: { stato: "ANNULLATO" } });
  x = await dove(sincronizzaOra());
  verifica(!calendari[mc].risorse.has(hApp), "annullato in P&C ONE → tolto da Nextcloud", x);
  calendari[mc].risorse.delete(`${mc}sw.ics`);
  await dove(sincronizzaOra());
  verifica((await prisma.eventoNextcloud.count({ where: { titolo: "Smart Working" } })) === 0, "impegno cancellato su Nextcloud → sparisce anche da P&C ONE");
  verifica(!richieste.some((r) => r.includes("azienda") && !r.startsWith("PROPFIND")), "il calendario senza persona non viene toccato");

  console.log(`\n${ok} ok, ${ko} ko`);
  server.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

// Collaudo: campagne email (filtri, invio a blocchi, disiscrizione, avvisi di scadenza 3-2-1).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/campagne-email.collaudo.ts
import net from "node:net";

// ── server SMTP finto: raccoglie le email inviate ─────────────────────────
const posta: { a: string[]; dati: string }[] = [];
const smtp = net.createServer((s) => {
  let inData = false, buf = "", rcpt: string[] = [];
  s.write("220 finto\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    if (inData) {
      const i = buf.indexOf("\r\n.\r\n");
      if (i < 0) return;
      posta.push({ a: rcpt, dati: buf.slice(0, i) });
      buf = buf.slice(i + 5); inData = false; rcpt = [];
      s.write("250 ok\r\n");
    }
    let j;
    while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
      const riga = buf.slice(0, j); buf = buf.slice(j + 2);
      const c = riga.slice(0, 4).toUpperCase();
      if (c === "EHLO") s.write("250-finto\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (c === "AUTH") s.write("235 ok\r\n");
      else if (c === "RCPT") { rcpt.push(riga.match(/<(.+)>/)?.[1] ?? ""); s.write("250 ok\r\n"); }
      else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); }
      else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); }
      else s.write("250 ok\r\n");
    }
  });
});

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { accodaCampagna, eseguiCampagne } from "../../src/lib/campagne/motore";
import { salvaCampagna } from "../../src/app/campagne-actions";
import { salvaZona } from "../../src/app/permessi-actions";
import { GET as traccia } from "../../src/app/api/traccia/[codice]/route";
import { codiceFirmato } from "../../src/lib/mail/tracciamento";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[] | File>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const chiama = (codice: string, q = "") => traccia(new NextRequest(`http://localhost/api/traccia/${codice}${q}`), { params: Promise.resolve({ codice }) });
// il corpo dell'email arriva codificato (quoted-printable): si toglie la codifica per leggerlo
const decodifica = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));

async function main() {
  await new Promise<void>((r) => smtp.listen(2533, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2533", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "CampagnaInvio","Campagna","Lead","Cliente","Configurazione","ZonaCommerciale","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco", email: "marketing@x.it", username: "mpec", ruolo: "MARKETING" } });
  await prisma.cliente.create({ data: { nome: "ROSSI MARIO", nomePersona: "Mario", email: "mario@rossi.it", brandId: brand.id } });
  await prisma.cliente.create({ data: { nome: "Bianchi Anna", nomePersona: "Anna", email: "anna@bianchi.it", brandId: brand.id } });

  console.log("1. Campagna con preheader e template HTML caricato da file");
  g.__utente = rocco;
  const camp = await prisma.campagna.create({ data: { nome: "Pergole", creataDa: "Rocco" } });
  const file = new File([`<html><body><h1>Ciao {nome}!</h1><p>Sconto sulle pergole</p><a href="https://gruppopec.com/pergole">Scopri</a></body></html>`], "promo.html", { type: "text/html" });
  const r = await redirectA(salvaCampagna(fd({ id: camp.id, nome: "Pergole", oggetto: "{nome}, la tua pergola", preheader: "Solo fino al 31 marzo", formato: "TESTO", testo: "", tracciamento: "on", file })));
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id: camp.id } });
  verifica(r?.includes("salvata") && c.formato === "HTML" && c.html.includes("Ciao {nome}!") && c.preheader === "Solo fino al 31 marzo" && c.tracciamento, "il file .html diventa il template, preheader salvato", { r, f: c.formato });

  console.log("2. Invio: preheader, disiscrizione, link tracciati, testo semplice");
  await accodaCampagna(camp.id);
  const e = await eseguiCampagne();
  verifica(e.inviate === 2 && posta.length === 2, "2 email partite", e);
  const mario = posta.find((p) => p.a[0] === "mario@rossi.it")!;
  const corpo = decodifica(mario.dati);
  verifica(/Subject: Mario, la tua pergola/.test(corpo) || corpo.includes("Mario, la tua pergola"), "oggetto con il nome");
  verifica(corpo.includes("Solo fino al 31 marzo") && corpo.includes('display:none'), "preheader nascosto in cima");
  verifica(corpo.includes("Ciao Mario!") && corpo.includes("Disiscriviti") && corpo.includes("/api/disiscrizione?c="), "nome e link per disiscriversi aggiunto dal CRM");
  verifica(/\/api\/traccia\/c-[A-Za-z0-9_-]+\.[0-9a-f]{16}\?u=https%3A%2F%2Fgruppopec\.com%2Fpergole/.test(corpo) && /<img src=3?D?"?https?:[^"]*\/api\/traccia\/c-/.test(corpo.replace(/3D/g, "")), "link dell'offerta e immagine invisibile tracciati");
  verifica(corpo.includes("Scopri (https://gruppopec.com/pergole)"), "versione di solo testo per chi non vede l'HTML");

  console.log("3. Aperture e clic");
  const invMario = await prisma.campagnaInvio.findFirstOrThrow({ where: { email: "mario@rossi.it" } });
  const cod = codiceFirmato(`c-${invMario.id}`);
  const ap = await chiama(cod);
  verifica(ap.status === 200 && ap.headers.get("content-type") === "image/gif", "l'immagine invisibile risponde");
  await chiama(cod);
  const cl = await chiama(cod, `?u=${encodeURIComponent("https://gruppopec.com/pergole")}`);
  verifica(cl.status === 302 && cl.headers.get("location") === "https://gruppopec.com/pergole", "il clic apre la pagina vera");
  const dopo = await prisma.campagnaInvio.findUniqueOrThrow({ where: { id: invMario.id } });
  verifica(dopo.aperture === 2 && dopo.clic === 1 && dopo.apertaIl && dopo.clicIl, "contate 2 aperture e 1 clic", dopo);
  const falso = await chiama(`c-${invMario.id}.0000000000000000`, `?u=${encodeURIComponent("https://sito-truffa.example")}`);
  verifica(falso.headers.get("location")?.startsWith("https://crm-gruppo-pc.vercel.app") && (await prisma.campagnaInvio.findUniqueOrThrow({ where: { id: invMario.id } })).clic === 1, "codice falso: nessun conteggio e niente rimbalzo verso altri siti");
  const anna = await prisma.campagnaInvio.findFirstOrThrow({ where: { email: "anna@bianchi.it" } });
  const annaClic = await chiama(codiceFirmato(`c-${anna.id}`), `?u=${encodeURIComponent("https://gruppopec.com/pergole")}`);
  const annaDopo = await prisma.campagnaInvio.findUniqueOrThrow({ where: { id: anna.id } });
  verifica(annaClic.status === 302 && annaDopo.clic === 1 && !!annaDopo.apertaIl, "chi clicca senza aver caricato le immagini conta anche come aperta");

  console.log("4. Tracciamento spento");
  await prisma.campagna.update({ where: { id: camp.id }, data: { tracciamento: false } });
  await prisma.cliente.create({ data: { nome: "Verdi Luca", email: "luca@verdi.it", brandId: brand.id } });
  await accodaCampagna(camp.id);
  await eseguiCampagne();
  const luca = decodifica(posta.find((p) => p.a[0] === "luca@verdi.it")?.dati ?? "");
  verifica(luca.includes("gruppopec.com/pergole") && !luca.includes("/api/traccia/"), "nessun contatore se il marketing lo spegne");

  console.log("5. Zona: il team si spunta nello stesso riquadro");
  g.__utente = ugo;
  const v1 = await prisma.utente.create({ data: { nome: "Venditore 1", email: "v1@x.it", username: "v1", ruolo: "COMMERCIALE" } });
  const v2 = await prisma.utente.create({ data: { nome: "Venditore 2", email: "v2@x.it", username: "v2", ruolo: "COMMERCIALE" } });
  const z = await prisma.zonaCommerciale.create({ data: { nome: "Liguria", regioni: ["Liguria"] } });
  const s1 = await redirectA(salvaZona(fd({ id: z.id, nome: "Liguria", "r:Liguria": "on", responsabileId: v1.id, conTeam: "1", membri: [v2.id] })));
  verifica(s1?.includes("salvato=") && (await prisma.utente.count({ where: { zonaId: z.id } })) === 2, "salvati responsabile e venditore spuntato (con la conferma ✓)");
  await redirectA(salvaZona(fd({ id: z.id, nome: "Liguria", "r:Liguria": "on", responsabileId: v1.id, conTeam: "1" })));
  verifica((await prisma.utente.findUniqueOrThrow({ where: { id: v2.id } })).zonaId === null && (await prisma.utente.findUniqueOrThrow({ where: { id: v1.id } })).zonaId === z.id, "tolta la spunta: esce dalla zona, il responsabile resta");

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
